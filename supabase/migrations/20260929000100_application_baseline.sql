-- Canonical migration entry point. Legacy per-app schema files are historical snapshots.
-- Idempotent CREATE/ALTER statements also adopt installations provisioned from those files.


-- apps/vocabstream/supabase/schema.sql (pre-transcript baseline)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists username text unique;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do update
  set
    email = excluded.email,
    username = coalesce(excluded.username, public.profiles.username),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.vocabstream_lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  anonymous_user_id text,
  user_username text,
  lesson_id text not null,
  genre text not null,
  lesson_number integer,
  lesson_title text,
  word_count integer not null default 0 check (word_count >= 0),
  meaning_score integer not null default 0 check (meaning_score >= 0),
  meaning_total integer not null default 0 check (meaning_total >= 0),
  quiz_score integer not null default 0 check (quiz_score >= 0),
  quiz_total integer not null default 0 check (quiz_total >= 0),
  total_score integer not null default 0 check (total_score >= 0),
  total_possible integer not null default 0 check (total_possible >= 0),
  percent_score numeric(5, 2) not null default 0 check (percent_score >= 0 and percent_score <= 100),
  replay_completed boolean not null default false,
  replay_correct integer not null default 0 check (replay_correct >= 0),
  replay_total integer not null default 0 check (replay_total >= 0),
  created_at timestamptz not null default now()
);

alter table public.vocabstream_lesson_attempts
add column if not exists user_id uuid references auth.users (id) on delete cascade;

create table if not exists public.vocabstream_question_attempts (
  id uuid primary key default gen_random_uuid(),
  lesson_attempt_id uuid not null references public.vocabstream_lesson_attempts (id) on delete cascade,
  question_type text not null check (question_type in ('meaning', 'quiz')),
  word text not null,
  prompt text,
  correct_answer text not null,
  selected_answer text not null,
  is_correct boolean not null,
  is_replay boolean not null default false,
  attempt_order integer not null default 0 check (attempt_order >= 0),
  choices text[] not null default '{}',
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.vocabstream_user_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null,
  genre text not null,
  lesson_number integer,
  lesson_title text,
  word_count integer not null default 0 check (word_count >= 0),
  latest_lesson_attempt_id uuid references public.vocabstream_lesson_attempts (id) on delete set null,
  meaning_score integer not null default 0 check (meaning_score >= 0),
  meaning_total integer not null default 0 check (meaning_total >= 0),
  quiz_score integer not null default 0 check (quiz_score >= 0),
  quiz_total integer not null default 0 check (quiz_total >= 0),
  total_score integer not null default 0 check (total_score >= 0),
  total_possible integer not null default 0 check (total_possible >= 0),
  percent_score numeric(5, 2) not null default 0 check (percent_score >= 0 and percent_score <= 100),
  replay_completed boolean not null default false,
  replay_correct integer not null default 0 check (replay_correct >= 0),
  replay_total integer not null default 0 check (replay_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table if not exists public.vocabstream_user_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null,
  word_key text not null,
  definition text,
  example text,
  explanation text,
  source_category text not null,
  source_lesson_id text,
  source_lesson_number integer,
  mistake_count integer not null default 1 check (mistake_count >= 1),
  last_question_type text check (last_question_type in ('meaning', 'quiz')),
  last_prompt text,
  last_correct_answer text,
  last_selected_answer text,
  last_mistaken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_category, word_key)
);

create index if not exists profiles_updated_at_idx
on public.profiles (updated_at desc);

create unique index if not exists profiles_username_key
on public.profiles (username)
where username is not null;

create index if not exists vocabstream_lesson_attempts_auth_user_idx
on public.vocabstream_lesson_attempts (user_id, created_at desc);

create index if not exists vocabstream_lesson_attempts_user_idx
on public.vocabstream_lesson_attempts (anonymous_user_id, user_username);

