# Backend and Frontend Integration

This document explains how the CS Career Hub backend works and how it is connected to the frontend. 

The original **Version 1** (a basic pipeline test) is kept at the bottom as a reference.


---

## Architecture

```txt
                 ┌──────────────────────┐
Greenhouse  ───► │ Python pipeline      │ ──writes──┐
job boards       │ (service_role key)   │           │
                 └──────────────────────┘           ▼
                                         ┌─────────────────────────┐
                                         │ Supabase                │
                                         │  PostgreSQL tables      │
                                         │  Auth (student login)   │
                                         │  Row-level security     │
                                         └─────────────────────────┘
                                                    ▲
                 ┌──────────────────────┐           │
Student's   ───► │ Website (Next.js)    │ ◄─reads/writes─┘
browser          │ (anon key)           │
                 └──────────────────────┘
```

**Key design rule:** the pipeline and the website never call each other. Each one only reads and writes the database. The slow work happens in the background, so pages load fast; a pipeline failure never takes the website down; and the frontend and backend teams can work independently as long as both follow the database schema.

**We use Supabase's built-in API instead of writing our own server.** Supabase automatically provides an API for our tables. The website calls it through Supabase's JavaScript library, and the database's security rules decide what each student may read or change. This means there is no separate backend server for our team to write, host or keep running. Work that needs secret keys (such as the planned AI matching and email alerts) runs in the Python worker instead.

---

## Current version: Connected MVP

### Purpose

The current version turns the original pipeline test into a working product: the pipeline collects useful jobs from many companies, and the website is connected to the database so students can sign up, browse real jobs, track applications and save a profile.

These changes were made in the commit "added working pipeline with login."

### Files added or changed from Version 1

| Area | File | Change |
| :-- | :-- | :-- |
| Database | `supabase/migrations/002_mvp_frontend_fields.sql` | **New.** Adds the fields the website needs and grants table access |
| Pipeline | `backend/worker/pipeline.py` | **New.** Replaces `basic_pipeline.py` for everyday use |
| Frontend | `frontend/package.json`, `package-lock.json` | Added `@supabase/supabase-js` |
| Frontend | `frontend/lib/supabase.ts` | **New.** Creates the Supabase connection |
| Frontend | `frontend/lib/types.ts` | **New.** TypeScript types matching the SQL columns |
| Frontend | `frontend/lib/data.ts` | **New.** Every database read and write the website does |
| Frontend | `frontend/components/auth-screen.tsx` | **New.** Sign-in and sign-up screen |
| Frontend | `frontend/app/page.tsx` | Rewritten to use real data, login and the tracker |
| Frontend | `frontend/components/profile-form.tsx` | Now loads and saves the student's profile |
| Frontend | `frontend/components/ui/tabs.tsx` | Can now be switched from code |
| Config | `frontend/.env.local.example` | **New.** Template for the website's keys |
| Config | `.gitignore` | Now also ignores `.env*.local` |
| Docs | `docs/database.dbml` | Updated to match the real schema |

`basic_pipeline.py` is still in the repo as a simpler example, but `pipeline.py` is the one to run.

### The database

#### Tables

| Table | One row per | Key columns | Written by |
| :-- | :-- | :-- | :-- |
| `companies` | Company | `id`, `name` (unique), `website`, `ats_type`, `ats_slug` | Pipeline |
| `jobs` | Job posting | `id`, `company_id` → companies, `title`, `location`, `url`, `posted_at`, `description`, `work_mode`, `source`, `dedupe_hash` (unique), `is_open`, `last_seen_at` | Pipeline |
| `profiles` | Student | `id` (= login account id), `full_name`, `school`, `grad_year`, `major`, `preferred_location`, `target_roles` | Signup trigger, then the student |
| `applications` | Job a student tracks | `id`, `user_id` → profiles, `job_id` → jobs, `status`, `updated_at`; unique on (`user_id`, `job_id`) | The student, through the website |

