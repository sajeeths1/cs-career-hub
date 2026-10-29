"use client";

import { ChevronDown, Lock, Mail, RotateCcw, Trash2 } from "lucide-react";
import { CompaniesTab } from "@/components/companies";
import { NotificationSettingsTab } from "@/components/notification-settings";
import { ProfileForm } from "@/components/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumeDraft } from "@/lib/resume";
import type { Profile } from "@/lib/types";

/** The Personalization screen: job preferences, email settings, companies and your data. */
export function PersonalizationView({ userId, resumeDraft, onProfileSaved, onGoToSkills }: {
  userId: string;
  resumeDraft: ResumeDraft | null;
  onProfileSaved: (profile: Profile) => void;
  onGoToSkills: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Personalization</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Your preferences shape your matches. Your email settings decide when we email you. Skills and your resume
          live on the{" "}
          <button className="font-medium text-primary hover:underline" type="button" onClick={onGoToSkills}>Skills page</button>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job preferences</CardTitle>
          <CardDescription>Your target roles power For you, your top matches and your role digest.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm userId={userId} resumeDraft={resumeDraft} onSaved={onProfileSaved} />
        </CardContent>
      </Card>

      <div role="separator" aria-label="Emails" className="flex items-center gap-3.5 pt-3">
        <span className="flex items-center gap-2 whitespace-nowrap text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <Mail className="h-4 w-4" aria-hidden="true" />Emails
        </span>
        <span className="h-px flex-1 bg-input" />
      </div>

      <NotificationSettingsTab userId={userId} />
      <CompaniesTab userId={userId} />

      <section aria-labelledby="your-data" className="space-y-3 border-t pt-6">
        <div>
          <h2 id="your-data" className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="h-[18px] w-[18px]" aria-hidden="true" />Your data
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Only you can see your profile, skills and tracker.</p>
        </div>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <DataCard
            icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
            title="Start over"
            text="Clears your skills, tracker, preferences and companies. You keep your account and can set things up again."
            button="Reset my data"
          />
          <DataCard
            danger
            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            title="Delete account"
            text="Permanently deletes your account and everything in it. This can't be undone."
            button="Delete my account"
          />
        </div>
      </section>
    </div>
  );
}

/** Collapsed card; opens to show what the action does. The actions need backend work, so the buttons are disabled. */
function DataCard({ icon, title, text, button, danger = false }: {
  icon: React.ReactNode; title: string; text: string; button: string; danger?: boolean;
}) {
  return (
    <details className={`group rounded-xl border px-[18px] py-3.5 ${danger ? "border-red-200 bg-red-50/40" : "bg-card"}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${danger ? "bg-red-100 text-red-700" : "bg-muted text-foreground/80"}`}>{icon}</span>
        <span className={`text-[15px] font-semibold ${danger ? "text-red-700" : ""}`}>{title}</span>
        <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-2.5 space-y-2.5">
        <p className="text-[13px] leading-relaxed text-muted-foreground">{text}</p>
        <button
          className={`h-10 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${danger ? "bg-red-700 text-white" : "border border-input bg-card"}`}
          disabled
          title="Coming soon"
          type="button"
        >
          {button}
        </button>
        <p className="text-xs text-muted-foreground">Coming soon.</p>
      </div>
    </details>
  );
}
