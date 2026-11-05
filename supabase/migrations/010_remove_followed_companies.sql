-- =====================================================================
-- 010: Remove followed companies
-- CS Career Hub
-- Run after 000-009.
-- The team decided following a company (unlimited, digest-only) was
-- redundant with prioritizing one (capped at 10, instant + digest).
-- Priority companies now handle all company-based notification control.
-- IMPORTANT: Review in Git and test in a development Supabase project
-- before applying to production.
-- =====================================================================

-- Existing followed-only notifications have no home once this category
-- is removed; priority_company and target_role rows are untouched.
delete from public.notifications where source = 'followed_company';

alter table public.notifications drop constraint notifications_source_check;
alter table public.notifications add constraint notifications_source_check
  check (source in ('priority_company', 'target_role'));

alter table public.notification_settings drop column followed_digest_frequency;

drop table public.followed_companies;
