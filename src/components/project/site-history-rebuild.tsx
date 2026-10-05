"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { rebuildSiteHistoryAction } from "@/lib/ai/actions";
import { useT } from "@/i18n/client";

/** The "Build from the reports" button on the Site history card (F19-d). */
export function SiteHistoryRebuild({ projectId, hasSummary }: { projectId: number; hasSummary: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        className="inline-flex h-10 w-fit items-center gap-1.5 rounded-[10px] border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const r = await rebuildSiteHistoryAction(projectId);
            if (r.ok) {
              setMessage(null);
              router.refresh();
            } else setMessage(r.message);
          })
        }
      >
        <Sparkles className="size-4" aria-hidden /> {pending ? t("Reading the reports…") : hasSummary ? t("Rebuild from the last 30 reports") : t("Build from the last 30 reports")}
      </button>
      {message && <p className="rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{t(message)}</p>}
    </div>
  );
}
