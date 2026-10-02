import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { connectWithCode } from "@/lib/bouncie/client";

/** Bouncie sends the administrator back here after they allow the app; keep the connection. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/bouncie?${q}`, req.url));
  const s = await getSession();
  if (s.status !== "active" || !s.user.isSysadmin) return new Response("Only administrators can connect Bouncie.", { status: 403 });
  const jar = await cookies();
  const expected = jar.get("bouncie_state")?.value;
  jar.delete({ name: "bouncie_state", path: "/api/bouncie" });
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent(url.searchParams.get("error_description") ?? "Sign-in cancelled")}`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("error=The%20sign-in%20expired.%20Try%20again.");
  try {
    await connectWithCode(code, s.user.id);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  return back("connected=1");
}
