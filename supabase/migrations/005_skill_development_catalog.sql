-- Persist the learning catalog, extract each posting once, and report demand from all open jobs.
-- Apply after 004. Only the Data owner should apply this to the shared Supabase project.
begin;
create table public.learning_resources (
  id bigint generated always as identity primary key,
  skill_id bigint not null references public.skills(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  url text not null check (url ~ '^https://[^[:space:]]+$'),
  suggested_goal text not null check (length(btrim(suggested_goal)) > 0),
  unique (skill_id, url)
);
create table public.skill_aliases (
  alias text primary key check (alias = lower(btrim(alias)) and length(alias) > 0),
  skill_id bigint not null references public.skills(id) on delete cascade
);
create index skill_aliases_skill_id_idx on public.skill_aliases(skill_id);
create table public.job_skill_extractions (
  job_id bigint primary key references public.jobs(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  extractor_version text not null check (length(extractor_version) between 1 and 100),
  extracted_at timestamptz not null default now()
);

create temporary table skill_catalog_seed (
  name text, aliases text[], title text, url text, goal text
) on commit drop;
insert into skill_catalog_seed values
('Python', array['python'], 'Python tutorial', 'https://docs.python.org/3/tutorial/', 'Complete the Python tutorial and build a command-line tool.'),
('React', array['react', 'reactjs', 'react.js'], 'Learn React', 'https://react.dev/learn', 'Complete React Quick Start and build an interactive app with shared state.'),
('SQL', array['sql', 'postgresql', 'postgres', 'mysql'], 'PostgreSQL tutorial', 'https://www.postgresql.org/docs/current/tutorial.html', 'Complete the SQL tutorial and write queries using joins and aggregates.'),
('JavaScript', array['javascript', 'js'], 'MDN web development', 'https://developer.mozilla.org/en-US/docs/Learn_web_development', 'Complete the JavaScript modules and build an app that fetches and displays data.'),
('HTML', array['html', 'html5'], 'MDN web development', 'https://developer.mozilla.org/en-US/docs/Learn_web_development', 'Complete the HTML modules and build a semantic page with an accessible form.'),
('CSS', array['css', 'css3'], 'MDN web development', 'https://developer.mozilla.org/en-US/docs/Learn_web_development', 'Complete the CSS modules and build a responsive layout with Grid and Flexbox.'),
('TypeScript', array['typescript', 'ts'], 'TypeScript handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html', 'Complete the TypeScript handbook and add typed API responses to a small app.'),
('Git', array['git'], 'Pro Git', 'https://git-scm.com/book/en/v2', 'Practice branches, commits and merges in a repository with a documented workflow.'),
('Docker', array['docker'], 'Get started with Docker', 'https://docs.docker.com/get-started/', 'Complete the getting-started tutorial and containerize a small application.'),
('AWS', array['aws', 'amazon web services'], 'Getting started on AWS', 'https://aws.amazon.com/getting-started/', 'Study AWS fundamentals and design a small application with a documented cost estimate.'),
('Java', array['java'], 'Learn Java', 'https://dev.java/learn/', 'Complete the Java language basics and build a project using collections and tests.');
insert into public.skills (name) select name from skill_catalog_seed on conflict do nothing;
insert into public.skill_aliases (alias, skill_id)
  select alias, s.id from skill_catalog_seed seed
  join public.skills s on lower(btrim(s.name)) = lower(seed.name)
  cross join lateral unnest(seed.aliases) as aliases(alias)
  on conflict do nothing;
insert into public.learning_resources (skill_id, title, url, suggested_goal)
  select s.id, seed.title, seed.url, seed.goal from skill_catalog_seed seed
  join public.skills s on lower(btrim(s.name)) = lower(seed.name)
  on conflict do nothing;

alter table public.learning_resources enable row level security;
alter table public.skill_aliases enable row level security;
alter table public.job_skill_extractions enable row level security;
create policy "signed in users read learning resources" on public.learning_resources
  for select to authenticated using (true);
create policy "signed in users read skill aliases" on public.skill_aliases
  for select to authenticated using (true);
create policy "signed in users read extraction coverage" on public.job_skill_extractions
  for select to authenticated using (true);
grant select on public.learning_resources, public.skill_aliases, public.job_skill_extractions to authenticated;
grant select on public.skills, public.skill_aliases to service_role;
-- SELECT FOR UPDATE in the atomic save also requires UPDATE privilege.
grant select, update on public.jobs to service_role;
grant select, insert, update, delete on public.job_skills, public.job_skill_extractions to service_role;

-- A changed posting must not keep outdated tags or a completed extraction marker.
create function public.invalidate_job_skills() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.job_skills where job_id = new.id;
  delete from public.job_skill_extractions where job_id = new.id;
  return new;
end $$;
create trigger invalidate_changed_job_skills
  after update of title, description on public.jobs
  for each row when (old.title is distinct from new.title or old.description is distinct from new.description)
  execute function public.invalidate_job_skills();

-- Tags and their completion marker commit together. A failed write can be retried.
create function public.save_job_skill_extraction(
  p_job_id bigint, p_skill_ids bigint[], p_input_hash text, p_extractor_version text,
  p_expected_title text, p_expected_description text
) returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.jobs
    where id = p_job_id and is_open
      and title is not distinct from p_expected_title
      and description is not distinct from p_expected_description
    for update;
  if not found then
    raise exception 'Posting changed or closed; retry extraction' using errcode = '40001';
  end if;
  delete from public.job_skills where job_id = p_job_id;
  insert into public.job_skills (job_id, skill_id)
    select p_job_id, skill_id from unnest(p_skill_ids) as ids(skill_id)
    on conflict do nothing;
  insert into public.job_skill_extractions (job_id, input_hash, extractor_version)
    values (p_job_id, p_input_hash, p_extractor_version)
    on conflict (job_id) do update set
      input_hash = excluded.input_hash, extractor_version = excluded.extractor_version,
      extracted_at = now();
end $$;
-- Supabase may grant routine access to browser roles through default privileges.
revoke all on function public.save_job_skill_extraction(bigint,bigint[],text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_job_skill_extraction(bigint,bigint[],text,text,text,text) to service_role;

-- A read-only report, respecting the caller's RLS. No scoring or extraction in the browser.
create function public.skill_development_overview(p_title_filter text default '') returns jsonb
language sql stable security invoker set search_path = '' as $$
  with filtered as (
    select j.id, j.title, j.url, j.company_id, j.posted_at
    from public.jobs j where j.is_open
      and position(lower(btrim(coalesce(p_title_filter, ''))) in lower(j.title)) > 0
  ), demand as (
    select js.skill_id, count(*) as job_count,
      count(*) filter (where f.posted_at between current_date - 29 and current_date) as recent_count,
      count(*) filter (where f.posted_at between current_date - 59 and current_date - 30) as previous_count
    from public.job_skills js join filtered f on f.id = js.job_id
    group by js.skill_id
  )
  select jsonb_build_object(
    'total_open_jobs', (select count(*) from public.jobs where is_open),
    'matching_jobs', (select count(*) from filtered),
    'analyzed_jobs', (select count(*) from filtered f where
      exists (select 1 from public.job_skill_extractions e where e.job_id = f.id)
      or exists (select 1 from public.job_skills js where js.job_id = f.id)),
    'skills', coalesce((select jsonb_agg(jsonb_build_object(
      'skill_id', d.skill_id, 'count', d.job_count,
      'recent_count', d.recent_count, 'previous_count', d.previous_count,
      'examples', (select coalesce(jsonb_agg(example), '[]'::jsonb) from (
        select f.id, f.title, f.url, c.name as company_name
        from filtered f join public.job_skills js on js.job_id = f.id
        join public.companies c on c.id = f.company_id
        where js.skill_id = d.skill_id order by f.posted_at desc nulls last, f.id desc limit 3
      ) example)
    ) order by d.job_count desc, d.skill_id) from demand d), '[]'::jsonb)
  );
$$;
revoke all on function public.skill_development_overview(text) from public, anon;
grant execute on function public.skill_development_overview(text) to authenticated;
commit;
