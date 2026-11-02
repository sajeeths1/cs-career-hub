"use client";

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPriorityCompany } from "@/lib/data";

const TOAST_DURATION_MS = 5000;

/** Single company action: prioritize up to ten for alerts. */
export function FollowCompanyButton({
  userId,
  companyId,
  companyName,
  isActive,
  onToggled,
}: {
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
      await setPriorityCompany(userId, companyId, !isActive);
      onToggled(companyId, !isActive);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = isActive ? "Priority" : "Prioritize";

  return (
    <>
      <Button
        aria-label={`${label} ${companyName}`}
        aria-pressed={isActive}
        disabled={busy}
        size="sm"
        variant={isActive ? "default" : "outline"}
        className={isActive ? "bg-amber-500 text-white hover:bg-amber-500/90" : undefined}
        onClick={toggle}
      >
        <Star className="h-3.5 w-3.5" aria-hidden="true" fill={isActive ? "currentColor" : "none"} />
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
