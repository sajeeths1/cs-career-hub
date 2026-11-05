-- Private resume versions and the version chosen for each tracked job.
begin;
create table public.profile_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 150),
  original_filename text not null,
  storage_path text not null unique check (storage_path like user_id::text || '/%'),
  mime_type text not null check (mime_type in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg')),
  file_size_bytes integer not null check (file_size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  is_default boolean not null default false,
  unique (id, user_id)
);
create unique index profile_resumes_one_default on public.profile_resumes(user_id) where is_default;
create index profile_resumes_user_created on public.profile_resumes(user_id, created_at desc);

create table public.application_resumes (
  user_id uuid not null,
  job_id bigint not null,
  resume_id uuid not null,
  primary key (user_id, job_id),
  foreign key (user_id, job_id) references public.applications(user_id, job_id) on delete cascade,
  foreign key (resume_id, user_id) references public.profile_resumes(id, user_id) on delete cascade
);
alter table public.profile_resumes enable row level security;
alter table public.application_resumes enable row level security;
create policy "users manage own resume library" on public.profile_resumes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own job resume choices" on public.application_resumes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, delete on public.profile_resumes to authenticated;
grant update (name) on public.profile_resumes to authenticated;
grant select, insert, update, delete on public.application_resumes to authenticated;

create function public.set_default_resume(p_resume_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = caller for update;
  if not exists (select 1 from public.profile_resumes where id = p_resume_id and user_id = caller) then
    raise exception 'Resume not found' using errcode = '42501';
  end if;
  update public.profile_resumes set is_default = false where user_id = caller and is_default;
  update public.profile_resumes set is_default = true where id = p_resume_id and user_id = caller;
end;
$$;
revoke all on function public.set_default_resume(uuid) from public, anon, authenticated;
grant execute on function public.set_default_resume(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-resumes', 'profile-resumes', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg']);
create policy "users read own resume versions" on storage.objects for select to authenticated
  using (bucket_id = 'profile-resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users upload own resume versions" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users remove own resume versions" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
