-- =====================================================================
-- 006: In-app and email notifications for priority-company job alerts
-- CS Career Hub
-- Run after 000-005. Uses priority_companies and notification_settings
-- from migration 003.
-- IMPORTANT: Review in Git and test in a development Supabase project
-- before applying to production.
-- =====================================================================

-- One row per (user, job): a new posting at a company the user follows.
-- The pipeline (service role) creates these; the browser only reads and
-- marks its own rows read. emailed_at tracks whether this row has already
-- been included in an instant alert or digest email, so neither resends it.
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz,
  unique (user_id, job_id)
);
create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);
create index notifications_pending_email_idx on public.notifications (user_id) where emailed_at is null;

alter table public.notifications enable row level security;

create policy "users read their notifications"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

-- The browser only ever marks its own notifications read (sets read_at);
-- creation and email bookkeeping happen through the service role.
create policy "users update their notifications"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, update on public.notifications to authenticated;
