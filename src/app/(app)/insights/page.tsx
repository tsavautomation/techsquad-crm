import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Insights" };

// Insights (the Portal design's "Relatórios"): charts and numbers over the real tables. Everything is
// read with the viewer's own permissions, so each person sees totals of what they can see; money cards
// need access to Transactions too.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const STAGES = ["Surveying", "Create Proposal", "Proposal Revisions", "Proposal Sent", "Proposal Approved", "Infrastructure", "Installation", "Programming", "Complete", "ON HOLD", "Proposal Denied"];
const WON = new Set(["Proposal Approved", "Infrastructure", "Installation", "Programming", "Complete"]);

function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[13px]">
      <span className="w-36 shrink-0 truncate text-text-2" title={label}>
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-gradient-to-r from-primary to-brand" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="w-28 shrink-0 text-right font-medium tabular-nums">{text}</span>
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card px-[18px] py-4 shadow-card", className)}>
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1.5 text-[13px] last:border-0">
      <span className="text-text-2">{label}</span>
      <b className="tabular-nums">{value}</b>
    </div>
  );
}

type Project = {
  id: number;
  job_status: string | null;
  general_contractor_id: number | null;
  design_firm_id: number | null;
  builder_developer_id: number | null;
  maintenance_plan: boolean;
  maintenance_status: string | null;
  maintenance_type: string | null;
  maintenance_amount: number | null;
};

