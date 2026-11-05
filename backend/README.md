# Backend

For the whole project, run `python3 setup_project.py` from the repository root
(`python setup_project.py` on Windows). It installs frontend packages and both
backend environments, and checks/installs Tesseract on supported systems.
The individual worker setup below is still available.

## Job ingestion worker (`worker/`)

- `pipeline.py`: the MVP pipeline. Collects jobs from every Greenhouse company in the `companies` table (and adds a starter list of companies), keeps U.S. early-career-friendly CS roles, saves descriptions and work mode, skips duplicates, and closes jobs that disappear.
- `basic_pipeline.py`: the original one-company test. Kept for reference.

```bash
cd backend/worker
python3 -m venv .venv  # first setup only
source .venv/bin/activate
pip install -r requirements.txt
python pipeline.py
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `worker/.env` or `backend/.env` before running. The dotenv loader searches parent folders.
Collection needs migrations 000–002. The Skills feature needs migrations 000–005, applied in order by the Data owner.

To add a company: add it to `STARTER_COMPANIES` in `pipeline.py` (name and Greenhouse slug), or insert a row in the `companies` table with `ats_type = 'greenhouse'`.

## Database

Supabase migrations live in the repository-root `supabase/migrations/` directory so they work with the standard Supabase CLI layout.

## Stored skill mentions

After migration 005, run from `backend/worker` with the same virtual environment:

```bash
python skills.py --limit 50
```

Repeat to backfill existing postings. An unchanged posting, including one with no
matching skills, is skipped on subsequent runs. Each run attempts at most 50 jobs
by default; `--limit` accepts 1–500. Processing failures are logged and retried on a
later run. The command exits nonzero if any attempted job failed.

To collect and then analyze in one command:

```bash
python pipeline.py --with-skills --skill-limit 50
```

This is a keyword baseline, not the planned LLM extraction. It normalizes aliases
from the database catalog, persists tags atomically, invalidates changed postings,
and does not use any paid API or call the website. An unchanged result from a
future non-keyword extractor is preserved. Only the backend uses the service-role
key. The future LLM worker should use the same atomic save contract, distinguish
required/nice-to-have skills, and keep a bounded batch size.

## Resume skills (local Ollama)

After migrations 010–011, with Ollama running and the model pulled, run from `backend/worker`:

```bash
python resume_skills.py --watch               # keep running: scans website uploads as they arrive
                                              # (npm run dev in frontend/ starts this for you)
python resume_skills.py --limit 20            # or scan what's waiting once, then exit
python resume_skills.py --limit 1 --dry-run   # print skills without saving
python skills.py --limit 500                  # re-tag jobs if new skills were added
```

Website uploads only get skills while `--watch` is running. Anything uploaded while it
is stopped waits and is scanned when it restarts. Set `OLLAMA_MODEL` to override the
default model. Run this on your own machine, because GitHub-hosted runners have no
Ollama. A failed resume is logged and retried later. A single run exits nonzero if
any attempted resume failed.

Run worker unit tests from the project root. They need the worker's packages, so use
its virtual environment:

```bash
backend/worker/.venv/bin/python -m unittest discover -s backend/worker/tests -v
```
