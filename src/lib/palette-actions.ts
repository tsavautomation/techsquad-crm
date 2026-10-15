"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isPalette, PALETTE_COOKIE } from "./palettes";

/** UI-m: save my brand colours (my profile) and remember them on this device so the next page paints right away. */
export async function setPaletteAction(id: string): Promise<{ ok: boolean }> {
  if (!isPalette(id)) return { ok: false };
  (await cookies()).set(PALETTE_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await getSession();
  if (session.status === "active") {
    const db = await createClient();
    const { error } = await db.from("profiles").update({ palette: id }).eq("id", session.user.id);
    if (error) return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
