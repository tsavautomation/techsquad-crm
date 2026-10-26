// SV-d (Fred 2026-10-26): the visits and job reports still on the placeholder project SURVEY #1271, for the office
// to assign one by one with "Assign to project" (nothing is changed here: this is a dry run, always).
//
//   npx tsx scripts/survey-1271.ts            lists them
//   npx tsx scripts/survey-1271.ts --csv      writes docs/survey-1271.csv (git-ignored) as well
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const PROJECT = Number(process.env.SURVEY_PROJECT_ID ?? 1271);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const et = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }) : "");
const line = (a: { street?: string; city?: string; state?: string } | null) => [a?.street, a?.city, a?.state].filter(Boolean).join(", ");

async function main() {
  const { data: visits } = await db
    .from("visits")
    .select("id, starts_at, status, kind, billing, service_type, address, contact_name, contact_phone, instructions, technician_id")
    .eq("project_id", PROJECT)
    .is("deleted_at", null)
    .order("starts_at");
  const { data: reports } = await db.from("job_reports").select("id, date, result, visit_id, title, report").eq("project_id", PROJECT).is("deleted_at", null).order("date");
  const { data: tasks } = await db.from("tasks").select("id, status, details, job_report_id, visit_id").eq("project_id", PROJECT).is("deleted_at", null);
  type V = { id: number; starts_at: string; status: string | null; kind: string | null; billing: string | null; service_type: string | null; address: { street?: string; city?: string; state?: string } | null; contact_name: string | null; contact_phone: string | null; instructions: string | null; technician_id: number | null };
  type R = { id: number; date: string | null; result: string | null; visit_id: number | null; title: string | null; report: string | null };
  const vs = (visits ?? []) as unknown as V[];
  const { data: emp } = await db.from("employee_names").select("id, title");
  const tech = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const techOf = (v: V) => (v.technician_id ? (tech.get(v.technician_id) ?? "") : "");
  const rs = (reports ?? []) as R[];
  const byVisit = new Map<number, R[]>();
  for (const r of rs) if (r.visit_id) byVisit.set(r.visit_id, [...(byVisit.get(r.visit_id) ?? []), r]);

  console.log(`SURVEY project #${PROJECT}: ${vs.length} visits, ${rs.length} reports, ${(tasks ?? []).length} tasks. Nothing is changed by this script.\n`);
  const rows: string[][] = [["visit", "date", "status", "technician", "address", "contact", "instructions", "reports", "link"]];
  for (const v of vs) {
    const reps = byVisit.get(v.id) ?? [];
    const hint = (v.instructions ?? "").replace(/\s+/g, " ").slice(0, 80);
    console.log(`Visit #${v.id}  ${et(v.starts_at)}  ${v.status ?? ""}  ${techOf(v)}  ${line(v.address) || "(no address)"}  ${v.contact_name ?? ""}${hint ? `  "${hint}"` : ""}${reps.length ? `  reports: ${reps.map((r) => `#${r.id} ${r.result ?? "?"}`).join(", ")}` : ""}`);
    rows.push([String(v.id), et(v.starts_at), v.status ?? "", techOf(v), line(v.address), v.contact_name ?? "", hint, reps.map((r) => `#${r.id}`).join(" "), `https://techsquad-crm.vercel.app/schedule/visits/${v.id}`]);
  }
  const orphans = rs.filter((r) => !r.visit_id);
  if (orphans.length) {
    console.log(`\nReports without a visit:`);
    for (const r of orphans) console.log(`  Report #${r.id}  ${r.date ?? ""}  ${r.result ?? "?"}  ${r.title ?? ""}  https://techsquad-crm.vercel.app/forms/job-reports/${r.id}`);
  }
  if ((tasks ?? []).length) {
    console.log(`\nTasks on the placeholder (they move with their report / visit):`);
    for (const t of tasks as { id: number; status: string | null; details: string | null; job_report_id: number | null; visit_id: number | null }[]) console.log(`  Task #${t.id}  ${t.status ?? ""}  report ${t.job_report_id ?? "-"}  visit ${t.visit_id ?? "-"}  ${(t.details ?? "").replace(/\s+/g, " ").slice(0, 90)}`);
  }
  if (process.argv.includes("--csv")) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    writeFileSync("docs/survey-1271.csv", csv);
    console.log("\nWritten: docs/survey-1271.csv");
  }
  console.log("\nHow to assign: open the visit (link above) → Assign to project → existing project or New project; the report, hours, photos and tasks follow.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
