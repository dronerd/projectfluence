-- Additive SpeakWise learning foundation. Do not apply without a database backup/review.
-- Documents retain extracted text privately; uploaded binary PDFs are discarded by Render.
alter table public.speakwise_lesson_sessions
  add column if not exists status text not null default 'active' check (status in ('active','interrupted','completed')),
  add column if not exists state jsonb not null default '{}',
  add column if not exists elapsed_seconds integer not null default 0 check (elapsed_seconds between 0 and 86400),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;
alter table public.speakwise_lesson_summaries
  add column if not exists schema_version integer not null default 1,
  add column if not exists summary_status text not null default 'legacy' check (summary_status in ('legacy','provisional','finalized'));
create unique index speakwise_final_summary_once on public.speakwise_lesson_summaries(session_id,user_id) where schema_version >= 2;
create index speakwise_summary_search_idx on public.speakwise_lesson_summaries using gin(to_tsvector('simple',summary::text));

create table public.speakwise_lesson_messages (
  id uuid primary key, session_id uuid not null references public.speakwise_lesson_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 24000),
  metadata jsonb not null default '{}' check (octet_length(metadata::text)<=24000),
  created_at timestamptz not null default now()
);
create index speakwise_messages_session_idx on public.speakwise_lesson_messages(user_id,session_id,created_at,id);
create table public.speakwise_learning_events (
  id uuid primary key, session_id uuid not null references public.speakwise_lesson_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('recommendation_impression','content_selected','source_opened','script_opened','vocabulary_revealed','vocabulary_attempt','comprehension_response','content_dismissed')),
  payload jsonb not null default '{}' check (octet_length(payload::text) <= 12000),
  created_at timestamptz not null default now()
);
create index speakwise_events_session_idx on public.speakwise_learning_events(user_id,session_id,created_at,id);
create index speakwise_events_search_idx on public.speakwise_learning_events using gin(to_tsvector('simple',payload::text));
create table public.speakwise_documents (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null check(length(filename) between 1 and 250),
  text_status text not null check(text_status in ('processing','ready','partial','unreadable','failed')),
  page_count integer not null default 0 check(page_count between 0 and 300),
  pages jsonb not null default '[]' check(jsonb_typeof(pages)='array' and octet_length(pages::text)<=6000000),
  warnings jsonb not null default '[]', sha256 text not null,
  created_at timestamptz not null default now()
);
create index speakwise_documents_owner_idx on public.speakwise_documents(user_id,created_at desc);
create table public.speakwise_scripts (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.speakwise_lesson_sessions(id) on delete set null,
  request_id uuid not null,title text not null check(length(title)<=300),body text not null check(length(body) between 1 and 20000),
  kind text not null check(kind in ('excerpt','adaptation','original')),
  source_refs jsonb not null default '[]',settings jsonb not null default '{}',
  questions jsonb not null default '[]',vocabulary jsonb not null default '[]',
  prompt_version text not null,schema_version integer not null default 1,
  created_at timestamptz not null default now(),unique(user_id,request_id)
);
create index speakwise_scripts_owner_idx on public.speakwise_scripts(user_id,created_at desc);
create table public.speakwise_learner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}' check(octet_length(preferences::text)<=8000),
  memory_enabled boolean not null default true,
  -- Derived memory never crosses a user-controlled reset boundary. Stable preferences do not decay.
  memory_reset_at timestamptz, version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.speakwise_vocab_cards (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.speakwise_lesson_sessions(id) on delete cascade,
  card jsonb not null check(octet_length(card::text)<=14000),
  created_at timestamptz not null default now()
);
create table public.speakwise_personal_vocabulary (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  word text not null check(length(word) between 1 and 200),definition text not null check(length(definition) between 1 and 1500),
  example text check(length(example)<=1500), language text not null default 'English',
  provenance text not null default 'learner_confirmed',created_at timestamptz not null default now(),unique(user_id,word,language)
);
-- Shared VidMatch text catalog: populated by a reviewed import; never fabricate catalog rows.
create table public.vidmatch_text_content (
  id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 1 and 500),
  content_type text not null check(content_type in ('article','news','website','blog')),
  source text not null,url text not null check(url ~ '^https://'),
  body text check(length(body)<=200000),language text not null default 'English',
  level text check(level in ('A1','A2','B1','B2','C1','C2')),topics text[] not null default '{}',
  word_count integer check(word_count>=0),published_at timestamptz,created_at timestamptz not null default now(),
  unique(url)
);
create index vidmatch_text_search_idx on public.vidmatch_text_content using gin(to_tsvector('english',title || ' ' || coalesce(body,'')));
alter table public.vocabstream_question_attempts add column if not exists hint_used boolean not null default false,
  add column if not exists speakwise_session_id uuid references public.speakwise_lesson_sessions(id) on delete set null;

