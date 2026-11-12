/** Jobs store posted_at as a date, so filters use local calendar days. */
export type PostedDateFilter = "any" | "today" | "week" | "month";
export type LocationFilter = "any" | "near_me" | "custom";

export const POSTED_DATE_FILTERS: { value: PostedDateFilter; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "week", label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
];

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function postedDateRange(filter: PostedDateFilter, today = new Date()): { from: string; to: string } | null {
  if (filter === "any") return null;
  const days = filter === "today" ? 1 : filter === "week" ? 7 : 30;
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
  return { from: localDate(cutoff), to: localDate(today) };
}

export function matchesPostedDate(
  postedAt: string | null,
  filter: PostedDateFilter,
  today = new Date(),
): boolean {
  if (filter === "any") return true;
  if (!postedAt || !/^\d{4}-\d{2}-\d{2}$/.test(postedAt)) return false;
  const range = postedDateRange(filter, today);
  return range !== null && postedAt >= range.from && postedAt <= range.to;
}

/** "Near me" uses the student's saved preferred city, not device GPS or distance. */
export function matchesLocation(
  jobLocation: string | null,
  filter: LocationFilter,
  preferredLocation: string | null,
  customLocation: string,
): boolean {
  if (filter === "any") return true;
  const query = filter === "near_me"
    ? (preferredLocation ?? "").split(/\s+or\s+|;/i)[0].trim()
    : customLocation.trim();
  if (!query) return false;
  const location = (jobLocation ?? "").toLocaleLowerCase();
  const preferred = query.toLocaleLowerCase();
  if (location.includes(preferred)) return true;
  // A preferred "Raleigh, NC" also matches postings that only name Raleigh.
  const city = preferred.split(",")[0].trim();
  return filter === "near_me" && city.length >= 3 && location.includes(city);
}
