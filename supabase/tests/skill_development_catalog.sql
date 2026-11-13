-- Run as the database owner in a disposable database after migrations 000–005.
begin;
create temporary table skills_test_jobs (n integer, id bigint) on commit drop;
do $$ declare company bigint; job bigint; n integer; begin
  insert into public.companies (name) values ('Skills audit fixture') returning id into company;
  for n in 1..306 loop
    insert into public.jobs (company_id, title, url, description, posted_at, dedupe_hash, is_open)
      values (company, 'Skills audit recent ' || n, 'https://example.invalid/jobs/' || n,
        case when n = 306 then 'No catalog mentions' else 'Python' end,
        case when n = 304 then current_date - 45 else current_date - 1 end,
        'skills-audit-fixture-' || n, n <> 305) returning id into job;
    insert into skills_test_jobs values (n, job);
  end loop;
end $$;
grant select on skills_test_jobs to service_role, authenticated;

set local role service_role;
select public.save_job_skill_extraction(t.id, array[s.id], repeat('a',64), 'keywords-test', j.title, j.description)
  from skills_test_jobs t join public.jobs j on j.id=t.id
  cross join public.skills s where t.n <= 304 and lower(s.name)='python';
select public.save_job_skill_extraction(t.id, '{}'::bigint[], repeat('a',64), 'keywords-test', j.title, j.description)
  from skills_test_jobs t join public.jobs j on j.id=t.id where t.n=306;

-- Failed replacement must leave previously saved tags and their marker intact.
do $$ declare target bigint; title text; begin
  select t.id,j.title into target,title from skills_test_jobs t join public.jobs j on j.id=t.id where n=2;
  begin
    perform public.save_job_skill_extraction(target, array[-999999]::bigint[], repeat('b',64), 'invalid', title, 'Python');
    raise exception 'Invalid skill was accepted';
  exception when foreign_key_violation then null; end;
  if not exists (select 1 from public.job_skills where job_id=target) then raise exception 'Failed replacement deleted existing tags'; end if;
  if (select input_hash from public.job_skill_extractions where job_id=target) <> repeat('a',64) then raise exception 'Failed replacement changed marker'; end if;
end $$;
reset role;

-- Ordinary collection refreshes should preserve cached extraction.
update public.jobs set description='Python' where id=(select id from skills_test_jobs where n=1);
do $$ begin
  if not exists (select 1 from public.job_skill_extractions where job_id=(select id from skills_test_jobs where n=1)) then
    raise exception 'Unchanged posting lost extraction cache'; end if;
end $$;

set local role authenticated;
do $$ declare report jsonb; python_row jsonb; begin
  if has_function_privilege(current_user, 'public.save_job_skill_extraction(bigint,bigint[],text,text,text,text)', 'execute') then
    raise exception 'Browser role has direct execute privilege on worker RPC'; end if;
  if has_function_privilege('anon', 'public.skill_development_overview(text)', 'execute') then
    raise exception 'Anonymous role can execute the authenticated report'; end if;
  report := public.skill_development_overview('Skills audit recent');
  if (report->>'matching_jobs')::integer <> 305 or (report->>'analyzed_jobs')::integer <> 305 then
    raise exception 'Coverage should include all 305 open jobs, including zero-match analyses: %', report; end if;
  select row into python_row from jsonb_array_elements(report->'skills') row
    where (row->>'skill_id')::bigint=(select id from public.skills where lower(name)='python');
  if (python_row->>'count')::integer <> 304 then raise exception 'Demand is capped or includes closed jobs'; end if;
  if (python_row->>'recent_count')::integer <> 303 or (python_row->>'previous_count')::integer <> 1 then
    raise exception 'Posting date comparison is wrong'; end if;
  if jsonb_array_length(python_row->'examples') <> 3 then raise exception 'Evidence should be limited to 3 jobs'; end if;
  if (public.skill_development_overview('%')->>'matching_jobs')::integer <> 0 then raise exception 'Focus filter should be literal'; end if;
  if not exists (select 1 from public.learning_resources) then raise exception 'Catalog is unreadable'; end if;
  begin
    insert into public.learning_resources (skill_id,title,url,suggested_goal)
      select id,'Bad','https://example.invalid','Bad' from public.skills limit 1;
    raise exception 'Browser can mutate catalog';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_job_skill_extraction(1,'{}'::bigint[],repeat('a',64),'bad','bad','bad');
    raise exception 'Browser can write extracted tags';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A description change invalidates tags. Stale workers cannot write their old result.
update public.jobs set description='React' where id=(select id from skills_test_jobs where n=1);
set local role service_role;
do $$ declare target bigint; title text; begin
  select t.id,j.title into target,title from skills_test_jobs t join public.jobs j on j.id=t.id where n=1;
  if exists (select 1 from public.job_skill_extractions where job_id=target) or exists (select 1 from public.job_skills where job_id=target) then
    raise exception 'Changed posting kept stale skill data'; end if;
  begin
    perform public.save_job_skill_extraction(target,'{}'::bigint[],repeat('a',64),'stale',title,'Python');
    raise exception 'Stale worker result was accepted';
  exception when serialization_failure then null; end;
  perform public.save_job_skill_extraction(target,array[(select id from public.skills where lower(name)='react')],repeat('b',64),'updated',title,'React');
end $$;
set local role authenticated;
do $$ declare report jsonb; begin
  report := public.skill_development_overview('Skills audit recent');
  if (report->>'analyzed_jobs')::integer <> 305 or jsonb_array_length(report->'skills') <> 2 then raise exception 'Updated extraction was not reported'; end if;
end $$;
rollback;
