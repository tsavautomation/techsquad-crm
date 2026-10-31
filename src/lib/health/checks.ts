import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchVehicles, isConnected as bouncieConnected } from "@/lib/bouncie/client";
import { formatDateTime, toDateTimeLocalET, todayET } from "@/lib/dates";
import { listChildren, oneDriveReady, ROOT } from "@/lib/files/onedrive";
import { loadSettings as loadGoogle } from "@/lib/google/client";
import { loadSettings as loadGmail } from "@/lib/mail/client";
import { loadSettings as loadPortal } from "@/lib/portalio/client";
import { pushConfigured } from "@/lib/push/send";
import { addDays } from "@/lib/schedule/dates";
import { adminDb } from "@/lib/supabase/admin";
import { hoursSince, type HealthCheck, type HealthReport } from "./report";

// HC-a: one call per integration, each with its own time limit, none able to break the others.
// Every check answers { ok, detail }; "skipped" means the integration is not connected (never a warning).

const KEY = "health";
const CHECK_TIMEOUT_MS = 20_000;
type Answer = { ok: boolean; detail: string | null; skipped?: boolean };
type Check = { key: string; label: string; run: (db: SupabaseClient, now: number) => Promise<Answer> };

const at = (iso: string | null | undefined) => (iso ? formatDateTime(toDateTimeLocalET(iso)) : "never");
const ago = (iso: string | null | undefined, now: number) => {
  const h = hoursSince(iso, now);
  if (!Number.isFinite(h)) return "never";
  return h < 1 ? `${Math.round(h * 60)} min ago` : h < 48 ? `${h.toFixed(1)} h ago` : `${Math.floor(h / 24)} days ago`;
};
const lastRun = async (db: SupabaseClient, prefix: string) => {
  const { data } = await db.from("scheduled_runs").select("key, started_at, finished_at, result").like("key", `${prefix}:%`).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data as { key: string; started_at: string; finished_at: string | null; result: Record<string, unknown> | null } | null;
};

