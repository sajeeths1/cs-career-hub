-- Connect multi-location and exact skill-threshold controls to paginated feeds.
-- Leave earlier RPCs intact for older frontend deployments.
begin;

create function public.normalize_job_location(value text) returns text
language sql immutable strict set search_path = '' as $$
  select trim(regexp_replace(
    lower(regexp_replace(normalize(value, NFKD), U&'[\0300-\036f]', '', 'g')),
    '[^[:alnum:]]+', ' ', 'g'
  ));
$$;

create function public.search_filtered_open_jobs(
  p_offset integer default 0,
  p_limit integer default 50,
  p_search text default '',
  p_work_mode text default 'all',
  p_posted_from date default null,
  p_posted_to date default null,
  p_locations text[] default '{}',
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
     or p_min_match is null or p_min_match not in (0, 50, 75, 100) or p_for_you is null then
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
  ), places as materialized (
    select public.normalize_job_location(place) as name
    from unnest(p_locations) place
    where public.normalize_job_location(place) <> ''
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
      and (not exists (select 1 from places) or exists (
        select 1 from places where strpos(
          ' ' || public.normalize_job_location(coalesce(j.location, '')) || ' ',
          ' ' || places.name || ' '
        ) > 0
      ))
      and (not p_for_you or s.percent > 0)
      and (p_min_match = 0 or s.matched::numeric * 100 >= p_min_match::numeric * s.total)
  ), page as (
    select j.id, j.company_id, j.title, j.location, j.url, j.posted_at, j.description, j.work_mode,
      jsonb_build_object('name', c.name, 'logo_url', c.logo_url) as companies,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'skill_id', js.skill_id, 'skills', jsonb_build_object('id', sk.id, 'name', sk.name)
        ) order by js.skill_id)
        from public.job_skills js join public.skills sk on sk.id = js.skill_id
        where js.job_id = j.id
      ), '[]'::jsonb) as job_skills,
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

revoke all on function public.search_filtered_open_jobs(integer, integer, text, text, date, date, text[], integer, boolean) from public, anon;
grant execute on function public.search_filtered_open_jobs(integer, integer, text, text, date, date, text[], integer, boolean) to authenticated;
commit;