create function public.check_speakwise_record_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare parent_status text;
begin
  if new.session_id is not null then
    -- Serialize Render message inserts with completion and memory reset. The role has
    -- no session UPDATE grant, so this tightly scoped trigger owns the row lock.
    select status into parent_status from public.speakwise_lesson_sessions s where s.id=new.session_id and s.user_id=new.user_id for update;
    if not found then raise exception 'Lesson session is unavailable' using errcode='42501';end if;
    if tg_table_name in ('speakwise_lesson_messages','speakwise_learning_events','speakwise_vocab_cards') and parent_status<>'active' then
      raise exception 'Lesson session is closed' using errcode='22023';
    end if;
    if tg_table_name='speakwise_scripts' and parent_status='interrupted' then
      raise exception 'This lesson was reset; start a new lesson' using errcode='22023';
    end if;
  end if;
  if tg_table_name='speakwise_scripts' then
    if exists(select 1 from jsonb_array_elements(new.source_refs) ref
      where ref->>'documentId' is not null and not exists(select 1 from public.speakwise_documents d where d.id=(ref->>'documentId')::uuid and d.user_id=new.user_id)) then
      raise exception 'Script source document is unavailable' using errcode='42501';
    end if;
  end if;
  return new;
end;$$;
do $$ declare t text; begin
  foreach t in array array['speakwise_lesson_messages','speakwise_learning_events','speakwise_scripts','speakwise_vocab_cards'] loop
    execute format('create trigger owner_check before insert or update on public.%I for each row execute function public.check_speakwise_record_owner()',t);
  end loop;
  foreach t in array array['speakwise_lesson_messages','speakwise_learning_events','speakwise_documents','speakwise_scripts','speakwise_learner_profiles','speakwise_vocab_cards','speakwise_personal_vocabulary'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy own_read on public.%I for select to authenticated using (user_id=auth.uid())',t);
  end loop;
  foreach t in array array['speakwise_documents','speakwise_scripts'] loop
    execute format('grant insert,update,delete on public.%I to authenticated',t);
    execute format('create policy own_write on public.%I for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);
  end loop;
end;$$;
-- Render may append authenticated messages; these are transcript records, never scored evidence.
grant insert on public.speakwise_lesson_messages to authenticated;
create policy own_message_insert on public.speakwise_lesson_messages for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.speakwise_lesson_sessions s where s.id=session_id and s.user_id=auth.uid() and s.status='active')
);
alter table public.vidmatch_text_content enable row level security;
revoke all on public.vidmatch_text_content from public,anon,authenticated;
grant all on public.vidmatch_text_content to service_role;
grant select on public.vidmatch_text_content,public.vidmatch_videos,public.vidmatch_transcripts,public.vidmatch_transcript_chunks to authenticated;
create policy authenticated_catalog_read on public.vidmatch_text_content for select to authenticated using(true);
create policy authenticated_video_read on public.vidmatch_videos for select to authenticated using(availability_status='active' and provider_metadata_expires_at>now());
create policy authenticated_transcript_read on public.vidmatch_transcripts for select to authenticated using(status='available');
create policy authenticated_chunks_read on public.vidmatch_transcript_chunks for select to authenticated using(exists(select 1 from public.vidmatch_transcripts t where t.id=transcript_id and t.status='available'));

