# Skill development

Apply migrations 000–004 in order. Existing installations that have already applied
000–003 only need 004. This feature does not automatically modify a hosted database.

In the **Skills** tab, select skills you already have. Selections are saved to
`user_skills`. Optionally enter part of a job title to focus recommendations.
Missing skills are ranked by the number of matching open postings that mention
them. The page uses the dashboard's newest 300 loaded jobs, not the full job market.

Recommendations combine existing `job_skills` tags with case-insensitive keyword
matching against titles and descriptions, so the feature works before the planned
AI extraction pipeline exists. Each job counts once per skill. Alias matching
recognizes terms such as React.js and PostgreSQL and avoids substring matches like
React in “reactive.” Mentions may describe preferences or optional qualifications;
these are learning suggestions, not an assessment of eligibility.

The initial curated catalog covers Python, React, SQL, JavaScript, HTML and CSS.
Its resource links point to Python, React, PostgreSQL and MDN learning material.
Extend `frontend/lib/skill-development.ts` and seed the matching canonical skill
name in a new migration to expand the catalog. Other skills already in the database
can still be suggested from job tags or literal mentions, with a generic project
goal and an explicit message when no curated resource exists.

**Add learning goal** persists a goal to `learning_goals`. Goals can be planned,
in progress or completed, and can be removed. Goals remain available when the job
filter changes or a skill is marked known. Completing a goal does not automatically
claim proficiency; users update My skills themselves. One goal per user and skill
prevents accidental duplicates. Row-level security restricts skills selections and
goals to their owner. The browser uses only the existing public Supabase client.

Validation:

```sh
cd frontend
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
```

For a disposable Supabase database with migrations applied, run
`psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/skill_development.sql`
from the repository root. This test creates temporary fixtures inside a transaction
and rolls them back. It verifies goal persistence, statuses and isolation between
two authenticated users. Do not point test commands at a production database.

Manual check: sign in, select Python, reload and confirm it stays selected. Filter
by a title present in the loaded jobs, add a recommended goal, change its progress,
then reload. Sign in as a different user and verify that the selections and goals
are private. Confirm retry and empty states when data is unavailable.