```txt
companies 1 ──< jobs 1 ──< applications >── 1 profiles
```

Allowed statuses: `saved`, `not_applied`, `applied`, `interviewing`, `offer`, `rejected`.

#### What migration 002 added

| Change | Why |
| :-- | :-- |
| `saved` status | The tracker's "Saved" column |
| `jobs.description` | The job detail view shows the full description |
| `jobs.work_mode` (`remote` / `hybrid` / `in_person` / `unknown`) | The Remote / Hybrid / In person filter |
| `profiles.major`, `preferred_location`, `target_roles` | The profile form's fields |
| `applications.updated_at` | Show the most recently changed jobs first |
| Index on `jobs (is_open, posted_at desc)` | Fast "newest open jobs" query |
| `GRANT` statements for signed-in users | Lets the website use the tables (security rules still limit which rows) |

#### Login

Supabase Auth handles email and password accounts, stored in Supabase's internal `auth.users` table. A trigger (`on_auth_user_created`, from migration `000`) automatically creates a matching `profiles` row whenever someone signs up.

#### Security

Row-level security is on for all four tables:

| Table | A signed-in student can |
| :-- | :-- |
| `companies`, `jobs` | Read every row; cannot change anything |
| `profiles` | Read and change only their own row |
| `applications` | Read, add, change and delete only their own rows |

Because these rules live in the database, a bug in the website cannot show one student's tracker to another.

#### Keys

| Key | Where it lives | What it can do |
| :-- | :-- | :-- |
| **service_role / secret** | `backend/worker/.env` only | Bypasses security rules. The pipeline needs it to write jobs |
| **anon / publishable** | `frontend/.env.local` | Limited by security rules. Safe in the browser |

Both files are in `.gitignore`.

### The pipeline (`pipeline.py`)

Compared with the original basic pipeline (see the appendix), `pipeline.py`:

1. Adds a starter list of ~15 Greenhouse companies to `companies` if missing, then loops over **every** company with `ats_type = 'greenhouse'`.
2. Downloads each company's jobs **with descriptions** (`?content=true`).
3. Uses a **stricter filter**: the title must contain a CS word and must not contain words like senior, staff, manager or sales; the location must be in the U.S. (or plain "Remote").
4. Saves a plain-text **description** and a guessed **work mode** for each job.
5. Skips a company with a warning if its download fails, instead of stopping the whole run.
6. Still removes duplicates with the fingerprint and closes jobs not seen for 2 days.

Full details: [PIPELINE_AND_SQL.md](PIPELINE_AND_SQL.md).

### Connecting the website to Supabase

#### The connection (`lib/supabase.ts`)

```ts
export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;
```

It reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `frontend/.env.local`. (The `NEXT_PUBLIC_` prefix lets Next.js use them in the browser.) If either is missing, the page shows a setup message instead of crashing.

#### Types (`lib/types.ts`)

