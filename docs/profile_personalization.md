# Score-based job browsing

**For you** and the dashboard's **Jobs for you** card use skill-match scores,
not saved target-role keywords. **All jobs** remains available alongside them.
Apply migration `019_paginated_job_feed.sql`, then `020_score_based_job_feed.sql`.
Do not rerun migrations already applied. The newer location/skill controls also
require `018_job_feed_filters.sql` after the existing migrations.
There are no new tables or API keys.

## Matching contract

Skill coverage is the percentage of a posting's distinct tagged skills that the
signed-in user has in `user_skills`, rounded to a whole percent. It is not the
planned AI fit score or 70/15/15 scoring formula.

For you includes only scores above 0% and ranks by score descending, then posting
date and ID descending for ties. Missing tags, no user skills, and 0% scores do
not qualify. The 50%/75%/100% controls narrow the feed using the unrounded
coverage ratio, even though badges show rounded percentages. All jobs remains
newest-first and includes unscored jobs unless a score threshold is selected.

Add skills in Profile/Skills to personalize recommendations. Updated skills
refresh recommendations. Saved target roles remain useful for role alerts but
do not restrict For you. Search, location, posting date and work mode apply in
both views. Users without matches see an explanatory empty state, not a silent
fallback to All jobs. Dashboard recommendations use the same ranking.

## Queries and pagination

Browser reads remain in `frontend/lib/data.ts`. Both feeds call the authenticated
`search_filtered_open_jobs` RPC (migration 018). It respects table RLS and calculates scores from
the caller's skills, not a user ID supplied by the browser. Returned scores use
the same data snapshot as filtering and ordering, so displayed percentages match
the feed's ranking.

Multiple location chips match any added place using normalized word boundaries,
ignoring case, accents and punctuation. All filters run before pagination.
The response includes skill IDs/names and company logos for the newer UI.

Pages contain up to 50 jobs with a total matching count and Previous/Next
controls. Neither feed has a total-result cap. Search and filters run in the
database before pagination. Changing filters or skills resets to page one;
outdated requests are aborted and search is debounced. The dashboard loads a
50-job preview independently of the current feed filters.

Tracked jobs and direct links remain accessible independently of score, open
status or current feed page. Role-based notification behavior is unchanged.

## Validation

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` from frontend.
SQL regression scripts in `supabase/tests` run as database owner and roll back
their fixtures. Verify positive-score inclusion, global ranking across pages,
rounding, score thresholds, no-skill/untagged empty states, and unchanged All jobs
ordering. The original migration 019 query remains available for older clients.
