create table if not exists public.vocabstream_lesson_attempts (
  id uuid primary key default gen_random_uuid(),
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

alter table public.vocabstream_lesson_attempts enable row level security;
alter table public.vocabstream_question_attempts enable row level security;

create policy "Service role can manage VocabStream lesson attempts"
on public.vocabstream_lesson_attempts
for all
to service_role
using (true)
with check (true);

create policy "Service role can manage VocabStream question attempts"
on public.vocabstream_question_attempts
for all
to service_role
using (true)
with check (true);
