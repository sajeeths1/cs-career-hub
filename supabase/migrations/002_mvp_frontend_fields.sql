-- =====================================================================
-- 002: Changes the MVP needs so the database matches the frontend.
-- Run AFTER 000_basic_schema.sql and 001_add_pipeline_columns.sql
-- (Supabase: SQL Editor -> New query -> paste -> Run).
-- =====================================================================

-- 1. Add a "saved" status so the tracker's Saved column works.
--    Statuses are now: saved, not_applied, applied, interviewing, offer, rejected
alter type public.application_status add value if not exists 'saved' before 'not_applied';

-- 2. Jobs: a description to show on the job page, and remote/hybrid/in-person
alter table public.jobs
  add column if not exists description text,
  add column if not exists work_mode text not null default 'unknown'
    check (work_mode in ('remote', 'hybrid', 'in_person', 'unknown'));

-- 3. Profiles: the fields the profile form asks for
alter table public.profiles
  add column if not exists major              text,
  add column if not exists preferred_location text,
  add column if not exists target_roles       text;

-- 4. Applications: remember when the status last changed
alter table public.applications
  add column if not exists updated_at timestamptz not null default now();

-- 5. Speed up the dashboard's "newest open jobs" list
create index if not exists jobs_open_posted_idx
  on public.jobs (is_open, posted_at desc);

-- 6. Make sure signed-in users are allowed to use these tables through the
--    website. (Row-level security from 000 still limits WHICH rows they see.)
grant usage on schema public to authenticated;
grant select on public.companies, public.jobs to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
