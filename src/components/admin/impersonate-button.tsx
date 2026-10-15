"use client";

import { useTransition } from "react";
import { Loader2, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { impersonateAction } from "@/lib/admin/impersonate-actions";
import { useT } from "@/i18n/client";

/** ADM-a: "Sign in as this person" on a user's page, administrators only. */
export function ImpersonateButton({ userId, name }: { userId: string; name: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await impersonateAction(userId);
            if (r && !r.ok) toast.error(t(r.message));
          })
        }
        className="inline-flex h-11 w-fit items-center gap-1.5 rounded-[10px] border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserRoundCog className="size-4" aria-hidden />} {t("Sign in as {name}", { name })}
      </button>
      <p className="text-xs text-muted-foreground">{t("You will see the CRM exactly as this person does. A bar at the top brings you back to your own account. Each take-over is logged.")}</p>
    </div>
  );
}
