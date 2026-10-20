import "server-only";

// Request tracing for the Supabase clients (Fred 2026-10-20: "5 seconds per tab"): with PERF_LOG=1
// every call to Supabase is logged with its duration and a short path, so a slow page can be read as
// a list of round trips. Off by default; costs nothing when off.
const on = process.env.PERF_LOG === "1";

export const tracedFetch: typeof fetch | undefined = on
  ? async (input, init) => {
      const t0 = Date.now();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      try {
        return await fetch(input, init);
      } finally {
        const u = new URL(url);
        const table = u.pathname.replace(/^\/(rest\/v1|storage\/v1|auth\/v1)\//, "").slice(0, 40);
        const sel = u.searchParams.get("select");
        console.log(`[sb] ${String(Date.now() - t0).padStart(4)} ms  ${init?.method ?? "GET"} ${table}${sel ? "  select=" + sel.slice(0, 50) : ""}`);
      }
    }
  : undefined;
