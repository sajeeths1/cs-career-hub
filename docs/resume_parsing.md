# Resume parsing and OCR

The Resume center on Dashboard and Profile reads PDF, DOCX, PNG and JPEG resumes.
It uses the WalletLens pattern: Python document extraction with Tesseract OCR for
images and PDF pages with little embedded text. Structured fields use conservative
rules, not an LLM. There is no paid API or separate API key.

## Local setup

For all project dependencies together, run `python3 setup_project.py` from the
repository root (`python setup_project.py` on Windows). This installs frontend,
job-worker and resume-parser packages and checks the OCR runtime. The separate
resume-only setup below remains available.

From the repository root, on macOS:

```bash
brew install tesseract
python3 -m venv backend/resume/.venv
backend/resume/.venv/bin/pip install -r backend/resume/requirements.txt
cd frontend
npm install
npm run dev
```

If Tesseract is already installed for WalletLens, skip the Homebrew command.
Keep the existing public Supabase URL/key in `frontend/.env` or `.env.local`.
The Next.js server locates `backend/resume/.venv` automatically. To use another
Python installation, set server-only `RESUME_PYTHON_BIN` to its absolute executable
path in the frontend environment file and restart Next.js. Do not point it at a
virtual environment that lacks these requirements.

No additional database migration or table is needed. Existing migrations 000–005
provide profiles, user skills, the canonical skill catalog and aliases. The
collection worker and its virtual environment remain separate and unchanged.

## Student workflow

1. Upload a resume while signed in. Limit: 5 MB, at most five PDF pages. Legacy
   `.doc` files must be converted to PDF or DOCX. Password-protected PDFs must be
   unlocked first. OCR currently uses English.
2. Review suggested name, major and school. **Fill profile form** copies nonempty
   suggestions into an editable form. **Save profile** explicitly saves them.
   Preferred location and target roles remain the student's choices. School and
   graduation year now use their existing `profiles` columns; graduation year is
   entered manually rather than guessed from potentially ambiguous resume dates.
3. Review skill mentions matched against live `skills` and `skill_aliases` records.
   Nothing is preselected. **Add selected skills** atomically adds the checked
   canonical skills to `user_skills`, retaining existing skills and learning goals.
   They participate in the existing Skills page's gap analysis on its next load.
4. Expand contact details, resume sections or full extracted text to check the
   result. Detected email, phone, GitHub/LinkedIn links, and headed sections such
   as education, experience and projects are review-only. They are not stored in
   the profile or treated as verified experience.

Extraction alone performs no database writes. Profile and skill saves are separate
explicit actions. The review survives tab navigation during the signed-in session;
discarding it, signing out or reloading clears it. No file or raw extracted text is
persisted in Supabase or browser storage. Tesseract can use short-lived OS temporary
files during processing; its normal cleanup removes them. Canceling parsing stops
the worker process group on macOS/Linux.

## Architecture

```text
Resume center -> POST /api/resume (bearer session)
              -> Supabase Auth verifies user
              -> bounded upload -> local Python subprocess
                 -> PDF text / DOCX XML / Tesseract OCR
              -> catalog + aliases read with the student's token and RLS
              -> uncached extraction response -> editable review

Approved profile fields / selected skills -> existing Supabase tables with RLS
```

`frontend/lib/data.ts` owns browser network calls. `frontend/app/api/resume/route.ts`
is the new server endpoint; `frontend/lib/server/resume-worker.ts` starts the fixed
Python script with document bytes on stdin, never shell-interpolated filenames.
The subprocess receives no Supabase keys. The endpoint requires a verified user,
limits actual streamed bytes, bounds concurrent parses per server process, times
out uploads after 20 seconds and extraction after 90 seconds, and sends `no-store`
responses. Worker failures return generic messages without logging document text.
If catalog access fails, text extraction is still returned with a visible warning.

This introduces an authenticated Next.js server endpoint specifically for document
processing. Job collection and normal application database operations still use
the existing Supabase architecture.

## Limits and deployment

PDF text layout, unusual headings, columns, OCR quality and name/degree formats can
affect results. The rule-based parser can miss details or suggest the wrong field;
the full extracted text and explicit review are intentional. It does not infer
seniority, target roles, proficiency, match scores or job requirements from a resume.
Scanned pages fall back to OCR independently, including in documents that also
have text pages. Mixed text/image content within the same page can require
exporting a clearer PDF. DOCX headers and body are read; embedded images in DOCX
are not OCRed. DOCX page count is unavailable without a layout renderer; its
decompressed content and extracted text are bounded instead.

Production must run Next.js on a Node host with Python, Tesseract's English data,
installed OCR requirements and the `backend/resume` source present. Include the
repository's backend directory when packaging the server; Next's default frontend
build tracing alone does not bundle it. A static-only host or ordinary Node-only
serverless deployment will not supply this runtime. Configure proxy request/time
limits accordingly. The in-process concurrency guard is not a distributed rate
limiter; use gateway limits and isolated worker capacity when deploying multiple
instances. Hosting changes are not included in this implementation.

## Verification

```bash
backend/resume/.venv/bin/python -m unittest discover -s backend/resume/tests -v
cd frontend
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Tests use synthetic resumes. Python tests cover actual Tesseract image extraction,
text PDFs, mixed PDFs, DOCX, unsafe XML, empty/oversized files and encrypted PDFs.
Frontend tests cover canonical skill boundaries, authenticated endpoint handling,
upload limits, catalog failures and concurrent requests. Browser verification also
exercises a real scanned PDF, explicit skill/profile approval, preservation of
career preferences, review/discard, invalid uploads and mobile layout against a
local mock database.

Implementation references: [PyMuPDF page API](https://pymupdf.readthedocs.io/en/latest/page.html),
[pytesseract timeouts](https://pypi.org/project/pytesseract/),
and [defusedxml protections](https://pypi.org/project/defusedxml/).
