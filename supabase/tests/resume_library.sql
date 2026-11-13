-- Disposable database only, after migration 016.
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
insert into public.resumes (id, user_id, name, original_filename, storage_path, mime_type, file_size_bytes) values
  ('10000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000061', 'Frontend', 'resume.pdf', '00000000-0000-0000-0000-000000000061/frontend.pdf', 'application/pdf', 100),
  ('20000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000061', 'Data', 'resume.pdf', '00000000-0000-0000-0000-000000000061/data.pdf', 'application/pdf', 100),
  ('10000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000062', 'Private', 'resume.pdf', '00000000-0000-0000-0000-000000000062/private.pdf', 'application/pdf', 100);
insert into storage.objects (bucket_id, name) values
  ('resumes', '00000000-0000-0000-0000-000000000061/frontend.pdf'),
  ('resumes', '00000000-0000-0000-0000-000000000062/private.pdf');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);
do $$ declare target bigint; begin
  if (select count(*) from public.resumes) <> 2 then raise exception 'Resume privacy failed'; end if;
  if (select count(*) from storage.objects where bucket_id = 'resumes') <> 1 then raise exception 'File privacy failed'; end if;
  select job_id into target from public.applications limit 1;
  insert into public.application_resumes values (auth.uid(), target, '10000000-0000-0000-0000-000000000061');
  begin
    update public.application_resumes set resume_id = '10000000-0000-0000-0000-000000000062';
    raise exception 'Other user resume accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('resumes', '00000000-0000-0000-0000-000000000062/stolen.pdf');
    raise exception 'Other user folder writable';
  exception when insufficient_privilege then null; end;
  perform public.set_default_resume('10000000-0000-0000-0000-000000000061');
  perform public.set_default_resume('20000000-0000-0000-0000-000000000061');
  if (select count(*) from public.resumes where is_default) <> 1 then raise exception 'Default not unique'; end if;
  if not exists (select 1 from public.application_resumes where resume_id = '10000000-0000-0000-0000-000000000061') then
    raise exception 'Default change altered job choice'; end if;
  update public.resumes set name = 'Renamed frontend' where id = '10000000-0000-0000-0000-000000000061';
  if not exists (select 1 from public.application_resumes) then raise exception 'Rename lost choice'; end if;
  begin
    perform public.set_default_resume('10000000-0000-0000-0000-000000000062');
    raise exception 'Other user default changed';
  exception when insufficient_privilege then null; end;
  delete from public.resumes where id = '10000000-0000-0000-0000-000000000061';
  if exists (select 1 from public.application_resumes) then raise exception 'Deleted resume left stale choice'; end if;
  insert into public.application_resumes values (auth.uid(), target, '20000000-0000-0000-0000-000000000061');
  delete from public.applications where user_id = auth.uid() and job_id = target;
  if exists (select 1 from public.application_resumes) then raise exception 'Untracking left stale choice'; end if;
end $$;

-- Both the new and old upload endpoints must preserve previous versions and choices.
do $$ declare first_id uuid; second_id uuid; removed text[]; begin
  first_id := public.save_uploaded_resume_version('First.pdf', auth.uid()::text || '/first.pdf', 'application/pdf', 100, 'Python');
  second_id := public.save_uploaded_resume_version('Second.pdf', auth.uid()::text || '/second.pdf', 'application/pdf', 100, 'SQL');
  removed := public.save_uploaded_resume('Third.pdf', auth.uid()::text || '/third.pdf', 'application/pdf', 100, 'Java');
  if cardinality(removed) <> 0 then raise exception 'Old endpoint still asks clients to delete files'; end if;
  if (select count(*) from public.resumes) <> 4 then raise exception 'Upload removed previous versions'; end if;
  if public.resume_scan_status_for(first_id) <> 'scanning' or public.resume_scan_status_for(second_id) <> 'scanning' then
    raise exception 'Scan status does not refer to the requested version'; end if;
  if public.resume_scan_status_for('10000000-0000-0000-0000-000000000062') <> 'none' then
    raise exception 'Other user scan status leaked'; end if;
  -- A file-only upload must not hide queued scans in older clients.
  insert into public.resumes (user_id, original_filename, storage_path, mime_type, file_size_bytes)
    values (auth.uid(), 'File only.pdf', auth.uid()::text || '/file-only.pdf', 'application/pdf', 100);
  if public.resume_scan_status() <> 'scanning' then raise exception 'File-only upload hid the queued scan'; end if;
  second_id := public.save_uploaded_resume_version('Text only.pdf', null, 'application/pdf', 100, 'Git');
  if (select has_file from public.resumes where id = second_id) then raise exception 'Text-only row marked as downloadable'; end if;
  begin
    perform public.save_uploaded_resume_version('Bad.pdf', '00000000-0000-0000-0000-000000000062/bad.pdf', 'application/pdf', 100, 'Python');
    raise exception 'Other user path accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.resumes set extracted_text = 'Unreviewed text';
    raise exception 'Browser can change worker input directly';
  exception when insufficient_privilege then null; end;
end $$;

-- Existing worker completion updates the same row and does not affect another scan.
reset role;
set local role service_role;
select public.save_resume_skills(id, array['Python'], text_extracted_at) from public.resumes where original_filename = 'First.pdf';
reset role;
set local role authenticated;
do $$ declare first_id uuid; second_id uuid; begin
  select id into first_id from public.resumes where original_filename = 'First.pdf';
  select id into second_id from public.resumes where original_filename = 'Second.pdf';
  if public.resume_scan_status_for(first_id) <> 'done' then raise exception 'Worker completion not visible'; end if;
  if public.resume_scan_status_for(second_id) <> 'scanning' then raise exception 'Worker completion changed another scan'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', true);
do $$ begin
  if (select count(*) from public.resumes) <> 1 then raise exception 'Other user library changed'; end if;
  if exists (select 1 from public.resumes where is_default) then raise exception 'Other user default changed'; end if;
end $$;
rollback;
