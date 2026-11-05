-- 009_resume_text_extraction.sql
-- Store extracted resume text for AI processing

ALTER TABLE public.resumes
ADD COLUMN extracted_text TEXT,
ADD COLUMN text_extracted_at TIMESTAMPTZ;