import type { WorkMode } from "@/lib/types";

export type WorkModeFilter = "all" | WorkMode;
export type JobView = "for_you" | "all";
export const WORK_MODE_FILTERS: { value: WorkModeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "in_person", label: "In person" },
];
