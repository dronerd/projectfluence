-- Adopt the transcript foundation in the root CLI migration chain.
-- Source: apps/vidmatch/supabase/migrations/202608090001_transcript_foundation.sql
create table if not exists public.vidmatch_transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references public.vidmatch_videos (video_id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 80),
  language_code text not null check (char_length(language_code) between 2 and 35),
  is_generated boolean not null default false,
  source_url text,
  status text not null check (status in ('available', 'unavailable', 'empty', 'malformed', 'failed')),
  content_sha256 text,
  content_version integer not null default 0 check (content_version >= 0),
  chunking_version text not null,
  segment_count integer not null default 0 check (segment_count >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  error_code text,
  error_message text,
  retryable boolean not null default false,
  acquired_at timestamptz,
  last_attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, provider, language_code)
);

create table if not exists public.vidmatch_transcript_chunks (
  chunk_id text primary key,
  transcript_id uuid not null references public.vidmatch_transcripts (id) on delete cascade,
  video_id text not null references public.vidmatch_videos (video_id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  text text not null check (char_length(text) > 0),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  word_count integer not null check (word_count > 0),
  char_count integer not null check (char_count > 0),
  content_sha256 text not null,
  source_segment_start integer not null check (source_segment_start >= 0),
  source_segment_end integer not null check (source_segment_end >= source_segment_start),
  created_at timestamptz not null default now(),
  unique (transcript_id, chunk_index)
);

create index if not exists vidmatch_transcripts_video_idx
on public.vidmatch_transcripts (video_id);
create index if not exists vidmatch_transcripts_status_idx
on public.vidmatch_transcripts (status, last_attempted_at desc);
create index if not exists vidmatch_transcript_chunks_video_idx
on public.vidmatch_transcript_chunks (video_id, chunk_index);
create index if not exists vidmatch_transcript_chunks_transcript_time_idx
on public.vidmatch_transcript_chunks (transcript_id, start_ms);

drop trigger if exists set_vidmatch_transcripts_updated_at on public.vidmatch_transcripts;
create trigger set_vidmatch_transcripts_updated_at
before update on public.vidmatch_transcripts
for each row
execute function public.set_updated_at();

alter table public.vidmatch_transcripts enable row level security;
alter table public.vidmatch_transcript_chunks enable row level security;

drop policy if exists "Service role can manage VidMatch transcripts" on public.vidmatch_transcripts;
create policy "Service role can manage VidMatch transcripts"
on public.vidmatch_transcripts
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage VidMatch transcript chunks" on public.vidmatch_transcript_chunks;
create policy "Service role can manage VidMatch transcript chunks"
on public.vidmatch_transcript_chunks
for all
to service_role
using (true)
with check (true);

create or replace function public.upsert_vidmatch_transcript_snapshot(
  p_video_id text,
  p_provider text,
  p_language_code text,
  p_is_generated boolean,
  p_source_url text,
  p_status text,
  p_content_sha256 text,
  p_chunking_version text,
  p_segment_count integer,
  p_error_code text,
  p_error_message text,
  p_retryable boolean,
  p_chunks jsonb
)
returns public.vidmatch_transcripts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transcript public.vidmatch_transcripts%rowtype;
  v_existing public.vidmatch_transcripts%rowtype;
  v_has_existing boolean := false;
  v_content_changed boolean := false;
  v_chunk_count integer := 0;
begin
  if p_status not in ('available', 'unavailable', 'empty', 'malformed', 'failed') then
    raise exception 'Unsupported transcript status: %', p_status using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_chunks, '[]'::jsonb)) <> 'array' then
    raise exception 'p_chunks must be a JSON array' using errcode = '22023';
  end if;

  v_chunk_count := jsonb_array_length(coalesce(p_chunks, '[]'::jsonb));

  if p_status = 'available' and (p_content_sha256 is null or v_chunk_count = 0 or p_segment_count <= 0) then
    raise exception 'Available transcripts require content, segments, and chunks' using errcode = '22023';
  end if;

  if p_status <> 'available' and v_chunk_count > 0 then
    raise exception 'Non-available transcript attempts cannot include chunks' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(concat_ws(':', p_video_id, p_provider, p_language_code), 0)
  );

  select *
  into v_existing
  from public.vidmatch_transcripts
  where video_id = p_video_id
    and provider = p_provider
    and language_code = p_language_code
  for update;

  v_has_existing := found;
  v_content_changed := p_status = 'available' and (
    not v_has_existing
    or v_existing.content_sha256 is distinct from p_content_sha256
    or v_existing.chunking_version is distinct from p_chunking_version
  );

  if not v_has_existing then
    insert into public.vidmatch_transcripts (
      video_id,
      provider,
      language_code,
      is_generated,
      source_url,
      status,
      content_sha256,
      content_version,
      chunking_version,
      segment_count,
      chunk_count,
      error_code,
      error_message,
      retryable,
      acquired_at,
      last_attempted_at
    )
    values (
      p_video_id,
      p_provider,
      p_language_code,
      p_is_generated,
      p_source_url,
      p_status,
      case when p_status = 'available' then p_content_sha256 else null end,
      case when p_status = 'available' then 1 else 0 end,
      p_chunking_version,
      case when p_status = 'available' then p_segment_count else 0 end,
      case when p_status = 'available' then v_chunk_count else 0 end,
      p_error_code,
      p_error_message,
      p_retryable,
      case when p_status = 'available' then now() else null end,
      now()
    )
    returning * into v_transcript;
  else
    update public.vidmatch_transcripts
    set
      is_generated = p_is_generated,
      source_url = coalesce(p_source_url, source_url),
      status = p_status,
      content_sha256 = case when p_status = 'available' then p_content_sha256 else content_sha256 end,
      content_version = case when v_content_changed then content_version + 1 else content_version end,
      chunking_version = case when p_status = 'available' then p_chunking_version else chunking_version end,
      segment_count = case when p_status = 'available' then p_segment_count else segment_count end,
      chunk_count = case when p_status = 'available' then v_chunk_count else chunk_count end,
      error_code = p_error_code,
      error_message = p_error_message,
      retryable = p_retryable,
      acquired_at = case when p_status = 'available' then now() else acquired_at end,
      last_attempted_at = now()
    where id = v_existing.id
    returning * into v_transcript;
  end if;

  if v_content_changed then
    delete from public.vidmatch_transcript_chunks
    where transcript_id = v_transcript.id;

    insert into public.vidmatch_transcript_chunks (
      chunk_id,
      transcript_id,
      video_id,
      chunk_index,
      text,
      start_ms,
      end_ms,
      word_count,
      char_count,
      content_sha256,
      source_segment_start,
      source_segment_end
    )
    select
      chunk->>'chunk_id',
      v_transcript.id,
      p_video_id,
      (chunk->>'chunk_index')::integer,
      chunk->>'text',
      (chunk->>'start_ms')::integer,
      (chunk->>'end_ms')::integer,
      (chunk->>'word_count')::integer,
      (chunk->>'char_count')::integer,
      chunk->>'content_sha256',
      (chunk->>'source_segment_start')::integer,
      (chunk->>'source_segment_end')::integer
    from jsonb_array_elements(p_chunks) as chunk;
  end if;

  if p_status = 'available' then
    update public.vidmatch_videos
    set transcript_available = true
    where video_id = p_video_id;
  end if;

  select * into v_transcript
  from public.vidmatch_transcripts
  where id = v_transcript.id;

  return v_transcript;
end;
$$;

revoke all on function public.upsert_vidmatch_transcript_snapshot(
  text, text, text, boolean, text, text, text, text, integer, text, text, boolean, jsonb
) from public;

grant execute on function public.upsert_vidmatch_transcript_snapshot(
  text, text, text, boolean, text, text, text, text, integer, text, text, boolean, jsonb
) to service_role;
