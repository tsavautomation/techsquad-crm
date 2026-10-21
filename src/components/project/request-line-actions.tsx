"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ackRequestAction, closeRequestAction, reopenRequestAction } from "@/lib/requests/actions";
import { useT } from "@/i18n/client";

// F26-1: the buttons on a request line — Done / Reopen for whoever may edit the project,
// "Got it" (hides the alert for me) and "Clear for everyone" for the alert's recipients.

export function RequestLineActions({ id, done, canModify, canAck }: { id: number; done: boolean; canModify: boolean; canAck: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(t(r.message));
      else router.refresh();
    });
  const cls = "inline-flex h-9 items-center gap-1 rounded-[10px] border px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-60";
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {canModify && !done && (
        <button type="button" disabled={pending} onClick={() => run(() => closeRequestAction(id))} className={`${cls} border-ok-fg/40 text-ok-fg`}>
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} {t("Mark done")}
        </button>
      )}
      {canModify && done && (
        <button type="button" disabled={pending} onClick={() => run(() => reopenRequestAction(id))} className={cls}>
          {t("Reopen")}
        </button>
      )}
      {canAck && (
        <>
          <button type="button" disabled={pending} onClick={() => run(() => ackRequestAction(id, "acknowledged"))} className={cls}>
            {t("Got it")}
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => ackRequestAction(id, "cleared"))} className={cls}>
            {t("Clear for everyone")}
          </button>
        </>
      )}
    </div>
  );
}
