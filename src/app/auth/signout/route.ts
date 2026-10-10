import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 so the browser follows with a GET. Customers (F6) go back to the portal's sign-in page.
  const to = request.nextUrl.searchParams.get("to") === "portal" ? "/portal/login" : "/login";
  return NextResponse.redirect(new URL(to, request.nextUrl.origin), { status: 303 });
}
