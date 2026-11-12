# Profile and resume library

Apply the revised `016_resume_library.sql` **after** the existing resume storage,
text extraction, skill extraction and upload migrations (`011_resume_storage.sql`,
`012_resume_text_extraction.sql`, `013_resume_skill_extraction.sql` and
`014_resume_uploads.sql`). Do not rerun older upload migrations afterward:
the library migration replaces their single-resume upload behavior.

The migration extends the existing `resumes` table with `name`, `is_default` and
`has_file`, reuses the private `resumes` Storage bucket and existing `uploaded_at`
timestamp, and adds `application_resumes` for per-job choices. It does not create
`profile_resumes` or a second bucket. The revised file is for projects that have
not applied the original library migration.

Existing resume rows, IDs, timestamps, files and extracted text are preserved.
Display names are derived from filenames. Existing stored resumes appear in the
library automatically. Old text-only rows remain visible with downloads disabled.

Profile replaces the Personalization tab. It contains the resume library, personal
and education details, role/location preferences, company follows, notification
settings, and account deletion. Old Personalization links continue to open Profile.

Upload multiple PDF, DOCX, PNG or JPEG versions (up to 5 MB each), rename them,
view/download them, and mark a default. Skills uploads save the file once in the
same bucket and append one resume row with extracted text for the worker. They
never delete previous versions or job choices. Per-resume scan polling uses the
saved ID so another upload cannot change the scan being displayed. The legacy
`save_uploaded_resume` RPC also appends and returns an empty deletion list for
older clients. Profile uploads store files without triggering skill extraction.
If file storage fails during a Skills upload, its extracted text can still be
saved; that row shows that no downloadable file was retained. Earlier versions
already overwritten by the old single-resume flow cannot be recovered.

Save a job before choosing its resume in the Tracker or job details. The choice
records which version the user plans to submit. It does not submit a job
application or change skill match scores. Choosing “Use default” saves the current
default's ID; later default changes do not rewrite existing job choices. Renaming
a resume retains assignments. Deleting a resume clears its assignments, and
untracking a job clears its choice. All ownership checks are enforced by RLS and
composite foreign keys, including assigning a resume to an application.

Files use random paths, private Storage policies, and signed viewing/downloading
links that expire after 60 seconds. Account deletion removes all resume
files/text, including orphan files in the user's folder,
before deleting the account. Hosted changes are not applied by a local build.

Validation:

```sh
cd frontend
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Against a disposable database with the prerequisite migrations installed, run
`supabase/tests/resume_library_migration.sql` to apply the revised migration and
verify existing rows/files survive. Then run `supabase/tests/resume_library.sql`
as the owner. It tests row/file isolation, cross-user assignments, defaults,
renames, append-only uploads, per-resume scan status, worker compatibility and
cascade cleanup. Frontend tests cover file validation, version
retention, failed-upload cleanup, and account deletion.
