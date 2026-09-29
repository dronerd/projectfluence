-- Durable discovery/evaluation workflow. No hosted data is changed by committing this file.
-- Provider snapshots and independently authored editorial annotations have separate lifetimes.
create table public.vidmatch_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check (length(run_key) between 1 and 200),
  evaluator_version text not null check (length(evaluator_version) between 1 and 100),
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 16384),
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null,
  metrics jsonb not null default '{}' check (jsonb_typeof(metrics) = 'object' and octet_length(metrics::text) <= 16384),
  error_code text check (length(error_code) <= 120),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.vidmatch_candidates (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  discovery_source text not null check (length(discovery_source) between 1 and 100),
  -- Own search/channel identifiers and query context only; never copied provider titles/descriptions.
  discovery_context jsonb not null default '{}' check (jsonb_typeof(discovery_context) = 'object' and octet_length(discovery_context::text) <= 8192),
  provider_metadata jsonb not null default '{}' check (jsonb_typeof(provider_metadata) = 'object' and octet_length(provider_metadata::text) <= 65536),
  metadata_checked_at timestamptz not null,
  metadata_expires_at timestamptz,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  stage text not null default 'pending' check (stage in ('pending','evaluating','approved','rejected','deferred','stale')),
  next_attempt_at timestamptz,
  claimed_run_id uuid references public.vidmatch_ingestion_runs(id),
  claim_token uuid,
  lease_until timestamptz,
  last_evaluator_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.vidmatch_evaluations (
  id uuid primary key,
  run_id uuid not null references public.vidmatch_ingestion_runs(id),
  video_id text not null references public.vidmatch_candidates(video_id),
  evaluator_version text not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  request_digest text not null,
  decision text not null check (decision in ('approved','rejected','deferred')),
  reason_codes text[] not null default '{}',
  -- Own review rationale/source IDs only, distinct from purgeable provider snapshots below.
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 16384),
  editorial jsonb not null default '{}' check (jsonb_typeof(editorial) = 'object' and octet_length(editorial::text) <= 16384),
  provider_metadata jsonb not null default '{}' check (jsonb_typeof(provider_metadata) = 'object' and octet_length(provider_metadata::text) <= 65536),
  provider_metadata_expires_at timestamptz,
  publication_status text not null default 'not_applicable' check (publication_status in ('inserted','activated','existing','conflict','not_applicable')),
  evaluated_at timestamptz not null default now(),
  unique (run_id, video_id)
);

alter table public.vidmatch_videos
  add column channel_id text,
  add column content_format text,
  add column classification_confidence numeric check (classification_confidence between 0 and 1),
  add column level_min text check (level_min in ('A1','A2','B1','B2','C1','C2')),
  add column level_max text check (level_max in ('A1','A2','B1','B2','C1','C2')),
  add column editorial_reviewed_at timestamptz,
  add column availability_status text not null default 'unknown' check (availability_status in ('unknown','active','suspect','inactive')),
  add column availability_checked_at timestamptz,
  add column unavailable_count integer not null default 0 check (unavailable_count between 0 and 2),
  add column unavailable_since timestamptz,
  -- A 30-day adoption window bounds retention of legacy rows without claiming they were verified.
  add column provider_metadata_expires_at timestamptz default (now() + interval '30 days'),
  add column latest_evaluation_id uuid references public.vidmatch_evaluations(id) on delete set null;

create index vidmatch_candidates_due_idx on public.vidmatch_candidates(stage, next_attempt_at, lease_until);
create index vidmatch_evaluations_video_idx on public.vidmatch_evaluations(video_id, evaluated_at desc);
create index vidmatch_videos_provider_expiry_idx on public.vidmatch_videos(provider_metadata_expires_at)
  where provider_metadata_expires_at is not null;
create index vidmatch_evaluations_provider_expiry_idx on public.vidmatch_evaluations(provider_metadata_expires_at)
  where provider_metadata_expires_at is not null;
create index vidmatch_candidates_metadata_expiry_idx on public.vidmatch_candidates(metadata_expires_at)
  where metadata_expires_at is not null;
-- Recommendation requests scan one level in stable video-ID pages; ranking happens in application code.
create index vidmatch_active_level_video_idx on public.vidmatch_videos(level, video_id)
  where availability_status = 'active';
