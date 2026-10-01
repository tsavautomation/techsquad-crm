import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { authorizeUrl, oneDriveConfigured } from "@/lib/files/onedrive";

/** Admin › OneDrive › Connect: send a System Administrator to Microsoft to sign in to the OneDrive account. */
export async function GET(req: Request) {
  const s = await getSession();
  if (s.status !== "active" || !s.user.isSysadmin) return new Response("Only System Administrators can connect OneDrive.", { status: 403 });
  if (!oneDriveConfigured()) return NextResponse.redirect(new URL("/admin/onedrive?error=setup", req.url));
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("od_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/onedrive" });
  return NextResponse.redirect(authorizeUrl(state));
}
