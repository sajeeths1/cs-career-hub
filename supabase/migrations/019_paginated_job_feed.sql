-- Search and filter all open jobs before paginating either Jobs feed.
begin;

create function public.normalize_job_role(value text) returns text
language plpgsql immutable strict set search_path = '' as $$
declare result text;
begin
  result := lower(regexp_replace(normalize(value, NFKD), U&'[\0300-\036f]', '', 'g'));
  result := regexp_replace(result, '\mc\+\+', 'cplusplus', 'g');
  result := regexp_replace(result, '\mc#', 'csharp', 'g');
  result := regexp_replace(result, '\mfront[\s-]*end\M', 'frontend', 'g');
  result := regexp_replace(result, '\mback[\s-]*end\M', 'backend', 'g');
  result := regexp_replace(result, '\mfull[\s-]*stack\M', 'fullstack', 'g');
  result := regexp_replace(result, '\m(machine[\s-]*learning|ml)\M', 'machinelearning', 'g');
  result := regexp_replace(result, '\m(artificial[\s-]*intelligence|ai)\M', 'artificialintelligence', 'g');
  result := regexp_replace(result, '\m(swe|sde)\M', 'software engineer', 'g');
  result := regexp_replace(result, '\m(engineers|engineering|developers?|development)\M', 'engineer', 'g');
  result := regexp_replace(result, '\m(scientists|science)\M', 'scientist', 'g');
  result := regexp_replace(result, '\manalysts\M', 'analyst', 'g');
  result := regexp_replace(result, '\m(interns|internships?)\M', 'intern', 'g');
  return trim(regexp_replace(result, '[^a-z0-9]+', ' ', 'g'));
end;
$$;

create function public.search_open_jobs(
  p_offset integer default 0,
  p_limit integer default 50,
  p_search text default '',
  p_roles text[] default '{}',
  p_work_mode text default 'all',
  p_posted_from date default null,
  p_posted_to date default null,
  p_location text default '',
  p_location_city text default '',
  p_location_required boolean default false,
  p_min_match integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid job page: offset must be nonnegative and limit must be 1..100';
  end if;
  if p_work_mode is null or p_work_mode not in ('all', 'remote', 'hybrid', 'in_person', 'unknown')
     or p_min_match is null or p_min_match not in (0, 50, 75) then
    raise exception 'Invalid job filters';
  end if;

  with role_words as (
    select array_remove(array_remove(array_remove(array_remove(
      string_to_array(public.normalize_job_role(role), ' '),
      'role'), 'roles'), 'position'), 'positions') as words
    from unnest(p_roles) role
  ), filtered as materialized (
    select j.id, j.posted_at
    from public.jobs j
    join public.companies c on c.id = j.company_id
    where j.is_open
      and (p_work_mode = 'all' or j.work_mode = p_work_mode)
      and (p_posted_from is null or j.posted_at >= p_posted_from)
      and (p_posted_to is null or j.posted_at <= p_posted_to)
      and (coalesce(p_search, '') = ''
        or strpos(lower(j.title || ' ' || c.name || ' ' || coalesce(j.location, '')), lower(p_search)) > 0)
      and (not p_location_required or (
        (coalesce(p_location, '') <> '' and strpos(lower(coalesce(j.location, '')), lower(p_location)) > 0)
        or (coalesce(p_location_city, '') <> '' and strpos(lower(coalesce(j.location, '')), lower(p_location_city)) > 0)
      ))
      and (coalesce(cardinality(p_roles), 0) = 0 or exists (
        select 1 from role_words r where cardinality(r.words) > 0
          and r.words <@ string_to_array(public.normalize_job_role(j.title), ' ')
      ))
      and (p_min_match = 0 or exists (
        select 1 from public.job_skills js
        left join public.user_skills us on us.skill_id = js.skill_id and us.user_id = (select auth.uid())
        where js.job_id = j.id
        group by js.job_id
        having round(100.0 * count(us.skill_id) / count(*)) >= p_min_match
      ))
  ), page as (
    select j.id, j.company_id, j.title, j.location, j.url, j.posted_at, j.description, j.work_mode,
      jsonb_build_object('name', c.name) as companies
    from (
      select id from filtered order by posted_at desc nulls last, id desc
      limit p_limit offset p_offset
    ) f
    join public.jobs j on j.id = f.id
    join public.companies c on c.id = j.company_id
    order by j.posted_at desc nulls last, j.id desc
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(page) order by posted_at desc nulls last, id desc) from page), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into result;
  return result;
end;
$$;

revoke all on function public.search_open_jobs(integer, integer, text, text[], text, date, date, text, text, boolean, integer) from public, anon;
grant execute on function public.search_open_jobs(integer, integer, text, text[], text, date, date, text, text, boolean, integer) to authenticated;
commit;
