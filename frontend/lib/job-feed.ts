import { normalizeLocation, postedDateRange, type PostedDateFilter } from "./job-filters";
import type { Job, WorkMode } from "./types";

export const JOB_PAGE_SIZE = 50;

export type JobFeedFilters = {
  search?: string;
  forYou?: boolean;
  workMode?: "all" | WorkMode;
  postedDate?: PostedDateFilter;
  locations?: readonly string[];
  minimumMatch?: number;
};

export type JobPage = { jobs: Job[]; total: number };

export function jobFeedParameters(filters: JobFeedFilters, page = 0, today = new Date()) {
  if (!Number.isInteger(page) || page < 0) throw new Error("Job page must be a nonnegative integer.");
  const range = postedDateRange(filters.postedDate ?? "any", today);
  const minimum = filters.minimumMatch ?? 0;
  if (![0, 50, 75, 100].includes(minimum)) throw new Error("Invalid minimum skill match.");
  return {
    p_offset: page * JOB_PAGE_SIZE,
    p_limit: JOB_PAGE_SIZE,
    p_search: (filters.search ?? "").trim(),
    p_work_mode: filters.workMode ?? "all",
    p_posted_from: range?.from ?? null,
    p_posted_to: range?.to ?? null,
    p_locations: [...new Set((filters.locations ?? []).map(normalizeLocation).filter(Boolean))],
    p_min_match: minimum,
    p_for_you: filters.forYou ?? false,
  };
}