create index if not exists vocabstream_lesson_attempts_lesson_idx
on public.vocabstream_lesson_attempts (lesson_id, created_at desc);

create index if not exists vocabstream_lesson_attempts_genre_idx
on public.vocabstream_lesson_attempts (genre, created_at desc);

create index if not exists vocabstream_question_attempts_lesson_attempt_idx
on public.vocabstream_question_attempts (lesson_attempt_id);

create index if not exists vocabstream_question_attempts_word_idx
on public.vocabstream_question_attempts (word, is_correct);

create index if not exists vocabstream_question_attempts_type_idx
on public.vocabstream_question_attempts (question_type, is_correct);

create index if not exists vocabstream_user_lesson_progress_user_idx
on public.vocabstream_user_lesson_progress (user_id, updated_at desc);

create index if not exists vocabstream_user_lesson_progress_genre_idx
on public.vocabstream_user_lesson_progress (user_id, genre, lesson_number);

create index if not exists vocabstream_user_mistakes_user_idx
on public.vocabstream_user_mistakes (user_id, mistake_count desc, updated_at desc);

create index if not exists vocabstream_user_mistakes_source_idx
on public.vocabstream_user_mistakes (user_id, source_category, source_lesson_number);

alter table public.vocabstream_lesson_attempts enable row level security;
alter table public.vocabstream_question_attempts enable row level security;
alter table public.vocabstream_user_lesson_progress enable row level security;
alter table public.vocabstream_user_mistakes enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Service role can manage profiles" on public.profiles;
create policy "Service role can manage profiles"
on public.profiles
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can read own VocabStream lesson attempts" on public.vocabstream_lesson_attempts;
create policy "Users can read own VocabStream lesson attempts"
on public.vocabstream_lesson_attempts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own VocabStream question attempts" on public.vocabstream_question_attempts;
create policy "Users can read own VocabStream question attempts"
on public.vocabstream_question_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.vocabstream_lesson_attempts lesson_attempts
    where lesson_attempts.id = vocabstream_question_attempts.lesson_attempt_id
      and lesson_attempts.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own VocabStream lesson progress" on public.vocabstream_user_lesson_progress;
create policy "Users can read own VocabStream lesson progress"
on public.vocabstream_user_lesson_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own VocabStream mistakes" on public.vocabstream_user_mistakes;
create policy "Users can read own VocabStream mistakes"
on public.vocabstream_user_mistakes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role can manage VocabStream lesson progress" on public.vocabstream_user_lesson_progress;
create policy "Service role can manage VocabStream lesson progress"
on public.vocabstream_user_lesson_progress
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage VocabStream mistakes" on public.vocabstream_user_mistakes;
create policy "Service role can manage VocabStream mistakes"
on public.vocabstream_user_mistakes
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage VocabStream lesson attempts" on public.vocabstream_lesson_attempts;
create policy "Service role can manage VocabStream lesson attempts"
on public.vocabstream_lesson_attempts
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage VocabStream question attempts" on public.vocabstream_question_attempts;
create policy "Service role can manage VocabStream question attempts"
on public.vocabstream_question_attempts
for all
to service_role
using (true)
with check (true);


-- apps/speakwise/supabase/schema.sql (pre-transcript baseline)
create extension if not exists pgcrypto;

create table if not exists public.speakwise_lesson_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.speakwise_lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('speaking', 'writing')),
  lesson_mode text not null default 'natural_conversation',
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  planned_duration_minutes integer not null default 0 check (planned_duration_minutes >= 0),
  selected_topics text[] not null default '{}',
  selected_components text[] not null default '{}',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.speakwise_lesson_sessions
add column if not exists lesson_mode text not null default 'natural_conversation';

