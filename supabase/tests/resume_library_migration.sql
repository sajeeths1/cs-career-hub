-- Disposable database only, with the resume prerequisite migrations installed
-- but WITHOUT 016_resume_library.sql. This script applies that migration.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000060', 'existing-resume@example.invalid');
insert into public.resumes (id, user_id, original_filename, storage_path, mime_type,
  file_size_bytes, uploaded_at, extracted_text, text_extracted_at, processed_at)
values ('10000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000060',
  'Existing frontend.pdf', '00000000-0000-0000-0000-000000000060/existing.pdf', 'application/pdf',
  100, '2026-01-01', 'Python and SQL', '2026-01-01', '2026-01-02');
insert into storage.objects (bucket_id, name) values
  ('resumes', '00000000-0000-0000-0000-000000000060/existing.pdf');

\ir ../migrations/016_resume_library.sql

do $$ begin
  if not exists (select 1 from public.resumes
    where id = '10000000-0000-0000-0000-000000000060'
      and name = 'Existing frontend' and has_file and not is_default
      and storage_path = '00000000-0000-0000-0000-000000000060/existing.pdf'
      and uploaded_at = '2026-01-01'::timestamptz and extracted_text = 'Python and SQL'
      and processed_at = '2026-01-02'::timestamptz) then
    raise exception 'Existing resume was changed or lost'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'resumes'
    and name = '00000000-0000-0000-0000-000000000060/existing.pdf') then
    raise exception 'Existing file was changed or lost'; end if;
  if to_regclass('public.profile_resumes') is not null then raise exception 'Duplicate resume table created'; end if;
  if exists (select 1 from storage.buckets where id = 'profile-resumes') then
    raise exception 'Duplicate resume bucket created'; end if;
end $$;
delete from storage.objects where name = '00000000-0000-0000-0000-000000000060/existing.pdf';
delete from public.resumes where user_id = '00000000-0000-0000-0000-000000000060';
delete from auth.users where id = '00000000-0000-0000-0000-000000000060';
