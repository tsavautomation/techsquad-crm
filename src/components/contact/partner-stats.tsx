import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, toDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// F4 partner stats on an Organization (docs/portal-features-merge.md §H, SPEC §9.1 F4-e): projects it
// worked on as designer, GC, builder or referrer, and (for people who see money) their approved value.

const ROLES = [
  ["design_firm_id", "Designer"],
  ["general_contractor_id", "GC"],
  ["builder_developer_id", "Builder"],
  ["referral_organization_id", "Referral"],
] as const;
const WON = new Set(["Proposal Approved", "Infrastructure", "Installation", "Programming", "Complete"]);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Row = { id: number; title: string | null; job_status: string | null; created_at: string } & Record<(typeof ROLES)[number][0], number | null>;

export async function PartnerStats({ orgId, user }: { orgId: number; user: CurrentUser }) {
  const pt = getTable("projects");
  if (!canOpen(user.permissions, pt, getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db
    .from("projects")
    .select(`id, title, job_status, created_at, ${ROLES.map(([c]) => c).join(", ")}`)
    .or(ROLES.map(([c]) => `${c}.eq.${orgId}`).join(","))
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return null;

  const showMoney = canOpen(user.permissions, getTable("transactions"), getTable);
  const approved = new Map<number, number>();
  if (showMoney) {
    const { data: fin } = await db.rpc("project_financials", { p_project_ids: rows.map((r) => r.id) });
    for (const f of (fin ?? []) as { project_id: number; approved_amount: number }[]) approved.set(f.project_id, Number(f.approved_amount));
  }
  const total = rows.reduce((n, r) => n + (approved.get(r.id) ?? 0), 0);
  const won = rows.filter((r) => r.job_status && WON.has(r.job_status)).length;
  const byRole = ROLES.map(([c, label]) => ({ label, n: rows.filter((r) => r[c] === orgId).length })).filter((x) => x.n);

  const stat = (label: string, value: string) => (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <p className="text-[11.5px] text-text-2">{label}</p>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
  return (
    <section className="mb-4 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("As a partner")}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(tr("Projects"), String(rows.length))}
        {stat(tr("Approved or further"), String(won))}
        {showMoney && stat(tr("Approved value"), money.format(total))}
        {stat(tr("Latest project"), formatDate(toDateTimeLocalET(rows[0].created_at).slice(0, 10)))}
      </div>
      <p className="mt-2 text-[12.5px] text-text-2">{byRole.map((r) => `${tr(r.label)}: ${r.n}`).join(" · ")}</p>
      <ul className="-mx-1 mt-2 divide-y">
        {rows.slice(0, 8).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-1 py-1.5 text-sm">
            <Link href={recordHref(pt, r.id)} className="min-w-0 truncate hover:underline">
              {r.title ?? tr("Project #{id}", { id: r.id })}
            </Link>
            <span className="shrink-0 text-[12.5px] text-text-2">
              {[r.job_status ? tr(r.job_status) : null, showMoney && approved.get(r.id) ? money.format(approved.get(r.id)!) : null].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 8 && <p className="mt-1 text-[12.5px] text-muted-foreground">{tr("+ {n} more", { n: rows.length - 8 })}</p>}
    </section>
  );
}
