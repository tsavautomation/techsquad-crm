"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isLang, LANG_COOKIE, type Lang } from "./core";

/** Save my screen language (my profile only) and remember it on this device for the login page. */
export async function setLanguageAction(lang: Lang): Promise<{ ok: boolean }> {
  if (!isLang(lang)) return { ok: false };
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await getSession();
  if (session.status === "active") {
    const db = await createClient();
    const { error } = await db.from("profiles").update({ language: lang }).eq("id", session.user.id);
    if (error) return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
