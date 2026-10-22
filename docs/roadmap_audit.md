# Project-plan audit

Scope: repository implementation on `feat/skill-development`, reviewed against the
team's supplied plan. Hosted Supabase migrations, email-provider setup, repository
secrets and deployment state are not inferred from source files.

| Plan item | Repository status | Evidence / remaining work |
| --- | --- | --- |
| Supabase Auth, profiles and RLS | Implemented in code | Migrations 000–002, auth screen, profile form and shared public browser client. Hosted setup must be verified by the Data owner. |
| Greenhouse collection, filtering, deduplication and stale closure | Implemented | `backend/worker/pipeline.py`; service-role writes, company failure isolation and database fingerprint uniqueness. |
| Jobs, search/filtering and application tracker | Implemented | `frontend/app/page.tsx`, `frontend/lib/data.ts`; private tracker rows. |
| Automatic collection | Workflow implemented; activation unverified | `.github/workflows/pipeline.yml` schedules collection every six hours and supports manual runs. Scheduled execution requires this file on the default branch and configured repository secrets. It runs collection only; skill extraction remains a separate or explicitly enabled step. |
| Shared skill catalog and student skills | Implemented | Migrations 003–005; normalized aliases and persisted student selections. |
| Once-per-posting extraction | Keyword baseline implemented | `skills.py`, bounded batches, persisted version/hash, atomic writes and invalidation. No paid API calls. |
| LLM extraction | Planned | Choose provider/key owner; validate structured output; distinguish required and nice-to-have skills and seniority. The baseline must not be presented as AI. |
| Precomputed 70/15/15 match scores | Planned | No `job_matches` table, scoring worker or job fit percentage. Preference fields and required/optional skill labels need to be defined first. Demand percentages are not match scores. |
| Missing skills and learning goals/resources | Implemented | Stored tags, known-skill exclusion, actionable resources in `learning_resources`, private goal progress, goal filters and job evidence. |
| Real skill demand and date comparisons | Implemented with stated limits | Database aggregates all open postings, reports extraction coverage and compares posting dates. No historical snapshots or claims of market growth. |
| Priority companies and notification preferences | Schema only | Migration 003 contains storage and the ten-company rule. No settings UI, sender or delivery ledger. |
| Instant alerts and digests | Planned | Need email service, `notifications_sent`, idempotent delivery and team-account integration tests. Cannot claim Phase 4 completion. |
| Lever, Ashby and GitHub internship sources | Planned | Only Greenhouse is collected. Shared job format remains compatible with future fetchers. |
| Error handling and logging | Partial | UI retry/error/empty/loading states, company warnings and logged per-posting extraction failures. No centralized monitoring. |
| Stable demo dataset | Planned | SQL tests have disposable deterministic fixtures; no product demo seed dataset is claimed. |
| Production hosting | Unverified / outside this change | Production build checked locally. No deployment or hosting configuration is asserted. |

## Architectural checks

The website and worker communicate only through Supabase. Every browser read/write
is in `frontend/lib/data.ts`; contracts are in `frontend/lib/types.ts`. No service-role
key is included in browser code, logs or fixtures. Shared skill/resource data is
read-only for students. Private learning goals and skills use database constraints
and RLS. Schema additions are in new numbered migrations, and the Data owner applies
them to the shared project. Existing migrations 000–004 are unchanged.

The worker performs extraction once per content/catalog version, stores completion
for zero-match jobs, caps each batch and retries failures. A transaction protects
tag replacement and its marker, and a stale worker cannot overwrite a changed
posting. A future LLM extractor can use the same contract. The browser only renders
persisted counts, known-skill differences and resources; it does not duplicate the
planned scoring algorithm.

## Team handoff and completion gates

1. **Data owner:** review/apply migration 005, then verify authenticated reads and
   two-user isolation in the shared development Supabase project.
2. **Intelligence owner:** review the alias/catalog and extraction-save contract,
   backfill keyword tags, then implement the separately selected LLM and matching
   work. Keep required versus optional labels explicit before scoring.
3. **Pipeline owner:** verify the collection workflow on the default branch and
   repository secrets. Optionally run `pipeline.py --with-skills --skill-limit 50`;
   the existing workflow runs collection only. Additional source adapters remain planned.
4. **Frontend/product:** test signup → select skills → inspect demand/gaps → open
   resources → save/update goals. Matching and email portions of the full Phase 5
   journey remain blocked on their respective unfinished phases.

The Skills slice is complete after migration and backfill. The entire project is
not complete until the matching, scheduled-operation, notification and deployment gates in
the original plan are met.
