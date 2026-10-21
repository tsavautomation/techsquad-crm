"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { rebuildBriefAction } from "@/lib/ai/actions";
import { useT } from "@/i18n/client";

/** Project › Project brief: write it again now (one Claude call). */
export function BriefRebuild({ projectId, hasBrief }: { projectId: number; hasBrief: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await rebuildBriefAction(projectId);
          if (!r.ok) toast.error(t(r.message));
          else router.refresh();
        })
      }
      className="mt-3 inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {hasBrief ? t("Rewrite the brief") : t("Write the brief")}
    </button>
  );
}
