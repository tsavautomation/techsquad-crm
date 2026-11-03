/**
 * PJ-b item 6 (Luana via Fred 2026-11-02): fill the Job Status of projects that have none from the Status column
 * of Luana's sheet (Sales Projections, already imported into sheet_proposals and linked to projects):
 *   Completed → Complete · On Hold → ON HOLD · In Progress → left alone (listed: it could be Installation or Programming).
 * Only projects whose Job Status is blank are touched. Dry run by default; --apply writes, with a history line.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/fill-job-status.ts [--apply]
 */
import { adminDb } from "@/lib/supabase/admin";

const APPLY = process.argv.includes("--apply");
const MAP: Record<string, string> = { Completed: "Complete", "On Hold": "ON HOLD" };

async function main() {
  const db = adminDb();
  const { data, error } = await db.from("sheet_proposals").select("id, number, title, status, date, project_id, projects:project_id(id, title, job_status, deleted_at)").not("project_id", "is", null).limit(5000);
  if (error) throw new Error(error.message);
  type Row = { id: number; number: string | null; title: string | null; status: string | null; date: string | null; project_id: number; projects: { id: number; title: string | null; job_status: string | null; deleted_at: string | null } | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.projects && !r.projects.deleted_at && !r.projects.job_status);
  // A project may have several sheet rows: the latest row's status wins; mixed statuses are listed, not applied.
  const byProject = Map.groupBy(rows, (r) => r.project_id);
  const plan: { id: number; title: string; status: string; from: string }[] = [];
  const skipped: string[] = [];
  for (const [pid, rs] of byProject) {
    const statuses = [...new Set(rs.map((r) => r.status ?? "").filter(Boolean))];
    const latest = [...rs].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
    const title = rs[0].projects!.title ?? `#${pid}`;
    if (statuses.length > 1 && !statuses.every((s) => s === "Completed")) {
      skipped.push(`#${pid} ${title}: mixed sheet statuses ${statuses.join(" / ")}`);
      continue;
    }
    const target = MAP[latest.status ?? ""];
    if (!target) {
      skipped.push(`#${pid} ${title}: sheet says "${latest.status}" (decide by hand)`);
      continue;
    }
    plan.push({ id: pid, title, status: target, from: `${latest.number ?? ""} ${latest.title ?? ""} (${latest.status})`.trim() });
  }
  console.log(`${rows.length} sheet rows on ${byProject.size} projects without a Job Status`);
  console.log(`\nWould set (${plan.length}):`);
  for (const p of plan) console.log(`  #${p.id} ${p.title} → ${p.status}   [${p.from}]`);
  console.log(`\nLeft alone (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s}`);
  if (!APPLY) return console.log("\nDry run. Add --apply to write.");
  let done = 0;
  for (const p of plan) {
    const { error: e } = await db.from("projects").update({ job_status: p.status, updated_at: new Date().toISOString() }).eq("id", p.id).is("job_status", null);
    if (e) {
      console.error(`  #${p.id}: ${e.message}`);
      continue;
    }
    await db.from("audit_log").insert({ table_name: "projects", record_id: p.id, action: "update", actor: null, changes: { job_status: [null, p.status], filled_from: [null, `Sales sheet: ${p.from}`] } });
    done++;
  }
  console.log(`\n${done} projects updated.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
