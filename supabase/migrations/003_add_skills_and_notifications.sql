-- =====================================================================
-- 003: Skills and user notification preferences
-- CS Career Hub
-- Run after 000_basic_schema.sql, 001_add_pipeline_columns.sql,
-- and 002_mvp_frontend_fields.sql.
-- IMPORTANT: Review in Git and test in a development Supabase project
-- before applying to production.
-- =====================================================================

-- 1. Canonical skill names, shared by jobs and users.
create table public.skills (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) > 0)
);

-- Prevent 'python' and 'Python' from becoming separate rows.
-- This does NOT automatically merge synonyms like 'JS' and 'JavaScript'.
create unique index skills_name_lower_key on public.skills (lower(btrim(name)));

-- 2. Skills extracted for each job by the backend pipeline.
create table public.job_skills (
  job_id bigint not null references public.jobs(id) on delete cascade,
  skill_id bigint not null references public.skills(id) on delete cascade,
  primary key (job_id, skill_id)
);
create index job_skills_skill_id_idx on public.job_skills (skill_id);

-- 3. Skills selected by a user in their profile.
create table public.user_skills (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id bigint not null references public.skills(id) on delete cascade,
  primary key (user_id, skill_id)
);
create index user_skills_skill_id_idx on public.user_skills (skill_id);

-- 4. Companies selected for priority job alerts.
create table public.priority_companies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index priority_companies_company_id_idx on public.priority_companies (company_id);

-- Enforce a maximum of 10 companies per user at the database level.
-- Lock each user's profile row so concurrent additions cannot exceed 10.
create function public.enforce_priority_company_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
begin
  perform 1 from public.profiles where id = new.user_id for update;
  select count(*) into selected_count
    from public.priority_companies
    where user_id = new.user_id;
  if selected_count >= 10 then
    raise exception 'A user can select at most 10 priority companies';
  end if;
  return new;
end;
$$;

create trigger check_priority_company_limit
before insert on public.priority_companies
for each row execute function public.enforce_priority_company_limit();

-- 5. One row per user: preferences for alert emails.
create table public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  instant_priority_alerts boolean not null default true,
  digest_frequency text not null default 'weekly'
    check (digest_frequency in ('daily', 'weekly', 'off')),
  updated_at timestamptz not null default now()
);

-- Automatically keep updated_at current when settings are changed.
create function public.touch_notification_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_notification_settings_updated_at
before update on public.notification_settings
for each row execute function public.touch_notification_settings_updated_at();

-- ---------------------------------------------------------------------
-- RLS: shared skill/job data is read-only from the browser.
-- Only a trusted backend process (service role) should extract/add job skills.
-- Private user data is accessible only to its owner.
-- ---------------------------------------------------------------------
alter table public.skills enable row level security;
alter table public.job_skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.priority_companies enable row level security;
alter table public.notification_settings enable row level security;

create policy "signed in users read skills"
  on public.skills for select to authenticated using (true);
create policy "signed in users read job skills"
  on public.job_skills for select to authenticated using (true);

create policy "users read their skills"
  on public.user_skills for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "users add their skills"
  on public.user_skills for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "users remove their skills"
  on public.user_skills for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "users read their priority companies"
  on public.priority_companies for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "users add their priority companies"
  on public.priority_companies for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "users remove their priority companies"
  on public.priority_companies for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "users read their notification settings"
  on public.notification_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "users add their notification settings"
  on public.notification_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "users update their notification settings"
  on public.notification_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Explicit privileges for the browser's authenticated role.
-- RLS above still determines which user-specific rows can be accessed.
grant select on public.skills, public.job_skills to authenticated;
grant select, insert, delete on public.user_skills, public.priority_companies to authenticated;
grant select, insert, update on public.notification_settings to authenticated;

-- Identity sequences may require USAGE on installations without
-- Supabase's standard default grants. Users cannot insert into the
-- skills table from the browser, so no sequence grant is needed here.

-- Not included yet: job_reports/job_ratings. The team must first define
-- what is being reported/rated and the allowed values.
