import Link from "next/link";
import { notFound } from "next/navigation";
import { PipelineBoard, type PipelineCard } from "@/components/pipeline/board";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { daysSince, NOT_SUBMITTED, type BoardLevel } from "@/lib/pipeline/moves";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Pipeline") };
}

// Finished stages fill up over the years; by default the board shows only their last 90 days.
const CLOSED = new Set(["Complete", "Proposal Denied"]);
const RECENT_DAYS = 90;

type Row = {
  id: number;
  title: string | null;
  type: string | null;
  salesperson_id: number | null;
  created_at: string;
  contacts: { title: string | null } | null;
  employees: { title: string | null } | null;
};

/** F4 pipeline board (Portal "Funil", SPEC §9.1 F4-a): Projects by Project Proposal stage. */
export default async function PipelinePage(props: PageProps<"/pipeline">) {
  const tr = await getT();
  const user = await requireUser();
  const t = getTable("projects");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const { who = "", all = "" } = (await props.searchParams) as { who?: string; all?: string };
  const db = await recordsDb();
  const now = new Date().getTime();

  const [{ data: board }, { data: meRow }, { data: pData }, { data: sData }] = await Promise.all([
    db.rpc("workflow_board", { p_table: "projects" }),
    db.from("employees").select("id").ilike("email", user.email).is("deleted_at", null).limit(1),
    db.from("projects").select("id, title, type, salesperson_id, created_at, contacts:job_owner_id(title), employees:salesperson_id(title)").is("deleted_at", null).is("archived_at", null).order("title").limit(2000),
    db.from("record_workflow_state").select("record_id, level_id, entered_at").eq("table_name", "projects"),
  ]);
  const levels = ((board as { levels?: BoardLevel[] } | null)?.levels ?? []).map((l) => ({ ...l, title: l.title, color: l.color || "#94a3b8" }));
  if (!levels.length) notFound();
  const me = ((meRow ?? []) as { id: number }[])[0]?.id ?? null;
  let rows = (pData ?? []) as unknown as Row[];

  const people = [...new Map(rows.filter((r) => r.salesperson_id).map((r) => [r.salesperson_id!, r.employees?.title ?? `#${r.salesperson_id}`])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const filterId = who === "me" ? me : /^\d+$/.test(who) ? Number(who) : null;
  if (who === "none") rows = rows.filter((r) => !r.salesperson_id);
  else if (filterId) rows = rows.filter((r) => r.salesperson_id === filterId);

  const state = new Map(((sData ?? []) as { record_id: number; level_id: number; entered_at: string }[]).map((s) => [s.record_id, s]));
  const closedIds = new Set(levels.filter((l) => CLOSED.has(l.title)).map((l) => l.id));
  let hidden = 0;
  const cards: PipelineCard[] = [];
  for (const r of rows) {
    const s = state.get(r.id);
    const level = s?.level_id ?? NOT_SUBMITTED;
    const days = daysSince(s?.entered_at ?? r.created_at, now);
    if (!all && closedIds.has(level) && (days ?? 0) > RECENT_DAYS) {
      hidden++;
      continue;
    }
    cards.push({ id: r.id, title: r.title ?? tr("Project #{id}", { id: r.id }), client: r.contacts?.title ?? null, salesperson: r.employees?.title ?? null, type: r.type, level, days, value: null });
  }

  // Approved value per project, for people who can see money (as on Insights).
  const showMoney = canOpen(user.permissions, getTable("transactions"), getTable);
  if (showMoney && cards.length) {
    const { data } = await db.rpc("project_financials", { p_project_ids: cards.map((c) => c.id) });
    const approved = new Map(((data ?? []) as { project_id: number; approved_amount: number }[]).map((x) => [x.project_id, Number(x.approved_amount)]));
    for (const c of cards) c.value = approved.get(c.id) || null;
  }

  const canModify = canDo(user.permissions, t, "modify", getTable);
  return (
    <div className="mx-auto max-w-[1400px]">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Pipeline")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        {tr("Projects by stage. Drag a card (or use Move to…) to the next stage; only the moves the workflow allows are offered.")}{" "}
        {hidden > 0 && (
          <Link href={`/pipeline?${new URLSearchParams({ ...(who ? { who } : {}), all: "1" })}`} className="underline underline-offset-4">
            {tr("Show {n} older finished projects", { n: hidden })}
          </Link>
        )}
      </p>
      <PipelineBoard levels={levels} cards={cards} canSubmit={canModify} people={people} me={me} who={who} all={Boolean(all)} showMoney={showMoney} />
    </div>
  );
}
