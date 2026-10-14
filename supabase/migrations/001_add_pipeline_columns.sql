-- =====================================================================
-- Adds the columns the pipeline needs to the BASIC schema.
-- Run this AFTER 000_basic_schema.sql (Supabase: SQL Editor -> Run).
-- =====================================================================

-- Companies: which job board to collect from
alter table public.companies
  add column ats_type text,   -- e.g. 'greenhouse'
  add column ats_slug text;   -- the company's name on that board, e.g. 'stripe'

-- Jobs: what the pipeline needs to skip repeats and close old jobs
alter table public.jobs
  add column source       text        not null default 'manual', -- where the job came from
  add column dedupe_hash  text,                                  -- the job's "fingerprint"
  add column is_open      boolean     not null default true,     -- still available?
  add column last_seen_at timestamptz not null default now();    -- last time the pipeline saw it

-- Any fake sample jobs you already added need a fingerprint too
update public.jobs set dedupe_hash = 'manual-' || id where dedupe_hash is null;

-- Now every job must have a fingerprint, and no two can match
alter table public.jobs alter column dedupe_hash set not null;
alter table public.jobs add constraint jobs_dedupe_hash_key unique (dedupe_hash);
