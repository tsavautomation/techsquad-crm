import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { googleConfigured } from "@/lib/google/client";
import { authorizeUrl } from "@/lib/mail/client";

/** Admin › Gmail intake › Connect: send an administrator to Google to let the CRM read the mailbox (F26-2). */
export async function GET(req: Request) {
  const s = await getSession();
  if (s.status !== "active" || !s.user.isSysadmin) return new Response("Only administrators can connect the mailbox.", { status: 403 });
  if (!googleConfigured()) return NextResponse.redirect(new URL("/admin/gmail?error=setup", req.url));
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("gmail_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/gmail" });
  return NextResponse.redirect(authorizeUrl(state));
}
