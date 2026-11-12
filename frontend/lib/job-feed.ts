import { postedDateRange, type LocationFilter, type PostedDateFilter } from "./job-filters";
import type { MatchFilter } from "./job-match";
import type { Job, WorkMode } from "./types";

export const JOB_PAGE_SIZE = 50;

export type JobFeedFilters = {
  search?: string;
  roles?: readonly string[];
  forYou?: boolean;
  workMode?: "all" | WorkMode;
  postedDate?: PostedDateFilter;
  location?: LocationFilter;
  locationQuery?: string;
  preferredLocation?: string | null;
  matchFilter?: MatchFilter;
};

export type JobPage = { jobs: Job[]; total: number };

export function jobFeedParameters(filters: JobFeedFilters, page = 0, today = new Date()) {
  if (!Number.isInteger(page) || page < 0) throw new Error("Job page must be a nonnegative integer.");
  const range = postedDateRange(filters.postedDate ?? "any", today);
  const location = filters.location ?? "any";
  const query = location === "near_me"
    ? (filters.preferredLocation ?? "").split(/\s+or\s+|;/i)[0].trim()
    : (filters.locationQuery ?? "").trim();
  const city = query.split(",")[0].trim();
  return {
    p_offset: page * JOB_PAGE_SIZE,
    p_limit: JOB_PAGE_SIZE,
    p_search: (filters.search ?? "").trim(),
    p_roles: [...(filters.roles ?? [])],
    p_work_mode: filters.workMode ?? "all",
    p_posted_from: range?.from ?? null,
    p_posted_to: range?.to ?? null,
    p_location: query,
    p_location_city: location === "near_me" && city.length >= 3 ? city : "",
    p_location_required: location !== "any",
    p_min_match: !filters.matchFilter || filters.matchFilter === "any" ? 0 : Number(filters.matchFilter),
    p_for_you: filters.forYou ?? false,
  };
}
