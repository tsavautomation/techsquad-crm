"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type UpdatePasswordState } from "./actions";

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState<UpdatePasswordState, FormData>(updatePassword, {});
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <CardDescription>At least 10 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required className="h-11 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-11 text-base" />
            </div>
            {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "Saving…" : "Save password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
