/**
 * SS-a (Fred 2026-11-18): the history. Every past day's visit with no "Left the job" gets one from the system, at
 * the time of whatever ended it: "On my way" to another job, "Arrived" at another job, the clock-out, or the end
 * of the day (23:59) when the day has none of those. Idempotent: a second run finds nothing to write.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-left-the-job.ts            # dry run: the list
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-left-the-job.ts --apply
 *   ... --from 2026-11-17 --to 2026-11-17                                                               # one stretch only
 */
import { toDateTimeLocalET, todayET } from "@/lib/dates";
import { projectLabel } from "@/lib/projects/label";
import { addDays, clock } from "@/lib/schedule/dates";
import { adminDb } from "@/lib/supabase/admin";
import { closeOpenStays } from "@/lib/time-clock/site-stays";

const REASON = { on_way: "on the way to another job", arrived: "arrived at another job", clock_out: "clock-out", end_of_day: "end of the day (no clock-out)" } as const;

async function main() {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const apply = process.argv.includes("--apply");
  const db = adminDb();
  const yesterday = addDays(todayET(), -1);
  const { data: first } = await db.from("time_entries").select("at").eq("kind", "visit_in").is("deleted_at", null).order("at").limit(1);
  const from = arg("--from") ?? (first?.[0] ? toDateTimeLocalET((first[0] as { at: string }).at).slice(0, 10) : yesterday);
  const to = arg("--to") ?? yesterday;
  if (to > yesterday) throw new Error("Past days only: --to must be before today.");

  const written = await closeOpenStays(null, from, to, { dryRun: !apply });
  const [{ data: emp }, { data: visits }] = await Promise.all([
    db.from("employee_names").select("id, title").in("id", [...new Set(written.map((w) => w.employee_id))]),
    db.from("visits").select("id, projects(id, title)").in("id", [...new Set(written.map((w) => w.visit_id))]),
  ]);
  const nameOf = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const jobOf = new Map(((visits ?? []) as unknown as { id: number; projects: { id: number; title: string | null } | null }[]).map((v) => [v.id, v.projects ? projectLabel(v.projects.title, v.projects.id) : `visit #${v.id}`]));
  const rows = written.map((w) => ({ day: toDateTimeLocalET(w.at).slice(0, 10), time: clock(toDateTimeLocalET(w.at).slice(11)), person: nameOf.get(w.employee_id) ?? `#${w.employee_id}`, job: jobOf.get(w.visit_id) ?? `visit #${w.visit_id}`, reason: REASON[w.reason], moved: w.moved })).sort((a, b) => (a.day + a.person + a.time < b.day + b.person + b.time ? -1 : 1));
  console.log(["Day", "Person", "Job", "Left the job at", "Because"].join("\t"));
  for (const r of rows) console.log([r.day, r.person, r.job, r.time, r.reason + (r.moved ? " (moved)" : "")].join("\t"));
  const byReason = Map.groupBy(rows, (r) => r.reason);
  console.log(`\n${from} → ${to}: ${rows.length} "Left the job" ${apply ? "written" : "to write (dry run, nothing changed)"}: ${[...byReason].map(([k, v]) => `${v.length} ${k}`).join(", ")}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
