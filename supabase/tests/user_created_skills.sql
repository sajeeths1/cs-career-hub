-- Run as the database owner in a disposable database after migrations 000–010.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000051', 'catalog-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000052', 'catalog-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000051', true);
do $$ declare created jsonb; reused jsonb; invalid text; begin
  created := public.add_known_skill(E'  Catalog\t Test Skill  ');
  if created->>'name' <> 'Catalog Test Skill' then raise exception 'Name was not normalized'; end if;
  reused := public.add_known_skill('catalog test skill');
  if created->>'id' <> reused->>'id' then raise exception 'Duplicate skill created'; end if;
  if (select count(*) from public.user_skills where skill_id = (created->>'id')::bigint) <> 1 then
    raise exception 'Skill not selected idempotently'; end if;
  reused := public.add_known_skill('JS');
  if reused->>'name' <> 'JavaScript' then raise exception 'Existing alias not reused'; end if;
  foreach invalid in array array['', '   ', repeat('a', 101), 'bad' || chr(1)] loop
    begin
      perform public.add_known_skill(invalid);
      raise exception 'Invalid skill accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.add_known_skill(null);
    raise exception 'Null skill accepted';
  exception when invalid_parameter_value then null; end;
  if has_function_privilege('anon', 'public.add_known_skill(text)', 'execute') then
    raise exception 'Anonymous callers can add skills'; end if;
  begin
    insert into public.skills (name) values ('Unrestricted insert');
    raise exception 'Direct catalog insert allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000052', true);
do $$ declare reused jsonb; begin
  if not exists (select 1 from public.skills where name = 'Catalog Test Skill') then
    raise exception 'Shared skill not visible to another user'; end if;
  if exists (select 1 from public.user_skills) then raise exception 'Other user selections leaked'; end if;
  reused := public.add_known_skill('CATALOG TEST SKILL');
  if (select count(*) from public.skills where lower(name) = 'catalog test skill') <> 1 then
    raise exception 'Another user created a duplicate'; end if;
  delete from public.user_skills where skill_id = (reused->>'id')::bigint;
  if not exists (select 1 from public.skills where id = (reused->>'id')::bigint) then
    raise exception 'Removing a selection removed the shared option'; end if;
end $$;

select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.add_known_skill('Unauthenticated skill');
    raise exception 'Missing identity accepted';
  exception when insufficient_privilege then null; end;
end $$;
-- If selecting the skill fails, creation must roll back too.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000053', true);
do $$ begin
  begin
    perform public.add_known_skill('Must roll back');
    raise exception 'Missing profile accepted';
  exception when foreign_key_violation then null; end;
  if exists (select 1 from public.skills where name = 'Must roll back') then
    raise exception 'Failed selection left a catalog row'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.user_skills where user_id = '00000000-0000-0000-0000-000000000051') <> 2 then
    raise exception 'Another caller changed the first user selections'; end if;
  if exists (select 1 from public.skills where name = 'Unauthenticated skill') then
    raise exception 'Rejected request left a catalog row'; end if;
end $$;
rollback;
