"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { acceptSuggestedEndAction } from "@/lib/time-clock/actions";
import { useT } from "@/i18n/client";

/** TS-a: accept the clock-out time the system suggested for a forgotten day (people who may edit Employees). */
export function AcceptSuggested({ entryId }: { entryId: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex h-9 basis-full items-center justify-center gap-1 rounded-md border border-warn-fg/40 bg-card px-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 sm:basis-auto"
      onClick={() =>
        start(async () => {
          const r = await acceptSuggestedEndAction(entryId);
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(t("Suggested time accepted"));
          router.refresh();
        })
      }
    >
      <Check className="size-3.5" aria-hidden />
      {t("Use suggested time")}
    </button>
  );
}
