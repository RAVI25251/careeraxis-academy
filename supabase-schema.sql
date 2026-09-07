create table if not exists public.admin_allowlist (user_id uuid primary key, display_name text not null, role text not null default 'admin', active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.site_settings (key text primary key, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.jobs (id uuid primary key default gen_random_uuid(), company text not null, title text not null, category text, location text, qualification text, last_date date, apply_url text, source_url text, video_url text, status text not null default 'draft', featured boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.resources (id uuid primary key default gen_random_uuid(), title text not null, company text, category text, description text, drive_file_id text, drive_url text, status text not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.youtube_videos (id text primary key, title text not null, url text not null, published_at timestamptz, thumbnail_url text, status text not null default 'published', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.drive_mappings (id uuid primary key default gen_random_uuid(), name text not null, folder_id text not null, category text, company text, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.calendar_events (id uuid primary key default gen_random_uuid(), title text not null, event_date date not null, type text, source_url text, status text not null default 'published', created_at timestamptz not null default now());
create table if not exists public.automation_logs (id bigint generated always as identity primary key, automation_name text not null, status text not null, summary text, created_at timestamptz not null default now());
create table if not exists public.audit_logs (id bigint generated always as identity primary key, actor_user_id uuid, action text not null, entity_type text, entity_id text, created_at timestamptz not null default now());

alter table public.admin_allowlist enable row level security;
alter table public.site_settings enable row level security;
alter table public.jobs enable row level security;
alter table public.resources enable row level security;
alter table public.youtube_videos enable row level security;
alter table public.drive_mappings enable row level security;
alter table public.calendar_events enable row level security;
alter table public.automation_logs enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select lower(coalesce(auth.jwt()->>'email','')) in ('careeraxisacademy@gmail.com','ravitejasiddana@gmail.com');
$$;

-- Optional profile table for the two fixed admins. Populate user_id after their first Google sign-in if desired.
create table if not exists public.admin_profiles (user_id uuid primary key, email text unique not null check (lower(email) in ('careeraxisacademy@gmail.com','ravitejasiddana@gmail.com')), display_name text, avatar_url text, role text not null default 'admin', active boolean not null default true, created_at timestamptz not null default now());
alter table public.admin_profiles enable row level security;
create policy "admins read own admin profiles" on public.admin_profiles for select using (public.is_admin());
create policy "admins update own admin profiles" on public.admin_profiles for update using (public.is_admin()) with check (public.is_admin());

create policy "published jobs readable" on public.jobs for select using (status='published' or public.is_admin());
create policy "published resources readable" on public.resources for select using (status='published' or public.is_admin());
create policy "published videos readable" on public.youtube_videos for select using (status='published' or public.is_admin());
create policy "published events readable" on public.calendar_events for select using (status='published' or public.is_admin());
create policy "admins manage jobs" on public.jobs for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage resources" on public.resources for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage videos" on public.youtube_videos for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage drive mappings" on public.drive_mappings for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage events" on public.calendar_events for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage settings" on public.site_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read automation logs" on public.automation_logs for select using (public.is_admin());
create policy "admins read audit logs" on public.audit_logs for select using (public.is_admin());
