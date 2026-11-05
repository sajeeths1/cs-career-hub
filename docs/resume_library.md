# Profile and resume library

Apply migrations through `011_resume_library.sql` before using this feature.
The migration adds a private `profile-resumes` Storage bucket, `profile_resumes`
metadata, `application_resumes` selections, and the `set_default_resume` RPC.
The existing resume extraction schema and worker are unchanged.

Profile replaces the Personalization tab. It contains the resume library, personal
and education details, role/location preferences, company follows, notification
settings, and account deletion. Old Personalization links continue to open Profile.

Upload multiple PDF, DOCX, PNG or JPEG versions (up to 5 MB each), rename them,
view/download them, and mark a default. Uploads from Skills also archive a copy
in the library. If archiving fails, Skills shows a warning so the user can retry
from Profile. Library uploads store files without triggering skill extraction.
Earlier versions overwritten by the old single-resume flow cannot be recovered;
existing users should upload the versions they want to retain in the new library.

Save a job before choosing its resume in the Tracker or job details. The choice
records which version the user plans to submit. It does not submit a job
application or change skill match scores. Choosing “Use default” saves the current
default's ID; later default changes do not rewrite existing job choices. Renaming
a resume retains assignments. Deleting a resume clears its assignments, and
untracking a job clears its choice. All ownership checks are enforced by RLS and
composite foreign keys, including assigning a resume to an application.

Files use random paths, private Storage policies, and signed viewing/downloading
links that expire after 60 seconds. Account deletion removes both legacy resume
files/text and the new library files, including orphan files in the user's folder,
before deleting the account. Hosted changes are not applied by a local build.

Validation:

```sh
cd frontend
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Run `supabase/tests/resume_library.sql` as the owner against a disposable migrated
Supabase database. It tests row/file isolation, cross-user assignments, defaults,
renames, and cascade cleanup. Frontend tests cover file validation, version
retention, failed-upload cleanup, and account deletion.