create function public.save_speakwise_session_state(p_user_id uuid,p_session_id uuid,p_messages jsonb,p_events jsonb,p_state jsonb,p_elapsed integer)
returns public.speakwise_lesson_sessions language plpgsql security definer set search_path='' as $$
declare s public.speakwise_lesson_sessions%rowtype; item jsonb; existing public.speakwise_lesson_messages%rowtype; event public.speakwise_learning_events%rowtype;
begin
  select * into s from public.speakwise_lesson_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Session unavailable' using errcode='42501'; end if;
  if s.status<>'active' then raise exception 'Session is closed; start a new lesson' using errcode='22023'; end if;
  if jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages)>80 or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>40
    or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>24000 or p_elapsed not between 0 and 86400 then raise exception 'Invalid session state' using errcode='22023';end if;
  if p_state->>'documentId' is not null and not exists(select 1 from public.speakwise_documents where id=(p_state->>'documentId')::uuid and user_id=p_user_id) then raise exception 'Document unavailable' using errcode='42501';end if;
  if p_state->>'scriptId' is not null and not exists(select 1 from public.speakwise_scripts where id=(p_state->>'scriptId')::uuid and user_id=p_user_id) then raise exception 'Script unavailable' using errcode='42501';end if;
  for item in select value from jsonb_array_elements(p_messages) loop
    select * into existing from public.speakwise_lesson_messages where id=(item->>'id')::uuid;
    if found then
      if existing.user_id<>p_user_id or existing.session_id<>p_session_id or existing.role<>item->>'role' or existing.content<>item->>'content' then raise exception 'Message identifier conflict' using errcode='22023';end if;
    else
      insert into public.speakwise_lesson_messages(id,session_id,user_id,role,content,metadata) values((item->>'id')::uuid,p_session_id,p_user_id,item->>'role',item->>'content',coalesce(item->'metadata','{}'));
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_events) loop
    if item->>'type' not in ('source_opened','script_opened','vocabulary_revealed','comprehension_response','content_dismissed') then raise exception 'Invalid self-reported activity' using errcode='22023';end if;
    select * into event from public.speakwise_learning_events where id=(item->>'id')::uuid;
    if found then
      if event.user_id<>p_user_id or event.session_id<>p_session_id or event.event_type<>item->>'type' or event.payload<>item->'payload' then raise exception 'Event identifier conflict' using errcode='22023';end if;
    else
      insert into public.speakwise_learning_events(id,session_id,user_id,event_type,payload) values((item->>'id')::uuid,p_session_id,p_user_id,item->>'type',item->'payload');
      if item->>'type'='source_opened' and item->'payload'->>'contentType'='video' and exists(select 1 from public.vidmatch_videos where video_id=item->'payload'->>'contentId' and availability_status='active' and provider_metadata_expires_at>now()) then
        perform public.record_vidmatch_video_view(p_user_id,item->'payload'->>'contentId');
      end if;
    end if;
  end loop;
  update public.speakwise_lesson_sessions set state=state||p_state,elapsed_seconds=greatest(elapsed_seconds,p_elapsed),updated_at=now(),status='active' where id=p_session_id returning * into s;
  return s;
end;$$;

create function public.complete_speakwise_session(p_user_id uuid,p_session_id uuid,p_summary jsonb)
returns public.speakwise_lesson_summaries language plpgsql security definer set search_path='' as $$
declare s public.speakwise_lesson_sessions%rowtype; result public.speakwise_lesson_summaries%rowtype; message_ids jsonb;event_ids jsonb;
begin
  select * into s from public.speakwise_lesson_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Session unavailable' using errcode='42501';end if;
  select * into result from public.speakwise_lesson_summaries where session_id=p_session_id and user_id=p_user_id and schema_version>=2;
  if found then return result;end if;
  if s.status<>'active' then raise exception 'Lesson session is closed' using errcode='22023';end if;
  select coalesce(jsonb_agg(id::text order by created_at,id),'[]') into message_ids from public.speakwise_lesson_messages where session_id=p_session_id and user_id=p_user_id;
  select coalesce(jsonb_agg(id::text order by created_at,id),'[]') into event_ids from public.speakwise_learning_events where session_id=p_session_id and user_id=p_user_id;
  if p_summary->'evidence'->'messageIds' is distinct from message_ids or p_summary->'evidence'->'eventIds' is distinct from event_ids then
    raise exception 'Session changed; retry completion' using errcode='22023';end if;
  insert into public.speakwise_lesson_summaries(user_id,session_id,lesson_mode,level,topics,duration_minutes,elapsed_seconds,summary,mistakes,recommendations,useful_vocabulary,schema_version,summary_status)
  values(p_user_id,p_session_id,s.lesson_mode,s.level,s.selected_topics,s.planned_duration_minutes,s.elapsed_seconds,p_summary,p_summary->'mistakes',
    array(select jsonb_array_elements_text(p_summary->'recommendations')),array(select jsonb_array_elements_text(p_summary->'usefulVocabulary')),2,'finalized') returning * into result;
  update public.speakwise_lesson_sessions set status='completed',completed_at=now(),updated_at=now() where id=p_session_id;
  return result;
