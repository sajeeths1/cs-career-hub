"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchNotificationSettings, saveNotificationSettings } from "@/lib/data";
import type { DigestFrequency, NotificationSettings } from "@/lib/types";

/** Notification cadence preferences. Following/prioritizing companies lives in its own tab. */
export function NotificationSettingsTab({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchNotificationSettings(userId)
      .then((settingsRow) => { if (active) setSettings(settingsRow); })
      .catch((err: Error) => { if (active) setLoadError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, attempt]);

  function updateSettings(patch: Partial<NotificationSettings>) {
    setSettings((current) => (current ? { ...current, ...patch } : current));
  }

  async function savePreferences() {
    if (!settings) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      await saveNotificationSettings(userId, {
        email_enabled: settings.email_enabled,
        instant_priority_alerts: settings.instant_priority_alerts,
        digest_frequency: settings.digest_frequency,
        followed_digest_frequency: settings.followed_digest_frequency,
        target_role_digest_frequency: settings.target_role_digest_frequency,
      });
      setSaveStatus({ text: "Preferences saved.", isError: false });
    } catch (err) {
      setSaveStatus({ text: (err as Error).message, isError: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {loadError ? (
        <div role="alert" className="grid gap-2 text-sm text-red-600">
          <p>Could not load notification settings: {loadError}</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>
            Control how often you hear about new roles, by category. Follow or prioritize companies in the Companies tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {loading || !settings ? (
            <p role="status" className="text-sm text-muted-foreground">Loading preferences…</p>
          ) : (
            <fieldset disabled={saving} className="grid gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={settings.email_enabled}
                  onChange={(event) => updateSettings({ email_enabled: event.target.checked })}
                  type="checkbox"
                />
                Email me about new roles
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={settings.instant_priority_alerts}
                  disabled={!settings.email_enabled}
                  onChange={(event) => updateSettings({ instant_priority_alerts: event.target.checked })}
                  type="checkbox"
                />
                Send an instant email as soon as a priority company posts
              </label>
              <DigestFrequencyField
                disabled={!settings.email_enabled}
                label="Priority companies (when not sent instantly)"
                onChange={(digest_frequency) => updateSettings({ digest_frequency })}
                value={settings.digest_frequency}
              />
              <DigestFrequencyField
                disabled={!settings.email_enabled}
                label="Companies you follow"
                onChange={(followed_digest_frequency) => updateSettings({ followed_digest_frequency })}
                value={settings.followed_digest_frequency}
              />
              <DigestFrequencyField
                disabled={!settings.email_enabled}
                label="New jobs matching your target roles"
                onChange={(target_role_digest_frequency) => updateSettings({ target_role_digest_frequency })}
                value={settings.target_role_digest_frequency}
              />
              <p className="text-xs text-muted-foreground">
                Target roles come from your Profile. A digest bundles anything not already sent as an instant alert.
              </p>
              <div className="flex items-center gap-3">
                <Button disabled={saving} onClick={savePreferences}>
                  {saving ? "Saving…" : "Save preferences"}
                </Button>
                {saveStatus ? (
                  <span className={`text-sm ${saveStatus.isError ? "text-red-600" : "text-muted-foreground"}`}>
                    {saveStatus.text}
                  </span>
                ) : null}
              </div>
            </fieldset>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DigestFrequencyField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: DigestFrequency;
  disabled: boolean;
  onChange: (value: DigestFrequency) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className="h-10 w-48 rounded-md border bg-card px-3 text-sm"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as DigestFrequency)}
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="off">Off</option>
      </select>
    </label>
  );
}
