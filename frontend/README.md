# Frontend

Next.js + React + TypeScript frontend for CS Career Hub.

## Stack

- Next.js + React
- TypeScript
- Tailwind CSS
- shadcn-style local UI components
- Lucide React icons
- React Hook Form + Zod

## Commands

To install dependencies for the entire project, run `python3 setup_project.py`
from the repository root (`python setup_project.py` on Windows). This includes
frontend packages and both Python environments. Individual frontend commands:

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

The Resume center uploads documents to an authenticated Next.js endpoint for
local Python/Tesseract extraction. Install the separate OCR dependencies before
using it; see [resume setup and deployment](../docs/resume_parsing.md). Users
review details and explicitly approve profile fields and skill selections.
Files and full extracted text are not persisted. No new migration is required.

The Skills tab needs migrations 000–005 and a backfill with the Python skills
worker. It reads saved tags, demand reports and learning resources through
`lib/data.ts`; it does not call the worker or extract skills in the browser.
Configure the public Supabase URL and publishable key in `.env.local` or `.env`.
See [Skills setup](../docs/skill_development.md) and the
[roadmap audit](../docs/roadmap_audit.md) for the completed scope and remaining work.

## Paginated job browsing

Apply `supabase/migrations/013_paginated_job_feed.sql`, then
`supabase/migrations/014_score_based_job_feed.sql` before deploying this frontend.
Migration 014 adds the authenticated, RLS-respecting `search_scored_open_jobs`
RPC; there are no new tables or API keys. If 013 is already applied, run only 014.

Both All jobs and For you use 50-job pages with Previous/Next controls and a
matching-job count. Search (title, company, location),
work mode, calendar-date range, location and skill-coverage thresholds are
applied in the database before pagination. There is no 300-result cap.
The dashboard loads a 50-job preview; tracker entries and direct links remain
accessible independently of the feed page.

For you and dashboard recommendations show jobs with positive rounded
skill-coverage scores, highest first, then newest date/ID for ties.
Target roles no longer determine these recommendations (role alerts are
unchanged). Jobs with no tags, no overlapping skills or a 0% score are excluded;
users without skills can still browse All jobs. All jobs remains newest-first.

`supabase/tests/paginated_job_feed.sql` checks both feeds against more than
300 fixture postings and rolls the fixtures back. Run it as the database owner
after applying migration 013.
`supabase/tests/score_based_job_feed.sql` checks positive-score inclusion,
ranking beyond 300 matches, thresholds, per-user scores and unchanged All jobs
after migration 014.
