"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

/** Email + password sign in / sign up, using Supabase Auth. */
export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);

    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setMessage({ text: error.message, isError: true });
    } else if (mode === "signup" && !data.session) {
      // Supabase's "Confirm email" setting is on: the user must click the email link first.
      setMessage({ text: "Check your email for a confirmation link, then sign in.", isError: false });
    }
    // On success, the page notices the new session and shows the dashboard.
    setBusy(false);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            CH
          </div>
          <CardTitle>{mode === "signin" ? "Sign in to CS Career Hub" : "Create your account"}</CardTitle>
          <CardDescription>Find CS internships and track your applications in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <Input
                autoComplete="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Password
              <Input
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {message ? (
              <p className={`text-sm ${message.isError ? "text-red-600" : "text-emerald-700"}`}>
                {message.text}
              </p>
            ) : null}
            <Button disabled={busy} type="submit">
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
            </Button>
          </form>
          <button
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage(null);
            }}
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </main>
  );
}
