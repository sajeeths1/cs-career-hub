"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchProfile, saveProfile } from "@/lib/data";

const profileSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  major: z.string().min(2, "Enter your major"),
  location: z.string().min(2, "Enter a preferred location"),
  roles: z.string().min(2, "Enter at least one target role"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

/** Loads and saves the signed-in student's row in the `profiles` table. */
export function ProfileForm({ userId }: { userId: string }) {
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
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
    fetchProfile(userId)
      .then((profile) => {
        if (!profile) return;
        reset({
          name: profile.full_name ?? "",
          major: profile.major ?? "",
          location: profile.preferred_location ?? "",
          roles: profile.target_roles ?? "",
        });
      })
      .catch((error: Error) => setStatus({ text: error.message, isError: true }));
  }, [userId, reset]);

  async function onSubmit(values: ProfileFormValues) {
    setStatus(null);
    try {
      await saveProfile(userId, {
        full_name: values.name,
        major: values.major,
        preferred_location: values.location,
        target_roles: values.roles,
      });
      setStatus({ text: "Profile saved.", isError: false });
    } catch (error) {
      setStatus({ text: (error as Error).message, isError: true });
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
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
        <Input placeholder="Software engineering, frontend, data" {...register("roles")} />
      </Field>
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
