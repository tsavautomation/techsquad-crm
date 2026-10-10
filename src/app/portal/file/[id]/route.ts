import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fileUrls } from "@/lib/files/store";
import { pathOf } from "@/lib/files/paths";
import { recordsDb } from "@/lib/records/data";
import { adminDb } from "@/lib/supabase/admin";

/**
 * Opens one of the customer's files (F6). The portal_files view, read as the customer, decides whether
 * this attachment is theirs; only then is a short-lived link made (the file itself may be in OneDrive).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/portal/file/[id]">) {
  const session = await getSession();
  if (session.status !== "active") return NextResponse.redirect(new URL("/portal/login", request.nextUrl.origin));
  if (!session.user.contactId) return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  const { id } = await ctx.params;
  const db = await recordsDb();
  const { data } = await db.from("portal_files").select("provider, provider_path").eq("id", id).maybeSingle();
  const row = data as { provider: string; provider_path: string } | null;
  if (!row) return new NextResponse("Not found", { status: 404 });
  const path = pathOf(row);
  const url = (await fileUrls(adminDb(), [path])).get(path);
  if (!url) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(url, { status: 302 });
}
