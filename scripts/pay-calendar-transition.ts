/**
 * PC-a (Fred 2026-11-17): move every pay schedule to Thursday → Wednesday periods (Thursday = approval day, Friday = pay day).
 * The period under way ends one day early (on the Wednesday); the next ones start on the Thursday. Approved periods are
 * never touched: the script stops if one would change.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/pay-calendar-transition.ts            # dry run: the list to approve
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/pay-calendar-transition.ts --apply
 */
import { todayET } from "@/lib/dates";
import { loadAssignments, loadSchedules } from "@/lib/payroll/load";
import { CYCLE_DAYS, nextPeriod, periodFor, scheduleInForce, weekdayOf, type Period, type Schedule } from "@/lib/payroll/periods";
import { adminDb } from "@/lib/supabase/admin";

const fmt = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const show = (p: Period) => `${fmt(p.starts_on)}–${fmt(p.ends_on)} (pay ${fmt(p.pay_day)})`;

async function main() {
  const apply = process.argv.includes("--apply");
  const db = adminDb();
  const today = todayET();
  const [schedules, links, { data: emp }, { data: locked }] = await Promise.all([
    loadSchedules(db),
    loadAssignments(db),
    db.from("employees").select("id, title, clock_group").is("deleted_at", null).order("title"),
    db.from("pay_periods").select("schedule_id, starts_on, ends_on"),
  ]);
  const people = (emp ?? []) as { id: number; title: string | null; clock_group: string | null }[];
  const changes: { schedule: Schedule; reanchor: string }[] = [];
  for (const s of schedules.filter((x) => x.active && CYCLE_DAYS[x.frequency])) {
    const current = periodFor(s, today);
    if (weekdayOf(current.starts_on) === 4) {
      console.log(`\n${s.name}: already Thursday → Wednesday, nothing to change.`);
      continue;
    }
    // The first Thursday on or before the current period's last day becomes the first day of the next period.
    let reanchor = current.ends_on;
    while (weekdayOf(reanchor) !== 4) reanchor = new Date(Date.parse(`${reanchor}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const after: Schedule = { ...s, reanchor_on: reanchor };
    const hit = ((locked ?? []) as { schedule_id: number; starts_on: string; ends_on: string }[]).filter((p) => p.schedule_id === s.id && p.ends_on >= reanchor);
    if (hit.length) {
      console.log(`\n${s.name}: STOP, an approved period reaches ${reanchor}: ${hit.map((p) => `${p.starts_on}–${p.ends_on}`).join(", ")}`);
      continue;
    }
    const oldCur = current;
    const newCur = periodFor(after, today);
    const oldNext = nextPeriod(oldCur, s);
    const newNext = nextPeriod(newCur, after);
    const newNext2 = nextPeriod(newNext, after);
    console.log(`\n${s.name} (${s.frequency}): periods start on Thursday from ${reanchor}`);
    console.log(`  period under way : ${show(oldCur)}  →  ${show(newCur)}  (${Math.round((Date.parse(oldCur.ends_on) - Date.parse(newCur.ends_on)) / 86_400_000)} day shorter)`);
    console.log(`  next period      : ${show(oldNext)}  →  ${show(newNext)}`);
    console.log(`  the one after    : ${show(nextPeriod(oldNext, s))}  →  ${show(newNext2)}`);
    const members = people.filter((p) => scheduleInForce(links, p.id, oldCur.starts_on) === s.id);
    console.log(`  people (${members.length}):`);
    for (const p of members) console.log(`    ${(p.title ?? `#${p.id}`).padEnd(26)} ${(p.clock_group ?? "Field").padEnd(7)} ${show(oldCur)}  →  ${show(newCur)}   then ${show(newNext)}`);
    changes.push({ schedule: s, reanchor });
  }
  if (!apply) {
    console.log(`\nDry run: nothing changed. ${changes.length} schedule(s) would change. Run with --apply after the list is approved.`);
    return;
  }
  for (const c of changes) {
    const { error } = await db.from("pay_schedules").update({ reanchor_on: c.reanchor }).eq("id", c.schedule.id);
    console.log(error ? `${c.schedule.name}: ${error.message}` : `${c.schedule.name}: periods start on Thursday from ${c.reanchor}.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
