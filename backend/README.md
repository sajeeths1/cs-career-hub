# Backend

## Job ingestion worker

The Greenhouse-to-Supabase job ingestion worker is in `worker/`.

```bash
cd backend/worker
pip install -r requirements.txt
python basic_pipeline.py
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a `.env` file before running it.

## Database

Supabase migrations remain in the repository-root `supabase/migrations/` directory so they work with the standard Supabase CLI layout.