create table if not exists public.speakwise_lesson_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.speakwise_lesson_sessions (id) on delete set null,
  lesson_mode text not null default 'natural_conversation',
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  topics text[] not null default '{}',
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  summary jsonb not null default '{}'::jsonb,
  mistakes jsonb not null default '[]'::jsonb,
  recommendations text[] not null default '{}',
  useful_vocabulary text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.speakwise_mistake_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mistake_type text not null,
  pattern text not null,
  count integer not null default 1 check (count >= 1),
  latest_original text,
  latest_correction text,
  latest_explanation text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, mistake_type, pattern)
);

create index if not exists speakwise_lesson_settings_updated_at_idx
on public.speakwise_lesson_settings (updated_at desc);
create index if not exists speakwise_lesson_sessions_user_idx
on public.speakwise_lesson_sessions (user_id, started_at desc);
create index if not exists speakwise_lesson_sessions_mode_idx
on public.speakwise_lesson_sessions (user_id, mode, started_at desc);
create index if not exists speakwise_lesson_sessions_lesson_mode_idx
on public.speakwise_lesson_sessions (user_id, lesson_mode, started_at desc);
create index if not exists speakwise_lesson_summaries_user_idx
on public.speakwise_lesson_summaries (user_id, created_at desc);
create index if not exists speakwise_lesson_summaries_mode_idx
on public.speakwise_lesson_summaries (user_id, lesson_mode, created_at desc);
create index if not exists speakwise_mistake_patterns_user_idx
on public.speakwise_mistake_patterns (user_id, count desc, last_seen_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_speakwise_lesson_settings_updated_at on public.speakwise_lesson_settings;
create trigger set_speakwise_lesson_settings_updated_at
before update on public.speakwise_lesson_settings
for each row
execute function public.set_updated_at();

alter table public.speakwise_lesson_settings enable row level security;
alter table public.speakwise_lesson_sessions enable row level security;
alter table public.speakwise_lesson_summaries enable row level security;
alter table public.speakwise_mistake_patterns enable row level security;

drop policy if exists "Users can read own SpeakWise lesson settings" on public.speakwise_lesson_settings;
create policy "Users can read own SpeakWise lesson settings"
on public.speakwise_lesson_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role can manage SpeakWise lesson settings" on public.speakwise_lesson_settings;
create policy "Service role can manage SpeakWise lesson settings"
on public.speakwise_lesson_settings
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can read own SpeakWise lesson sessions" on public.speakwise_lesson_sessions;
create policy "Users can read own SpeakWise lesson sessions"
on public.speakwise_lesson_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role can manage SpeakWise lesson sessions" on public.speakwise_lesson_sessions;
create policy "Service role can manage SpeakWise lesson sessions"
on public.speakwise_lesson_sessions
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can read own SpeakWise lesson summaries" on public.speakwise_lesson_summaries;
create policy "Users can read own SpeakWise lesson summaries"
on public.speakwise_lesson_summaries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role can manage SpeakWise lesson summaries" on public.speakwise_lesson_summaries;
create policy "Service role can manage SpeakWise lesson summaries"
on public.speakwise_lesson_summaries
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can read own SpeakWise mistake patterns" on public.speakwise_mistake_patterns;
create policy "Users can read own SpeakWise mistake patterns"
on public.speakwise_mistake_patterns
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role can manage SpeakWise mistake patterns" on public.speakwise_mistake_patterns;
create policy "Service role can manage SpeakWise mistake patterns"
on public.speakwise_mistake_patterns
for all
to service_role
using (true)
with check (true);


-- apps/vidmatch/supabase/schema.sql (pre-transcript baseline)
create extension if not exists pgcrypto;

create table if not exists public.vidmatch_videos (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  title text not null,
  channel_name text not null,
  youtube_url text not null,
  thumbnail_url text,
  duration text,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  skills text[] not null default '{}',
  topics text[] not null default '{}',
  accent text,
  transcript_available boolean not null default false,
  description text,
  tags text[] not null default '{}',
  quality_score numeric(5, 2) not null default 0 check (quality_score >= 0 and quality_score <= 100),
  source text not null default 'youtube',
  source_video_id text not null default '',
  speaker_name text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vidmatch_videos
add column if not exists source text not null default 'youtube';
alter table public.vidmatch_videos
add column if not exists source_video_id text not null default '';
alter table public.vidmatch_videos
add column if not exists speaker_name text;
alter table public.vidmatch_videos
add column if not exists source_url text;

update public.vidmatch_videos
set
  source = coalesce(nullif(source, ''), 'youtube'),
  source_video_id = coalesce(nullif(source_video_id, ''), video_id),
  source_url = coalesce(source_url, youtube_url)
where source_video_id = '' or source_url is null or source = '';

create table if not exists public.vidmatch_video_view_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id text not null,
  title text not null,
  channel_name text not null,
  youtube_url text not null,
  thumbnail_url text,
  duration text,
  level text,
  skills text[] not null default '{}',
  topics text[] not null default '{}',
  accent text,
  quality_score numeric(5, 2) not null default 0 check (quality_score >= 0 and quality_score <= 100),
  click_count integer not null default 1 check (click_count >= 1),
  created_at timestamptz not null default now(),
  last_clicked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, video_id)
);