Defines `Job`, `Application`, `Profile`, `ApplicationStatus` and `WorkMode` using the **exact SQL column names**, plus `TRACKER_COLUMNS` (the tracker's columns in order) and `WORK_MODE_LABELS` (display names).

#### Database calls (`lib/data.ts`)

Every database call lives in this one file:

| Function | What it does | Supabase query |
| :-- | :-- | :-- |
| `fetchOpenJobs(limit = 300)` | Newest open jobs, with company name | `from("jobs").select("…, companies(name)").eq("is_open", true).order("posted_at", desc).limit(300)` |
| `fetchApplications()` | The student's tracker, with job and company | `from("applications").select("…, jobs(…, companies(name))").order("updated_at", desc)` |
| `setApplicationStatus(userId, jobId, status)` | Add a job to the tracker or change its status | `upsert({...}, { onConflict: "user_id,job_id" })` |
| `removeApplication(id)` | Remove a job from the tracker | `delete().eq("id", id)` |
| `fetchProfile(userId)` | Load the student's profile | `from("profiles").select(...).eq("id", userId).maybeSingle()` |
| `saveProfile(userId, values)` | Save the profile form | `update(values).eq("id", userId)` |

- `companies(name)` works **because of the foreign key** `jobs.company_id → companies.id`. Supabase follows it and returns the company name inside each job.
- `fetchApplications()` has **no user filter**. The security rules return only the signed-in student's rows.

#### Login (`components/auth-screen.tsx` and `app/page.tsx`)

The auth screen is one form that switches between sign in (`signInWithPassword`) and sign up (`signUp`). If sign-up returns no session, Supabase's "Confirm email" setting is on, so it tells the user to check their email.

`Home` in `app/page.tsx` decides what to show:

```txt
no Supabase keys    → setup message
checking session    → "Loading…"
not signed in       → AuthScreen
signed in           → Dashboard
```

It listens for sign-in and sign-out changes, so the page updates immediately, and Supabase keeps students signed in across refreshes.

#### The dashboard (`app/page.tsx`)

The dashboard keeps the original layout but uses real data:

| Tab | Data | Behavior |
| :-- | :-- | :-- |
| Dashboard | Real | Top numbers (open jobs, saved, applied, interviewing), 6 newest jobs, tracker counts |
| Jobs | Real | Search and work-mode filter; detail panel with description, "Open posting" link and a tracker status menu |
| Applications | Real | Five-column tracker; each card has a status menu and a remove button |
| Skills | **Sample data** | Still from `mock-data.ts`, clearly labeled |
| Profile | Real | Loads and saves the `profiles` row |

- **Loading:** jobs and applications load in parallel when the page opens; the refresh button reloads them. Errors show in a red banner.
- **Search and filters** run in the browser over the loaded jobs (title, company name, location, and work mode).
- **Tracking a job** upserts into `applications`, so saving a job that is already tracked updates it instead of duplicating it. Tracked jobs show "✓ Saved" or "✓ Applied" instead of a Save button.
- **Older `not_applied` rows** are shown in the Saved column so nothing is hidden.
- **Tabs** (`components/ui/tabs.tsx`) can now be switched from code, for example clicking a tracker card opens that job in the Jobs tab.

#### Profile form (`components/profile-form.tsx`)

Keeps its validation, and now loads the profile on open and saves it on submit:

| Form field | Column |
| :-- | :-- |
| Name | `full_name` |
| Major | `major` |
| Preferred location | `preferred_location` |
| Target roles | `target_roles` |

### How a request flows

**A student signs up**

```txt
AuthScreen ─signUp()─► Supabase Auth creates the login account
                         └─ trigger creates the profiles row
Home sees the new session ─► shows Dashboard
```

**The dashboard loads**

```txt
Dashboard ─► fetchOpenJobs()      ─► jobs + companies (any signed-in user may read)
          └► fetchApplications()  ─► applications + jobs + companies (own rows only)
```

**A student saves a job**

```txt
Save ─► setApplicationStatus(userId, jobId, "saved")
     ─► upsert into applications (only allowed for their own user_id)
     ─► fetchApplications() ─► tracker and counts update
```

---

## Known limitations

| Limitation | Notes / next step |
| :-- | :-- |
| Match scores and skills are not real yet | Planned: AI skill extraction plus a scoring formula |
| Skills tab uses sample data | Will use real skill trends once job skills are extracted |
| Resume upload is preview-only | Files never leave the browser |
| Website loads the newest 300 open jobs | Search and filters only cover those; add pagination later |
| Pipeline runs manually | Next: run it automatically every few hours with GitHub Actions |
| Only Greenhouse is supported | Add Lever, Ashby and community GitHub lists |
| Title and location filter is keyword-based | Some jobs will be wrongly kept or dropped |
| `work_mode` is guessed from text | Jobs that don't say "remote" or "hybrid" are marked in person |
| `profiles.school` and `grad_year` are not in the form | Columns exist; add form fields when needed |
| Website runs on localhost only | Deploy (for example, to Vercel) to share it |

---

## Making future changes safely

- **Database changes:** add a new numbered file (`003_...sql`) in `supabase/migrations/`. Never edit a migration that has already been run. One owner runs migrations so everyone's database matches. Update `docs/database.dbml` and `frontend/lib/types.ts` to match.
- **New database calls from the website:** add them to `frontend/lib/data.ts`, not directly in components.
- **New columns the pipeline fills:** add them to the row built in `clean_up()` in `pipeline.py`, using the exact column name.
- **Keys:** the website only ever uses the anon/publishable key.

---

## Appendix: Version 1 (basic pipeline)

> **Reference only.** This was the first test of the pipeline. It is no longer what the project runs, but it explains where the current design came from. `basic_pipeline.py` is still in the repo as a simpler example.

### Version 1 vs. the current version

| | Version 1: basic pipeline | Current version: connected MVP |
| :-- | :-- | :-- |
| Goal | Prove the pipeline works | A working product students can use |
| Pipeline file | `basic_pipeline.py` | `pipeline.py` |
| Companies | One (Stripe), hard-coded | ~15 starter companies, plus any added to the `companies` table |
| Job filter | Loose keyword match | CS roles only, no senior or non-technical titles, U.S. locations |
| Job details saved | Title, location, link, date | Also the full description and work mode |
| SQL migrations | `000`, `001` | `000`, `001`, `002` |
| Website | Sample data only, not connected | Connected to Supabase |
| Login | None | Email and password sign-up and sign-in |
| Application tracker | Sample cards | Saved to each student's account |
| Profile form | Kept only in the browser | Saved to the database |

### Purpose

Version 1 was a test. Its only job was to prove that the most important connection in the project works: **Python can download real job postings and save them into our Supabase database**, without saving duplicates.

At this stage, the website was being built separately by the frontend team and showed only sample data from `frontend/lib/mock-data.ts`. It did not talk to the database.

### What it included

| Part | File | What it did |
| :-- | :-- | :-- |
| Database tables | `supabase/migrations/000_basic_schema.sql` | Created `companies`, `jobs`, `profiles` and `applications`, the signup trigger and the security rules |
| Pipeline columns | `supabase/migrations/001_add_pipeline_columns.sql` | Added `ats_type`, `ats_slug`, `source`, `dedupe_hash`, `is_open` and `last_seen_at` |
| Pipeline | `backend/worker/basic_pipeline.py` | Collected jobs from one company and saved them |

### How the basic pipeline worked

`basic_pipeline.py` ran these steps for **one hard-coded company (Stripe)**:

1. **Find the company:** add Stripe to `companies` if it was not there, and get its id.
2. **Collect:** download Stripe's jobs from `https://boards-api.greenhouse.io/v1/boards/stripe/jobs`.
3. **Clean up:** keep jobs whose title contained a CS keyword (software, engineer, developer, data, machine learning, intern) and reshape them to match the `jobs` columns.
4. **Save:** upsert into `jobs` using the fingerprint (`dedupe_hash`) so repeats were updated, not duplicated.
5. **Close old jobs:** mark jobs not seen for 2 days as closed.

### What it proved

- Python could connect to Supabase with the service_role key.
- Jobs were saved with the correct `company_id`, so the link between `jobs` and `companies` worked.
- Running it a second time saved **0 new jobs**, so the duplicate check worked.

### What it showed we needed to fix

- **The filter was too loose.** The first run kept **719 jobs** from Stripe alone, including senior roles, sales engineers and jobs outside the U.S.
- **It only handled one company,** hard-coded in the file.
- **If the company's download failed,** the whole run stopped.
- **It did not save descriptions or work mode,** which the website needed.
- **The frontend and backend used different field names.** For example, the tracker had a "Saved" column that the database did not support, and the profile form had fields the database did not have.

These became the goals for the current version.