end;$$;

-- One in-lesson answer is one canonical VocabStream question attempt, not a completed standalone lesson.
create function public.answer_speakwise_vocabulary(p_user_id uuid,p_session_id uuid,p_card_id uuid,p_attempt_id uuid,p_answer text,p_hint boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;right_answer boolean;e public.speakwise_learning_events%rowtype;recent_success integer;recent_count integer;v_category text;v_word_key text;v_hint boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('vocabstream:'||p_user_id::text,0));
  perform 1 from public.speakwise_lesson_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Session unavailable' using errcode='42501';end if;
  select * into e from public.speakwise_learning_events where id=p_attempt_id;
  if found then
    if e.user_id<>p_user_id or e.session_id<>p_session_id or e.payload->>'cardId'<>p_card_id::text or e.payload->>'answer'<>p_answer or coalesce((e.payload->>'reportedHintUsed')::boolean,(e.payload->>'hintUsed')::boolean)<>p_hint then raise exception 'Attempt identifier conflict' using errcode='22023';end if;
    return jsonb_build_object('ok',true,'correct',e.payload->'correct','reviewSaved',true,'duplicate',true);
  end if;
  if not exists(select 1 from public.speakwise_lesson_sessions where id=p_session_id and status='active') then raise exception 'Session already completed' using errcode='22023';end if;
  select card into c from public.speakwise_vocab_cards where id=p_card_id and user_id=p_user_id and session_id=p_session_id;
  if not found then raise exception 'Practice card unavailable' using errcode='42501';end if;
  if p_hint is null or length(p_answer)>200 or not (c->'choices' ? p_answer) then raise exception 'Invalid answer' using errcode='22023';end if;
  v_hint:=p_hint or exists(select 1 from public.speakwise_learning_events where user_id=p_user_id and session_id=p_session_id and event_type='vocabulary_revealed' and payload->>'cardId'=p_card_id::text);
  right_answer:=p_answer=c->>'answer';v_category:=c->>'sourceCategory';v_word_key:=lower(trim(c->>'word'));
  insert into public.vocabstream_lesson_attempts(id,user_id,lesson_id,genre,lesson_number,lesson_title,word_count,meaning_score,meaning_total,quiz_score,quiz_total,total_score,total_possible,percent_score,replay_completed,replay_correct,replay_total)
  values(p_attempt_id,p_user_id,'speakwise:'||p_session_id::text,v_category,coalesce((c->>'sourceLessonNumber')::integer,0),'SpeakWise in-lesson practice',1,case when right_answer then 1 else 0 end,1,0,0,case when right_answer then 1 else 0 end,1,case when right_answer then 100 else 0 end,false,0,0);
  insert into public.vocabstream_question_attempts(lesson_attempt_id,question_type,word,prompt,correct_answer,selected_answer,is_correct,is_replay,attempt_order,choices,hint_used,speakwise_session_id)
  values(p_attempt_id,'meaning',c->>'word',c->>'question',c->>'answer',p_answer,right_answer,false,1,array(select jsonb_array_elements_text(c->'choices')),v_hint,p_session_id);
  insert into public.speakwise_learning_events(id,session_id,user_id,event_type,payload)
  values(p_attempt_id,p_session_id,p_user_id,'vocabulary_attempt',jsonb_build_object('cardId',p_card_id,'word',c->>'word','answer',p_answer,'correctAnswer',c->>'answer','correct',right_answer,'hintUsed',v_hint,'reportedHintUsed',p_hint,'sourceCategory',v_category,'sourceLessonId',c->>'sourceLessonId','definition',c->>'definition'));
  if not right_answer then
    insert into public.vocabstream_user_mistakes(user_id,word,word_key,definition,example,source_category,source_lesson_id,source_lesson_number,last_question_type,last_prompt,last_correct_answer,last_selected_answer)
    values(p_user_id,c->>'word',v_word_key,c->>'definition',c->>'example',v_category,c->>'sourceLessonId',(c->>'sourceLessonNumber')::integer,'meaning',c->>'question',c->>'answer',p_answer)
    on conflict(user_id,source_category,word_key) do update set mistake_count=public.vocabstream_user_mistakes.mistake_count+1,last_mistaken_at=now(),updated_at=now(),last_selected_answer=excluded.last_selected_answer;
  elsif not v_hint then
    select count(*),count(*) filter(where correct and not hint) into recent_count,recent_success from (
      select (payload->>'correct')::boolean correct,(payload->>'hintUsed')::boolean hint from public.speakwise_learning_events
      where user_id=p_user_id and event_type='vocabulary_attempt' and payload->>'word'=c->>'word' and payload->>'sourceCategory'=v_category
      order by created_at desc,id desc limit 3
    ) recent;
    -- Require three separately recorded successful recalls; lifetime attempt evidence remains intact.
    if recent_count=3 and recent_success=3 then delete from public.vocabstream_user_mistakes where user_id=p_user_id and source_category=c->>'sourceCategory' and vocabstream_user_mistakes.word_key=v_word_key;end if;
  end if;
  return jsonb_build_object('ok',true,'correct',right_answer,'definition',c->>'definition','reviewSaved',true,'duplicate',false);
