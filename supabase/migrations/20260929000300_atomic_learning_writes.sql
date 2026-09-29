-- Keep existing historical rows. Enforce consistency for new writes and retry safely.
alter table public.vocabstream_lesson_attempts add column if not exists request_digest text;

-- NOT VALID preserves historical data while enforcing checks for subsequent INSERT/UPDATE.
alter table public.vocabstream_lesson_attempts add constraint vocabstream_attempt_score_bounds
  check (meaning_score <= meaning_total and quiz_score <= quiz_total and replay_correct <= replay_total
    and total_score = meaning_score + quiz_score and total_possible = meaning_total + quiz_total) not valid;
alter table public.vocabstream_user_lesson_progress add constraint vocabstream_progress_score_bounds
  check (meaning_score <= meaning_total and quiz_score <= quiz_total and replay_correct <= replay_total
    and total_score = meaning_score + quiz_score and total_possible = meaning_total + quiz_total) not valid;

-- Actual read paths: per-genre lesson lists, weak-word ranking, and per-session summary idempotency.
create index if not exists vocabstream_progress_genre_updated_idx
  on public.vocabstream_user_lesson_progress (user_id, genre, updated_at desc);
create index if not exists vocabstream_mistakes_rank_idx
  on public.vocabstream_user_mistakes (user_id, mistake_count desc, last_mistaken_at desc);
create index if not exists speakwise_summaries_session_idx
  on public.speakwise_lesson_summaries (session_id, user_id, created_at) where session_id is not null;

