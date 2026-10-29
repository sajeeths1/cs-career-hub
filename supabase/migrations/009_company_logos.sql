-- =====================================================================
-- 009: Company logos
-- CS Career Hub
-- Run after 000-008.
-- IMPORTANT: Review in Git and test in a development Supabase project
-- before applying to production.
-- =====================================================================

-- Nullable: not every company has a known logo. companies already grants
-- select to authenticated ("anyone signed in can read companies"), so no
-- RLS change is needed for this additive column.
alter table public.companies add column logo_url text;
