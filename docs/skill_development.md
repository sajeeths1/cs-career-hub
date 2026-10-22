# Skill development

The feature implements the Skills portion of the supplied project plan. It keeps
collection/extraction in Python, shared data in Supabase and browser database calls
in `frontend/lib/data.ts`. The browser does not extract skills, score matches or
call the worker. See [the roadmap audit](roadmap_audit.md) for remaining phases.

## Run it

The Data owner applies migrations **000–005** in order to the shared project.
If 000–004 are already applied, only run `005_skill_development_catalog.sql`.
Existing migrations have not been edited. No hosted database is modified by a code
checkout, build or test. Restart Next.js after changing environment variables.

With the existing backend environment and virtual environment, run:

```sh
cd backend/worker
source .venv/bin/activate
python skills.py --limit 50
```

Repeat until zero jobs are attempted to backfill all open postings. This does not
redownload company job boards. The limit caps attempted jobs, including failures.
For future collection runs, `python pipeline.py --with-skills --skill-limit 50`
collects first, then processes one bounded extraction batch. Existing
`python pipeline.py` collection behavior remains available.

Start the frontend with `npm run dev` from `frontend`, sign in and open **Skills**.
Choose your existing skills, optionally apply a job-title focus, add suggested goals
and update progress. Skill selection and goals persist across reloads and remain
private to the signed-in user. Desktop uses sidebar navigation; smaller screens
use the horizontal navigation.

## Data contract

- `skills`: canonical names shared by job tags and student selections.
- `skill_aliases`: normalized spellings such as JS/JavaScript and React.js/React.
- `job_skills`: persisted posting/skill links. Browser access is read-only.
- `job_skill_extractions`: hash, extractor version and time, including zero-match
  analyses. Only the trusted worker can write it.
- `learning_resources`: skill foreign key, title, HTTPS URL and actionable goal.
  Multiple resources can be attached to one skill without changing frontend code.
- `user_skills` and `learning_goals`: private rows protected by RLS. Goal statuses
  are planned, in progress or completed, with one goal per user/skill.
- `skill_development_overview(title_filter)`: authenticated, security-invoker,
  read-only report over **all open postings**, independent of the Jobs tab's
  300-row display limit. The filter is a literal case-insensitive title substring.
- `save_job_skill_extraction(...)`: service-role-only transaction. Locks the posting,
  verifies its title/description still match the input, replaces its tags and saves
  its marker together. Invalid tags or changed/closed jobs roll back the whole save.

The initial catalog covers Python, React, SQL, JavaScript, HTML, CSS, TypeScript,
Git, Docker, AWS and Java. Add aliases/resources through a new migration or a
trusted administrative workflow; students cannot alter the shared catalog.
Resources link to official language/platform documentation and tutorials, including
[TypeScript](https://www.typescriptlang.org/docs/handbook/intro.html),
[Pro Git](https://git-scm.com/book/en/v2) and
[Docker](https://docs.docker.com/get-started/).

## Extraction and reporting limits

The worker is a **keyword baseline**, not an LLM. Alias matching is case-insensitive,
escapes punctuation and rejects matches inside unrelated words. Mentions may be
optional qualifications, examples or otherwise not actual requirements. This
feature therefore offers learning suggestions and does not display match scores.

A content hash and catalog version make unchanged postings safe to skip. Changing
the catalog triggers reanalysis of keyword results. Changing a posting's title or
description invalidates its old tags and marker in the same database transaction.
Failed jobs retain no success marker and can be retried; unchanged non-keyword
results from a future extractor are not downgraded by the baseline worker.

Demand includes known skills; recommendations exclude the student's selected skills.
Counts and example postings come from persisted tags. Coverage explicitly includes
analyzed postings that produced zero tags. Unanalyzed postings do not imply that a
student has no gaps. Date comparisons show the last 30 days versus the preceding
30 days among **currently open** postings, based on `posted_at`; they are not
historical market growth or a full historical series. Null/future dates are not
counted in either period. Closed postings are excluded everywhere.

Goals remain saved when a job focus changes, a posting closes or a skill becomes
known. Completing a goal does not automatically claim proficiency. Users update
My skills themselves; goal progress can be filtered independently of the job focus.

The future Intelligence worker can replace keyword extraction through the same
atomic RPC, with a distinct extractor version and the same input-hash contract
(reuse `skills.input_hash`: SHA-256 of UTF-8 `json.dumps([title, description], ensure_ascii=False)`).
It still needs provider selection, validated JSON output, required/nice-to-have
labels and saved match scores before the planned 70/15/15 formula is possible.

## Validation

From the project root:

```sh
python3 -m unittest discover -s backend/worker/tests -v
cd frontend
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Against a **disposable** migrated Supabase database:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/skill_development.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/skill_development_catalog.sql
```

Fixtures run inside transactions and roll back. Tests cover user isolation,
read-only shared data, worker-only writes, failed-save rollback, stale workers,
cache invalidation, full-dataset counts, closed jobs, zero-tag analyses and date
windows. Worker tests use no network or credentials. Browser smoke checks use
mocked Supabase responses; they do not prove a hosted project has been migrated.
