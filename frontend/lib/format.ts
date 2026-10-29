import { TRACKER_COLUMNS, type ApplicationStatus } from "@/lib/types";

/** The database also allows "not_applied"; the tracker shows it in the Saved column. */
export function normalizeStatus(status: ApplicationStatus): ApplicationStatus {
  return status === "not_applied" ? "saved" : status;
}

export function statusLabel(status: ApplicationStatus) {
  return TRACKER_COLUMNS.find((column) => column.status === normalizeStatus(status))?.label ?? status;
}

export function formatPosted(postedAt: string | null) {
  if (!postedAt) return "Date not listed";
  const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${new Date(postedAt).toLocaleDateString()}`;
}
