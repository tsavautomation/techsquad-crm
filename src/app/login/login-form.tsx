"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPasswordReset, signIn, type AuthFormState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [signInState, signInAction, signingIn] = useActionState<AuthFormState, FormData>(signIn, {});
  const [resetState, resetAction, resetting] = useActionState<AuthFormState, FormData>(sendPasswordReset, {});

  if (mode === "reset") {
    return (
      <form action={resetAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input id="reset-email" name="email" type="email" autoComplete="email" required className="h-11 text-base" />
        </div>
        {resetState.error && <p className="text-sm text-destructive">{resetState.error}</p>}
        {resetState.message && <p className="text-sm text-muted-foreground">{resetState.message}</p>}
        <Button type="submit" className="h-11" disabled={resetting}>
          {resetting ? "Sending…" : "Send reset link"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("signin")}>
          Back to sign in
        </Button>
      </form>
    );
  }

  return (
    <form action={signInAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11 text-base" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 text-base"
        />
      </div>
      {signInState.error && (
        <p role="alert" className="text-sm text-destructive">
          {signInState.error}
        </p>
      )}
      <Button type="submit" className="h-11" disabled={signingIn}>
        {signingIn ? "Signing in…" : "Sign in"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setMode("reset")}>
        Forgot password?
      </Button>
    </form>
  );
}
