-- Replace role-based recommendations with positive skill-coverage scores.
-- Migration 019 remains available for older frontend deployments.
begin;

create function public.search_scored_open_jobs(
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
  p_min_match integer default 0,
  p_for_you boolean default false
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid job page: offset must be nonnegative and limit must be 1..100';
  end if;
  if p_work_mode is null or p_work_mode not in ('all', 'remote', 'hybrid', 'in_person', 'unknown')
     or p_min_match is null or p_min_match not in (0, 50, 75) or p_for_you is null then
    raise exception 'Invalid job filters';
  end if;

  with known as materialized (
    select skill_id from public.user_skills where user_id = (select auth.uid())
  ), scores as (
    select js.job_id, count(k.skill_id)::integer as matched, count(*)::integer as total,
      round(100.0 * count(k.skill_id) / count(*))::integer as percent
    from public.job_skills js
    left join known k on k.skill_id = js.skill_id
    group by js.job_id
  ), role_words as (
    select array_remove(array_remove(array_remove(array_remove(
      string_to_array(public.normalize_job_role(role), ' '),
      'role'), 'roles'), 'position'), 'positions') as words
    from unnest(p_roles) role
  ), filtered as materialized (
    select j.id, j.posted_at,
      case when exists (select 1 from known) then s.percent end as percent,
      s.matched, s.total
    from public.jobs j
    join public.companies c on c.id = j.company_id
    left join scores s on s.job_id = j.id
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
      and (p_for_you or coalesce(cardinality(p_roles), 0) = 0 or exists (
        select 1 from role_words r where cardinality(r.words) > 0
          and r.words <@ string_to_array(public.normalize_job_role(j.title), ' ')
      ))
      and (not p_for_you or s.percent > 0)
      and (p_min_match = 0 or s.percent >= p_min_match)
  ), page as (
    select j.id, j.company_id, j.title, j.location, j.url, j.posted_at, j.description, j.work_mode,
      jsonb_build_object('name', c.name) as companies,
      case when f.percent is not null then jsonb_build_object(
        'matched', f.matched, 'total', f.total, 'percent', f.percent
      ) end as match_score,
      case when p_for_you then f.percent end as sort_score
    from (
      select * from filtered
      order by (case when p_for_you then percent end) desc nulls last, posted_at desc nulls last, id desc
      limit p_limit offset p_offset
    ) f
    join public.jobs j on j.id = f.id
    join public.companies c on c.id = j.company_id
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(page) - 'sort_score'
      order by sort_score desc nulls last, posted_at desc nulls last, id desc) from page), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into result;
  return result;
end;
$$;

revoke all on function public.search_scored_open_jobs(integer, integer, text, text[], text, date, date, text, text, boolean, integer, boolean) from public, anon;
grant execute on function public.search_scored_open_jobs(integer, integer, text, text[], text, date, date, text, text, boolean, integer, boolean) to authenticated;
commit;
