"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchProfile, saveProfile } from "@/lib/data";
import { parseTargetRoles } from "@/lib/job-personalization";
import type { Profile } from "@/lib/types";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  major: z.string().trim().min(2, "Enter your major"),
  location: z.string().trim().min(2, "Enter a preferred location"),
  roles: z.string().trim().min(2, "Enter at least one target role").max(500, "Keep target roles under 500 characters")
    .refine((value) => parseTargetRoles(value).length > 0, "Enter a role using words, such as frontend developer")
    .refine((value) => parseTargetRoles(value).length <= 10, "Enter up to 10 target roles, separated by commas"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

/** Loads and saves the signed-in student's row in the `profiles` table. */
export function ProfileForm({ userId, onSaved }: { userId: string; onSaved?: (profile: Profile) => void }) {
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", major: "", location: "", roles: "" },
  });

  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    fetchProfile(userId)
      .then((profile) => {
        if (!active || !profile) return;
        reset({
          name: profile.full_name ?? "",
          major: profile.major ?? "",
          location: profile.preferred_location ?? "",
          roles: profile.target_roles ?? "",
        });
      })
      .catch((error: Error) => { if (active) setStatus({ text: error.message, isError: true }); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [userId, reset]);

  async function onSubmit(values: ProfileFormValues) {
    setStatus(null);
    try {
      const profile = {
        full_name: values.name.trim(), major: values.major.trim(),
        preferred_location: values.location.trim(),
        target_roles: parseTargetRoles(values.roles).join(", "),
      };
      await saveProfile(userId, profile);
      onSaved?.({ id: userId, ...profile });
      setStatus({ text: "Profile saved.", isError: false });
    } catch (error) {
      setStatus({ text: (error as Error).message, isError: true });
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      {profileLoading && <p role="status" className="text-sm text-muted-foreground">Loading profile…</p>}
      <fieldset disabled={profileLoading || isSubmitting} className="grid min-w-0 gap-4">
      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} />
      </Field>
      <Field label="Major" error={errors.major?.message}>
        <Input {...register("major")} />
      </Field>
      <Field label="Preferred location" error={errors.location?.message}>
        <Input placeholder="Raleigh, NC or Remote" {...register("location")} />
      </Field>
      <Field label="Target roles" error={errors.roles?.message}>
        <Input aria-describedby="target-roles-help" placeholder="Software engineering, frontend, data" {...register("roles")} />
      </Field>
      <p id="target-roles-help" className="text-xs text-muted-foreground">Separate roles with commas. Saved roles personalize your For you jobs.</p>
      <div className="flex items-center gap-3">
        <Button disabled={isSubmitting} type="submit">
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? "Saving…" : "Save profile"}
        </Button>
        {status ? (
          <span className={`text-sm ${status.isError ? "text-red-600" : "text-muted-foreground"}`}>
            {status.text}
          </span>
        ) : null}
      </div>
      </fieldset>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
