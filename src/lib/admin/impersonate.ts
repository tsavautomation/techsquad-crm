import "server-only";
import { cookies } from "next/headers";
import { decrypt, encrypt } from "@/lib/crypto";
import { adminDb } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ADM-a Sign in as (SPEC §9.1 ADM-a): a System Administrator opens the CRM as another person, sees exactly what
// they see, and comes back with one tap. The browser's session really becomes the other person's (a one-time
// sign-in link is created and used on the server), so everything they would hit — permissions, row-level
// security, their language — applies for real. Who the administrator is stays in an encrypted, httpOnly cookie
// so the "Back to my account" bar can bring them back; every take-over is logged in public.impersonations.

export const IMPERSONATOR_COOKIE = "crm-impersonator";
const MAX_AGE_S = 8 * 60 * 60;

export type Impersonator = { id: string; email: string; name: string; logId: number };

/** The administrator behind the current session, when it is a take-over. */
export async function readImpersonator(): Promise<Impersonator | null> {
  const raw = (await cookies()).get(IMPERSONATOR_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(decrypt(raw)) as Impersonator & { exp: number };
    if (!v?.id || !v.email || Date.now() > v.exp) return null;
    return { id: v.id, email: v.email, name: v.name, logId: v.logId };
  } catch {
    return null;
  }
}

export async function rememberImpersonator(v: Impersonator) {
  (await cookies()).set(IMPERSONATOR_COOKIE, encrypt(JSON.stringify({ ...v, exp: Date.now() + MAX_AGE_S * 1000 })), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: MAX_AGE_S, path: "/" });
}

export async function forgetImpersonator() {
  (await cookies()).delete(IMPERSONATOR_COOKIE);
}

/** Replace the browser's session with `email`'s: a magic link made and consumed on the server. */
export async function switchSessionTo(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await adminDb().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) return { ok: false, message: error?.message ?? "Could not create the sign-in." };
  const supabase = await createClient();
  const { error: e2 } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (e2) return { ok: false, message: e2.message };
  return { ok: true };
}
