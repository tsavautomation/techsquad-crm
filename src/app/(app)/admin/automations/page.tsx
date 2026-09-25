import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { describeConditions, describeEvents, type Conditions } from "@/lib/engine/conditions";
import type { Action } from "@/lib/engine/automations";
import { createClient } from "@/lib/supabase/server";
import { REGISTRY } from "@/registry";
import { recordHref } from "@/registry/routes";

export const metadata = { title: "Automations" };

type AutomationRow = { id: number; table_name: string; title: string; active: boolean; events: string[]; conditions: Conditions; actions: Action[]; notes: string | null };
type RunRow = { id: number; automation_id: number; table_name: string; record_id: number; event: string; status: string; detail: { actions?: string[]; error?: string }; at: string };
type SlotRow = { key: string; kind: string; started_at: string; finished_at: string | null; result: { checked?: number; matched?: number; error?: string; cleanup?: { removed: number } } | null };
type EmailRow ={ id: string; subject: string; to_addresses: string[]; status: string; test_mode: boolean; error: string | null; created_at: string; table_name: string | null; record_id: number | null };

const TABLES = new Map(REGISTRY.map((t) => [t.name, t]));

function describeAction(a: Action, label: (f: string) => string): string {
  switch (a.type) {
    case "update":
      return `Set ${Object.entries(a.set).map(([k, v]) => `${label(k)} = ${v ?? "empty"}`).join(", ")}`;
    case "archive":
      return "Archive the record";
    case "checklist":
      return `Add checklist item ${a.item}${a.target ? ` to the ${label(a.target)}` : ""}`;
    case "email": {
      const extras = [a.card && "record card", a.link && "link", a.pdf && "PDF", a.files?.length && `files (${a.files.map(label).join(", ")})`].filter(Boolean);
      return `Email ${a.to.join(", ")}${a.bcc?.length ? ` (bcc ${a.bcc.join(", ")})` : ""}: “${a.subject.trim()}”${extras.length ? ` with ${extras.join(", ")}` : ""}`;
    }
  }
}

/** The automations (SPEC §5), scheduled checks, run log and email outbox. Each opens in the editor (M12). */
export default async function AutomationsPage() {
  const user = await requireUser();
  if (!user.permissions.has("projects.module.design_triggers")) notFound();
  const db = await createClient();
  const [{ data: autos }, { data: runs }, { data: emails }, { data: slots }] = await Promise.all([
    db.from("automations").select("*").order("table_name").order("id"),
    db.from("automation_runs").select("*").order("id", { ascending: false }).limit(50),
    db.from("email_outbox").select("id, subject, to_addresses, status, test_mode, error, created_at, table_name, record_id").order("created_at", { ascending: false }).limit(30),
    db.from("scheduled_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);
  const automations = (autos ?? []) as unknown as AutomationRow[];
  const titles = new Map(automations.map((a) => [a.id, a.title]));
  const byTable = Map.groupBy(automations, (a) => a.table_name);
  const testMode = process.env.EMAIL_TEST_MODE !== "false";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Automations</h1>
        {user.isSysadmin && (
          <Link href="/admin/automations/new" className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted">
            New automation
          </Link>
        )}
      </div>
      <p className="mt-1 mb-2 text-sm text-muted-foreground">
        The {automations.length} WebAuthor triggers ({automations.filter((a) => a.active).length} active). They run right after a record is saved; daily checks run
        just after midnight (Eastern) and hourly checks every hour. Tap one to see or change it.
      </p>
      {testMode && (
        <p className="mb-6 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Email test mode is on: every email goes to {process.env.EMAIL_TEST_RECIPIENT || "the test recipient"} only, marked [TEST].
        </p>
      )}

      {[...byTable.entries()].map(([table, list]) => {
        const t = TABLES.get(table);
        const label = (f: string) => t?.fields.find((x) => x.name === f)?.label ?? f;
        return (
          <section key={table} className="mb-8">
            <h2 className="mb-2 text-lg font-semibold">{t?.label ?? table}</h2>
            <ul className="divide-y rounded-lg border">
              {list.map((a) => (
                <li key={a.id} className={`p-3 text-sm ${a.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/admin/automations/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                      {a.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">#{a.id}</span>
                    {!a.active && <span className="rounded bg-muted px-1.5 text-xs">off</span>}
                  </div>
                  <dl className="mt-1 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5">
                    <dt className="text-muted-foreground">When</dt>
                    <dd>{describeEvents(a.events, label)}</dd>
                    <dt className="text-muted-foreground">If</dt>
                    <dd>{describeConditions(a.conditions, label)}</dd>
                    <dt className="text-muted-foreground">Then</dt>
                    <dd>{a.actions.map((x) => describeAction(x, label)).join("; ")}</dd>
                    {a.notes && (
                      <>
                        <dt className="text-muted-foreground">Note</dt>
                        <dd className="text-muted-foreground">{a.notes}</dd>
                      </>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Scheduled checks</h2>
        {!slots?.length ? (
          <p className="text-sm text-muted-foreground">No scheduled check has run yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {(slots as unknown as SlotRow[]).map((s) => (
              <li key={s.key} className="flex flex-wrap justify-between gap-x-3 p-3">
                <span className="font-medium">{s.kind === "daily" ? "Daily" : "Hourly"} check</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(s.started_at)}</span>
                <span className={`w-full ${s.result?.error ? "text-destructive" : "text-muted-foreground"}`}>
                  {!s.finished_at
                    ? "running…"
                    : s.result?.error
                      ? String(s.result.error)
                      : `${s.result?.checked ?? 0} records checked, ${s.result?.matched ?? 0} matched${s.result?.cleanup ? `, ${s.result.cleanup.removed} abandoned uploads removed` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Recent runs</h2>
        {!runs?.length ? (
          <p className="text-sm text-muted-foreground">Nothing has run yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {(runs as unknown as RunRow[]).map((r) => {
              const t = TABLES.get(r.table_name);
              return (
                <li key={r.id} className="p-3">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-medium">{titles.get(r.automation_id) ?? `#${r.automation_id}`}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(r.at)}</span>
                  </div>
                  <div className={r.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                    {t ? (
                      <Link href={recordHref(t, r.record_id)} className="underline underline-offset-4">
                        {t.itemLabel} #{r.record_id}
                      </Link>
                    ) : (
                      `${r.table_name} #${r.record_id}`
                    )}{" "}
                    · {r.event} · {r.status === "error" ? r.detail.error : r.detail.actions?.join("; ")}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Recent emails</h2>
        {!emails?.length ? (
          <p className="text-sm text-muted-foreground">No emails yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {(emails as unknown as EmailRow[]).map((m) => (
              <li key={m.id} className="p-3">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-medium">{m.subject}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
                </div>
                <div className="text-muted-foreground">
                  To {m.to_addresses.join(", ")}
                  {m.test_mode && " (test mode)"} ·{" "}
                  <span className={m.status === "failed" ? "text-destructive" : m.status === "sent" ? "text-emerald-700 dark:text-emerald-400" : ""}>
                    {m.status}
                    {m.error ? `: ${m.error}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
