"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { runHealthNowAction } from "@/lib/health/actions";
import { useT } from "@/i18n/client";

/** HC-a: the Run now button on Admin › Diagnostics. */
export function RunHealthNow() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      onClick={() =>
        start(async () => {
          const r = await runHealthNowAction();
          if (!r.ok) return void toast.error(t(r.message));
          const bad = r.report.checks.filter((c) => !c.ok && !c.skipped).length;
          if (bad) toast.warning(t("{n} checks failed", { n: bad }));
          else toast.success(t("Everything is working"));
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
      {t("Run now")}
    </button>
  );
}