const CHECKS: Check[] = [
  {
    key: "timer",
    label: "Hourly timer",
    run: async (db, now) => {
      const r = await lastRun(db, "hourly");
      const h = hoursSince(r?.started_at, now);
      return { ok: h <= 2, detail: r ? `Last run ${ago(r.started_at, now)} (${at(r.started_at)})` : "Never ran" };
    },
  },
  {
    key: "backup",
    label: "Nightly backup",
    run: async (db) => {
      const { data } = await db.from("backups").select("day, status, error, finished_at").eq("kind", "nightly").order("id", { ascending: false }).limit(1).maybeSingle();
      const b = data as { day: string; status: string; error: string | null; finished_at: string | null } | null;
      if (!b) return { ok: false, detail: "No backup yet" };
      if (b.status === "failed") return { ok: false, detail: `Copy of ${b.day} failed: ${b.error ?? "unknown error"}` };
      // The diagnostic runs at midnight, before 3 AM: the copy of the day before is the newest one expected.
      const ok = b.day >= addDays(todayET(), -1);
      return { ok, detail: `Last copy: ${b.day} (${b.status})` };
    },
  },
  {
    key: "onedrive",
    label: "OneDrive",
    run: async () => {
      if (!(await oneDriveReady())) return { ok: true, skipped: true, detail: "Not connected" };
      const kids = await listChildren(ROOT);
      return { ok: true, detail: `Signed in; ${kids.length} folders under ${ROOT}` };
    },
  },
  {
    key: "google",
    label: "Google Calendar",
    run: async (_db, now) => {
      const s = await loadGoogle();
      if (!s?.calendar_id) return { ok: true, skipped: true, detail: "Not connected" };
      if (s.last_sync_error) return { ok: false, detail: `Last sync error: ${s.last_sync_error}` };
      return { ok: hoursSince(s.last_sync_at, now) <= 2, detail: `Last sync ${ago(s.last_sync_at, now)}` };
    },
  },
  {
    key: "gmail",
    label: "Gmail intake",
    run: async (_db, now) => {
      const s = await loadGmail();
      if (!s) return { ok: true, skipped: true, detail: "Not connected" };
      if (s.last_sync_error) return { ok: false, detail: `Last check error: ${s.last_sync_error}` };
      return { ok: hoursSince(s.last_sync_at, now) <= 2, detail: `Last check ${ago(s.last_sync_at, now)}` };
    },
  },
  {
    key: "portalio",
    label: "Portal.io",
    run: async (db, now) => {
      if (!(await loadPortal())) return { ok: true, skipped: true, detail: "Not connected" };
      const r = await lastRun(db, "portalio");
      const err = r?.result && typeof r.result.error === "string" ? r.result.error : null;
      if (err) return { ok: false, detail: `Last sync error: ${err}` };
      return { ok: hoursSince(r?.started_at, now) <= 2, detail: r ? `Last hourly sync ${ago(r.started_at, now)}` : "The hourly sync never ran" };
    },
  },
  {
    key: "bouncie",
    label: "Bouncie (vehicles)",
    run: async (_db, now) => {
      if (!(await bouncieConnected())) return { ok: true, skipped: true, detail: "Not connected" };
      const v = await fetchVehicles();
      const fresh = v.filter((x) => hoursSince(x.updatedAt, now) <= 24).length;
      return { ok: v.length > 0, detail: `${v.length} vehicles, ${fresh} reported in the last 24 h` };
    },
  },
  {
    key: "email",
    label: "Email sending",
    run: async (db, now) => {
      const since = new Date(now - 24 * 3_600_000).toISOString();
      const [{ count: failed }, { count: stuck }] = await Promise.all([
        db.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
        db.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "queued").lt("created_at", new Date(now - 3_600_000).toISOString()),
      ]);
      const ok = !failed && !stuck;
      return { ok, detail: ok ? "Nothing failed or stuck in the last 24 h" : `${failed ?? 0} failed in 24 h, ${stuck ?? 0} waiting for over an hour` };
    },
  },
  {
    key: "push",
    label: "Push notifications",
    run: async (db, now) => {
      if (!pushConfigured()) return { ok: false, detail: "VAPID keys are missing on the server" };
      const since = new Date(now - 24 * 3_600_000).toISOString();
      const [{ count: sent }, { count: errors }] = await Promise.all([
        db.from("push_log").select("id", { count: "exact", head: true }).not("sent_at", "is", null).gte("created_at", since),
        db.from("push_log").select("id", { count: "exact", head: true }).not("error", "is", null).gte("created_at", since),
      ]);
      return { ok: !(errors && !sent), detail: `${sent ?? 0} sent, ${errors ?? 0} failed in the last 24 h` };
    },
  },
  {
    key: "wa_agent",
    label: "WhatsApp capture PC",
    run: async (db, now) => {
      // Alive = a heartbeat in the last hour or a forwarded message in the last 24 h (the office PC's agent
      // stopped sending heartbeats on 2026-10-24 while still forwarding messages).
      const { data } = await db.from("wa_agents").select("device, last_seen_at, last_message_at").order("last_message_at", { ascending: false });
      const rows = (data ?? []) as { device: string; last_seen_at: string | null; last_message_at: string | null }[];
      if (!rows.length) return { ok: true, skipped: true, detail: "No capture PC registered" };
      const live = rows.filter((r) => hoursSince(r.last_seen_at, now) <= 1 || hoursSince(r.last_message_at, now) <= 24);
      const r0 = rows[0];
      return { ok: live.length > 0, detail: live.length ? `${live.map((r) => `${r.device}: last message ${ago(r.last_message_at, now)}, heartbeat ${ago(r.last_seen_at, now)}`).join("; ")}` : `${r0.device}: last message ${at(r0.last_message_at)}, heartbeat ${at(r0.last_seen_at)}` };
    },
  },
  {
    key: "wa_messages",
    label: "WhatsApp messages",
    run: async (db, now) => {
      const { data: agents } = await db.from("wa_agents").select("device").limit(1);
      if (!agents?.length) return { ok: true, skipped: true, detail: "No capture PC registered" };
      const since = new Date(now - 24 * 3_600_000).toISOString();
      const { count } = await db.from("wa_messages").select("id", { count: "exact", head: true }).eq("source", "whatsapp").gte("captured_at", since);
      return { ok: (count ?? 0) > 0, detail: count ? `${count} received in the last 24 h` : "Nothing received in the last 24 h" };
    },
  },
];

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No answer in ${ms / 1000} s`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Runs every check (in parallel, each with its own time limit) and stores the report as app_settings 'health'. */
export async function runHealthChecks(by: HealthReport["by"], now: Date = new Date()): Promise<HealthReport> {
  const db = adminDb();
  const t0 = Date.now();
  const checks: HealthCheck[] = await Promise.all(
    CHECKS.map(async (c) => {
      try {
        const a = await withTimeout(c.run(db, now.getTime()), CHECK_TIMEOUT_MS);
        return { key: c.key, label: c.label, ...a };
      } catch (e) {
        return { key: c.key, label: c.label, ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  const report: HealthReport = { ran_at: now.toISOString(), by, ms: Date.now() - t0, checks };
  await db.from("app_settings").upsert({ key: KEY, value: report });
  return report;
}

/** The latest stored report, or null before the first run. */
export async function loadHealth(): Promise<HealthReport | null> {
  const { data } = await adminDb().from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const v = (data as { value?: unknown } | null)?.value as HealthReport | undefined;
  return v && Array.isArray(v.checks) ? v : null;
}
