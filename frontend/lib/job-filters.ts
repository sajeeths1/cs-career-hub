/** Jobs store posted_at as a date, so filters use local calendar days. */
export type PostedDateFilter = "any" | "today" | "week" | "month";

export const POSTED_DATE_FILTERS: { value: PostedDateFilter; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "week", label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
];

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function matchesPostedDate(
  postedAt: string | null,
  filter: PostedDateFilter,
  today = new Date(),
): boolean {
  if (filter === "any") return true;
  if (!postedAt || !/^\d{4}-\d{2}-\d{2}$/.test(postedAt)) return false;
  const days = filter === "today" ? 1 : filter === "week" ? 7 : 30;
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
  return postedAt >= localDate(cutoff) && postedAt <= localDate(today);
}
