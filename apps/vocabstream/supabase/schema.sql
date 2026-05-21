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

alter table public.vocabstream_lesson_attempts enable row level security;
alter table public.vocabstream_question_attempts enable row level security;
alter table public.vocabstream_user_lesson_progress enable row level security;
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

drop policy if exists "Service role can manage VocabStream lesson progress" on public.vocabstream_user_lesson_progress;
create policy "Service role can manage VocabStream lesson progress"
on public.vocabstream_user_lesson_progress
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
