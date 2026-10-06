# CS Career Hub

Centralized job and internship hub for CS students: real postings collected from company job boards, search and filters, and a personal application tracker.

## Project structure

```txt
cs-career-hub/
  frontend/              Next.js + React + TypeScript website (talks to Supabase)
  backend/worker/        Python pipeline that collects jobs into Supabase
  supabase/migrations/   SQL files that build the database (run in order)
  docs/                  Database diagram (database.dbml)
```

## How it fits together

```txt
Greenhouse job boards -> backend/worker/pipeline.py -> Supabase <- frontend (Next.js)
```

The pipeline and the website never talk to each other directly. They both read and write the same Supabase tables.

## MVP setup (do these in order)

### 1. Database (once)
In Supabase -> SQL Editor, run each file as its own query, in order:
1. `supabase/migrations/000_basic_schema.sql`
2. `supabase/migrations/001_add_pipeline_columns.sql`
3. `supabase/migrations/002_mvp_frontend_fields.sql`

For a smooth demo, turn off email confirmation: Authentication -> Sign In / Providers -> Email -> uncheck "Confirm email".

### 2. Collect jobs
```bash
cd backend/worker
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python pipeline.py
```
Needs `backend/worker/.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### 3. Run the website
```bash
cd frontend
npm install
cp .env.local.example .env.local   # then paste your Project URL + anon key
npm run dev
```
Open `http://localhost:3000`, create an account, and browse jobs.

## Keys
- `backend/worker/.env`: service_role key (pipeline only, never in the frontend).
- `frontend/.env.local`: anon key (safe in the browser; row-level security limits it).
- Both files are in `.gitignore`. Never commit them.
