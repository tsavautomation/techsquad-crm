import { notFound } from "next/navigation";
import { NeedsProjectList, type OrphanVisit } from "@/components/schedule/needs-project-list";
import { requireUser } from "@/lib/auth/session";
import { toDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Needs a project") };
}

const PAGE = 100;

/** /schedule/needs-project (F15, reached from the calendar notice and Admin › Google Calendar): visits that came from Google Calendar without a project the CRM could recognise. */
export default async function NeedsProjectPage(props: PageProps<"/schedule/needs-project">) {
  const tr = await getT();
  const user = await requireUser();
  const t = getTable("visits");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const sp = (await props.searchParams) as { q?: string; page?: string };
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const db = await recordsDb();
  let query = db
    .from("visits")
    .select("id, title, starts_at, instructions, technician_id, status, google_event_id, employees:technician_id(title)", { count: "exact" })
    .is("project_id", null)
    .is("deleted_at", null)
    .order("starts_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  const { data, count } = await query;
  type Row = { id: number; title: string | null; starts_at: string | null; instructions: string | null; status: string | null; google_event_id: string | null; employees: { title: string | null } | null };
  const visits: OrphanVisit[] = ((data ?? []) as unknown as Row[]).map((v) => ({
    id: v.id,
    title: v.title ?? `Visit #${v.id}`,
    start: v.starts_at ? toDateTimeLocalET(v.starts_at) : null,
    notes: v.instructions ? v.instructions.split("\n")[0].slice(0, 120) : null,
    technician: v.employees?.title ?? null,
    status: v.status,
    fromGoogle: Boolean(v.google_event_id),
  }));

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-2xl font-semibold">{tr("Needs a project")}</h1>
      <p className="mb-3 text-xs text-muted-foreground">{tr("Visits from Google Calendar whose project the CRM couldn't tell. Pick the project here, or open the visit to fill in everything. \"Not a job\" removes the visit (Google is left alone).")}</p>
      <NeedsProjectList visits={visits} total={count ?? 0} page={page} pageSize={PAGE} q={q} canEdit={canDo(user.permissions, t, "modify", getTable)} canDelete={canDo(user.permissions, t, "delete", getTable)} />
    </div>
  );
}
