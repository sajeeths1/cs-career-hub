-- 011_resume_storage.sql
-- CS Career Hub: private resume storage and per-user metadata.
-- Apply ONCE to the intended development Supabase project.
-- This file uses the repo's existing numeric migration naming convention.

CREATE TABLE public.resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (mime_type IN (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )),
    file_size_bytes BIGINT NOT NULL CHECK (
        file_size_bytes > 0 AND file_size_bytes <= 10485760
    ),
    processing_status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
        processing_status IN ('uploaded', 'processing', 'completed', 'failed')
    ),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT resume_path_owner CHECK (
        split_part(storage_path, '/', 1) = user_id::TEXT
    )
);

CREATE INDEX resumes_user_uploaded_at_idx
    ON public.resumes (user_id, uploaded_at DESC);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.resumes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.resumes TO authenticated;

CREATE POLICY "Users read their own resumes"
    ON public.resumes FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users register their own uploaded resumes"
    ON public.resumes FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND processing_status = 'uploaded'
        AND processed_at IS NULL
    );

CREATE POLICY "Users delete their own resumes"
    ON public.resumes FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- This creates a PRIVATE bucket as part of the recorded migration.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'resumes',
    'resumes',
    false,
    10485760,
    ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Object paths: <authenticated-user-uuid>/<random-resume-uuid>.pdf or .docx
CREATE POLICY "Users upload to their own resume folder"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
        AND lower(storage.extension(name)) IN ('pdf', 'docx')
    );

CREATE POLICY "Users read their own resume files"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
    );

CREATE POLICY "Users delete their own resume files"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
    );

-- No UPDATE policies: existing objects cannot be overwritten and clients
-- cannot change processing status. Trusted backend code updates statuses.
