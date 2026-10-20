import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// J-m (Jessica 2026-10-20, item 8): the maintenance plan's balance on the project page. "Visits used" is a
// count, never a stored number (SPEC §9.1 F6): visits ticked "Counts toward the maintenance plan", status Done,
// dated inside the plan period. So a visit is counted once however often it is saved, and un-doing it
// gives the visit back. Same rule as the client portal's view portal_projects.

type Plan = { maintenance_plan: boolean; maintenance_type: string | null; maintenance_status: string | null; maintenance_purchase_date: string | null; maintenance_expires_on: string | null; maintenance_visits_included: number | null };
type Visit = { id: number; starts_at: string; technician: string | null };

export async function MaintenancePlan({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const db = await recordsDb();
  const { data } = await db.from("projects").select("maintenance_plan, maintenance_type, maintenance_status, maintenance_purchase_date, maintenance_expires_on, maintenance_visits_included").eq("id", projectId).maybeSingle();
  const p = data as Plan | null;
  if (!p?.maintenance_plan) return null;
  const tr = await getT();
  const visitsT = getTable("visits");
  let used: Visit[] = [];
  if (canOpen(user.permissions, visitsT, getTable)) {
    let q = db.from("visits").select("id, starts_at, technician_id").eq("project_id", projectId).eq("maintenance_visit", true).eq("status", "Done").is("deleted_at", null).order("starts_at", { ascending: false });
    if (p.maintenance_purchase_date) q = q.gte("starts_at", `${p.maintenance_purchase_date}T00:00:00-04:00`);
    if (p.maintenance_expires_on) q = q.lte("starts_at", `${p.maintenance_expires_on}T23:59:59-05:00`);
    const rows = ((await q).data ?? []) as { id: number; starts_at: string; technician_id: number | null }[];
    const ids = [...new Set(rows.map((r) => r.technician_id).filter((x): x is number => x !== null))];
    const { data: emp } = ids.length ? await db.from("employee_names").select("id, title").in("id", ids) : { data: [] };
    const name = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title]));
    used = rows.map((r) => ({ id: r.id, starts_at: r.starts_at, technician: r.technician_id ? name.get(r.technician_id) ?? null : null }));
  }
  const included = p.maintenance_visits_included;
  const remaining = included === null ? null : Math.max(0, included - used.length);
  const tone = p.maintenance_status === "Active" ? "text-ok-fg" : p.maintenance_status === "Expired" ? "text-bad-fg" : "text-warn-fg";

  return (
    <section id="maintenance-plan" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <ShieldCheck className={`size-4 ${tone}`} aria-hidden /> {tr("Maintenance plan")}
      </h2>
      <p className="mb-2 text-[13px] text-text-2">
        {[p.maintenance_type ? tr(p.maintenance_type) : null, p.maintenance_status ? tr(p.maintenance_status) : null, p.maintenance_purchase_date ? `${tr("Started")} ${formatDate(p.maintenance_purchase_date)}` : null, p.maintenance_expires_on ? `${tr("Expires")} ${formatDate(p.maintenance_expires_on)}` : null].filter(Boolean).join(" · ")}
      </p>
      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted px-2 py-2">
          <b className="block text-xl font-semibold">{used.length}</b>
          <span className="text-xs text-text-2">{tr("Visits used")}</span>
        </div>
        <div className="rounded-xl bg-muted px-2 py-2">
          <b className="block text-xl font-semibold">{included ?? "—"}</b>
          <span className="text-xs text-text-2">{tr("Included")}</span>
        </div>
        <div className={`rounded-xl px-2 py-2 ${remaining === 0 ? "bg-bad-bg text-bad-fg" : "bg-ok-bg text-ok-fg"}`}>
          <b className="block text-xl font-semibold">{remaining ?? "—"}</b>
          <span className="text-xs">{tr("Remaining")}</span>
        </div>
      </div>
      {used.length > 0 ? (
        <ul className="divide-y text-sm">
          {used.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 py-1.5">
              <Link href={recordHref(visitsT, v.id)} className="text-primary hover:underline">
                {formatDateTime(v.starts_at)}
              </Link>
              <span className="truncate text-xs text-text-2">{v.technician ?? ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-2">{tr("No visit counted yet: tick \"Counts toward the maintenance plan\" on a visit and mark it Done.")}</p>
      )}
    </section>
  );
}
