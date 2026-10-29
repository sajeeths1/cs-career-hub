"use client";

import { useEffect, useState } from "react";
import { Bell, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setFollowedCompany, setPriorityCompany } from "@/lib/data";

const TOAST_DURATION_MS = 5000;

/** Toggles a company's follow status (unlimited, digest-only) or priority status
 * (max 10, instant alerts). Manages its own request state so it can be dropped
 * into any list; the parent only needs to react once it succeeds. */
export function FollowCompanyButton({
  mode = "follow",
  userId,
  companyId,
  companyName,
  isActive,
  onToggled,
}: {
  mode?: "follow" | "priority";
  userId: string;
  companyId: number;
  companyName: string;
  isActive: boolean;
  onToggled: (companyId: number, active: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [error]);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const toggleFn = mode === "priority" ? setPriorityCompany : setFollowedCompany;
      await toggleFn(userId, companyId, !isActive);
      onToggled(companyId, !isActive);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const Icon = mode === "priority" ? Star : Bell;
  const label = mode === "priority" ? (isActive ? "Instant" : "Add to instant") : (isActive ? "Following" : "Follow");

  return (
    <>
      <Button
        aria-label={`${label} ${companyName}`}
        aria-pressed={isActive}
        disabled={busy}
        size="sm"
        variant="outline"
        className={isActive
          ? mode === "priority"
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : undefined}
        onClick={toggle}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" fill={isActive ? "currentColor" : "none"} />
        {label}
      </Button>
      {error ? (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-lg">
          <p className="flex-1">{error}</p>
          <button aria-label="Dismiss" className="shrink-0" onClick={() => setError(null)} type="button">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
