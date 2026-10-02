import Link from "next/link";
import { Award, ChevronDown } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { myEmployeeIds } from "@/lib/field-day/load";
import { LEVELS, SKILLS, skillsGrade } from "@/lib/performance/score";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

// P2-f: the signed-in person's own skills grade on Today, with what to work on next.

const LETTER_TONE = { A: "bg-ok-bg text-ok-fg", B: "bg-info-bg text-info-fg", C: "bg-warn-bg text-warn-fg", D: "bg-bad-bg text-bad-fg" } as const;

export async function MySkills({ user }: { user: CurrentUser }) {
  const db = await recordsDb();
  const [employeeId] = await myEmployeeIds(db, user);
  if (!employeeId) return null;
  const [tr, { data }] = await Promise.all([getT(), db.from("employee_skills").select("skill, level").eq("employee_id", employeeId)]);
  const skills = Object.fromEntries(((data ?? []) as { skill: string; level: string }[]).map((s) => [s.skill, s.level]));
  const g = skillsGrade(skills);
  const employeesT = getTable("employees");
  const rated = SKILLS.filter((s) => skills[s]);

  return (
    <details className="group scroll-mt-20 rounded-2xl border bg-card shadow-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-[20px] font-bold", LETTER_TONE[g.letter])}>{g.letter}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
              <Award className="size-4 text-primary" aria-hidden /> {tr("My skills")}
            </span>
            <span className="block text-[12.5px] text-text-2">{rated.length ? tr("{score}% · {points} of {max} points · {n} skills rated", { score: g.score, points: g.points, max: g.max, n: rated.length }) : tr("Not rated yet — ask the office to fill in your skills.")}</span>
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t px-[18px] py-3">
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {SKILLS.map((skill) => {
            const idx = skills[skill] ? LEVELS.indexOf(skills[skill] as (typeof LEVELS)[number]) : -1;
            return (
              <li key={skill} className="flex min-h-9 items-center justify-between gap-2 text-[13px]">
                <span className={idx < 0 ? "text-text-2" : ""}>{tr(skill)}</span>
                <span className="flex items-center gap-1">
                  {LEVELS.map((l, i) => (
                    <span key={l} className={cn("size-2.5 rounded-full", i <= idx ? "bg-primary" : "bg-muted")} />
                  ))}
                  <span className="ml-1 w-16 text-[11px] text-text-2">{idx >= 0 ? tr(LEVELS[idx]) : ""}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {g.steps.length > 0 && (
          <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[13px]">
            <p className="mb-1 font-semibold">{tr("How to improve")}</p>
            <ol className="list-decimal pl-5">
              {g.steps.slice(0, 5).map((s) => (
                <li key={s.skill}>{s.from ? tr("{skill}: from {from} to {to}", { skill: tr(s.skill), from: tr(s.from), to: tr(s.to) }) : tr("Start on {skill} (reach {to})", { skill: tr(s.skill), to: tr(s.to) })}</li>
              ))}
            </ol>
            <p className="mt-1 text-[12px] text-muted-foreground">{tr("Each skill is worth up to 3 points: Learning 1, Can do 2, Expert 3. Grades: A 85%+, B 70%+, C 55%+, D below.")}</p>
          </div>
        )}
        {canOpen(user.permissions, employeesT, getTable) && (
          <p className="mt-2 text-[12.5px]">
            <Link href={recordHref(employeesT, employeeId)} className="text-primary underline underline-offset-2">
              {tr("My employee record")}
            </Link>
          </p>
        )}
      </div>
    </details>
  );
}
