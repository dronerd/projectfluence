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
