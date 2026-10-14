# The Pipeline and the SQL, Explained

This document walks through the SQL files that build the database and the Python files that fill it with jobs. It is written for teammates who are new to databases and pipelines. For how to run everything, see the root [README](../README.md).

**How the pieces relate**

- The **SQL files** build the empty tables (the "shelves"). They are run once, by hand, in Supabase's SQL Editor.
- The **Python pipeline** fills the `jobs` and `companies` tables (puts things on the shelves). It runs whenever we want fresh jobs.
- The pipeline writes using the **exact column names** the SQL created, so the two must always agree.

---

## Part 1: The SQL migrations

A **migration** is a SQL file that changes the database's structure. Ours are numbered and run in order:

| File | What it does |
| :-- | :-- |
| `000_basic_schema.sql` | Creates the four tables, the signup trigger and the security rules |
| `001_add_pipeline_columns.sql` | Adds the columns the pipeline needs (duplicate check, closing old jobs) |
| `002_mvp_frontend_fields.sql` | Adds the columns the website needs, plus the "saved" status |

**Rules:** run each file once, in order. To change the database later, add a new file (`003_...`) instead of editing an old one. That way, anyone who already ran 000–002 just runs the new file and ends up with the same database.

### Key terms

| Term | Meaning |
| :-- | :-- |
| **Table** | Like a spreadsheet: columns describe the data, rows are items |
| **Primary key (PK)** | A column that uniquely identifies each row (`id`) |
| **Foreign key (FK)** | A column holding another table's id, which links the tables |
| **Unique** | No two rows may have the same value in that column |
| **Enum** | A fixed list of allowed values |
| **RLS (row-level security)** | Database rules deciding which rows each user may see or change |
| **Trigger** | Code the database runs automatically when something happens |

### 1.1 `000_basic_schema.sql`

**The status list**

```sql
create type application_status as enum
  ('not_applied', 'applied', 'interviewing', 'offer', 'rejected');
```

Creates a fixed list of allowed statuses, so the database rejects typos like "Aplied." (Migration 002 adds `saved`.)

**`companies`**

```sql
create table public.companies (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  website  text
);
```

- `id ... generated always as identity primary key`: the database numbers rows automatically (1, 2, 3...).
- `name ... not null unique`: every company needs a name, and the same name cannot be added twice.

**`jobs`**

```sql
create table public.jobs (
  id          bigint generated always as identity primary key,
  company_id  bigint not null references public.companies(id) on delete cascade,
  title       text not null,
  location    text,
  url         text not null,
  posted_at   date
);
```

- `company_id ... references public.companies(id)` is the **foreign key**: each job points to the company that posted it.
- `on delete cascade`: if a company is deleted, its jobs are deleted too, so no job points to a missing company.

**`profiles`**

```sql
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  school     text,
  grad_year  int
);
```

- Supabase keeps login accounts in its own `auth.users` table. A profile uses the **same id** as the login account, so we always know whose profile is whose.
- `uuid` is a long random id (like `a1b2c3d4-...`), which is what Supabase uses for accounts.

**`applications`**

```sql
create table public.applications (
  id       bigint generated always as identity primary key,
  user_id  uuid   not null references public.profiles(id) on delete cascade,
  job_id   bigint not null references public.jobs(id) on delete cascade,
  status   application_status not null default 'not_applied',
  unique (user_id, job_id)
);
```

- Two foreign keys: **which student** (`user_id`) and **which job** (`job_id`). One row means "this student is tracking this job."
- `unique (user_id, job_id)`: a student cannot track the same job twice.

**The signup trigger**

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Whenever someone signs up (a new row in `auth.users`), the database automatically creates their `profiles` row with the same id. `security definer` lets the function insert even though the new user has no permissions yet.

**Security rules**

