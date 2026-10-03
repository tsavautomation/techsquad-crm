"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSkillsAction } from "@/lib/performance/actions";
import { LEVELS, SKILLS, skillsGrade } from "@/lib/performance/score";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const LETTER_TONE = { A: "bg-ok-bg text-ok-fg", B: "bg-info-bg text-info-fg", C: "bg-warn-bg text-warn-fg", D: "bg-bad-bg text-bad-fg" } as const;

/** Skills with three levels (P2-d): tap a dot to set, tap again to clear. */
export function SkillsGrid({ employeeId, initial, canEdit }: { employeeId: number; initial: Record<string, string>; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [skills, setSkills] = useState<Record<string, string | null>>(initial);
  const changed = SKILLS.some((s) => (skills[s] ?? null) !== (initial[s] ?? null));
  const g = skillsGrade(skills);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className={cn("inline-flex size-10 items-center justify-center rounded-xl text-[18px] font-bold", LETTER_TONE[g.letter])}>{g.letter}</span>
        <span className="text-[13px]">
          <b>{g.score}%</b> <span className="text-text-2">· {t("{points} of {max} points", { points: g.points, max: g.max })}</span>
          {g.steps.length > 0 && <span className="block text-xs text-text-2">{t("Next: {steps}", { steps: g.steps.slice(0, 3).map((s) => (s.from ? `${t(s.skill)} → ${t(s.to)}` : `${t("start")} ${t(s.skill)}`)).join(", ") })}</span>}
        </span>
      </div>
      <ul className="grid gap-x-4 sm:grid-cols-2">
        {SKILLS.map((skill) => {
          const level = skills[skill] ?? null;
          const idx = level ? LEVELS.indexOf(level as (typeof LEVELS)[number]) : -1;
          return (
            <li key={skill} className="flex min-h-11 items-center justify-between gap-2 text-[13px]">
              <span className={idx < 0 ? "text-text-2" : ""}>{t(skill)}</span>
              <span className="flex items-center gap-1" role="group" aria-label={t(skill)}>
                {LEVELS.map((l, i) => (
                  <button
                    key={l}
                    type="button"
                    disabled={!canEdit}
                    title={t(l)}
                    aria-label={`${t(skill)}: ${t(l)}`}
                    aria-pressed={i <= idx}
                    onClick={() => setSkills({ ...skills, [skill]: level === l ? null : l })}
                    className={cn("size-7 rounded-full border transition-colors", i <= idx ? "border-primary bg-primary" : "bg-muted", canEdit && "hover:border-primary")}
                  />
                ))}
                <span className="ml-1 w-14 text-xs text-text-2">{level ? t(level) : ""}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {canEdit && changed && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={pending}
            className="h-10 rounded-lg border border-foreground bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
            onClick={() =>
              start(async () => {
                const r = await saveSkillsAction(employeeId, skills);
                if (!r.ok) return void toast.error(t(r.message));
                toast.success(t("Skills saved"));
                router.refresh();
              })
            }
          >
            {t("Save skills")}
          </button>
          <button type="button" className="h-10 rounded-lg border px-4 text-sm hover:bg-muted" onClick={() => setSkills(initial)}>
            {t("Undo")}
          </button>
        </div>
      )}
    </div>
  );
}
