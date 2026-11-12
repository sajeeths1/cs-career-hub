-- Run after migration 013 as the database owner. All fixtures are rolled back.
begin;
do $$
declare
  fixture_name text := '__job_feed_test_' || gen_random_uuid()::text;
  fixture_company bigint;
  result jsonb;
  seen_ids bigint[] := '{}';
  page_offset integer;
begin
  insert into public.companies (name) values (fixture_name) returning id into fixture_company;
  insert into public.jobs (company_id, title, location, url, posted_at, description, work_mode, dedupe_hash, is_open)
    select fixture_company,
      case when n <= 400 then 'JavaScript Developer' else 'Java Developer' end,
      'Raleigh', 'https://example.com/test/' || n, date '2026-10-29',
      '', 'remote', fixture_name || n, true
    from generate_series(1, 405) n;
  insert into public.jobs (company_id, title, url, dedupe_hash, is_open)
    values (fixture_company, 'Java Developer', 'https://example.com/closed', fixture_name || 'closed', false);

  for page_offset in select generate_series(0, 400, 50) loop
    result := public.search_open_jobs(p_search => fixture_name, p_offset => page_offset);
    assert (result->>'total')::int = 405, 'All jobs must include every open posting';
    assert jsonb_array_length(result->'jobs') <= 50, 'Pages must remain bounded';
    seen_ids := seen_ids || array(
      select (j->>'id')::bigint from jsonb_array_elements(result->'jobs') j
    );
  end loop;
  assert cardinality(seen_ids) = 405, 'All jobs must be reachable beyond 300';
  assert (select count(distinct id) from unnest(seen_ids) id) = 405, 'Pages must not overlap';

  for page_offset in select generate_series(0, 350, 50) loop
    result := public.search_open_jobs(p_search => fixture_name, p_roles => array['JavaScript developer'], p_offset => page_offset);
    assert (result->>'total')::int = 400, 'For you must count all exact role matches';
    assert jsonb_array_length(result->'jobs') = 50, 'For you must paginate beyond 300';
  end loop;
  result := public.search_open_jobs(p_search => fixture_name, p_roles => array['Java developer']);
  assert (result->>'total')::int = 5, 'Java must not match JavaScript';
  result := public.search_open_jobs(p_search => fixture_name, p_location_required => true, p_location => 'Raleigh, NC', p_location_city => 'Raleigh');
  assert (result->>'total')::int = 405, 'Preferred location must retain the city fallback';
  result := public.search_open_jobs(p_search => fixture_name, p_location_required => true);
  assert (result->>'total')::int = 0, 'An empty required location must not match';
  result := public.search_open_jobs(p_search => fixture_name, p_work_mode => 'in_person');
  assert (result->>'total')::int = 0, 'Work mode must filter before pagination';
  result := public.search_open_jobs(p_search => fixture_name, p_posted_from => date '2026-10-30');
  assert (result->>'total')::int = 0, 'Posting dates must filter before pagination';
  result := public.search_open_jobs(p_search => fixture_name, p_min_match => 50);
  assert (result->>'total')::int = 0, 'Untagged jobs must not pass skill thresholds';
end;
$$;
rollback;
