-- Disposable database only, after migration 011.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000061', 'library-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000062', 'library-b@example.invalid');
insert into public.companies (name) values ('Resume library fixture');
insert into public.jobs (company_id, title, url, dedupe_hash)
  select id, 'Resume fixture job', 'https://example.invalid/resume-test', 'resume-library-fixture' from public.companies where name = 'Resume library fixture';
insert into public.applications (user_id, job_id)
  select u.id, j.id from auth.users u cross join public.jobs j where u.id in
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062') and j.title = 'Resume fixture job';
insert into public.profile_resumes (id, user_id, name, original_filename, storage_path, mime_type, file_size_bytes) values
  ('10000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000061', 'Frontend', 'resume.pdf', '00000000-0000-0000-0000-000000000061/frontend.pdf', 'application/pdf', 100),
  ('20000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000061', 'Data', 'resume.pdf', '00000000-0000-0000-0000-000000000061/data.pdf', 'application/pdf', 100),
  ('10000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000062', 'Private', 'resume.pdf', '00000000-0000-0000-0000-000000000062/private.pdf', 'application/pdf', 100);
insert into storage.objects (bucket_id, name) values
  ('profile-resumes', '00000000-0000-0000-0000-000000000061/frontend.pdf'),
  ('profile-resumes', '00000000-0000-0000-0000-000000000062/private.pdf');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);
do $$ declare target bigint; begin
  if (select count(*) from public.profile_resumes) <> 2 then raise exception 'Resume privacy failed'; end if;
  if (select count(*) from storage.objects where bucket_id = 'profile-resumes') <> 1 then raise exception 'File privacy failed'; end if;
  select job_id into target from public.applications limit 1;
  insert into public.application_resumes values (auth.uid(), target, '10000000-0000-0000-0000-000000000061');
  begin
    update public.application_resumes set resume_id = '10000000-0000-0000-0000-000000000062';
    raise exception 'Other user resume accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('profile-resumes', '00000000-0000-0000-0000-000000000062/stolen.pdf');
    raise exception 'Other user folder writable';
  exception when insufficient_privilege then null; end;
  perform public.set_default_resume('10000000-0000-0000-0000-000000000061');
  perform public.set_default_resume('20000000-0000-0000-0000-000000000061');
  if (select count(*) from public.profile_resumes where is_default) <> 1 then raise exception 'Default not unique'; end if;
  if not exists (select 1 from public.application_resumes where resume_id = '10000000-0000-0000-0000-000000000061') then
    raise exception 'Default change altered job choice'; end if;
  update public.profile_resumes set name = 'Renamed frontend' where id = '10000000-0000-0000-0000-000000000061';
  if not exists (select 1 from public.application_resumes) then raise exception 'Rename lost choice'; end if;
  begin
    perform public.set_default_resume('10000000-0000-0000-0000-000000000062');
    raise exception 'Other user default changed';
  exception when insufficient_privilege then null; end;
  delete from public.profile_resumes where id = '10000000-0000-0000-0000-000000000061';
  if exists (select 1 from public.application_resumes) then raise exception 'Deleted resume left stale choice'; end if;
  insert into public.application_resumes values (auth.uid(), target, '20000000-0000-0000-0000-000000000061');
  delete from public.applications where user_id = auth.uid() and job_id = target;
  if exists (select 1 from public.application_resumes) then raise exception 'Untracking left stale choice'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', true);
do $$ begin
  if (select count(*) from public.profile_resumes) <> 1 then raise exception 'Other user library changed'; end if;
  if exists (select 1 from public.profile_resumes where is_default) then raise exception 'Other user default changed'; end if;
end $$;
rollback;
