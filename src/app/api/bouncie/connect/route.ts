import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { authorizeUrl, bouncieConfigured } from "@/lib/bouncie/client";

/** Admin › Bouncie › Connect: send an administrator to Bouncie to allow the CRM to read the vehicles. */
export async function GET(req: Request) {
  const s = await getSession();
  if (s.status !== "active" || !s.user.isSysadmin) return new Response("Only administrators can connect Bouncie.", { status: 403 });
  if (!bouncieConfigured()) return NextResponse.redirect(new URL("/admin/bouncie?error=setup", req.url));
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("bouncie_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/bouncie" });
  return NextResponse.redirect(authorizeUrl(state));
}
