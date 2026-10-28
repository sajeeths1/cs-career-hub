"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchNotifications, markNotificationsRead } from "@/lib/data";
import { KIND_LABELS, SOURCE_LABELS, unreadCount } from "@/lib/notifications";
import type { NotificationRow } from "@/lib/types";

/** Bell with a dropdown feed of new postings at companies the student follows. */
export function NotificationBell({ onOpenJob }: { onOpenJob: (jobId: number) => void }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setNotifications(await fetchNotifications());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function markAllRead() {
    const unreadIds = notifications.filter((row) => !row.read_at).map((row) => row.id);
    if (!unreadIds.length) return;
    try {
      await markNotificationsRead(unreadIds);
      const now = new Date().toISOString();
      setNotifications((rows) => rows.map((row) => (row.read_at ? row : { ...row, read_at: now })));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const unread = unreadCount(notifications);

  async function openNotification(row: NotificationRow) {
    setOpen(false);
    onOpenJob(row.job_id);
    if (row.read_at) return;
    try {
      await markNotificationsRead([row.id]);
      const now = new Date().toISOString();
      setNotifications((rows) => rows.map((item) => (item.id === row.id ? { ...item, read_at: now } : item)));
    } catch {
      // Non-critical: the job still opens even if marking it read fails.
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Button
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        size="icon"
        variant="outline"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" aria-hidden="true" />
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b p-3">
            <p className="text-sm font-semibold">Notifications</p>
            <Button disabled={!unread} size="sm" variant="ghost" onClick={markAllRead}>
              Mark all read
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {loading ? <p className="p-3 text-sm text-muted-foreground">Loading…</p> : null}
            {error ? <p role="alert" className="p-3 text-sm text-red-600">{error}</p> : null}
            {!loading && !error && notifications.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No notifications yet. Follow companies in the Companies tab to get alerted about new roles.
              </p>
            ) : null}
            {notifications.map((row) => (
              <button
                className={`block w-full rounded-md p-2 text-left text-sm hover:bg-muted ${row.read_at ? "" : "bg-muted/60"}`}
                key={row.id}
                type="button"
                onClick={() => void openNotification(row)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{row.jobs?.title ?? "A job that is no longer listed"}</p>
                  <Badge className={`shrink-0 text-[10px] ${row.kind === "closing_soon" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}`}>
                    {SOURCE_LABELS[row.source]}
                  </Badge>
                </div>
                <p className={`text-xs ${row.kind === "closing_soon" ? "font-semibold text-amber-700" : "text-muted-foreground"}`}>
                  {KIND_LABELS[row.kind]} at {row.companies?.name ?? "this company"} · {formatRelative(row.created_at)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(isoDate: string) {
  const hours = Math.floor((Date.now() - new Date(isoDate).getTime()) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
