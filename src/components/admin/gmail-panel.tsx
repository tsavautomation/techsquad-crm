"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { checkMailNowAction, disconnectGmailAction } from "@/lib/mail/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F26-2: the buttons under Status on Admin › Gmail intake.

const BTN = "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50";

export function GmailPanel() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  const check = () =>
    start(async () => {
      const r = await checkMailNowAction();
      if (!r.ok) return void toast.error(t(r.message));
      const s = r.summary;
      setLast(s.skipped ? t(s.skipped) : t("{read} new: {filed} on project timelines, {waiting} to assign, {moved} moved out of the inbox{texts}{errors}", { read: s.read, filed: s.filed, waiting: s.waiting, moved: s.moved, texts: s.texts ? ` · ${s.texts} ${t("texts to the WhatsApp board")}` : "", errors: s.errors.length ? ` · ${s.errors.length} ${t("errors")}` : "" }));
      router.refresh();
    });
  const off = () =>
    start(async () => {
      if (!window.confirm(t("Disconnect the mailbox? Emails already on the timelines stay; nothing new is read until it is connected again."))) return;
      const r = await disconnectGmailAction();
      if (!r.ok) toast.error(t(r.message));
      router.refresh();
    });

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={check} disabled={pending} className={cn(BTN, "bg-primary text-primary-foreground")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Check the mailbox now")}
        </button>
        <button type="button" onClick={off} disabled={pending} className={cn(BTN, "border font-medium hover:bg-muted")}>
          {t("Disconnect")}
        </button>
      </div>
      {last && <p className="text-xs text-text-2">{last}</p>}
    </div>
  );
}
