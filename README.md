# CS Career Hub

**A job and internship hub built for computer science students.**

CS Career Hub collects CS job and internship postings from public company job boards into one place, so students can search them, filter them, and track every application from "saved" to "offer."

---

## How it works

```txt
Company job boards ──► Python pipeline ──► Supabase database ◄──► Website
   (Greenhouse)        collects & cleans    (PostgreSQL + login)    (Next.js)
```

- A **Python pipeline** downloads postings from public Greenhouse job boards, keeps U.S. early-career CS roles, removes duplicates, and marks postings that disappear as closed.
- A **Supabase** database stores the jobs, student accounts and application trackers. Its security rules make sure each student can only see their own data.
- A **Next.js website** lets students browse jobs and manage their tracker.
- The **For you jobs view** uses saved profile target roles to find relevant open titles. Switch to **All jobs** for general browsing. See [profile personalization](docs/profile_personalization.md) for matching behavior and limits.
- The **Skills tab** compares postings with students' skills, suggests learning resources and goals, and saves their progress. See [skill development](docs/skill_development.md) for setup and matching details.
- The **Resume center** extracts text and details from PDFs, DOCX and images, using OCR for scans. Students review suggestions before filling profile fields or adding skills. See [resume setup](docs/resume_parsing.md) for the Python/Tesseract requirements.

We only use public job-board feeds that are meant to be read. We do not scrape sites whose terms of service forbid it.

### Tech stack

| Part | Technology |
| :-- | :-- |
| Website | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Database and login | Supabase (PostgreSQL, Auth, row-level security) |
| Job pipeline | Python 3 (`requests`, `supabase`, `python-dotenv`) |
| Job data | Greenhouse public job board API |

---

## Getting started

These steps run the project on **macOS** and **Windows**.

### Requirements

| Tool | Version | Download |
| :-- | :-- | :-- |
| Git | any recent version | [git-scm.com](https://git-scm.com) |
| Python | 3.11 or newer | [python.org](https://www.python.org) (Windows: check **"Add Python to PATH"** during install) |
| Node.js | 22 or newer | [nodejs.org](https://nodejs.org) |
| Supabase account | default | [supabase.com](https://supabase.com) |

Use **Terminal** on macOS and **PowerShell** on Windows.

### Install all project dependencies with one command

After cloning, run this from the project root:

```bash
python3 setup_project.py
```

On Windows, use `python setup_project.py`.

This installs frontend packages from `frontend/package-lock.json` and both Python
requirements files into their existing `backend/worker/.venv` and
`backend/resume/.venv` environments. You do not need to activate either environment
for setup. Rerun the same command after pulling dependency changes.

Install Python 3.11+ and Node.js 22+ first. Setup also checks Tesseract and its
English OCR data. If Tesseract is missing, it installs it through Homebrew on
macOS or apt on Debian/Ubuntu (which may ask for your administrator password).
On Windows or other Linux distributions, install Tesseract and add it to PATH
before running setup. macOS requires Homebrew for automatic Tesseract installation.

To check an existing installation without changing it:

```bash
python3 setup_project.py --check
```

Supabase keys and database migrations are configured separately below. Setup
preserves `.env` files and does not run migrations or collect jobs. After this
command succeeds, you can skip the individual dependency-install commands below.

### 1. Get the code

```bash
git clone https://github.com/sajeeths1/cs-career-hub.git
cd cs-career-hub
```

### 2. Set up the database

1. Create a project on [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run these files **one at a time, in order** (New query → paste the file → Run):
   1. `supabase/migrations/000_basic_schema.sql`
   2. `supabase/migrations/001_add_pipeline_columns.sql`
   3. `supabase/migrations/002_mvp_frontend_fields.sql`
   4. `supabase/migrations/003_add_skills_and_notifications.sql`
   5. `supabase/migrations/004_skill_development.sql`
   6. `supabase/migrations/005_skill_development_catalog.sql`
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

### 5. Start the website

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

For skill demand and learning recommendations, activate the backend virtual environment
and run `python skills.py --limit 50` from `backend/worker`. Repeat until it reports
zero attempted jobs, or use `python pipeline.py --with-skills --skill-limit 50` on
future collection runs. This saves keyword-based skill mentions once per posting;
LLM extraction and match scores remain planned. See [skill development](docs/skill_development.md).

For a shared Supabase project, the team's Data owner applies new migrations.
Do not rerun migrations that have already been applied.

### Next time

You only need the setup once. After that:

| Task | macOS | Windows |
| :-- | :-- | :-- |
| Refresh jobs | `source .venv/bin/activate` then `python pipeline.py` | `.venv\Scripts\Activate.ps1` then `python pipeline.py` |
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

---

## Project structure

```txt
cs-career-hub/
├── backend/worker/        Python job pipeline
├── frontend/              Next.js website
├── supabase/migrations/   SQL files that build the database
└── docs/                  Technical documentation
```
