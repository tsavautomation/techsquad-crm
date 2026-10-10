import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseEnv } from "./env";

/** Paths reachable without being signed in. */
// /api/cron checks its own secret (CRON_SECRET) instead of a signed-in user.
// /portal/login and /portal/install (F6) are the customer portal's own public pages.
export const PUBLIC_PATHS = ["/login", "/auth", "/setup", "/api/cron", "/privacy", "/portal/login", "/portal/install"];
const isPortalPath = (pathname: string) => pathname === "/portal" || pathname.startsWith("/portal/");

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and sends
 * signed-out visitors to /login.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    // Before .env.local is filled in, show the setup page instead of crashing.
    if (isPublicPath(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run other code between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  if (!signedIn && !isPublicPath(pathname)) {
    // Customers who open a portal link signed out land on the portal's own sign-in page.
    const loginUrl = new URL(isPortalPath(pathname) ? "/portal/login" : "/login", request.url);
    if (pathname !== "/" && pathname !== "/portal") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (signedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (signedIn && pathname === "/portal/login") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return response;
}
