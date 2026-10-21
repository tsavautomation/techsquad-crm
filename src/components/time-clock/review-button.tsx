"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { reviewShiftAction } from "@/lib/time-clock/actions";
import { useT } from "@/i18n/client";

/** TC-b: mark a flagged shift as looked at (or take the mark back). People who may edit Employees. */
export function ReviewButton({ entryId, reviewed }: { entryId: number; reviewed: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={reviewed ? "inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs text-text-2 hover:bg-muted disabled:opacity-50" : "inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"}
      onClick={() =>
        start(async () => {
          const r = await reviewShiftAction(entryId, !reviewed);
          if (!r.ok) return void toast.error(t(r.message));
          router.refresh();
        })
      }
    >
      {reviewed ? (
        t("Undo review")
      ) : (
        <>
          <Check className="size-3.5" aria-hidden />
          {t("Mark as reviewed")}
        </>
      )}
    </button>
  );
}
