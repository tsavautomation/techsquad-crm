import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDateTime, toDateTimeLocalET } from "@/lib/dates";
import { loadHealth } from "@/lib/health/checks";
import { reportState } from "@/lib/health/report";
import { getT } from "@/i18n/server";

// HC-a (Fred 2026-10-31): the warning sign on the administrators' Home page when the nightly diagnostic
// found a broken integration, a day without WhatsApp messages, or when it did not run at all.

export async function HealthWarning({ user, now }: { user: CurrentUser; now: number }) {
  if (!user.isSysadmin) return null;
  const report = await loadHealth().catch(() => null);
  const { stale, problems } = reportState(report, now);
  if (!stale && !problems.length) return null;
  const t = await getT();
  return (
    <Link href="/admin/health" className="mb-3.5 flex items-start gap-3 rounded-2xl border border-bad-fg/30 bg-bad-bg px-4 py-3 text-bad-fg shadow-card hover:opacity-90">
      <TriangleAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
      <span className="min-w-0 text-sm">
        <span className="block font-semibold">{problems.length ? t("{n} integrations need attention", { n: problems.length }) : t("The nightly diagnostic did not run")}</span>
        {problems.slice(0, 4).map((p) => (
          <span key={p.key} className="block">
            {t(p.label)}
            {p.detail ? `: ${p.detail}` : ""}
          </span>
        ))}
        {stale && (
          <span className="block">{report ? t("Last diagnostic {time}; the timer may be down.", { time: formatDateTime(toDateTimeLocalET(report.ran_at)) }) : t("The diagnostic has never run.")}</span>
        )}
      </span>
    </Link>
  );
}
