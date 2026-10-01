"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { profileDefaults } from "@/lib/mock-data";

const profileSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  major: z.string().min(2, "Enter your major"),
  location: z.string().min(2, "Enter a preferred location"),
  roles: z.string().min(2, "Enter at least one target role"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitSuccessful },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: profileDefaults,
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={handleSubmit(() => {
        // Frontend-only prototype: values stay in the browser.
      })}
    >
      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} />
      </Field>
      <Field label="Major" error={errors.major?.message}>
        <Input {...register("major")} />
      </Field>
      <Field label="Preferred location" error={errors.location?.message}>
        <Input {...register("location")} />
      </Field>
      <Field label="Target roles" error={errors.roles?.message}>
        <Input {...register("roles")} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save profile
        </Button>
        {isSubmitSuccessful ? (
          <span className="text-sm text-muted-foreground">Saved in this browser session.</span>
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
