# CS Career Hub

**A job and internship hub built for computer science students.**

CS Career Hub collects CS job and internship postings from public company job boards into one place, so students can search them, filter them, and track every application from "saved" to "offer."

---

## How it works

```txt
Company job boards ──► Python pipeline ──► Supabase database ◄──► Website
   (Greenhouse)        collects & cleans    (PostgreSQL + login)    (Next.js)
                                                   ▲
                       Skills step ────────────────┘
                   (local LLM via Ollama)
```

- A **Python pipeline** downloads postings from public Greenhouse job boards, keeps U.S. early-career CS roles, removes duplicates, and marks postings that disappear as closed.
- A **skills step** reads each job description with a local AI model (run through Ollama) and saves the skills it asks for, such as Python, SQL or AWS, and whether each is required or preferred.
- A **Supabase** database stores the jobs, student accounts and application trackers. Its security rules make sure each student can only see their own data.
- A **Next.js website** lets students browse jobs and manage their tracker.

We only use public job-board feeds that are meant to be read. We do not scrape sites whose terms of service forbid it.

### Tech stack

| Part | Technology |
| :-- | :-- |
| Website | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Database and login | Supabase (PostgreSQL, Auth, row-level security) |
| Job pipeline | Python 3 (`requests`, `supabase`, `python-dotenv`) |
| Skill extraction | Ollama running `qwen2.5:7b` locally (`ollama`, `pydantic`) |
| Job data | Greenhouse public job board API |

---

## Getting started

These steps run the project on **macOS** and **Windows**.

### Requirements

| Tool | Version | Download |
| :-- | :-- | :-- |
| Git | any recent version | [git-scm.com](https://git-scm.com) |
| Python | 3.11 or newer | [python.org](https://www.python.org) (Windows: check **"Add Python to PATH"** during install) |
| Node.js | 20 LTS or newer | [nodejs.org](https://nodejs.org) |
| Supabase account | default | [supabase.com](https://supabase.com) |
| Ollama (only for the skills step) | any recent version | [ollama.com](https://ollama.com) (macOS: or `brew install ollama`) |

Use **Terminal** on macOS and **PowerShell** on Windows.

### 1. Get the code

```bash
git clone https://github.com/sajeeths1/cs-career-hub.git
cd cs-career-hub
```

### 2. Set up the database

> **Joining the team?** We all share one Supabase project, and its migrations have already been run. Skip this step and ask a teammate for the keys in step 3. Only run a **new** migration once, and tell the team before you do.

1. Create a project on [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run these files **one at a time, in order** (New query → paste the file → Run):
   1. `supabase/migrations/000_basic_schema.sql`
   2. `supabase/migrations/001_add_pipeline_columns.sql`
   3. `supabase/migrations/002_mvp_frontend_fields.sql`
   4. `supabase/migrations/003_add_skills.sql`
3. Optional, for local testing: under **Authentication → Sign In / Providers → Email**, turn off **Confirm email** so new accounts work without an email link.

### 3. Get your keys

From your Supabase project:

- **Project URL:** click **Connect** at the top of the project page.
- **Publishable (anon) key** and **secret (service_role) key:** **Settings → API Keys**.

> The **secret** key bypasses all security rules. Use it only in the backend file below, never in the website, and never commit it.

### 4. Collect jobs

Create `backend/worker/.env`:

```txt
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-key
```

Then run the pipeline.

**macOS**

```bash
cd backend/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python pipeline.py
```

**Windows (PowerShell)**

```powershell
cd backend\worker
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python pipeline.py
```

You'll see a line for each company and a summary of how many jobs were saved. A few companies being "skipped" is normal; it means they no longer use Greenhouse.

### 5. Extract skills (optional)

This step needs [Ollama](https://ollama.com) and about 5 GB of disk space for the model. You can skip it; the website still works, just without skill data.

Install Ollama, then download the model once:

```bash
ollama pull qwen2.5:7b
```

Make sure Ollama is running (macOS: `brew services start ollama`, or open the Ollama app; Windows: open the Ollama app). Then, with the virtual environment from step 4 still on:

```bash
python try_skills.py          # preview skills for 5 jobs; saves nothing
python skills.py --limit 5    # save skills for 5 jobs
python skills.py              # save skills for every remaining open job
```

Each job takes about 20 seconds, so the first full run can take over an hour. Later runs only process jobs that don't have skills yet, and if a run stops partway, running it again picks up where it left off.

### 6. Start the website

In a **new** terminal window, create `frontend/.env.local`:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
```

(You can copy `frontend/.env.local.example` as a starting point.) Then:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**, create an account, and start browsing jobs.

### Next time

You only need the setup once. After that:

| Task | macOS | Windows |
| :-- | :-- | :-- |
| Refresh jobs | `source .venv/bin/activate` then `python pipeline.py` | `.venv\Scripts\Activate.ps1` then `python pipeline.py` |
| Add skills for new jobs (after refreshing) | `python skills.py` | `python skills.py` |
| Start the website | `npm run dev` | `npm run dev` |

---

## Troubleshooting

| Problem | Solution |
| :-- | :-- |
| Windows: `source` is not recognized | Use `.venv\Scripts\Activate.ps1` instead. |
| Windows: "running scripts is disabled" | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again. |
| `python` / `python3` not found | Use `python3` on macOS and `python` on Windows. Reinstall Python if neither works. |
| `npm` not found | Install Node.js LTS, then reopen the terminal. |
| `KeyError: 'SUPABASE_URL'` | `backend/worker/.env` is missing or misnamed (check it isn't `.env.txt`). |
| `PGRST125: Invalid path` | `SUPABASE_URL` must end in `.supabase.co`, with nothing after it. |
| Website says "Connect the website to Supabase" | `frontend/.env.local` is missing. Create it and restart `npm run dev`. |
| Sign-up asks you to check your email | Email confirmation is on. Click the link in the email, or turn the setting off (step 2). |
| The job list is empty | Run the pipeline (step 4), then refresh the website. |
| `Can't reach Ollama or model qwen2.5:7b isn't pulled` | Start Ollama (step 5) and run `ollama pull qwen2.5:7b`. |
| `skills.py` seems stuck | It's probably working. Each job takes ~20 seconds and a line prints after each one. Run `ollama ps` in another terminal to check the model is loaded. |
| `relation "public.skills" does not exist` | Migration `003_add_skills.sql` hasn't been run (step 2). |

---

## Project structure

```txt
cs-career-hub/
├── backend/worker/        Python job pipeline and skills step
├── frontend/              Next.js website
├── supabase/migrations/   SQL files that build the database
└── docs/                  Technical documentation
```
