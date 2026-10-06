-- =====================================================================
-- CS Job Hub — BASIC starter schema (4 tables)
-- companies, jobs, profiles, applications
-- Paste into Supabase: SQL Editor -> New query -> Run
-- =====================================================================

-- The fixed list of allowed application statuses
create type application_status as enum
  ('not_applied', 'applied', 'interviewing', 'offer', 'rejected');

-- ---------------------------------------------------------------------
-- companies: one row per company
-- ---------------------------------------------------------------------
create table public.companies (
  id       bigint generated always as identity primary key,  -- ID made automatically
  name     text not null unique,                              -- required, no duplicates
  website  text
);

-- ---------------------------------------------------------------------
-- jobs: one row per posting; each job belongs to one company
-- ---------------------------------------------------------------------
create table public.jobs (
  id          bigint generated always as identity primary key,
  company_id  bigint not null references public.companies(id) on delete cascade,
  title       text not null,
  location    text,
  url         text not null,
  posted_at   date
);

-- ---------------------------------------------------------------------
-- profiles: one row per student (linked to Supabase's built-in login table)
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  school     text,
  grad_year  int
);

-- ---------------------------------------------------------------------
-- applications: one row per job a student is tracking
-- belongs to one student AND one job
-- ---------------------------------------------------------------------
create table public.applications (
  id       bigint generated always as identity primary key,
  user_id  uuid   not null references public.profiles(id) on delete cascade,
  job_id   bigint not null references public.jobs(id) on delete cascade,
  status   application_status not null default 'not_applied',
  unique (user_id, job_id)  -- a student can't track the same job twice
);

-- ---------------------------------------------------------------------
-- Automatically create a profile row when someone signs up
-- ---------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Security: signed-in users can read all jobs and companies,
-- but can only see and change their OWN profile and applications
-- ---------------------------------------------------------------------
alter table public.companies    enable row level security;
alter table public.jobs         enable row level security;
alter table public.profiles     enable row level security;
alter table public.applications enable row level security;

create policy "anyone signed in can read companies"
  on public.companies for select to authenticated using (true);

create policy "anyone signed in can read jobs"
  on public.jobs for select to authenticated using (true);

create policy "users manage their own profile"
  on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "users manage their own applications"
  on public.applications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
