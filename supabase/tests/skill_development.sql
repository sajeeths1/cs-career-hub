-- Run as a database administrator against a disposable migrated database.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'skills-test-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000042', 'skills-test-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
insert into public.user_skills (user_id, skill_id)
  select auth.uid(), id from public.skills where lower(name) = 'python';
-- Duplicate selection is safe without requiring UPDATE privileges.
insert into public.user_skills (user_id, skill_id)
  select auth.uid(), id from public.skills where lower(name) = 'python'
  on conflict (user_id, skill_id) do nothing;
insert into public.learning_goals (user_id, skill_id)
  select auth.uid(), id from public.skills where lower(name) = 'react';
insert into public.learning_goals (user_id, skill_id, status)
  select auth.uid(), id, 'in_progress' from public.skills where lower(name) = 'react'
  on conflict (user_id, skill_id) do update set status = excluded.status;
do $$ begin
  if (select count(*) from public.user_skills) <> 1 then raise exception 'Skill selection not persisted'; end if;
  if (select count(*) from public.learning_goals where status = 'in_progress') <> 1 then
    raise exception 'Goal upsert failed'; end if;
  begin
    update public.learning_goals set status = 'invalid';
    raise exception 'Invalid status was accepted';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000042', true);
do $$ begin
  if exists (select 1 from public.learning_goals) then raise exception 'Other user can read goals'; end if;
  if exists (select 1 from public.user_skills) then raise exception 'Other user can read skills'; end if;
  update public.learning_goals set status = 'completed';
  if found then raise exception 'Other user can update goals'; end if;
  delete from public.learning_goals;
  if found then raise exception 'Other user can delete goals'; end if;
  delete from public.user_skills;
  if found then raise exception 'Other user can delete skills'; end if;
  begin
    insert into public.learning_goals (user_id, skill_id)
      select '00000000-0000-0000-0000-000000000041', id from public.skills where lower(name) = 'sql';
    raise exception 'Other user can insert goals';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.user_skills (user_id, skill_id)
      select '00000000-0000-0000-0000-000000000041', id from public.skills where lower(name) = 'sql';
    raise exception 'Other user can insert skills';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
do $$ begin
  if (select count(*) from public.learning_goals where status = 'in_progress') <> 1 then
    raise exception 'Other user changed private goal'; end if;
end $$;
update public.learning_goals set status = 'completed';
do $$ begin
  if (select count(*) from public.learning_goals where status = 'completed') <> 1 then
    raise exception 'Completion not persisted'; end if;
end $$;
delete from public.learning_goals;
delete from public.user_skills;
do $$ begin
  if exists (select 1 from public.learning_goals) or exists (select 1 from public.user_skills) then
    raise exception 'Owner cannot remove goals or skills'; end if;
end $$;
rollback;