end;$$;

-- Lexical OR admits relevant evidence even when a conversational request has extra words.
create function public.speakwise_query_terms(p_query text,p_config regconfig default 'simple') returns tsquery language sql immutable set search_path='' as $$
select coalesce(to_tsquery(p_config,string_agg(quote_literal(term),' | ')),''::tsquery)
from (select distinct lower(token) term from regexp_split_to_table(left(coalesce(p_query,''),500),'[^[:alnum:]_]+') token
 where length(token)>1 and lower(token) not in ('the','and','for','with','that','this','practice','please','find','about','video','article') limit 24) words;
$$;

-- Search the full owned corpus in PostgreSQL before taking bounded candidates.
create function public.retrieve_speakwise_memory(p_user_id uuid,p_query text,p_since timestamptz default null)
returns jsonb language sql stable security definer set search_path='' as $$
with q as(select public.speakwise_query_terms(p_query) query), summaries as (
 select id,summary,lesson_mode,level,topics,created_at,schema_version,
 ts_rank_cd(to_tsvector('simple',summary::text),(select query from q)) rank
 from public.speakwise_lesson_summaries where user_id=p_user_id and (auth.uid() is null or auth.uid()=p_user_id)
 and coalesce((select memory_enabled from public.speakwise_learner_profiles where user_id=p_user_id),true)
 and created_at>coalesce(greatest(p_since,(select memory_reset_at from public.speakwise_learner_profiles where user_id=p_user_id)),'1970-01-01'::timestamptz)
 order by rank desc,created_at desc limit 60
), events as (
 select id,event_type,payload,created_at,ts_rank_cd(to_tsvector('simple',payload::text),(select query from q)) rank
 from public.speakwise_learning_events where user_id=p_user_id and (auth.uid() is null or auth.uid()=p_user_id)
 and coalesce((select memory_enabled from public.speakwise_learner_profiles where user_id=p_user_id),true)
 and created_at>coalesce(greatest(p_since,(select memory_reset_at from public.speakwise_learner_profiles where user_id=p_user_id)),'1970-01-01'::timestamptz)
 order by rank desc,created_at desc limit 100
)
, weak_words as (
 select id,word,definition,mistake_count,last_mistaken_at,source_category,
 ts_rank_cd(to_tsvector('simple',word||' '||coalesce(definition,'')),(select query from q)) rank
 from public.vocabstream_user_mistakes where user_id=p_user_id and (auth.uid() is null or auth.uid()=p_user_id)
 and coalesce((select memory_enabled from public.speakwise_learner_profiles where user_id=p_user_id),true)
 and last_mistaken_at>coalesce(greatest(p_since,(select memory_reset_at from public.speakwise_learner_profiles where user_id=p_user_id)),'1970-01-01'::timestamptz)
 order by rank desc,last_mistaken_at desc limit 100
), recent_attempts as (
 select a.id,a.word,a.is_correct,a.hint_used,a.answered_at,a.prompt,l.genre source_category,
 row_number() over(partition by lower(a.word),l.genre order by a.answered_at desc,a.id desc) n,
 ts_rank_cd(to_tsvector('simple',a.word||' '||a.prompt),(select query from q)) rank
 from public.vocabstream_question_attempts a join public.vocabstream_lesson_attempts l on l.id=a.lesson_attempt_id
 where l.user_id=p_user_id and (auth.uid() is null or auth.uid()=p_user_id)
 and coalesce((select memory_enabled from public.speakwise_learner_profiles where user_id=p_user_id),true)
 and a.answered_at>coalesce(greatest(p_since,(select memory_reset_at from public.speakwise_learner_profiles where user_id=p_user_id)),'1970-01-01'::timestamptz)
), canonical_attempts as (
 select id,word,is_correct,hint_used,answered_at,prompt,source_category from recent_attempts where n<=8 order by rank desc,answered_at desc limit 200
)
select jsonb_build_object('summaries',coalesce((select jsonb_agg(s) from summaries s),'[]'), 'events',coalesce((select jsonb_agg(e) from events e),'[]'),
 'weakWords',coalesce((select jsonb_agg(w) from weak_words w),'[]'),'canonicalAttempts',coalesce((select jsonb_agg(a) from canonical_attempts a),'[]'));
