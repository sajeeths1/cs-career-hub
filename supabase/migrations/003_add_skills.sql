-- =====================================================================
-- 003: Skills extracted from job descriptions.
-- Run AFTER 000, 001 and 002
-- (Supabase: SQL Editor -> New query -> paste -> Run).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. skills: one row per skill, e.g. "Python" or "PostgreSQL"
-- ---------------------------------------------------------------------
create table if not exists public.skills (
  id        bigint generated always as identity primary key,
  name      text not null unique,   -- canonical name, no duplicates
  category  text not null
    check (category in ('language', 'framework', 'database', 'cloud', 'tool', 'concept'))
);

-- ---------------------------------------------------------------------
-- 2. job_skills: which skills each job asks for
-- belongs to one job AND one skill
-- ---------------------------------------------------------------------
create table if not exists public.job_skills (
  job_id    bigint  not null references public.jobs(id)   on delete cascade,
  skill_id  bigint  not null references public.skills(id) on delete cascade,
  required  boolean not null default true,  -- false = preferred / nice-to-have
  primary key (job_id, skill_id)            -- a job can't list the same skill twice
);

-- Speed up "how many jobs want this skill?"
create index if not exists job_skills_skill_idx on public.job_skills (skill_id);

-- ---------------------------------------------------------------------
-- 3. Jobs: remember when skills were extracted, so the pipeline skips
--    jobs it already did (including jobs where it found no skills)
-- ---------------------------------------------------------------------
alter table public.jobs
  add column if not exists skills_extracted_at timestamptz;

-- ---------------------------------------------------------------------
-- 4. skill_demand: how many OPEN jobs ask for each skill (for the dashboard)
-- security_invoker makes the view follow the row-level security rules below
-- ---------------------------------------------------------------------
create or replace view public.skill_demand
with (security_invoker = true) as
select
  s.id,
  s.name,
  s.category,
  count(*)                          as job_count,
  count(*) filter (where js.required) as required_count
from public.skills s
join public.job_skills js on js.skill_id = s.id
join public.jobs j        on j.id = js.job_id
where j.is_open
group by s.id, s.name, s.category;

-- ---------------------------------------------------------------------
-- 5. Security: signed-in users can read skills; only the pipeline
--    (service role key, which skips these rules) can write them
-- ---------------------------------------------------------------------
alter table public.skills     enable row level security;
alter table public.job_skills enable row level security;

create policy "anyone signed in can read skills"
  on public.skills for select to authenticated using (true);

create policy "anyone signed in can read job skills"
  on public.job_skills for select to authenticated using (true);

grant select on public.skills, public.job_skills, public.skill_demand to authenticated;
