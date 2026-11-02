-- =====================================================================
-- 008: Closing-soon notifications
-- CS Career Hub
-- Run after 000-007.
-- IMPORTANT: Review in Git and test in a development Supabase project
-- before applying to production.
-- =====================================================================

-- `source` (migration 007) records WHY a user sees a notification (which
-- company/profile relationship). `kind` records WHAT happened: a brand new
-- posting, or an existing one that is about to close. A user can now get
-- both kinds of notification for the same job over time, so the uniqueness
-- guard moves from (user, job) to (user, job, kind).
alter table public.notifications
  add column kind text not null default 'new_posting'
    check (kind in ('new_posting', 'closing_soon'));

alter table public.notifications drop constraint notifications_user_id_job_id_key;
alter table public.notifications add constraint notifications_user_id_job_id_kind_key
  unique (user_id, job_id, kind);