create index vidmatch_videos_availability_check_idx on public.vidmatch_videos(availability_checked_at asc nulls first, video_id);

create function public.begin_vidmatch_ingestion_run(
  p_run_key text, p_evaluator_version text, p_config jsonb, p_lease_seconds integer default 900
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.vidmatch_ingestion_runs%rowtype;
begin
  if p_run_key is null or length(p_run_key) not between 1 and 200 or p_evaluator_version is null
    or length(p_evaluator_version) not between 1 and 100 or jsonb_typeof(p_config) is distinct from 'object'
    or octet_length(p_config::text) > 16384 or p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise exception 'Invalid ingestion run' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vidmatch-run:' || p_run_key, 0));
  select * into r from public.vidmatch_ingestion_runs where run_key = p_run_key for update;
  if found then
    if r.config is distinct from p_config or r.evaluator_version <> p_evaluator_version then
      raise exception 'Run key already has different configuration' using errcode = '22023';
    end if;
    if r.status in ('completed','partial') or (r.status = 'running' and r.lease_until > now()) then
      return jsonb_build_object('run_id',r.id,'lease_token',null,'lease_until',r.lease_until,'status',r.status,'claimed',false);
    end if;
    update public.vidmatch_ingestion_runs set status='running',lease_token=gen_random_uuid(),
      lease_until=now()+make_interval(secs=>p_lease_seconds),finished_at=null,error_code=null where id=r.id returning * into r;
  else
    insert into public.vidmatch_ingestion_runs(run_key,evaluator_version,config,lease_until)
    values(p_run_key,p_evaluator_version,p_config,now()+make_interval(secs=>p_lease_seconds)) returning * into r;
  end if;
  return jsonb_build_object('run_id',r.id,'lease_token',r.lease_token,'lease_until',r.lease_until,'status',r.status,'claimed',true);
end;
$$;

-- Internal guard, not a browser-callable API. All public entrypoints verify their lease.
create function public.vidmatch_ingestion_lease(p_run_id uuid,p_lease_token uuid)
returns public.vidmatch_ingestion_runs language plpgsql security definer set search_path = '' as $$
declare r public.vidmatch_ingestion_runs%rowtype;
begin
  select * into r from public.vidmatch_ingestion_runs where id=p_run_id for update;
  if not found or r.lease_token is distinct from p_lease_token or r.status <> 'running' or r.lease_until <= now() then
    raise exception 'Ingestion lease is unavailable' using errcode='42501';
  end if;
  return r;
end;
$$;

create function public.stage_vidmatch_candidates(p_run_id uuid,p_lease_token uuid,p_candidates jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.vidmatch_ingestion_runs%rowtype; item jsonb; old public.vidmatch_candidates%rowtype; checked timestamptz; staged integer:=0;
begin
  r:=public.vidmatch_ingestion_lease(p_run_id,p_lease_token);
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>50 then
    raise exception 'Candidates must be a batch of at most 50' using errcode='22023';
  end if;
  if (select count(distinct value->>'video_id') from jsonb_array_elements(p_candidates))<>jsonb_array_length(p_candidates) then
    raise exception 'Candidate IDs must be unique within a batch' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_candidates) order by value->>'video_id' loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'provider_metadata') is distinct from 'object'
      or jsonb_typeof(coalesce(item->'discovery_context','{}')) is distinct from 'object' then
      raise exception 'Invalid candidate' using errcode='22023';
    end if;
    checked:=(item->>'metadata_checked_at')::timestamptz;
    if checked is null or checked > now()+interval '5 minutes' then raise exception 'Invalid metadata timestamp' using errcode='22023'; end if;
    -- Also serialize absent identities, where SELECT FOR UPDATE cannot yet acquire a row lock.
    perform pg_advisory_xact_lock(hashtextextended('vidmatch-candidate:'||(item->>'video_id'),0));
    select * into old from public.vidmatch_candidates where video_id=item->>'video_id' for update;
    if found then
      update public.vidmatch_candidates set last_seen_at=now() where video_id=old.video_id;
      -- Never replace an in-flight worker's input or replace fresh metadata with a stale observation.
      if old.metadata_checked_at>checked then continue; end if;
      if old.stage='evaluating' and old.lease_until>now() then
        if old.claimed_run_id=p_run_id and old.claim_token=p_lease_token then
          -- The owning worker may rebind freshly verified input immediately before evaluation/commit.
          update public.vidmatch_candidates set provider_metadata=item->'provider_metadata',metadata_checked_at=checked,
            metadata_expires_at=least(checked+interval '30 days',now()+interval '30 days'),input_sha256=item->>'input_sha256',
            discovery_source=item->>'discovery_source',discovery_context=coalesce(item->'discovery_context','{}')
          where video_id=old.video_id;
          staged:=staged+1;
        end if;
        continue;
      end if;
      update public.vidmatch_candidates set
        discovery_source=item->>'discovery_source',discovery_context=coalesce(item->'discovery_context','{}'),
        provider_metadata=item->'provider_metadata',metadata_checked_at=checked,
        metadata_expires_at=least(checked+interval '30 days',now()+interval '30 days'),input_sha256=item->>'input_sha256',
        stage=case when old.input_sha256 is distinct from item->>'input_sha256' or old.last_evaluator_version is distinct from r.evaluator_version
          or old.metadata_expires_at is null or (old.stage in ('deferred','rejected') and old.next_attempt_at<=now()) then 'pending' else old.stage end,
        next_attempt_at=case when old.input_sha256 is distinct from item->>'input_sha256' or old.last_evaluator_version is distinct from r.evaluator_version
          or old.metadata_expires_at is null or (old.stage in ('deferred','rejected') and old.next_attempt_at<=now()) then now() else old.next_attempt_at end,
        claimed_run_id=null,claim_token=null,lease_until=null
      where video_id=old.video_id;
    else
      insert into public.vidmatch_candidates(video_id,discovery_source,discovery_context,provider_metadata,metadata_checked_at,metadata_expires_at,input_sha256,next_attempt_at)
      values(item->>'video_id',item->>'discovery_source',coalesce(item->'discovery_context','{}'),item->'provider_metadata',checked,
        least(checked+interval '30 days',now()+interval '30 days'),item->>'input_sha256',now());
    end if;
    staged:=staged+1;
  end loop;
  return jsonb_build_object('staged',staged);
