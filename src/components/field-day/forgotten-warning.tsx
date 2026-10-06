"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { formatDate, formatDateTime, toDateTimeLocalET } from "@/lib/dates";
import type { FieldWarning } from "@/lib/field-day/warnings";
import { acknowledgeWarningsAction } from "@/lib/field-day/warnings-actions";
import { useT } from "@/i18n/client";

// F20: the big red warning the person sees before anything else, the day after a forgotten check-out,
// a forgotten clock-out or a missing Job Report. It covers the whole app until "I understand" is pressed.

export function ForgottenWarning({ items }: { items: FieldWarning[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!items.length) return null;
  const time = (iso: string | null) => (iso ? formatDateTime(toDateTimeLocalET(iso)).split(" ").slice(1).join(" ") : "");
  const line = (w: FieldWarning) => {
    const date = formatDate(w.day);
    const project = w.project ?? t("a job");
    if (w.kind === "forgot_checkout") return t("You never checked out of {project} on {date}. The system checked you out at {time}.", { project, date, time: time(w.closed_at) });
    if (w.kind === "forgot_clock_out") return t("You never clocked out on {date}. The system clocked you out at {time}.", { date, time: time(w.closed_at) });
    return t("No Job Report was filed for the visit to {project} on {date}. File it today.", { project, date });
  };
  const ack = () =>
    start(async () => {
      const r = await acknowledgeWarningsAction();
      if (!r.ok) setError(r.message);
      else router.refresh();
    });
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="forgotten-title" className="fixed inset-0 z-[200] flex items-center justify-center bg-red-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border-2 border-red-500 bg-red-600 p-5 text-white shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <TriangleAlert className="size-9 shrink-0" aria-hidden />
          <h2 id="forgotten-title" className="text-xl font-bold leading-tight">
            {t("Before you continue")}
          </h2>
        </div>
        <ul className="space-y-3 text-[15px] leading-snug">
          {items.map((w) => (
            <li key={w.id} className="rounded-xl bg-red-700/70 px-3 py-2.5">
              {line(w)}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-red-100">{t("Check out when you leave a job, clock out at the end of the day, and file the Job Report before you go home.")}</p>
        {error && <p className="mt-2 text-sm font-semibold">{error}</p>}
        <button type="button" onClick={ack} disabled={pending} className="mt-4 h-12 w-full rounded-xl bg-white text-base font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
          {pending ? t("Saving…") : t("I understand")}
        </button>
      </div>
    </div>
  );
}
