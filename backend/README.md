# Backend

## Job ingestion worker (`worker/`)

- `pipeline.py`: the MVP pipeline. Collects jobs from every Greenhouse company in the `companies` table (and adds a starter list of companies), keeps U.S. early-career-friendly CS roles, saves descriptions and work mode, skips duplicates, and closes jobs that disappear.
- `skills.py`: the skills step. For every open job without skills yet, asks a local model (through Ollama) which skills the description names, normalizes the names with `ALIASES` ("JS" -> "JavaScript"), and saves them to `skills` and `job_skills`. Run it after `pipeline.py`. Use `--limit N` to try a few jobs.
- `try_skills.py`: previews extracted skills for 5 jobs without saving anything. Use it to check prompt changes.
- `basic_pipeline.py`: the original one-company test. Kept for reference.

```bash
cd backend/worker
source .venv/bin/activate
pip install -r requirements.txt
python pipeline.py
python skills.py      # needs Ollama running with qwen2.5:7b pulled
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `worker/.env` before running.
Run all migrations (000-003) first.

To fix a skill spelling (e.g. "Postgres" and "PostgreSQL" showing up separately): add the lowercase spelling to `ALIASES` in `skills.py`. To change what counts as a skill, edit `SYSTEM` in `skills.py` and check the result with `python try_skills.py`.

To add a company: add it to `STARTER_COMPANIES` in `pipeline.py` (name and Greenhouse slug), or insert a row in the `companies` table with `ats_type = 'greenhouse'`.

## Database

Supabase migrations live in the repository-root `supabase/migrations/` directory so they work with the standard Supabase CLI layout.
