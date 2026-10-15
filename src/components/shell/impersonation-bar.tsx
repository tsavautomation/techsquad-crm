"use client";

import { useTransition } from "react";
import { Loader2, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { stopImpersonatingAction } from "@/lib/admin/impersonate-actions";
import { useT } from "@/i18n/client";

/** ADM-a: the amber bar at the top while an administrator is signed in as someone else. */
export function ImpersonationBar({ as, admin }: { as: string; admin: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div role="status" className="sticky top-0 z-[150] flex items-center justify-between gap-3 bg-warn-bg px-3.5 py-2 text-sm text-warn-fg md:px-7">
      <p className="min-w-0 truncate">
        <UserRoundCog className="mr-1.5 inline size-4 align-text-bottom" aria-hidden />
        {t("You are signed in as {as} ({admin})", { as, admin })}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await stopImpersonatingAction();
            if (r && !r.ok) toast.error(t(r.message));
          })
        }
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-warn-fg/40 bg-card px-3 text-[13px] font-semibold hover:brightness-95 disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Back to my account")}
      </button>
    </div>
  );
}
