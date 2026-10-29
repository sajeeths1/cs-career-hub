"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchNotificationSettings, saveNotificationSettings } from "@/lib/data";
import type { DigestFrequency, NotificationSettings } from "@/lib/types";

/** Email settings: the master switch, instant alerts and digest frequencies. Companies are managed in CompaniesTab. */
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

  const emailOn = !!settings?.email_enabled;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {loadError ? (
        <div role="alert" className="grid gap-2 text-sm text-red-600">
          <p>Could not load notification settings: {loadError}</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>
      ) : null}

      {loading || !settings ? (
        <Card className="p-5"><p role="status" className="text-sm text-muted-foreground">Loading email settings…</p></Card>
      ) : (
        <fieldset disabled={saving} className="grid min-w-0 gap-4">
          {/* Master switch */}
          <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Email alerts</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Turns all job emails on or off</p>
            </div>
            <Switch label="Email me about new roles" checked={settings.email_enabled} onChange={(email_enabled) => updateSettings({ email_enabled })} />
          </Card>

          <Card className={emailOn ? "" : "opacity-50"}>
            <CardHeader className="pb-3">
              <CardTitle>When we email you</CardTitle>
              <CardDescription>A digest bundles anything not already sent as an instant alert.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-0">
              <div className="flex items-center justify-between gap-4 border-t py-3.5">
                <div>
                  <p className="text-sm font-semibold">Instant alerts</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Email me right away when a company on my instant list posts</p>
                </div>
                <Switch
                  checked={settings.instant_priority_alerts}
                  disabled={!emailOn}
                  label="Instant alerts"
                  onChange={(instant_priority_alerts) => updateSettings({ instant_priority_alerts })}
                />
              </div>
              <DigestFrequencyField
                disabled={!emailOn}
                hint="Used when instant alerts are off"
                label="Instant-list companies"
                onChange={(digest_frequency) => updateSettings({ digest_frequency })}
                value={settings.digest_frequency}
              />
              <DigestFrequencyField
                disabled={!emailOn}
                label="Companies you follow"
                onChange={(followed_digest_frequency) => updateSettings({ followed_digest_frequency })}
                value={settings.followed_digest_frequency}
              />
              <DigestFrequencyField
                disabled={!emailOn}
                hint="Uses the target roles in Job preferences"
                label="New jobs matching your roles"
                onChange={(target_role_digest_frequency) => updateSettings({ target_role_digest_frequency })}
                value={settings.target_role_digest_frequency}
              />
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button disabled={saving} onClick={savePreferences}>
              {saving ? "Saving…" : "Save email settings"}
            </Button>
            {saveStatus ? (
              <span className={`text-sm ${saveStatus.isError ? "text-red-600" : "text-muted-foreground"}`}>
                {saveStatus.text}
              </span>
            ) : null}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** On/off switch. */
function Switch({ label, checked, disabled = false, onChange }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${checked ? "bg-primary" : "bg-input"}`}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-[left] ${checked ? "left-[21px]" : "left-[3px]"}`} />
    </button>
  );
}

const FREQUENCIES: { value: DigestFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Off" },
];

function DigestFrequencyField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: DigestFrequency;
  disabled: boolean;
  onChange: (value: DigestFrequency) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t py-3.5">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-1">
        {FREQUENCIES.map((option) => (
          <button
            aria-checked={value === option.value}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${value === option.value ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            disabled={disabled}
            key={option.value}
            role="radio"
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