```sql
alter table public.jobs enable row level security;   -- same for all four tables

create policy "anyone signed in can read jobs"
  on public.jobs for select to authenticated using (true);

create policy "users manage their own applications"
  on public.applications for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

- Once RLS is on, **nothing** is allowed unless a policy allows it.
- `companies` and `jobs`: any signed-in user may **read** (`for select ... using (true)`), but nobody may change them through the website.
- `profiles` and `applications`: signed-in users may do everything (`for all`), but only on rows where the id matches their own login (`auth.uid()`).
  - `using (...)` controls which existing rows they can see, change or delete.
  - `with check (...)` controls what new or changed rows they may save, so nobody can save a row under someone else's id.
- The pipeline uses the **service_role** key, which bypasses RLS. That is how it can write jobs.

### 1.2 `001_add_pipeline_columns.sql`

```sql
alter table public.companies
  add column ats_type text,   -- e.g. 'greenhouse'
  add column ats_slug text;   -- e.g. 'stripe'
```

"ATS" means applicant tracking system, the website a company uses for job postings (Greenhouse is one). `ats_type` says **which** system; `ats_slug` is the company's name **on** that system, used to build the download address.

```sql
alter table public.jobs
  add column source       text        not null default 'manual',
  add column dedupe_hash  text,
  add column is_open      boolean     not null default true,
  add column last_seen_at timestamptz not null default now();
```

| Column | Purpose |
| :-- | :-- |
| `source` | Where the job came from (`greenhouse`, or `manual` for hand-added test jobs) |
| `dedupe_hash` | The job's "fingerprint," used to spot repeats |
| `is_open` | Whether the posting is still available |
| `last_seen_at` | The last time the pipeline saw the job (date **and** time, with time zone) |

```sql
update public.jobs set dedupe_hash = 'manual-' || id where dedupe_hash is null;
alter table public.jobs alter column dedupe_hash set not null;
alter table public.jobs add constraint jobs_dedupe_hash_key unique (dedupe_hash);
```

Any sample jobs added by hand before this migration get a made-up fingerprint (`manual-1`, `manual-2`...). Then the column becomes required and **unique**. The unique rule is what makes the pipeline's duplicate check work: the database itself refuses two jobs with the same fingerprint.

### 1.3 `002_mvp_frontend_fields.sql`

```sql
alter type public.application_status add value if not exists 'saved' before 'not_applied';
```

Adds `saved` to the status list for the tracker's "Saved" column.

```sql
alter table public.jobs
  add column if not exists description text,
  add column if not exists work_mode text not null default 'unknown'
    check (work_mode in ('remote', 'hybrid', 'in_person', 'unknown'));
```

The job description for the detail view, and the work mode for the Remote / Hybrid / In person filter. `check (...)` only allows those four values.

```sql
alter table public.profiles
  add column if not exists major              text,
  add column if not exists preferred_location text,
  add column if not exists target_roles       text;

alter table public.applications
  add column if not exists updated_at timestamptz not null default now();
```

The profile form's fields, and a timestamp so the tracker can show the most recently changed jobs first.

```sql
create index if not exists jobs_open_posted_idx
  on public.jobs (is_open, posted_at desc);
```

An **index** is like a book's index: it lets the database find "open jobs, newest first" without scanning every row.

```sql
grant usage on schema public to authenticated;
grant select on public.companies, public.jobs to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
```

`GRANT` gives signed-in users permission to use these tables at all. RLS (from 000) still decides **which rows**. Both are needed: grants open the door, and RLS limits what is inside.

`if not exists` appears throughout 002 so it is safer to run if part of it was already applied.

---

## Part 2: The Python pipeline

There are two Python files in `backend/worker/`:

| File | Purpose |
| :-- | :-- |
| `pipeline.py` | **The one to run.** Collects from many companies |
| `basic_pipeline.py` | The original one-company (Stripe) test. Kept as a simpler example; not used by anything |

Both need `backend/worker/.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and the libraries in `requirements.txt`:

| Library | Used for |
| :-- | :-- |
| `supabase` | Talking to the database |
| `requests` | Downloading job lists from Greenhouse |
| `python-dotenv` | Reading keys from the `.env` file |

### 2.1 What one run does

