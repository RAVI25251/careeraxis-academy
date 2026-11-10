-- CareerAxis Academy - small follow-up patch (run once, safe to re-run).
-- Your live youtube_videos table has no updated_at column, but the admin
-- panel sends one when you edit a video. This adds it.
alter table public.youtube_videos add column if not exists updated_at timestamptz not null default now();
