# Backend

## Job ingestion worker (`worker/`)

- `pipeline.py`: the MVP pipeline. Collects jobs from every Greenhouse company in the `companies` table (and adds a starter list of companies), keeps U.S. early-career-friendly CS roles, saves descriptions and work mode, skips duplicates, and closes jobs that disappear.
- `basic_pipeline.py`: the original one-company test. Kept for reference.

```bash
cd backend/worker
source .venv/bin/activate
pip install -r requirements.txt
python pipeline.py
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `worker/.env` before running.
Run all migrations (000, 001, 002) first.

To add a company: add it to `STARTER_COMPANIES` in `pipeline.py` (name and Greenhouse slug), or insert a row in the `companies` table with `ats_type = 'greenhouse'`.

## Database

Supabase migrations live in the repository-root `supabase/migrations/` directory so they work with the standard Supabase CLI layout.