-- Username metadata is user-controlled and nonessential; a duplicate must not break account creation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.profiles (id, email, username, display_name)
    values (new.id, new.email, nullif(left(btrim(new.raw_user_meta_data ->> 'username'), 80), ''),
      left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'username',
        new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 160))
    on conflict (id) do update set email = excluded.email, updated_at = now();
  exception when unique_violation then
    insert into public.profiles (id, email, display_name)
    values (new.id, new.email, left(coalesce(new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 160))
    on conflict (id) do update set email = excluded.email, updated_at = now();
  end;
  return new;
end;
$$;

-- Existing users may predate the trigger. Preserve any existing profile and avoid username collisions.
insert into public.profiles (id, email, display_name)
select id, email, left(coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'), 160)
from auth.users on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

-- Foreign keys alone do not establish that the linked session/attempt belongs to the same learner.
create or replace function public.check_learning_reference_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'speakwise_lesson_summaries' then
    if new.session_id is not null and not exists (
      select 1 from public.speakwise_lesson_sessions where id = new.session_id and user_id = new.user_id
    ) then raise exception 'Lesson session is unavailable' using errcode = '42501'; end if;
  else
    if new.latest_lesson_attempt_id is not null and not exists (
      select 1 from public.vocabstream_lesson_attempts
      where id = new.latest_lesson_attempt_id and user_id = new.user_id and lesson_id = new.lesson_id
    ) then raise exception 'Lesson attempt is unavailable' using errcode = '42501'; end if;
  end if;
  return new;
end;
$$;
create trigger check_speakwise_summary_owner before insert or update on public.speakwise_lesson_summaries
for each row execute function public.check_learning_reference_owner();
create trigger check_vocabstream_progress_owner before insert or update on public.vocabstream_user_lesson_progress
for each row execute function public.check_learning_reference_owner();

create or replace function public.save_vocabstream_progress(p_user_id uuid, p_attempt_id uuid, p_payload jsonb)
returns public.vocabstream_lesson_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.vocabstream_lesson_attempts%rowtype;
  v_question jsonb;
  v_digest text := md5(p_payload::text);
  v_total integer;
  v_possible integer;
  v_percent numeric;
  v_category text;
begin
  if p_user_id is null or p_attempt_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload -> 'question_attempts') is distinct from 'array' then
    raise exception 'Invalid learning progress' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload -> 'question_attempts') not between 1 and 500 then
    raise exception 'Invalid question count' using errcode = '22023';
  end if;
  -- Serialize writes for one learner so shared mistake counters and latest progress stay coherent.
  perform pg_advisory_xact_lock(hashtextextended('vocabstream:' || p_user_id::text, 0));
  select * into v_attempt from public.vocabstream_lesson_attempts where id = p_attempt_id;
  if found then
    if v_attempt.user_id is distinct from p_user_id then
      raise exception 'Lesson attempt is unavailable' using errcode = '42501';
    end if;
    if v_attempt.request_digest is distinct from v_digest then
      raise exception 'Attempt identifier already used for different answers' using errcode = '22023';
    end if;
    return v_attempt;
  end if;
  v_total := (p_payload ->> 'meaning_score')::integer + (p_payload ->> 'quiz_score')::integer;
  v_possible := (p_payload ->> 'meaning_total')::integer + (p_payload ->> 'quiz_total')::integer;
  v_percent := case when v_possible > 0 then round(v_total::numeric / v_possible * 100) else 0 end;

  insert into public.vocabstream_lesson_attempts (
    id, user_id, lesson_id, genre, lesson_number, lesson_title, word_count,
    meaning_score, meaning_total, quiz_score, quiz_total, total_score, total_possible, percent_score,
    replay_completed, replay_correct, replay_total, request_digest
  ) values (
    p_attempt_id, p_user_id, p_payload ->> 'lesson_id', p_payload ->> 'genre',
    (p_payload ->> 'lesson_number')::integer, p_payload ->> 'lesson_title', (p_payload ->> 'word_count')::integer,
    (p_payload ->> 'meaning_score')::integer, (p_payload ->> 'meaning_total')::integer,
    (p_payload ->> 'quiz_score')::integer, (p_payload ->> 'quiz_total')::integer, v_total, v_possible, v_percent,
    coalesce((p_payload ->> 'replay_completed')::boolean, false),
    coalesce((p_payload ->> 'replay_correct')::integer, 0), coalesce((p_payload ->> 'replay_total')::integer, 0), v_digest
  ) returning * into v_attempt;

  insert into public.vocabstream_user_lesson_progress (
    user_id, lesson_id, genre, lesson_number, lesson_title, word_count, latest_lesson_attempt_id,
    meaning_score, meaning_total, quiz_score, quiz_total, total_score, total_possible, percent_score,
    replay_completed, replay_correct, replay_total
  ) values (
    p_user_id, v_attempt.lesson_id, v_attempt.genre, v_attempt.lesson_number, v_attempt.lesson_title,
    v_attempt.word_count, v_attempt.id, v_attempt.meaning_score, v_attempt.meaning_total,
    v_attempt.quiz_score, v_attempt.quiz_total, v_total, v_possible, v_percent,
    v_attempt.replay_completed, v_attempt.replay_correct, v_attempt.replay_total
  ) on conflict (user_id, lesson_id) do update set
    genre = excluded.genre, lesson_number = excluded.lesson_number, lesson_title = excluded.lesson_title,
    word_count = excluded.word_count, latest_lesson_attempt_id = excluded.latest_lesson_attempt_id,
    meaning_score = excluded.meaning_score, meaning_total = excluded.meaning_total,
    quiz_score = excluded.quiz_score, quiz_total = excluded.quiz_total, total_score = excluded.total_score,
    total_possible = excluded.total_possible, percent_score = excluded.percent_score,
    replay_completed = excluded.replay_completed, replay_correct = excluded.replay_correct,
    replay_total = excluded.replay_total, updated_at = now();

  for v_question in select value from jsonb_array_elements(p_payload -> 'question_attempts') loop
    insert into public.vocabstream_question_attempts (
      lesson_attempt_id, question_type, word, prompt, correct_answer, selected_answer, is_correct,
      is_replay, attempt_order, choices, answered_at
    ) values (
      v_attempt.id, v_question ->> 'question_type', v_question ->> 'word', v_question ->> 'prompt',
      v_question ->> 'correct_answer', v_question ->> 'selected_answer', (v_question ->> 'is_correct')::boolean,
      coalesce((v_question ->> 'is_replay')::boolean, false), (v_question ->> 'attempt_order')::integer,
      array(select jsonb_array_elements_text(coalesce(v_question -> 'choices', '[]'::jsonb))),
      coalesce((v_question ->> 'answered_at')::timestamptz, now())
    );
    if (v_question ->> 'is_correct')::boolean = false then
      v_category := coalesce(nullif(v_question ->> 'source_category', ''), v_attempt.genre);
      insert into public.vocabstream_user_mistakes (
        user_id, word, word_key, definition, example, explanation, source_category, source_lesson_id,
        source_lesson_number, last_question_type, last_prompt, last_correct_answer, last_selected_answer
      ) values (
        p_user_id, v_question ->> 'word', lower(v_question ->> 'word'),
        coalesce(v_question ->> 'definition', v_question ->> 'prompt', ''), v_question ->> 'example',
        v_question ->> 'explanation', v_category,
        coalesce(v_question ->> 'source_lesson_id', v_attempt.lesson_id),
        coalesce((v_question ->> 'source_lesson_number')::integer, v_attempt.lesson_number),
        v_question ->> 'question_type', v_question ->> 'prompt',
        v_question ->> 'correct_answer', v_question ->> 'selected_answer'
      ) on conflict (user_id, source_category, word_key) do update set
        mistake_count = public.vocabstream_user_mistakes.mistake_count + 1,
        definition = excluded.definition, example = excluded.example, explanation = excluded.explanation,
        source_lesson_id = excluded.source_lesson_id, source_lesson_number = excluded.source_lesson_number,
        last_question_type = excluded.last_question_type, last_prompt = excluded.last_prompt,
        last_correct_answer = excluded.last_correct_answer, last_selected_answer = excluded.last_selected_answer,
        last_mistaken_at = now(), updated_at = now();
    end if;
  end loop;
  return v_attempt;
