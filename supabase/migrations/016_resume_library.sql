-- Extend the existing resumes table and resumes Storage bucket for multiple versions.
-- Apply AFTER 011_resume_storage.sql, 012_resume_text_extraction.sql,
-- 013_resume_skill_extraction.sql and 014_resume_uploads.sql are installed.
-- This replaces the unapplied library migration; no profile_resumes table is needed.
begin;

alter table public.resumes
  add column name text,
  add column is_default boolean not null default false,
  add column has_file boolean not null default true;
update public.resumes set name = coalesce(nullif(left(btrim(regexp_replace(original_filename, '\.[^.]+$', '')), 150), ''), 'Resume'),
  has_file = storage_path not like 'not-stored/%';
alter table public.resumes alter column name set not null;
alter table public.resumes alter column name set default 'Resume';
alter table public.resumes add constraint resumes_display_name_check check (char_length(btrim(name)) between 1 and 150);
alter table public.resumes add constraint resumes_id_user_key unique (id, user_id);
create unique index resumes_one_default on public.resumes(user_id) where is_default;

-- Existing PDFs/DOCX files keep their paths; image resumes can now retain files too.
alter table public.resumes drop constraint if exists resumes_mime_type_check;
alter table public.resumes add constraint resumes_mime_type_check check (mime_type in (
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'
));
update storage.buckets set public = false, allowed_mime_types = array[
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'
] where id = 'resumes';

alter table public.resumes enable row level security;
create policy "library users read own resumes" on public.resumes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "library users register own resumes" on public.resumes for insert to authenticated
  with check ((select auth.uid()) = user_id and split_part(storage_path, '/', 1) = user_id::text
    and processing_status = 'uploaded' and processed_at is null);
create policy "library users rename own resumes" on public.resumes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "library users delete own resumes" on public.resumes for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, delete on public.resumes to authenticated;
revoke update on public.resumes from authenticated;
grant update (name) on public.resumes to authenticated;

create table public.application_resumes (
  user_id uuid not null,
  job_id bigint not null,
  resume_id uuid not null,
  primary key (user_id, job_id),
  foreign key (user_id, job_id) references public.applications(user_id, job_id) on delete cascade,
  foreign key (resume_id, user_id) references public.resumes(id, user_id) on delete cascade
);
alter table public.application_resumes enable row level security;
create policy "users manage own job resume choices" on public.application_resumes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.application_resumes to authenticated;

create or replace function public.set_default_resume(p_resume_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = caller for update;
  if not exists (select 1 from public.resumes where id = p_resume_id and user_id = caller) then
    raise exception 'Resume not found' using errcode = '42501';
  end if;
  update public.resumes set is_default = false where user_id = caller and is_default;
  update public.resumes set is_default = true where id = p_resume_id and user_id = caller;
end;
$$;

-- Skills uploads now append a version and return its ID for per-resume polling.
create function public.save_uploaded_resume_version(
  p_original_filename text, p_storage_path text, p_mime_type text,
  p_file_size_bytes bigint, p_extracted_text text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  resume_id uuid := gen_random_uuid();
  filename text := left(coalesce(nullif(btrim(p_original_filename), ''), 'resume'), 255);
begin
  if caller is null then raise exception 'Sign in before saving a resume' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_extracted_text, ''))) = 0 or length(p_extracted_text) > 200000
    or p_file_size_bytes is null or p_file_size_bytes not between 1 and 5242880 then
    raise exception 'Invalid resume text or file size' using errcode = '22023';
  end if;
  if p_storage_path is not null and (
    split_part(p_storage_path, '/', 1) <> caller::text or position('..' in p_storage_path) > 0
    or length(split_part(p_storage_path, '/', 2)) = 0
  ) then raise exception 'Resume file path is outside your folder' using errcode = '42501'; end if;

  insert into public.resumes (
    id, user_id, name, original_filename, storage_path, mime_type, file_size_bytes,
    processing_status, uploaded_at, extracted_text, text_extracted_at, has_file
  ) values (
    resume_id, caller, coalesce(nullif(left(btrim(regexp_replace(filename, '\.[^.]+$', '')), 150), ''), 'Resume'),
    filename, coalesce(p_storage_path, caller::text || '/' || resume_id::text || '.text-only'),
    p_mime_type, p_file_size_bytes, 'uploaded', now(), p_extracted_text, now(), p_storage_path is not null
  );
  return resume_id;
end;
$$;

-- Compatibility for older clients: preserve all rows and return no paths to delete.
create or replace function public.save_uploaded_resume(
  p_original_filename text, p_storage_path text, p_mime_type text,
  p_file_size_bytes bigint, p_extracted_text text
) returns text[] language plpgsql security definer set search_path = '' as $$
begin
  perform public.save_uploaded_resume_version(p_original_filename, p_storage_path, p_mime_type, p_file_size_bytes, p_extracted_text);
  return '{}'::text[];
end;
$$;

create function public.resume_scan_status_for(p_resume_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when processed_at is null or processed_at < text_extracted_at then 'scanning' else 'done' end
    from public.resumes where id = p_resume_id and user_id = auth.uid() and text_extracted_at is not null), 'none');
$$;
-- File-only library uploads do not hide the latest skill scan from older clients.
create or replace function public.resume_scan_status() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when processed_at is null or processed_at < text_extracted_at then 'scanning' else 'done' end
    from public.resumes where user_id = auth.uid() and text_extracted_at is not null
    order by text_extracted_at desc, id limit 1), 'none');
$$;

revoke all on function public.set_default_resume(uuid) from public, anon, authenticated;
revoke all on function public.save_uploaded_resume_version(text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.save_uploaded_resume(text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.resume_scan_status_for(uuid) from public, anon, authenticated;
revoke all on function public.resume_scan_status() from public, anon, authenticated;
grant execute on function public.set_default_resume(uuid) to authenticated;
grant execute on function public.save_uploaded_resume_version(text, text, text, bigint, text) to authenticated;
grant execute on function public.save_uploaded_resume(text, text, text, bigint, text) to authenticated;
grant execute on function public.resume_scan_status_for(uuid) to authenticated;
grant execute on function public.resume_scan_status() to authenticated;
commit;