```txt
seed_companies()            add starter companies if missing
for each Greenhouse company:
    collect(slug)           download its jobs from Greenhouse
    clean_up(...)           keep U.S. CS roles, reshape to our columns
    save(...)               add new jobs, refresh existing ones
    close_old_jobs(...)     mark jobs unseen for 2 days as closed
print a summary
```

### 2.2 Settings (top of the file)

```python
STARTER_COMPANIES = {"Stripe": "stripe", "Airbnb": "airbnb", ...}
CLOSE_AFTER_DAYS = 2
BATCH_SIZE = 200
CS_WORDS = ["software", "engineer", "developer", "data", ..., "intern", "new grad"]
EXCLUDE_WORDS = ["senior", "staff", "principal", "manager", ..., "sales", "recruiter"]
US_STATE_CODES, US_HINTS, NON_US_HINTS = ...
```

| Setting | Meaning |
| :-- | :-- |
| `STARTER_COMPANIES` | Display name → Greenhouse slug (from `job-boards.greenhouse.io/<slug>`). Added to `companies` on every run if missing |
| `CLOSE_AFTER_DAYS` | Jobs not seen for this many days are marked closed |
| `BATCH_SIZE` | How many rows are sent to Supabase per request |
| `CS_WORDS` | A title must contain one of these to count as a CS job |
| `EXCLUDE_WORDS` | A title containing any of these is dropped (too senior, or not a CS role) |
| `US_STATE_CODES`, `US_HINTS`, `NON_US_HINTS` | Used to decide whether a location is in the U.S. |

Names in ALL CAPS are settings you can change without touching the logic below them.

### 2.3 Helper functions (no internet or database needed)

**`has_word(text, words)`** returns True if any word or phrase appears as a **whole word**. It uses a regular expression with `\b` (word boundary), so "intern" matches "Software Intern" but not "International," and "ai" does not match "Maintenance."

**`is_cs_role(title)`**

```python
return has_word(title, CS_WORDS) and not has_word(title, EXCLUDE_WORDS)
```

"Software Engineer, Intern" → kept. "Senior Software Engineer" → dropped ("senior"). "Sales Engineer" → dropped ("sales").

**`is_us_location(location)`** checks, in this order:

1. Contains a U.S. hint like "United States," "Remote - US," "New York" or "Raleigh" → **U.S.**
2. Contains a state code after a comma or dash, like "Austin, TX" → **U.S.**
3. Contains a non-U.S. hint like "Dublin," "Toronto" or "Bengaluru" → **not U.S.**
4. Otherwise, plain "Remote" with no country → **kept**; anything else → dropped.

**`guess_work_mode(title, location)`**: "hybrid" anywhere → `hybrid`; "remote" → `remote`; any known location → `in_person`; otherwise `unknown`.

**`html_to_text(content)`**: Greenhouse sends descriptions as escaped HTML (`&lt;p&gt;...`). This turns them into readable plain text: line breaks for paragraphs, "•" for list items, tags removed, and a 20,000-character cap.

**`make_fingerprint(company_id, title, location)`**

```python
text = f"{company_id}|{title.strip().lower()}|{location.strip().lower()}"
return hashlib.sha256(text.encode()).hexdigest()
```

Combines company, title and location into one string (like `1|software engineer, intern|remote`) and turns it into a fixed-length code. The same job always produces the same code. Lowercasing and trimming spaces means tiny formatting differences do not create a "new" job.

**`clean_up(raw_jobs, company_id, now)`** loops over the downloaded jobs and:

1. Skips anything that fails `is_cs_role` or `is_us_location`.
2. Skips a job if the same fingerprint already appeared in this download (a company sometimes lists one role twice).
3. Builds a row whose keys match the `jobs` columns exactly:

