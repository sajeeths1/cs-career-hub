-- Run after migration 003. Catalog inserts tolerate existing canonical names.
begin;
insert into public.skills (name)
values ('Python'), ('React'), ('SQL'), ('JavaScript'), ('HTML'), ('CSS')
on conflict do nothing;

create table public.learning_goals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id bigint not null references public.skills(id) on delete cascade,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed')),
  primary key (user_id, skill_id)
);
alter table public.learning_goals enable row level security;
create policy "users manage their learning goals"
  on public.learning_goals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.learning_goals to authenticated;
commit;