$$;

create function public.reset_speakwise_memory(p_user_id uuid,p_scope text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_scope not in ('derived','all') then raise exception 'Invalid reset scope' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('speakwise:'||p_user_id::text,0));
  -- Same row lock as append/completion prevents in-flight writers from restoring reset evidence.
  perform 1 from public.speakwise_lesson_sessions where user_id=p_user_id order by id for update;
  delete from public.speakwise_lesson_summaries where user_id=p_user_id;
  delete from public.speakwise_mistake_patterns where user_id=p_user_id;
  -- Exact learner request removes saved conversation and observed event memory. Canonical VocabStream progress is a separate explicit record and is preserved.
  delete from public.speakwise_learning_events where user_id=p_user_id;
  delete from public.speakwise_lesson_messages where user_id=p_user_id;
  update public.speakwise_lesson_sessions set state='{}',status=case when status='completed' then status else 'interrupted' end,updated_at=now() where user_id=p_user_id;
  insert into public.speakwise_learner_profiles(user_id,memory_reset_at,version) values(p_user_id,now(),1)
  on conflict(user_id) do update set memory_reset_at=now(),version=speakwise_learner_profiles.version+1,preferences=case when p_scope='all' then '{}'::jsonb else speakwise_learner_profiles.preferences end,updated_at=now();
  if p_scope='all' then
    delete from public.speakwise_scripts where user_id=p_user_id;
    delete from public.speakwise_documents where user_id=p_user_id;
    delete from public.speakwise_personal_vocabulary where user_id=p_user_id;
    delete from public.speakwise_vocab_cards where user_id=p_user_id;
  end if;
end;$$;

do $$ declare signature text; begin
  foreach signature in array array['check_speakwise_record_owner()','save_speakwise_session_state(uuid,uuid,jsonb,jsonb,jsonb,integer)',
    'complete_speakwise_session(uuid,uuid,jsonb)','answer_speakwise_vocabulary(uuid,uuid,uuid,uuid,text,boolean)',
    'retrieve_speakwise_memory(uuid,text,timestamptz)','reset_speakwise_memory(uuid,text)'] loop
    execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
    execute 'grant execute on function public.'||signature||' to service_role';
  end loop;
end;$$;

-- Safe direct Render JWT access: ownership and reset boundary enforced inside the function.
grant execute on function public.retrieve_speakwise_memory(uuid,text,timestamptz) to authenticated;