end;
$$;

create or replace function public.save_speakwise_lesson_summary(p_user_id uuid, p_session_id uuid, p_payload jsonb)
returns public.speakwise_lesson_summaries
language plpgsql security definer set search_path = '' as $$
declare
  v_summary public.speakwise_lesson_summaries%rowtype;
  v_mistake jsonb;
  v_type text;
  v_pattern text;
begin
  if p_user_id is null or p_session_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload -> 'summary') is distinct from 'object'
    or jsonb_typeof(p_payload -> 'mistakes') is distinct from 'array' then
    raise exception 'Invalid lesson summary' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload -> 'mistakes') > 100 then
    raise exception 'Too many mistakes' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('speakwise:' || p_user_id::text, 0));
  if not exists (select 1 from public.speakwise_lesson_sessions where id = p_session_id and user_id = p_user_id) then
    raise exception 'Lesson session is unavailable' using errcode = '42501';
  end if;
  select * into v_summary from public.speakwise_lesson_summaries
    where session_id = p_session_id and user_id = p_user_id order by created_at limit 1;
  if found then return v_summary; end if;
  insert into public.speakwise_lesson_summaries (
    user_id, session_id, lesson_mode, level, topics, duration_minutes, elapsed_seconds,
    summary, mistakes, recommendations, useful_vocabulary
  ) values (
    p_user_id, p_session_id, coalesce(p_payload ->> 'lesson_mode', 'natural_conversation'), p_payload ->> 'level',
    array(select jsonb_array_elements_text(coalesce(p_payload -> 'topics', '[]'::jsonb))),
    (p_payload ->> 'duration_minutes')::integer, (p_payload ->> 'elapsed_seconds')::integer,
    p_payload -> 'summary', p_payload -> 'mistakes',
    array(select jsonb_array_elements_text(coalesce(p_payload -> 'recommendations', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_payload -> 'useful_vocabulary', '[]'::jsonb)))
  ) returning * into v_summary;
  for v_mistake in select value from jsonb_array_elements(p_payload -> 'mistakes') loop
    v_type := left(coalesce(nullif(v_mistake ->> 'type', ''), 'expression'), 80);
    v_pattern := left(coalesce(nullif(v_mistake ->> 'pattern', ''), nullif(v_mistake ->> 'explanation', ''), v_type), 240);
    insert into public.speakwise_mistake_patterns (
      user_id, mistake_type, pattern, latest_original, latest_correction, latest_explanation
    ) values (
      p_user_id, v_type, v_pattern, left(v_mistake ->> 'original', 400),
      left(v_mistake ->> 'correction', 400), left(v_mistake ->> 'explanation', 400)
    ) on conflict (user_id, mistake_type, pattern) do update set
      count = public.speakwise_mistake_patterns.count + 1, latest_original = excluded.latest_original,
      latest_correction = excluded.latest_correction, latest_explanation = excluded.latest_explanation,
      last_seen_at = now();
  end loop;
  return v_summary;
end;
$$;

create or replace function public.record_vidmatch_video_view(p_user_id uuid, p_video_id text)
returns public.vidmatch_video_view_history
language plpgsql security definer set search_path = '' as $$
declare v_history public.vidmatch_video_view_history%rowtype;
begin
  if p_user_id is null then raise exception 'Learner is required' using errcode = '22023'; end if;
  insert into public.vidmatch_video_view_history (
    user_id, video_id, title, channel_name, youtube_url, thumbnail_url, duration, level, skills, topics, accent, quality_score
  ) select p_user_id, video_id, title, channel_name, youtube_url, thumbnail_url, duration, level, skills, topics, accent, quality_score
    from public.vidmatch_videos where video_id = p_video_id
  on conflict (user_id, video_id) do update set
    title = excluded.title, channel_name = excluded.channel_name, youtube_url = excluded.youtube_url,
    thumbnail_url = excluded.thumbnail_url, duration = excluded.duration, level = excluded.level,
    skills = excluded.skills, topics = excluded.topics, accent = excluded.accent, quality_score = excluded.quality_score,
    click_count = public.vidmatch_video_view_history.click_count + 1, last_clicked_at = now(), updated_at = now()
  returning * into v_history;
  if not found then raise exception 'Video is unavailable' using errcode = '22023'; end if;
  return v_history;
