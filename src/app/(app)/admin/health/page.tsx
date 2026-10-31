import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleMinus, TriangleAlert } from "lucide-react";
import { RunHealthNow } from "@/components/admin/health-panel";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, toDateTimeLocalET } from "@/lib/dates";
import { loadHealth } from "@/lib/health/checks";
import { reportState } from "@/lib/health/report";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: (await getT())("Diagnostics") };
}

/** Admin › Diagnostics (HC-a): the nightly check of every integration, and Run now. */
export default async function HealthPage() {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const report = await loadHealth();
  const now = new Date();
  const { stale, problems } = reportState(report, now.getTime());

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin" className="underline underline-offset-4">
          {t("Admin")}
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t("Diagnostics")}</h1>
      <p className="mb-4 text-sm text-text-2">{t("Every night at midnight the CRM checks each integration and the timer. When something is broken, or a whole day passes without a WhatsApp message, a warning shows on the Home page of the administrators.")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RunHealthNow />
        {report && (
          <span className="text-sm text-text-2">
            {t("Last run {time}", { time: formatDateTime(toDateTimeLocalET(report.ran_at)) })} · {report.by === "tick" ? t("automatic") : t("by hand")} · {(report.ms / 1000).toFixed(1)} s
          </span>
        )}
      </div>

      {stale && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {report ? t("The nightly diagnostic has not run since {time}. The timer itself may be down.", { time: formatDateTime(toDateTimeLocalET(report.ran_at)) }) : t("The diagnostic has never run.")}
        </p>
      )}

      {report ? (
        <ul className="divide-y rounded-2xl border bg-card shadow-card">
          {report.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 px-4 py-3">
              {c.skipped ? <CircleMinus className="mt-0.5 size-5 shrink-0 text-text-2" aria-hidden /> : c.ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok-fg" aria-hidden /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bad-fg" aria-hidden />}
              <div className="min-w-0">
                <p className={cn("text-[15px] font-medium", !c.ok && !c.skipped && "text-bad-fg")}>{t(c.label)}</p>
                {c.detail && <p className="text-[13px] text-text-2">{c.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{t("No report yet. Press Run now.")}</p>
      )}
      {problems.length > 0 && <p className="mt-3 text-sm text-text-2">{t("{n} checks failed", { n: problems.length })}</p>}
    </div>
  );
}
