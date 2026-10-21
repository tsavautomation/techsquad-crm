"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setEventKindAction } from "@/lib/ai/actions";
import { EMAIL_KINDS, KIND_LABEL, type EmailKind } from "@/lib/ai/route-engine";
import { useT } from "@/i18n/client";

// F26-3: the office corrects what the AI read (or sets it when the AI did not run). An RFI / change order
// gets its request line; moving away from those takes an AI-made, still-open line off the project.

export function EventKindPicker({ eventId, kind }: { eventId: number; kind: EmailKind | null }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={kind ?? ""}
      disabled={pending}
      aria-label={t("What this email is")}
      onChange={(e) => {
        const next = e.target.value as EmailKind;
        if (!next) return;
        start(async () => {
          const r = await setEventKindAction(eventId, next);
          if (!r.ok) toast.error(t(r.message));
          else router.refresh();
        });
      }}
      className="h-8 rounded-md border bg-background px-2 text-xs"
    >
      {!kind && <option value="">{t("Not read yet")}</option>}
      {EMAIL_KINDS.map((k) => (
        <option key={k} value={k}>
          {t(KIND_LABEL[k])}
        </option>
      ))}
    </select>
  );
}