create index speakwise_catalog_video_search on public.vidmatch_videos using gin(to_tsvector('english',title||' '||coalesce(description,'')));
create function public.search_speakwise_catalog(p_user_id uuid,p_query text,p_level text)
returns jsonb language sql stable security definer set search_path='' as $$
with q as (select public.speakwise_query_terms(p_query,'english') query), videos as (
 select v.video_id,v.title,v.channel_name,v.duration,v.level,v.topics,
 exists(select 1 from public.vidmatch_transcripts t where t.video_id=v.video_id and t.status='available' and t.chunk_count>0) indexed,
 ts_rank_cd(to_tsvector('english',v.title||' '||coalesce(v.description,'')),q.query) rank,
 exists(select 1 from public.vidmatch_video_view_history h where h.user_id=p_user_id and h.video_id=v.video_id) previously_opened
 from public.vidmatch_videos v cross join q
 where v.availability_status='active' and v.editorial_reviewed_at is not null and v.provider_metadata_expires_at>now()
 and (length(trim(p_query))=0 or to_tsvector('english',v.title||' '||coalesce(v.description,''))@@q.query
   or exists(select 1 from public.vidmatch_transcript_chunks c where c.video_id=v.video_id and to_tsvector('english',c.text)@@q.query))
 order by rank desc,(v.level=p_level) desc,v.video_id limit 60
), texts as (
 select id,title,content_type,source,url,level,topics,word_count,(body is not null and length(body)>0) indexed,
 ts_rank_cd(to_tsvector('english',title||' '||coalesce(body,'')),q.query) rank
 from public.vidmatch_text_content cross join q
 where length(trim(p_query))=0 or to_tsvector('english',title||' '||coalesce(body,''))@@q.query
 order by rank desc,(level=p_level) desc,id limit 60
)
select jsonb_build_object('videos',coalesce((select jsonb_agg(v) from videos v),'[]'),'texts',coalesce((select jsonb_agg(t) from texts t),'[]'));
$$;
revoke all on function public.search_speakwise_catalog(uuid,text,text) from public,anon,authenticated;
grant execute on function public.search_speakwise_catalog(uuid,text,text) to service_role;

-- Delete private source plus copied adaptations atomically and clear stale active selections.
create function public.delete_speakwise_document(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare learner uuid:=auth.uid();script_ids uuid[];
begin
  if learner is null or not exists(select 1 from public.speakwise_documents where id=p_document_id and user_id=learner) then raise exception 'Document unavailable' using errcode='42501';end if;
  select coalesce(array_agg(id),'{}') into script_ids from public.speakwise_scripts where user_id=learner and source_refs @> jsonb_build_array(jsonb_build_object('documentId',p_document_id));
  update public.speakwise_lesson_sessions set state=state-'documentId'-'scriptId',updated_at=now() where user_id=learner and (state->>'documentId'=p_document_id::text or state->>'scriptId'=any(array(select unnest(script_ids)::text)));
  delete from public.speakwise_scripts where user_id=learner and id=any(script_ids);
  delete from public.speakwise_documents where id=p_document_id and user_id=learner;
  return jsonb_build_object('deleted',true,'scriptsDeleted',cardinality(script_ids));
end;$$;
revoke all on function public.delete_speakwise_document(uuid) from public,anon;
grant execute on function public.delete_speakwise_document(uuid) to authenticated;
-- Direct DELETE cannot bypass cleanup of derived scripts.
revoke delete on public.speakwise_documents from authenticated;
create function public.record_speakwise_event(p_user_id uuid,p_session_id uuid,p_event_id uuid,p_type text,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare prior public.speakwise_learning_events%rowtype;
begin
  perform 1 from public.speakwise_lesson_sessions where id=p_session_id and user_id=p_user_id and status='active' for update;
  if not found then raise exception 'Active lesson unavailable' using errcode='42501';end if;
  if p_type not in ('recommendation_impression','content_selected') or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid event' using errcode='22023';end if;
  select * into prior from public.speakwise_learning_events where id=p_event_id;
  if found then
    if prior.user_id<>p_user_id or prior.session_id<>p_session_id or prior.event_type<>p_type or prior.payload<>p_payload then raise exception 'Event identifier conflict' using errcode='22023';end if;
    return;
  end if;
  insert into public.speakwise_learning_events(id,session_id,user_id,event_type,payload) values(p_event_id,p_session_id,p_user_id,p_type,p_payload);
end;$$;
revoke all on function public.record_speakwise_event(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_speakwise_event(uuid,uuid,uuid,text,jsonb) to service_role;
