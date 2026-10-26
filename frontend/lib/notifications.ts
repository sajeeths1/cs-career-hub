import type { NotificationRow, NotificationSource } from "@/lib/types";
export type { Company, DigestFrequency, NotificationRow, NotificationSettings, NotificationSource } from "@/lib/types";

export const DEFAULT_NOTIFICATION_SETTINGS = {
  email_enabled: true,
  instant_priority_alerts: true,
  digest_frequency: "weekly" as const,
  followed_digest_frequency: "weekly" as const,
  target_role_digest_frequency: "off" as const,
};

export const MAX_PRIORITY_COMPANIES = 10;

export const SOURCE_LABELS: Record<NotificationSource, string> = {
  priority_company: "Priority",
  followed_company: "Following",
  target_role: "Matches your roles",
};

export function unreadCount(notifications: NotificationRow[]): number {
  return notifications.filter((row) => !row.read_at).length;
}
