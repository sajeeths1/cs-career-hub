"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export function DeleteAccount() {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeAccount() {
    setBusy(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase!.auth.getSession();
      if (sessionError || !data.session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Could not delete your account.");
      }
      await supabase!.auth.signOut({ scope: "local" });
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return <details className="rounded-lg border border-red-200 bg-red-50/50 p-4">
    <summary className="cursor-pointer font-semibold text-red-700">Delete account</summary>
    <div className="mt-4 grid max-w-md gap-3 text-sm">
      <p>This permanently deletes your sign-in, profile, saved jobs, applications, skills, and notification preferences. This cannot be undone.</p>
      <label className="grid gap-1 font-medium" htmlFor="delete-confirmation">Type DELETE to confirm
        <Input id="delete-confirmation" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </label>
      <Button type="button" className="w-fit bg-red-700 text-white hover:bg-red-800" disabled={busy || confirmation !== "DELETE"} onClick={() => void removeAccount()}>
        {busy ? "Deleting…" : "Permanently delete my account"}
      </Button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  </details>;
}
