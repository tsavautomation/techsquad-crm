"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { disconnectBouncieAction } from "@/lib/bouncie/actions";
import { useT } from "@/i18n/client";

/** The Disconnect button on Admin › Bouncie (asks first). */
export function BounciePanel() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex h-11 w-fit items-center rounded-[10px] border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
      onClick={() => {
        if (!confirm(t("Disconnect Bouncie? The map stops showing the vehicles until you connect again."))) return;
        start(async () => {
          const r = await disconnectBouncieAction();
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(t("Bouncie disconnected"));
          router.refresh();
        });
      }}
    >
      {t("Disconnect Bouncie")}
    </button>
  );
}
