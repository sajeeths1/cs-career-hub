-- Store website uploads: the file in Storage and its text for the local skill worker.
-- Apply after 010. Only the Data owner should apply this to the shared Supabase project.
begin;

-- The resumes bucket was created by hand in the shared project. This lets new
-- environments match it, and does nothing where the bucket already exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('resumes', 'resumes', false, 10485760, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])
  on conflict (id) do nothing;

-- Students reach only files in their own folder: <user id>/<file>.
create policy "students read their own resume files" on storage.objects
  for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "students upload their own resume files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "students delete their own resume files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- SECURITY DEFINER with auth.uid() lets students save only their own resume, without
-- giving browser roles direct access to public.resumes. Earlier resumes are replaced so
-- only the latest is kept, and their file paths are returned for removal from Storage.
-- p_storage_path is null when no file is kept, such as for image uploads.
create function public.save_uploaded_resume(
  p_original_filename text, p_storage_path text, p_mime_type text,
  p_file_size_bytes bigint, p_extracted_text text
) returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_replaced text[];
begin
  if v_user_id is null then
    raise exception 'Sign in before saving a resume' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_extracted_text, ''))) = 0 or length(p_extracted_text) > 200000 then
    raise exception 'Resume text is empty or too long' using errcode = '22023';
  end if;
  -- Account deletion removes the files rows point to, so a row must never point at
  -- another student's file.
  if p_storage_path is not null and (
    split_part(p_storage_path, '/', 1) <> v_user_id::text
    or position('..' in p_storage_path) > 0
    or length(split_part(p_storage_path, '/', 2)) = 0
  ) then
    raise exception 'Resume file path is outside your folder' using errcode = '42501';
  end if;

  with removed as (
    delete from public.resumes where user_id = v_user_id returning storage_path
  )
  select coalesce(array_agg(storage_path) filter (where storage_path not like 'not-stored/%'), '{}')
    into v_replaced from removed;

  insert into public.resumes (
    id, user_id, original_filename, storage_path, mime_type, file_size_bytes,
    processing_status, uploaded_at, extracted_text, text_extracted_at
  ) values (
    v_id, v_user_id, left(p_original_filename, 255), coalesce(p_storage_path, 'not-stored/' || v_id),
    p_mime_type, p_file_size_bytes, 'uploaded', now(), p_extracted_text, now()
  );
  return v_replaced;
end $$;

-- Lets the upload screen wait for the worker without reading resume rows.
create function public.resume_scan_status() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when processed_at is null then 'scanning' else 'done' end
    from public.resumes
    where user_id = auth.uid()
    order by uploaded_at desc limit 1
  ), 'none');
$$;

-- Supabase may grant routine access to browser roles through default privileges.
revoke all on function public.save_uploaded_resume(text, text, text, bigint, text) from public, anon;
revoke all on function public.resume_scan_status() from public, anon;
grant execute on function public.save_uploaded_resume(text, text, text, bigint, text) to authenticated;
grant execute on function public.resume_scan_status() to authenticated;

-- Account deletion removes stored resumes explicitly.
grant delete on public.resumes to service_role;
commit;
