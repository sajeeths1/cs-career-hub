-- Run after migration 014 as the database owner. Fixtures are rolled back.
begin;
do $$
declare
  fixture_name text := '__score_feed_test_' || gen_random_uuid()::text;
  fixture_company bigint;
  fixture_user uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  skill_one bigint;
  skill_two bigint;
  result jsonb;
  all_ids bigint[] := '{}';
  page_offset integer;
begin
  insert into auth.users (id, email) values
    (fixture_user, fixture_user::text || '@example.invalid'),
    (other_user, other_user::text || '@example.invalid');
  perform set_config('request.jwt.claim.sub', fixture_user::text, true);
  insert into public.companies (name) values (fixture_name) returning id into fixture_company;
  insert into public.skills (name) values (fixture_name || '_one') returning id into skill_one;
  insert into public.skills (name) values (fixture_name || '_two') returning id into skill_two;
  insert into public.user_skills (user_id, skill_id) values (fixture_user, skill_one), (other_user, skill_two);
  insert into public.jobs (company_id, title, location, url, posted_at, description, work_mode, dedupe_hash, is_open)
    select fixture_company, 'Any role ' || n, 'Raleigh', 'https://example.com/' || n,
      case when n <= 350 then date '2026-10-29' else date '2025-01-01' end,
      '', 'remote', fixture_name || n, true from generate_series(1, 402) n;
  insert into public.job_skills (job_id, skill_id)
    select id, skill_one from public.jobs where company_id = fixture_company and title <> 'Any role 402';
  insert into public.job_skills (job_id, skill_id)
    select id, skill_two from public.jobs where company_id = fixture_company and title in (
      select 'Any role ' || n from generate_series(1, 350) n
    );
  -- Job 401 has zero overlap; job 402 is untagged.
  delete from public.job_skills where job_id = (
    select id from public.jobs where company_id = fixture_company and title = 'Any role 401'
  );
  insert into public.job_skills (job_id, skill_id)
    select id, skill_two from public.jobs where company_id = fixture_company and title = 'Any role 401';

  for page_offset in select generate_series(0, 350, 50) loop
    result := public.search_scored_open_jobs(p_search => fixture_name, p_for_you => true, p_offset => page_offset,
      p_roles => array['Role that does not match']);
    assert (result->>'total')::int = 400, 'For you must exclude zero/unscored jobs, not restrict titles';
    assert jsonb_array_length(result->'jobs') = 50, 'For you must paginate beyond 300';
    if page_offset = 0 then
      assert (result->'jobs'->0->'match_score'->>'percent')::int = 100, 'Older highest scores must rank first';
      assert result->'jobs'->0->>'title' = 'Any role 400', 'Score ties must use date and ID';
    else
      assert (result->'jobs'->0->'match_score'->>'percent')::int = 50, 'Ranking must continue across pages';
    end if;
    all_ids := all_ids || array(select (j->>'id')::bigint from jsonb_array_elements(result->'jobs') j);
  end loop;
  assert (select count(distinct id) from unnest(all_ids) id) = 400, 'Ranked pages must not overlap';
  result := public.search_scored_open_jobs(p_search => fixture_name, p_for_you => true, p_min_match => 75);
  assert (result->>'total')::int = 50, 'Score threshold must narrow For you';
  result := public.search_scored_open_jobs(p_search => fixture_name);
  assert (result->>'total')::int = 402, 'All jobs must include zero/unscored jobs';
  assert result->'jobs'->0->>'title' = 'Any role 350', 'All jobs must remain newest-first';
  result := public.search_scored_open_jobs(p_search => fixture_name, p_for_you => true, p_work_mode => 'in_person');
  assert (result->>'total')::int = 0, 'Other filters must apply to ranked matches';

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  result := public.search_scored_open_jobs(p_search => fixture_name, p_for_you => true);
  assert (result->>'total')::int = 0, 'A caller without skills must not inherit another user score';
  result := public.search_scored_open_jobs(p_search => fixture_name);
  assert result->'jobs'->0->'match_score' = 'null'::jsonb, 'Scores must be pending without user skills';
end;
$$;
rollback;
