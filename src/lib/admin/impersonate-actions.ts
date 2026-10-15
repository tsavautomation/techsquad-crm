"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/supabase/admin";
import { forgetImpersonator, readImpersonator, rememberImpersonator, switchSessionTo } from "./impersonate";

// ADM-a: the two moves. Only an administrator who is not already signed in as someone else may start one;
// anyone holding the cookie may come back (the cookie is encrypted with the server key, so it cannot be forged).

type Result = { ok: false; message: string };

export async function impersonateAction(userId: string): Promise<Result> {
  const session = await getSession();
  if (session.status !== "active" || !session.user.isSysadmin) return { ok: false, message: "Only an administrator can sign in as someone else." };
  if (await readImpersonator()) return { ok: false, message: "Go back to your own account first." };
  const me = session.user;
  if (userId === me.id) return { ok: false, message: "That is you." };
  const db = adminDb();
  const { data: target } = await db.from("profiles").select("id, email, first_name, last_name, active").eq("id", userId).maybeSingle();
  if (!target) return { ok: false, message: "User not found." };
  if (!target.active) return { ok: false, message: "This login is deactivated. Reactivate it first." };
  const { data: log, error } = await db.from("impersonations").insert({ admin_id: me.id, target_id: target.id }).select("id").single();
  if (error) return { ok: false, message: error.message };
  const switched = await switchSessionTo(target.email);
  if (!switched.ok) {
    await db.from("impersonations").update({ ended_at: new Date().toISOString() }).eq("id", log.id);
    return switched;
  }
  await rememberImpersonator({ id: me.id, email: me.email, name: [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email, logId: log.id });
  redirect("/");
}

export async function stopImpersonatingAction(): Promise<Result> {
  const admin = await readImpersonator();
  if (!admin) return { ok: false, message: "You are not signed in as someone else." };
  const db = adminDb();
  const { data: p } = await db.from("profiles").select("email, active, is_admin").eq("id", admin.id).maybeSingle();
  if (!p?.active || !p.is_admin) {
    await forgetImpersonator();
    return { ok: false, message: "Your own login is no longer an active administrator. Sign out and sign in again." };
  }
  const switched = await switchSessionTo(p.email);
  if (!switched.ok) return switched;
  await forgetImpersonator();
  await db.from("impersonations").update({ ended_at: new Date().toISOString() }).eq("id", admin.logId);
  redirect("/admin/users");
}