export default async function InsightsPage(props: PageProps<"/insights">) {
  const user = await requireUser();
  const can = (t: string) => canOpen(user.permissions, getTable(t), getTable);
  if (!can("projects")) notFound();
  const { days: daysParam } = (await props.searchParams) as { days?: string };
  const days = [7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const showMoney = can("transactions");
  const db = await recordsDb();

  const { data: pData } = await db
    .from("projects")
    .select("id, job_status, general_contractor_id, design_firm_id, builder_developer_id, maintenance_plan, maintenance_status, maintenance_type, maintenance_amount")
    .is("deleted_at", null);
  const projects = (pData ?? []) as Project[];

  // Money per project ("Apply to Project" transactions only, SPEC §9.1 M7-b).
  const fin = new Map<number, { approved: number; invoiced: number; paid: number }>();
  if (showMoney && projects.length) {
    const { data } = await db.rpc("project_financials", { p_project_ids: projects.map((p) => p.id) });
    for (const r of (data ?? []) as { project_id: number; approved_amount: number; invoiced_amount: number; paid_amount: number }[])
      fin.set(r.project_id, { approved: Number(r.approved_amount), invoiced: Number(r.invoiced_amount), paid: Number(r.paid_amount) });
  }
  const approvedOf = (id: number) => fin.get(id)?.approved ?? 0;

  // Pipeline by stage.
  const byStage = new Map<string, { n: number; v: number }>();
  for (const p of projects) {
    const k = p.job_status && STAGES.includes(p.job_status) ? p.job_status : "No stage";
    const s = byStage.get(k) ?? { n: 0, v: 0 };
    s.n++;
    s.v += approvedOf(p.id);
    byStage.set(k, s);
  }
  const stages = [...STAGES, "No stage"].filter((k) => byStage.has(k)).map((k) => ({ k, ...byStage.get(k)! }));
  const maxStage = Math.max(1, ...stages.map((s) => s.n));
  const won = projects.filter((p) => p.job_status && WON.has(p.job_status)).length;
  const lost = projects.filter((p) => p.job_status === "Proposal Denied").length;

  // Money.
  const totals = [...fin.values()].reduce((a, f) => ({ approved: a.approved + f.approved, invoiced: a.invoiced + f.invoiced, paid: a.paid + f.paid }), { approved: 0, invoiced: 0, paid: 0 });
  const withValue = [...fin.values()].filter((f) => f.approved > 0).length;

  // Partners by approved value.
  const partnerIds = new Map<number, { roles: Set<string>; n: number; v: number }>();
  for (const p of projects)
    for (const [col, role] of [
      [p.general_contractor_id, "GC"],
      [p.design_firm_id, "Designer"],
      [p.builder_developer_id, "Builder"],
    ] as const) {
      if (!col) continue;
      const e = partnerIds.get(col) ?? { roles: new Set<string>(), n: 0, v: 0 };
      e.roles.add(role);
      e.n++;
      e.v += approvedOf(p.id);
      partnerIds.set(col, e);
    }
  const { data: orgs } = partnerIds.size ? await db.from("organizations").select("id, title").in("id", [...partnerIds.keys()]) : { data: [] };
  const orgName = new Map(((orgs ?? []) as { id: number; title: string | null }[]).map((o) => [o.id, o.title ?? `#${o.id}`]));
  const partners = [...partnerIds.entries()]
    .map(([id, e]) => ({ id, name: orgName.get(id) ?? `#${id}`, roles: [...e.roles].join(", "), n: e.n, v: e.v }))
    .sort((a, b) => (showMoney ? b.v - a.v : 0) || b.n - a.n)
    .slice(0, 8);

  // Operations: visits in the period.
  let ops: { total: number; done: number; cancelled: number; byTech: [string, number][]; byType: [string, { n: number; min: number }][] } | null = null;
  if (can("visits")) {
    const today = todayET();
    const since = fromDateTimeLocalET(`${addDays(today, -days + 1)}T00:00`);
    const until = fromDateTimeLocalET(`${addDays(today, 1)}T00:00`);
    const { data } = await db.from("visits").select("status, duration, service_type, technician_id").gte("starts_at", since).lt("starts_at", until).is("deleted_at", null);
    const v = (data ?? []) as { status: string | null; duration: string | null; service_type: string | null; technician_id: number | null }[];
    const techIds = [...new Set(v.map((x) => x.technician_id).filter((x): x is number => x !== null))];
    const { data: emp } = techIds.length ? await db.from("employees").select("id, title").in("id", techIds) : { data: [] };
    const tn = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
    const byTech = new Map<string, number>();
    const byType = new Map<string, { n: number; min: number }>();
    for (const x of v.filter((y) => y.status !== "Cancelled")) {
      const name = x.technician_id ? (tn.get(x.technician_id) ?? "—") : "No technician";
      byTech.set(name, (byTech.get(name) ?? 0) + 1);
      const t = byType.get(x.service_type ?? "No service type") ?? { n: 0, min: 0 };
      t.n++;
      t.min += Number(x.duration ?? 0);
      byType.set(x.service_type ?? "No service type", t);
    }
    ops = {
      total: v.filter((x) => x.status !== "Cancelled").length,
      done: v.filter((x) => x.status === "Done").length,
      cancelled: v.filter((x) => x.status === "Cancelled").length,
      byTech: [...byTech.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      byType: [...byType.entries()].sort((a, b) => b[1].n - a[1].n),
    };
  }

  // Maintenance plans.
  const plans = projects.filter((p) => p.maintenance_plan);
  const active = plans.filter((p) => p.maintenance_status === "Active");
  const tiers = new Map<string, { n: number; v: number }>();
  for (const p of active) {
    const t = tiers.get(p.maintenance_type ?? "—") ?? { n: 0, v: 0 };
    t.n++;
    t.v += Number(p.maintenance_amount ?? 0);
    tiers.set(p.maintenance_type ?? "—", t);
  }
  const completeNoPlan = projects.filter((p) => p.job_status === "Complete" && !p.maintenance_plan).length;

  // Data quality (contacts: phone + email; projects: job address).
  let quality: number | null = null;
  if (can("contacts")) {
    const { data } = await db.from("contacts").select("main_phone, email").is("deleted_at", null);
    const c = (data ?? []) as { main_phone: string | null; email: string | null }[];
    if (c.length) quality = Math.round((c.reduce((n, x) => n + (x.main_phone ? 1 : 0) + (x.email ? 1 : 0), 0) / (c.length * 2)) * 100);
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">Insights</h1>
          <p className="text-[12.5px] text-muted-foreground">Pipeline, money, partners, field work and maintenance plans.</p>
        </div>
        {ops && (
          <div className="flex rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist" aria-label="Period for field work">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/insights?days=${d}`} role="tab" aria-selected={d === days} className={cn("rounded-lg px-3 py-1.5", d === days ? "bg-card font-semibold shadow-card" : "text-text-2")}>
                {d} days
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid items-start gap-3.5 md:grid-cols-2">
        <Card title="Pipeline">
          {stages.map((s) => (
            <Bar key={s.k} label={s.k} value={s.n} max={maxStage} text={`${s.n}${showMoney && s.v ? ` · ${money.format(s.v)}` : ""}`} />
          ))}
          <p className="mt-2 text-[12.5px] text-text-2">
            {won} approved or further, {lost} lost.{showMoney && ` Values come from ${withValue} projects with an approved proposal.`}
          </p>
        </Card>

        {showMoney && (
          <Card title="Money (Apply to Project transactions)">
            <Bar label="Approved" value={totals.approved} max={totals.approved} text={money.format(totals.approved)} />
            <Bar label="Invoiced" value={totals.invoiced} max={totals.approved} text={money.format(totals.invoiced)} />
            <Bar label="Paid" value={totals.paid} max={totals.approved} text={money.format(totals.paid)} />
            <div className="mt-3 rounded-xl border bg-muted px-3">
              <Stat label="To collect (invoiced − paid)" value={money.format(Math.max(0, totals.invoiced - totals.paid))} />
              <Stat label="Approved, not invoiced yet" value={money.format(Math.max(0, totals.approved - totals.invoiced))} />
            </div>
          </Card>
        )}

        <Card title={showMoney ? "Partners by approved value" : "Partners by number of projects"}>
          {partners.length ? (
            partners.map((p) => (
              <Bar key={p.id} label={`${p.name} (${p.roles})`} value={showMoney ? p.v : p.n} max={showMoney ? partners[0].v || 1 : partners[0].n} text={showMoney ? money.format(p.v) : `${p.n} projects`} />
            ))
          ) : (
            <p className="text-[13px] text-text-2">No GC, designer or builder linked to projects yet.</p>
          )}
        </Card>

        {ops && (
          <Card title={`Field work (last ${days} days)`}>
            <div className="mb-2 rounded-xl border bg-muted px-3">
              <Stat label="Visits" value={String(ops.total)} />
              <Stat label="Done" value={String(ops.done)} />
              <Stat label="Cancelled" value={String(ops.cancelled)} />
            </div>
            {ops.byType.length > 0 && (
              <>
                <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Planned time by service type</p>
                {ops.byType.map(([t, v]) => (
                  <Bar key={t} label={t} value={v.min} max={Math.max(...ops!.byType.map(([, x]) => x.min), 1)} text={`${v.n} · ${Math.round(v.min / 60)} h`} />
                ))}
              </>
            )}
            {ops.byTech.length > 0 && (
              <>
                <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Visits by technician</p>
                {ops.byTech.map(([n, c]) => (
                  <Bar key={n} label={n} value={c} max={ops!.byTech[0][1]} text={String(c)} />
                ))}
              </>
            )}
            <p className="mt-2 text-[12px] text-muted-foreground">Real time on site (check-in / check-out) comes with the technician&apos;s Today screen.</p>
          </Card>
        )}

        <Card title="Maintenance plans">
          <div className="mb-2 rounded-xl border bg-muted px-3">
            <Stat label="Active plans" value={String(active.length)} />
            <Stat label="Renewal due" value={String(plans.filter((p) => p.maintenance_status === "Renewal Alert").length)} />
            <Stat label="Expired" value={String(plans.filter((p) => p.maintenance_status === "Expired").length)} />
            {showMoney && <Stat label="Yearly value of active plans" value={money.format(active.reduce((n, p) => n + Number(p.maintenance_amount ?? 0), 0))} />}
          </div>
          {[...tiers.entries()].map(([t, v]) => (
            <Bar key={t} label={t} value={v.n} max={Math.max(1, active.length)} text={`${v.n}${showMoney ? ` · ${money.format(v.v)}` : ""}`} />
          ))}
          <p className="mt-2 rounded-[10px] bg-ok-bg px-3 py-2 text-[12.5px] text-ok-fg">Opportunity: {completeNoPlan} completed projects without a maintenance plan.</p>
        </Card>

        {quality !== null && (
          <Card title="Data quality">
            <Bar label="Contacts complete" value={quality} max={100} text={`${quality}%`} />
            <p className="mt-2 text-[12.5px] text-text-2">
              Phone and email filled in. Fix the gaps in{" "}
              <Link href="/data" className="text-primary underline underline-offset-2">
                Data
              </Link>
              .
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
