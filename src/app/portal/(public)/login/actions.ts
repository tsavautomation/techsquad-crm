"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PortalAuthState = { error?: string; message?: string };

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/** Only the portal's own pages after signing in. Staff who sign in here are sent on by requireClient(). */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/portal") && !next.startsWith("//") ? next : "/portal";
}

export async function portalSignIn(_prev: PortalAuthState, formData: FormData): Promise<PortalAuthState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: "Email or password is incorrect." };
  redirect(safeNext(parsed.data.next));
}

export async function portalPasswordReset(_prev: PortalAuthState, formData: FormData): Promise<PortalAuthState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // After the new password, "/" sends a customer to /portal (requireUser) — same page as staff use.
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${site}/auth/callback?next=/auth/update-password` });
  return { message: "If that email has an account, a reset link is on its way." };
}
