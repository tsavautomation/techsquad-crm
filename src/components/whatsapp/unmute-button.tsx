"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { unmuteChatAction } from "@/lib/whatsapp/actions";
import { useT } from "@/i18n/client";

export function UnmuteButton({ chat }: { chat: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await unmuteChatAction(chat);
          if (!r.ok) toast.error(r.message);
          else router.refresh();
        })
      }
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Unmute")}
    </button>
  );
}
