-- =====================================================================
-- 007: Two-tier company follows and notification categories
-- CS Career Hub
-- Run after 000-006.
-- IMPORTANT: Review in Git and test in a development Supabase project
-- before applying to production.
-- =====================================================================

-- Companies followed for default (digest-only) alerts. Unlimited, unlike
-- priority_companies (migration 003), which is capped at 10 and is
-- eligible for instant email alerts. A company does not need to be
-- followed to be marked priority; the website keeps both selections in
-- sync when a user marks a company as priority.
create table public.followed_companies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index followed_companies_company_id_idx on public.followed_companies (company_id);

alter table public.followed_companies enable row level security;

create policy "users read their followed companies"
  on public.followed_companies for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "users add their followed companies"
  on public.followed_companies for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "users remove their followed companies"
  on public.followed_companies for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.followed_companies to authenticated;

-- Separate digest cadences per notification category. digest_frequency
-- (migration 003) keeps its existing meaning: priority-company postings
-- that were not already sent as an instant alert. These two are new.
alter table public.notification_settings
  add column followed_digest_frequency text not null default 'weekly'
    check (followed_digest_frequency in ('daily', 'weekly', 'off')),
  add column target_role_digest_frequency text not null default 'off'
    check (target_role_digest_frequency in ('daily', 'weekly', 'off'));

-- Which rule created a notification, so the browser can label it and the
-- digest sender can batch by category against the settings above.
alter table public.notifications
  add column source text not null default 'priority_company'
    check (source in ('priority_company', 'followed_company', 'target_role'));
