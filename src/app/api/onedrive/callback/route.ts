import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { connectWithCode } from "@/lib/files/onedrive";

/** Microsoft sends the administrator back here after signing in; keep the connection. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/onedrive?${q}`, req.url));
  const s = await getSession();
  if (s.status !== "active" || !s.user.isSysadmin) return new Response("Only System Administrators can connect OneDrive.", { status: 403 });
  const jar = await cookies();
  const expected = jar.get("od_state")?.value;
  jar.delete({ name: "od_state", path: "/api/onedrive" });
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent(url.searchParams.get("error_description")?.split("\r\n")[0] ?? "Sign-in cancelled")}`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("error=The%20sign-in%20expired.%20Try%20again.");
  try {
    await connectWithCode(code, s.user.id);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  return back("connected=1");
}