end;
$$;

create function public.claim_vidmatch_candidates(p_run_id uuid,p_lease_token uuid,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.vidmatch_ingestion_runs%rowtype; result jsonb;
begin
  r:=public.vidmatch_ingestion_lease(p_run_id,p_lease_token);
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid claim limit' using errcode='22023'; end if;
  with due as (
    select c.video_id from public.vidmatch_candidates c
    where c.metadata_expires_at>now()
      and ((c.stage in ('pending','deferred') and coalesce(c.next_attempt_at,now())<=now())
        or (c.stage='evaluating' and coalesce(c.lease_until,now())<=now()))
      and not exists(select 1 from public.vidmatch_evaluations e where e.run_id=p_run_id and e.video_id=c.video_id)
    order by c.first_seen_at,c.video_id for update skip locked limit p_limit
  ), claimed as (
    update public.vidmatch_candidates c set stage='evaluating',claimed_run_id=p_run_id,claim_token=p_lease_token,lease_until=r.lease_until
    from due where c.video_id=due.video_id returning c.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
  return jsonb_build_object('candidates',result);
end;
$$;

create function public.commit_vidmatch_evaluations(p_run_id uuid,p_lease_token uuid,p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.vidmatch_ingestion_runs%rowtype; c public.vidmatch_candidates%rowtype; previous public.vidmatch_evaluations%rowtype;
  existing_video public.vidmatch_videos%rowtype; item jsonb; editorial jsonb; metadata jsonb; eid uuid;
  published text; digest text; reviewed timestamptz; retry_at timestamptz;
  approved integer:=0; rejected integer:=0; deferred integer:=0; inserted integer:=0; existing integer:=0; conflicts integer:=0;
  levels text[]:=array['A1','A2','B1','B2','C1','C2'];
begin
  select * into r from public.vidmatch_ingestion_runs where id=p_run_id for update;
  if not found or r.lease_token is distinct from p_lease_token then raise exception 'Ingestion lease is unavailable' using errcode='42501'; end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)>50 then
    raise exception 'Results must be a batch of at most 50' using errcode='22023';
  end if;
  if (select count(distinct value->>'video_id') from jsonb_array_elements(p_results))<>jsonb_array_length(p_results) then
    raise exception 'Evaluation IDs must be unique within a batch' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_results) order by value->>'video_id' loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'decision' is null or item->>'decision' not in ('approved','rejected','deferred')
      or jsonb_typeof(item->'evidence') is distinct from 'object' or jsonb_typeof(item->'editorial') is distinct from 'object'
      or jsonb_typeof(item->'reason_codes') is distinct from 'array' or jsonb_array_length(item->'reason_codes')>20 then
      raise exception 'Invalid evaluation' using errcode='22023';
    end if;
    digest:=md5(item::text);
    select * into previous from public.vidmatch_evaluations where run_id=p_run_id and video_id=item->>'video_id';
    if found then
      if previous.request_digest<>digest then raise exception 'Evaluation retry changed the result' using errcode='22023'; end if;
      published:=previous.publication_status;
    else
      if r.status<>'running' or r.lease_until<=now() then raise exception 'Ingestion lease expired' using errcode='42501'; end if;
      select * into c from public.vidmatch_candidates where video_id=item->>'video_id' for update;
      if not found or c.stage<>'evaluating' or c.claimed_run_id is distinct from p_run_id or c.claim_token is distinct from p_lease_token
        or c.lease_until<=now() or c.input_sha256 is distinct from item->>'input_sha256' then
        raise exception 'Candidate input or claim is unavailable' using errcode='42501';
      end if;
      eid:=(item->>'evaluation_id')::uuid;
      editorial:=item->'editorial'; metadata:=c.provider_metadata; published:='not_applicable';
      retry_at:=(item->>'retry_after')::timestamptz;
      if item->>'decision'='deferred' and (retry_at is null or retry_at<=now()) then
        raise exception 'Deferred evaluations require a future retry_after' using errcode='22023';
      end if;
      if exists(select 1 from jsonb_array_elements(item->'reason_codes') v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>120) then
        raise exception 'Invalid reason codes' using errcode='22023';
      end if;
      if item->>'decision'='approved' then
        reviewed:=(editorial->>'editorial_reviewed_at')::timestamptz;
        if not coalesce((editorial->>'level')=any(levels),false)
          or jsonb_typeof(editorial->'quality_score') is distinct from 'number' or (editorial->>'quality_score')::numeric not between 0 and 100
          or jsonb_typeof(editorial->'classification_confidence') is distinct from 'number' or (editorial->>'classification_confidence')::numeric not between 0 and 1
          or reviewed is null or reviewed>now()+interval '5 minutes'
          or jsonb_typeof(editorial->'skills') is distinct from 'array' or jsonb_typeof(editorial->'topics') is distinct from 'array'
          or c.metadata_expires_at is null or c.metadata_expires_at<=now()
          or metadata->>'privacy_status' is distinct from 'public' or metadata->>'upload_status' is distinct from 'processed'
          or metadata->'age_restricted' is distinct from 'false'::jsonb
          or metadata->'embeddable' is distinct from 'true'::jsonb
          or metadata->'region_restricted' is distinct from 'false'::jsonb or metadata->'live' is distinct from 'false'::jsonb
          or nullif(btrim(metadata->>'title'),'') is null or nullif(btrim(metadata->>'channel_name'),'') is null then
          raise exception 'Approval requires current public metadata and independent editorial review' using errcode='22023';
        end if;
        if (editorial->>'level_min' is not null and not (editorial->>'level_min')=any(levels))
          or (editorial->>'level_max' is not null and not (editorial->>'level_max')=any(levels))
          or array_position(levels,editorial->>'level_min')>array_position(levels,editorial->>'level_max')
          or array_position(levels,editorial->>'level_min')>array_position(levels,editorial->>'level')
          or array_position(levels,editorial->>'level')>array_position(levels,editorial->>'level_max') then
          raise exception 'Invalid level range' using errcode='22023';
        end if;
        published:='existing';
      end if;
      insert into public.vidmatch_evaluations(id,run_id,video_id,evaluator_version,input_sha256,request_digest,decision,reason_codes,evidence,editorial,provider_metadata,provider_metadata_expires_at)
      values(eid,p_run_id,c.video_id,r.evaluator_version,c.input_sha256,digest,item->>'decision',
        array(select jsonb_array_elements_text(item->'reason_codes')),item->'evidence',editorial,metadata,c.metadata_expires_at);
      if item->>'decision'='approved' then
        -- Lock the video identity across competing runs; never merge-replace established editorial labels.
        perform pg_advisory_xact_lock(hashtextextended('vidmatch-publish:'||c.video_id,0));
        select * into existing_video from public.vidmatch_videos where video_id=c.video_id for update;
        if not found then
          insert into public.vidmatch_videos(video_id,title,channel_name,channel_id,youtube_url,thumbnail_url,duration,level,skills,topics,accent,
            transcript_available,description,tags,quality_score,source,source_video_id,source_url,content_format,classification_confidence,
            level_min,level_max,editorial_reviewed_at,availability_status,availability_checked_at,provider_metadata_expires_at,latest_evaluation_id)
          values(c.video_id,metadata->>'title',metadata->>'channel_name',metadata->>'channel_id','https://www.youtube.com/watch?v='||c.video_id,
            metadata->>'thumbnail_url',metadata->>'duration',editorial->>'level',array(select jsonb_array_elements_text(editorial->'skills')),
            array(select jsonb_array_elements_text(editorial->'topics')),editorial->>'accent',coalesce((metadata->>'captions_available')::boolean,false),
            metadata->>'description',array(select jsonb_array_elements_text(coalesce(metadata->'tags','[]'))),(editorial->>'quality_score')::numeric,
            'youtube',c.video_id,'https://www.youtube.com/watch?v='||c.video_id,editorial->>'content_format',(editorial->>'classification_confidence')::numeric,
            editorial->>'level_min',editorial->>'level_max',reviewed,'active',c.metadata_checked_at,c.metadata_expires_at,eid);
          published:='inserted';
        elsif existing_video.level<>editorial->>'level'
          or (existing_video.availability_checked_at>c.metadata_checked_at and existing_video.availability_status in ('suspect','inactive')) then
          published:='conflict';
        else
          -- Matching legacy curated seeds may acquire provenance once. Existing editorial annotations remain intact.
          if existing_video.editorial_reviewed_at is null then
            update public.vidmatch_videos set content_format=coalesce(content_format,editorial->>'content_format'),
              classification_confidence=coalesce(classification_confidence,(editorial->>'classification_confidence')::numeric),
              level_min=coalesce(level_min,editorial->>'level_min'),level_max=coalesce(level_max,editorial->>'level_max'),
              editorial_reviewed_at=reviewed,latest_evaluation_id=eid where video_id=c.video_id;
            published:='activated';
          end if;
          if existing_video.availability_checked_at is null or existing_video.availability_checked_at<=c.metadata_checked_at then
            update public.vidmatch_videos set title=metadata->>'title',channel_name=metadata->>'channel_name',channel_id=metadata->>'channel_id',
              thumbnail_url=metadata->>'thumbnail_url',duration=metadata->>'duration',description=metadata->>'description',
              tags=array(select jsonb_array_elements_text(coalesce(metadata->'tags','[]'))),
              transcript_available=coalesce((metadata->>'captions_available')::boolean,false),availability_status='active',
              availability_checked_at=c.metadata_checked_at,unavailable_count=0,unavailable_since=null,provider_metadata_expires_at=c.metadata_expires_at
            where video_id=c.video_id;
          end if;
        end if;
      end if;
      update public.vidmatch_evaluations set publication_status=published where id=eid;
      update public.vidmatch_candidates set stage=item->>'decision',next_attempt_at=retry_at,
        last_evaluator_version=r.evaluator_version,claimed_run_id=null,claim_token=null,lease_until=null where video_id=c.video_id;
    end if;
    if item->>'decision'='approved' then approved:=approved+1;
    elsif item->>'decision'='rejected' then rejected:=rejected+1;
    else deferred:=deferred+1; end if;
    if published='inserted' then inserted:=inserted+1;
    elsif published='conflict' then conflicts:=conflicts+1;
    elsif published in ('existing','activated') then existing:=existing+1; end if;
  end loop;
  return jsonb_build_object('approved',approved,'rejected',rejected,'deferred',deferred,'inserted',inserted,'existing',existing,'activation_conflicts',conflicts);
end;
$$;

create function public.finish_vidmatch_ingestion_run(p_run_id uuid,p_lease_token uuid,p_status text,p_metrics jsonb,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.vidmatch_ingestion_runs%rowtype;
begin
  select * into r from public.vidmatch_ingestion_runs where id=p_run_id for update;
  if not found or r.lease_token is distinct from p_lease_token then raise exception 'Ingestion lease unavailable' using errcode='42501'; end if;
  if p_status is null or p_status not in ('completed','partial','failed') or jsonb_typeof(p_metrics) is distinct from 'object' then
    raise exception 'Invalid completion' using errcode='22023';
  end if;
  if r.status<>'running' then
    if r.status=p_status and r.metrics=p_metrics and r.error_code is not distinct from p_error_code then return jsonb_build_object('run_id',r.id,'status',r.status); end if;
    raise exception 'Run already completed differently' using errcode='22023';
  end if;
  if r.lease_until<=now() then raise exception 'Ingestion lease expired' using errcode='42501'; end if;
  -- Release unfinished work immediately on a bounded partial/failed run, without losing staged input.
  update public.vidmatch_candidates set stage='pending',next_attempt_at=now(),claimed_run_id=null,claim_token=null,lease_until=null
    where claimed_run_id=p_run_id and claim_token=p_lease_token;
  update public.vidmatch_ingestion_runs set status=p_status,metrics=p_metrics,error_code=p_error_code,finished_at=now(),lease_until=now() where id=p_run_id;
  return jsonb_build_object('run_id',p_run_id,'status',p_status);
end;
$$;

create function public.refresh_vidmatch_provider_metadata(p_checks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb; metadata jsonb; v public.vidmatch_videos%rowtype; checked timestamptz; expires timestamptz; failures integer; state text;
  active_count integer:=0; suspect_count integer:=0; inactive_count integer:=0; transient_count integer:=0; ignored_count integer:=0; unknown_count integer:=0;
begin
  if jsonb_typeof(p_checks) is distinct from 'array' or jsonb_array_length(p_checks)>50 then
    raise exception 'Checks must be a batch of at most 50' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_checks) order by value->>'video_id',value->>'checked_at' loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'status' is null
      or item->>'status' not in ('available','missing','restricted','transient_error')
      or not coalesce((item->>'video_id') ~ '^[A-Za-z0-9_-]{11}$',false) then
      raise exception 'Invalid availability check' using errcode='22023';
    end if;
    checked:=(item->>'checked_at')::timestamptz;
    if checked is null or checked>now()+interval '5 minutes' then raise exception 'Invalid availability timestamp' using errcode='22023'; end if;
    select * into v from public.vidmatch_videos where video_id=item->>'video_id' for update;
    if not found then ignored_count:=ignored_count+1; continue; end if;
    if item->>'status'='transient_error' then transient_count:=transient_count+1; continue; end if;
    if v.availability_checked_at is not null and checked<=v.availability_checked_at then ignored_count:=ignored_count+1; continue; end if;
    if item->>'status'='available' then
      metadata:=item->'provider_metadata';
      if jsonb_typeof(metadata) is distinct from 'object' or octet_length(metadata::text)>65536
        or metadata->>'privacy_status' is distinct from 'public' or metadata->>'upload_status' is distinct from 'processed'
        or metadata->'age_restricted' is distinct from 'false'::jsonb or metadata->'embeddable' is distinct from 'true'::jsonb
        or metadata->'region_restricted' is distinct from 'false'::jsonb or metadata->'live' is distinct from 'false'::jsonb
        or nullif(btrim(metadata->>'title'),'') is null or nullif(btrim(metadata->>'channel_name'),'') is null
        or checked<=now()-interval '30 days' then
        raise exception 'Available check requires fresh eligible metadata' using errcode='22023';
      end if;
      expires:=least(checked+interval '30 days',now()+interval '30 days');
      -- Fresh availability never fabricates editorial approval of unreviewed legacy entries.
      state:=case when v.editorial_reviewed_at is not null then 'active' else 'unknown' end;
      update public.vidmatch_videos set title=metadata->>'title',channel_name=metadata->>'channel_name',channel_id=metadata->>'channel_id',
        youtube_url='https://www.youtube.com/watch?v='||v.video_id,source_url='https://www.youtube.com/watch?v='||v.video_id,
        thumbnail_url=metadata->>'thumbnail_url',duration=metadata->>'duration',description=metadata->>'description',
        tags=array(select jsonb_array_elements_text(coalesce(metadata->'tags','[]'))),
        transcript_available=coalesce((metadata->>'captions_available')::boolean,false),
        availability_status=state,availability_checked_at=checked,unavailable_count=0,unavailable_since=null,
        provider_metadata_expires_at=expires where video_id=v.video_id;
      if state='active' then active_count:=active_count+1; else unknown_count:=unknown_count+1; end if;
    else
      if v.unavailable_count=0 then failures:=1;
      elsif v.unavailable_count>=2 then failures:=2;
      elsif checked>=v.unavailable_since+interval '24 hours' then failures:=2;
      else failures:=1; end if;
      state:=case when failures=2 then 'inactive' else 'suspect' end;
      update public.vidmatch_videos set availability_status=state,availability_checked_at=checked,
        unavailable_count=failures,unavailable_since=coalesce(unavailable_since,checked) where video_id=v.video_id;
      if failures=2 then inactive_count:=inactive_count+1; else suspect_count:=suspect_count+1; end if;
    end if;
  end loop;
  return jsonb_build_object('active',active_count,'suspect',suspect_count,'inactive',inactive_count,'transient',transient_count,'ignored',ignored_count,'unknown',unknown_count);
end;
$$;

-- History snapshots have their own lifetime; a refreshed catalog cannot keep older copies indefinitely.
alter table public.vidmatch_video_view_history add column provider_metadata_expires_at timestamptz default(now()+interval '30 days');
create index vidmatch_history_provider_expiry_idx on public.vidmatch_video_view_history(provider_metadata_expires_at)
  where provider_metadata_expires_at is not null;
create or replace function public.record_vidmatch_video_view(p_user_id uuid,p_video_id text)
returns public.vidmatch_video_view_history language plpgsql security definer set search_path = '' as $$
declare v_history public.vidmatch_video_view_history%rowtype;
begin
  if p_user_id is null then raise exception 'Learner is required' using errcode='22023'; end if;
  insert into public.vidmatch_video_view_history(user_id,video_id,title,channel_name,youtube_url,thumbnail_url,duration,level,skills,topics,accent,quality_score,provider_metadata_expires_at)
  select p_user_id,video_id,title,channel_name,youtube_url,thumbnail_url,duration,level,skills,topics,accent,quality_score,provider_metadata_expires_at
  from public.vidmatch_videos where video_id=p_video_id
  on conflict(user_id,video_id) do update set title=excluded.title,channel_name=excluded.channel_name,youtube_url=excluded.youtube_url,
    thumbnail_url=excluded.thumbnail_url,duration=excluded.duration,level=excluded.level,skills=excluded.skills,topics=excluded.topics,
    accent=excluded.accent,quality_score=excluded.quality_score,provider_metadata_expires_at=excluded.provider_metadata_expires_at,
    click_count=public.vidmatch_video_view_history.click_count+1,last_clicked_at=now(),updated_at=now()
  returning * into v_history;
  if not found then raise exception 'Video is unavailable' using errcode='22023'; end if;
  return v_history;
end;
$$;

create function public.purge_expired_vidmatch_provider_data(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare budget integer:=p_limit; affected integer; catalog_count integer:=0; history_count integer:=0; candidate_count integer:=0; evaluation_count integer:=0; has_more boolean;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid purge limit' using errcode='22023'; end if;
  with expired as (
    select video_id from public.vidmatch_videos where provider_metadata_expires_at<=now()
      order by provider_metadata_expires_at,video_id for update skip locked limit budget
  ) update public.vidmatch_videos v set title='Video details unavailable',channel_name='',channel_id=null,thumbnail_url=null,
    duration=null,description=null,tags='{}',speaker_name=null,transcript_available=false,
    youtube_url='https://www.youtube.com/watch?v='||v.video_id,source_url='https://www.youtube.com/watch?v='||v.video_id,
    availability_status='inactive',provider_metadata_expires_at=null
  from expired where v.video_id=expired.video_id;
  get diagnostics affected=row_count; catalog_count:=affected; budget:=budget-affected;
  with expired as (
    select id from public.vidmatch_video_view_history where provider_metadata_expires_at<=now()
      order by provider_metadata_expires_at,id for update skip locked limit budget
  ) update public.vidmatch_video_view_history h set title='Video details unavailable',channel_name='',thumbnail_url=null,duration=null,
    youtube_url='https://www.youtube.com/watch?v='||h.video_id,provider_metadata_expires_at=null
  from expired where h.id=expired.id;
  get diagnostics affected=row_count; history_count:=affected; budget:=budget-affected;
  with expired as (
    select video_id from public.vidmatch_candidates where metadata_expires_at<=now()
      order by metadata_expires_at,video_id for update skip locked limit budget
  ) update public.vidmatch_candidates c set provider_metadata='{}',metadata_expires_at=null,stage='stale',next_attempt_at=null,
    claimed_run_id=null,claim_token=null,lease_until=null
  from expired where c.video_id=expired.video_id;
  get diagnostics affected=row_count; candidate_count:=affected; budget:=budget-affected;
  with expired as (
    select id from public.vidmatch_evaluations where provider_metadata_expires_at<=now()
      order by provider_metadata_expires_at,id for update skip locked limit budget
  ) update public.vidmatch_evaluations e set provider_metadata='{}',provider_metadata_expires_at=null
  from expired where e.id=expired.id;
  get diagnostics affected=row_count; evaluation_count:=affected; budget:=budget-affected;
  has_more:=exists(select 1 from public.vidmatch_videos where provider_metadata_expires_at<=now())
    or exists(select 1 from public.vidmatch_video_view_history where provider_metadata_expires_at<=now())
    or exists(select 1 from public.vidmatch_candidates where metadata_expires_at<=now())
    or exists(select 1 from public.vidmatch_evaluations where provider_metadata_expires_at<=now());
  return jsonb_build_object('purged',p_limit-budget,'remaining',has_more,'catalog',catalog_count,'history',history_count,'candidates',candidate_count,'evaluations',evaluation_count);
end;
$$;

-- All pipeline state and commands are private to the server credential.
alter table public.vidmatch_ingestion_runs enable row level security;
alter table public.vidmatch_candidates enable row level security;
alter table public.vidmatch_evaluations enable row level security;
revoke all on public.vidmatch_ingestion_runs,public.vidmatch_candidates,public.vidmatch_evaluations from public,anon,authenticated;
grant all on public.vidmatch_ingestion_runs,public.vidmatch_candidates,public.vidmatch_evaluations to service_role;
create policy "Service role manages ingestion runs" on public.vidmatch_ingestion_runs for all to service_role using(true) with check(true);
create policy "Service role manages candidates" on public.vidmatch_candidates for all to service_role using(true) with check(true);
create policy "Service role manages evaluations" on public.vidmatch_evaluations for all to service_role using(true) with check(true);
revoke all on function public.begin_vidmatch_ingestion_run(text,text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.vidmatch_ingestion_lease(uuid,uuid) from public,anon,authenticated;
revoke all on function public.stage_vidmatch_candidates(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.claim_vidmatch_candidates(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.commit_vidmatch_evaluations(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_vidmatch_ingestion_run(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.refresh_vidmatch_provider_metadata(jsonb) from public,anon,authenticated;
revoke all on function public.purge_expired_vidmatch_provider_data(integer) from public,anon,authenticated;
revoke all on function public.record_vidmatch_video_view(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_vidmatch_ingestion_run(text,text,jsonb,integer) to service_role;
grant execute on function public.stage_vidmatch_candidates(uuid,uuid,jsonb) to service_role;
grant execute on function public.claim_vidmatch_candidates(uuid,uuid,integer) to service_role;
grant execute on function public.commit_vidmatch_evaluations(uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_vidmatch_ingestion_run(uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.refresh_vidmatch_provider_metadata(jsonb) to service_role;
grant execute on function public.purge_expired_vidmatch_provider_data(integer) to service_role;
grant execute on function public.record_vidmatch_video_view(uuid,text) to service_role;
-- The guard is called by definer-owned entrypoints only; it has no direct service-role grant.
notify pgrst, 'reload schema';
