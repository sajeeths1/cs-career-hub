-- Save skills extracted from resume text by the local worker (backend/worker/resume_skills.py).
-- Apply after 009. Only the Data owner should apply this to the shared Supabase project.
begin;

-- public.resumes was created by hand in the shared project. This definition lets new
-- environments match its columns, and does nothing where the table already exists.
-- Columns come from the live API, which does not expose defaults, foreign keys or
-- CHECK constraints: replace this with the real DDL once it has been exported.
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  processing_status text not null default 'uploaded',
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz,
extracted_text text,
  text_extracted_at timestamptz
);
-- Resume text is personal data. Existing policies, if any, are left in place.
alter table public.resumes enable row level security;
grant select on public.resumes to service_role;

-- Skills, user links and the completion marker commit together, so a failed save can
-- be retried. Existing user_skills rows are never removed. SECURITY DEFINER lets this
-- one function add catalog skills without giving service_role wider table access.
create function public.save_resume_skills(
  p_resume_id uuid, p_skill_names text[], p_expected_text_extracted_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.resumes
    where id = p_resume_id
      and text_extracted_at is not distinct from p_expected_text_extracted_at
    for update;
  if not found then
    raise exception 'Resume changed or was deleted; retry extraction' using errcode = '40001';
  end if;

  -- The conflict target is omitted because the unique index is on an expression.
  insert into public.skills (name)
    select distinct on (lower(btrim(raw))) btrim(raw)
    from unnest(p_skill_names) as names(raw)
    where char_length(btrim(raw)) between 2 and 40
      and not exists (select 1 from public.skill_aliases a where a.alias = lower(btrim(raw)))
    on conflict do nothing;

  insert into public.user_skills (user_id, skill_id)
    select distinct v_user_id, coalesce(s.id, a.skill_id)
    from unnest(p_skill_names) as names(raw)
    left join public.skills s on lower(btrim(s.name)) = lower(btrim(raw))
    left join public.skill_aliases a on a.alias = lower(btrim(raw))
    where coalesce(s.id, a.skill_id) is not null
    on conflict do nothing;

  update public.resumes set processed_at = now() where id = p_resume_id;
end $$;
-- Supabase may grant routine access to browser roles through default privileges.
revoke all on function public.save_resume_skills(uuid, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.save_resume_skills(uuid, text[], timestamptz) to service_role;
commit;
