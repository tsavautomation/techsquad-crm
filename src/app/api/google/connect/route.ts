import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { authorizeUrl, googleConfigured } from "@/lib/google/client";

/** Admin › Google Calendar › Connect: send an administrator to Google to allow the CRM to read and write the calendar. */
export async function GET(req: Request) {
  const s = await getSession();
  if (s.status !== "active" || !s.user.isSysadmin) return new Response("Only administrators can connect Google Calendar.", { status: 403 });
  if (!googleConfigured()) return NextResponse.redirect(new URL("/admin/google-calendar?error=setup", req.url));
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("google_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/google" });
  return NextResponse.redirect(authorizeUrl(state));
}
