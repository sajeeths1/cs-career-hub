# Profile-based job browsing

Saved `profiles.target_roles` now drives a **For you** view in Jobs and a **Jobs
for you** card on the dashboard. **All jobs** remains available alongside it.
There are no new tables, migrations, backend services, or API keys for this change.

## User flow

1. Open Profile, enter target roles separated by commas, and save. Semicolons and
   newlines are also accepted; equivalent repeated roles are deduplicated.
2. Open Jobs. For you shows open postings whose titles match a saved target role.
3. Switch to All jobs to browse the general newest-job feed at any time.
4. Search and work-mode filters apply within the chosen view.

Saving a profile updates the recommendations without a page reload. A failed save
keeps the previous saved preferences. Refresh reloads the saved profile and both
feeds. New accounts without target roles get a setup prompt in For you, and can
still browse All jobs. The dashboard falls back to newest jobs until roles exist.
Profile or recommendation failures have retry controls and do not block All jobs.

## Matching contract

This is a title-keyword preference filter, not an AI fit score. Each role is a set
of required title words. All words in one role must match; any saved role can
qualify a posting. Word order and case do not matter. Descriptions and company
names are not used to determine role eligibility.

Common variations are normalized: front-end/front end/frontend, back-end/backend,
full-stack/full stack, engineer/engineering/developer, SWE/SDE, ML/machine learning,
AI/artificial intelligence, and data science/data scientist. Language tokens keep
C, C++ and C# distinct. Word matching rejects Java in JavaScript and data in
database. Other wording may still need broader preferences or a manual search.

For example, `frontend developer, data analyst` matches Frontend Engineer and
Data Analyst titles. Data Engineer does not match the data-analyst preference.
Preferred location and skills do not currently affect this view, and there is no
numerical match score. The separately planned 70/15/15 scoring worker is still
future work.

## Queries and limits

All browser database calls remain in `frontend/lib/data.ts`. The personalized
query applies `is_open = true` and a generated title filter in Supabase before
retrieving candidates. Input is normalized into fixed query templates rather
than interpolated as PostgREST operators. A final word check rejects broad
substring candidates.

Candidates are fetched in 200-row pages, ordered by posting date and ID, until
300 matching jobs are found or the candidate set is exhausted. This can find
matches outside the first 300 jobs in the general feed. Empty preferences issue
no personalized query. Outdated requests are aborted when preferences change.

Each view displays at most 300 results. All jobs retains its original general
feed limit, and free-text/work-mode filtering remains local to the selected
view's loaded results. This change does not implement general server-side search
and pagination. The Skills title focus remains independent of this job view.

Tracked postings can be opened directly by ID even when outside either feed or
closed; switching preferences does not hide a student's tracker entries.

## Validation

Run `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` from frontend.
Tests cover parsing, aliases, word boundaries, language punctuation, safe filter
construction, pagination beyond 300 candidates, ordering, deduplication and errors.
Browser checks with mocked Supabase responses cover saved profile changes,
reloads, failed saves, missing roles, retries, both views, search/work mode,
tracked-job details and mobile layout. Read-only requests against the configured
Supabase project verify that the generated nested title filters are accepted.
