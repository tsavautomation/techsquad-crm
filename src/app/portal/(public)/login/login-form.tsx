"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalPasswordReset, portalSignIn, type PortalAuthState } from "./actions";
import { useT } from "@/i18n/client";

export function PortalLoginForm({ next }: { next?: string }) {
  const t = useT();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [signInState, signInAction, signingIn] = useActionState<PortalAuthState, FormData>(portalSignIn, {});
  const [resetState, resetAction, resetting] = useActionState<PortalAuthState, FormData>(portalPasswordReset, {});

  if (mode === "reset") {
    return (
      <form action={resetAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-email">{t("Email")}</Label>
          <Input id="reset-email" name="email" type="email" autoComplete="email" required className="h-11 text-base" />
        </div>
        {resetState.error && <p className="text-sm text-destructive">{t(resetState.error)}</p>}
        {resetState.message && <p className="text-sm text-muted-foreground">{t(resetState.message)}</p>}
        <Button type="submit" className="h-11" disabled={resetting}>
          {t(resetting ? "Sending…" : "Send reset link")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("signin")}>
          {t("Back to sign in")}
        </Button>
      </form>
    );
  }

  return (
    <form action={signInAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("Email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11 text-base" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("Password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11 text-base" />
      </div>
      {signInState.error && <p className="text-sm text-destructive">{t(signInState.error)}</p>}
      <Button type="submit" className="h-11" disabled={signingIn}>
        {t(signingIn ? "Signing in…" : "Sign in")}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => setMode("reset")} className="text-muted-foreground hover:text-foreground">
          {t("Forgot your password?")}
        </button>
        <Link href="/portal/install" className="text-muted-foreground hover:text-foreground">
          {t("Add to your phone")}
        </Link>
      </div>
    </form>
  );
}
