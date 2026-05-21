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
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  planned_duration_minutes integer not null default 0 check (planned_duration_minutes >= 0),
  selected_topics text[] not null default '{}',
  selected_components text[] not null default '{}',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists speakwise_lesson_settings_updated_at_idx
on public.speakwise_lesson_settings (updated_at desc);
create index if not exists speakwise_lesson_sessions_user_idx
on public.speakwise_lesson_sessions (user_id, started_at desc);
create index if not exists speakwise_lesson_sessions_mode_idx
on public.speakwise_lesson_sessions (user_id, mode, started_at desc);

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