end;
$$;

-- Aggregation runs in PostgreSQL, without the Data API's 1000-row response ceiling.
create or replace function public.get_learning_analytics(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
with vocab as materialized (
  select * from public.vocabstream_user_lesson_progress where user_id = p_user_id and total_possible > 0
), videos as materialized (
  select * from public.vidmatch_video_view_history where user_id = p_user_id
), sessions as materialized (
  select * from public.speakwise_lesson_sessions where user_id = p_user_id
)
select jsonb_build_object(
  'vocabstream', (select jsonb_build_object(
    'completedLessons', count(*), 'lowScoreLessons', count(*) filter (where percent_score < 60),
    'averageAccuracy', coalesce(avg(percent_score), 0), 'latestActivityAt', max(updated_at),
    'byGenre', coalesce((select jsonb_object_agg(k,n) from (select coalesce(nullif(genre,''),'Unknown') k,count(*) n from vocab group by 1) x), '{}'::jsonb)
  ) from vocab),
  'vidmatch', (select jsonb_build_object(
    'savedVideos', count(*), 'totalClicks', coalesce(sum(click_count), 0), 'latestActivityAt', max(last_clicked_at),
    'byLevel', coalesce((select jsonb_object_agg(k,n) from (select coalesce(nullif(level,''),'Unknown') k,count(*) n from videos group by 1) x), '{}'::jsonb)
  ) from videos),
  'speakwise', (select jsonb_build_object(
    'lessonSessions', count(*), 'totalMinutes', coalesce(sum(planned_duration_minutes), 0), 'latestActivityAt', max(started_at),
    'byMode', coalesce((select jsonb_object_agg(k,n) from (select coalesce(nullif(mode,''),'Unknown') k,count(*) n from sessions group by 1) x), '{}'::jsonb),
    'byLevel', coalesce((select jsonb_object_agg(k,n) from (select coalesce(nullif(level,''),'Unknown') k,count(*) n from sessions group by 1) x), '{}'::jsonb)
  ) from sessions)
);
$$;

-- The transcript foundation uses qualified table names; remove its mutable public search path too.
alter function public.upsert_vidmatch_transcript_snapshot(text,text,text,boolean,text,text,text,text,integer,text,text,boolean,jsonb)
  set search_path = '';

-- Restrict RPCs explicitly: PUBLIC grants otherwise override a role-specific revoke.
revoke all on function public.save_vocabstream_progress(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.save_speakwise_lesson_summary(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.record_vidmatch_video_view(uuid,text) from public, anon, authenticated;
revoke all on function public.get_learning_analytics(uuid) from public, anon, authenticated;
grant execute on function public.save_vocabstream_progress(uuid,uuid,jsonb) to service_role;
grant execute on function public.save_speakwise_lesson_summary(uuid,uuid,jsonb) to service_role;
grant execute on function public.record_vidmatch_video_view(uuid,text) to service_role;
grant execute on function public.get_learning_analytics(uuid) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.check_learning_reference_owner() from public, anon, authenticated;
revoke all on function public.upsert_vidmatch_transcript_snapshot(text,text,text,boolean,text,text,text,text,integer,text,text,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_vidmatch_transcript_snapshot(text,text,text,boolean,text,text,text,text,integer,text,text,boolean,jsonb)
  to service_role;

-- Explicit grants work on both clean Supabase projects and installations with older defaults.
do $$
declare t text;
begin
  foreach t in array array['profiles','vocabstream_lesson_attempts','vocabstream_question_attempts',
    'vocabstream_user_lesson_progress','vocabstream_user_mistakes','speakwise_lesson_settings',
    'speakwise_lesson_sessions','speakwise_lesson_summaries','speakwise_mistake_patterns',
    'vidmatch_videos','vidmatch_video_view_history','vidmatch_user_settings','vidmatch_transcripts','vidmatch_transcript_chunks'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    if t not in ('vidmatch_videos','vidmatch_transcripts','vidmatch_transcript_chunks') then
      execute format('grant select on table public.%I to authenticated', t);
    end if;
  end loop;
end;
$$;
grant update (username, display_name) on public.profiles to authenticated;