create table if not exists public.vidmatch_user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vidmatch_videos
drop constraint if exists vidmatch_videos_level_check;

alter table public.vidmatch_videos
add constraint vidmatch_videos_level_check
check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

create index if not exists vidmatch_videos_level_idx on public.vidmatch_videos (level);
create index if not exists vidmatch_videos_quality_score_idx on public.vidmatch_videos (quality_score desc);
create index if not exists vidmatch_videos_transcript_available_idx on public.vidmatch_videos (transcript_available);
create index if not exists vidmatch_videos_skills_idx on public.vidmatch_videos using gin (skills);
create index if not exists vidmatch_videos_topics_idx on public.vidmatch_videos using gin (topics);
create index if not exists vidmatch_videos_tags_idx on public.vidmatch_videos using gin (tags);
create index if not exists vidmatch_video_view_history_user_idx
on public.vidmatch_video_view_history (user_id, last_clicked_at desc);
create index if not exists vidmatch_video_view_history_video_idx
on public.vidmatch_video_view_history (video_id);
create index if not exists vidmatch_user_settings_updated_at_idx
on public.vidmatch_user_settings (updated_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_vidmatch_videos_updated_at on public.vidmatch_videos;
create trigger set_vidmatch_videos_updated_at
before update on public.vidmatch_videos
for each row
execute function public.set_updated_at();

drop trigger if exists set_vidmatch_video_view_history_updated_at on public.vidmatch_video_view_history;
create trigger set_vidmatch_video_view_history_updated_at
before update on public.vidmatch_video_view_history
for each row
execute function public.set_updated_at();

drop trigger if exists set_vidmatch_user_settings_updated_at on public.vidmatch_user_settings;
create trigger set_vidmatch_user_settings_updated_at
before update on public.vidmatch_user_settings
for each row
execute function public.set_updated_at();

alter table public.vidmatch_videos enable row level security;
alter table public.vidmatch_video_view_history enable row level security;
alter table public.vidmatch_user_settings enable row level security;

drop policy if exists "Service role can manage VidMatch videos" on public.vidmatch_videos;
create policy "Service role can manage VidMatch videos"
on public.vidmatch_videos
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can read own VidMatch history" on public.vidmatch_video_view_history;
create policy "Users can read own VidMatch history"
on public.vidmatch_video_view_history
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role can manage VidMatch history" on public.vidmatch_video_view_history;
create policy "Service role can manage VidMatch history"
on public.vidmatch_video_view_history
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can read own VidMatch settings" on public.vidmatch_user_settings;
create policy "Users can read own VidMatch settings"
on public.vidmatch_user_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role can manage VidMatch settings" on public.vidmatch_user_settings;
create policy "Service role can manage VidMatch settings"
on public.vidmatch_user_settings
for all
to service_role
using (true)
with check (true);
