create table if not exists public.vidmatch_videos (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  title text not null,
  channel_name text not null,
  youtube_url text not null,
  thumbnail_url text,
  duration text,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  skills text[] not null default '{}',
  topics text[] not null default '{}',
  accent text,
  transcript_available boolean not null default false,
  description text,
  tags text[] not null default '{}',
  quality_score numeric(5, 2) not null default 0 check (quality_score >= 0 and quality_score <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vidmatch_videos_level_idx on public.vidmatch_videos (level);
create index if not exists vidmatch_videos_quality_score_idx on public.vidmatch_videos (quality_score desc);
create index if not exists vidmatch_videos_transcript_available_idx on public.vidmatch_videos (transcript_available);
create index if not exists vidmatch_videos_skills_idx on public.vidmatch_videos using gin (skills);
create index if not exists vidmatch_videos_topics_idx on public.vidmatch_videos using gin (topics);
create index if not exists vidmatch_videos_tags_idx on public.vidmatch_videos using gin (tags);

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

alter table public.vidmatch_videos enable row level security;

create policy "Service role can manage VidMatch videos"
on public.vidmatch_videos
for all
to service_role
using (true)
with check (true);