| Row key → column | Comes from |
| :-- | :-- |
| `company_id` | The company's id in our `companies` table |
| `title` | Greenhouse `title` |
| `location` | Greenhouse `location.name` (or "Unknown") |
| `url` | Greenhouse `absolute_url` |
| `posted_at` | `first_published`, else `updated_at`, else today (date part only) |
| `description` | `html_to_text(content)` |
| `work_mode` | `guess_work_mode(title, location)` |
| `source` | `"greenhouse"` |
| `dedupe_hash` | `make_fingerprint(...)` |
| `is_open` | `True` |
| `last_seen_at` | The time this run started |

If you rename a column in SQL, you must rename the matching key here.

### 2.4 Database and internet functions

**`get_client()`** connects to Supabase using the URL and service_role key from `.env`.

**`seed_companies(supabase)`**

```python
supabase.table("companies").upsert(rows, on_conflict="name").execute()
```

**Upsert** means "insert, or update if it already exists." Because `name` is unique, existing companies are updated, not duplicated.

**`collect(slug)`**

```python
url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
response = requests.get(url, timeout=30)
response.raise_for_status()
```

Downloads one company's full job list. `?content=true` includes descriptions. `raise_for_status()` turns a bad response (like 404 for a company that left Greenhouse) into an error that `main()` catches.

**`save(supabase, rows, company_id)`**

1. Asks the database which fingerprints this company already has, only to **count** how many jobs are new.
2. Sends rows in batches of 200 with `upsert(batch, on_conflict="dedupe_hash")`. New fingerprints are inserted; existing ones are updated, which refreshes `last_seen_at`. The unique rule from migration 001 guarantees no duplicates.

**`close_old_jobs(supabase, company_id, now)`**

```python
supabase.table("jobs").update({"is_open": False}) \
    .eq("company_id", company_id).eq("is_open", True) \
    .lt("last_seen_at", cutoff)
```

Read it like a sentence: set `is_open` to false **where** the company matches, the job is open, and `last_seen_at` is **less than** (older than) two days ago. `.eq` means "equals" and `.lt` means "less than."

**`main()`** ties it together: records the current time, seeds companies, loads every company with `ats_type = 'greenhouse'` (sorted by name), and runs the four steps for each. If one company fails to download, it prints a warning and moves on; one bad company never stops the run. It prints a line per company and a final summary.

```python
if __name__ == "__main__":
    main()
```

This last part means "when this file is run directly, start `main()`."

### 2.5 `basic_pipeline.py` vs `pipeline.py`

| | `basic_pipeline.py` | `pipeline.py` |
| :-- | :-- | :-- |
| Companies | One (Stripe), hard-coded | Every Greenhouse company in the table, plus a starter list |
| Filter | Loose keyword match (kept 719 Stripe jobs on its first run) | CS words, excluded words and U.S. location |
| Saves description / work mode | No | Yes |
| One company failing | Stops the run | Skipped with a warning |
| Needs migration | 000 + 001 | 000 + 001 + 002 |

---

## Part 3: Common tasks

**Add a company**
Find its Greenhouse slug from a job link (`job-boards.greenhouse.io/<slug>/...`). Either add `"Name": "slug"` to `STARTER_COMPANIES`, or insert a row in **Table Editor → companies** with `ats_type = greenhouse` and `ats_slug = <slug>`. Run the pipeline.

**Change what counts as a CS job**
Edit `CS_WORDS` or `EXCLUDE_WORDS`. To start fresh after a filter change, run `delete from jobs;` in the SQL Editor (this deletes only jobs, and also removes any tracker entries pointing to them), then run the pipeline again.

**Add a new column**
1. Create `supabase/migrations/003_<what>.sql` with an `alter table ... add column ...` and run it once.
2. If the pipeline fills it, add the key to the row in `clean_up()`.
3. If the website shows it, add it to `lib/types.ts` and the select list in `lib/data.ts`.
4. Update `docs/database.dbml`.

**Check what columns a table has**

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'jobs'
order by ordinal_position;
```

**See the newest jobs the pipeline saved**

```sql
select c.name, j.title, j.location, j.work_mode, j.posted_at
from jobs j join companies c on c.id = j.company_id
where j.is_open
order by j.last_seen_at desc
limit 20;
```