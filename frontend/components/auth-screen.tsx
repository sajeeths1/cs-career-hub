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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-32 h-96 w-[520px] rounded-full bg-[#DCE6F2] opacity-70 blur-[90px]" />
        <div className="absolute -right-20 bottom-[-120px] h-96 w-[520px] rounded-full bg-[#D8EAEC] opacity-70 blur-[90px]" />
      </div>
      <Card className="relative w-full max-w-sm">
        <CardHeader>
          <div className="mb-3 flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">CS</div>
            <span className="text-base font-bold">Career Hub</span>
          </div>
          <CardTitle className="font-display text-[26px] font-medium">{mode === "signin" ? "Welcome back" : "Create your account"}</CardTitle>
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
