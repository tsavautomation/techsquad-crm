"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { decideCorrectionAction, requestCorrectionAction } from "@/lib/field-day/correction-actions";
import type { CorrectionField } from "@/lib/field-day/corrections";
import { useT } from "@/i18n/client";

// F22-a: the technician's "Ask for a correction" form and the approver's Approve / Reject buttons.

const BOX = "w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function CorrectionForm({ visitId, options }: { visitId: number; options: { field: CorrectionField; label: string; current: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<CorrectionField>(options[0]?.field ?? "checked_in_at");
  const [when, setWhen] = useState(options[0]?.current ?? "");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!options.length) return null;

  const pick = (f: CorrectionField) => {
    setField(f);
    setWhen(options.find((o) => o.field === f)?.current ?? "");
  };
  const submit = () =>
    start(async () => {
      const r = await requestCorrectionAction(visitId, field, when, reason);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Correction requested. The office will review it."));
      setOpen(false);
      setReason("");
      router.refresh();
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[13px] hover:bg-muted">
        <Clock className="size-4" aria-hidden /> {t("Ask for a time correction")}
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block text-sm font-medium">
        {t("Which time")}
        <select className={`${BOX} mt-1 h-11`} value={field} onChange={(e) => pick(e.target.value as CorrectionField)}>
          {options.map((o) => (
            <option key={o.field} value={o.field}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t("Right time")}
        <input type="datetime-local" required className={`${BOX} mt-1 h-11`} value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        {t("Why")}
        <textarea required rows={2} maxLength={500} className={`${BOX} mt-1 py-2`} placeholder={t("E.g. I forgot to check out when I left at 4:30")} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {t("Send request")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}

export function DecideButtons({ id }: { id: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const decide = (decision: "approve" | "reject") =>
    start(async () => {
      const note = decision === "reject" ? (prompt(t("Why is it rejected? (optional)")) ?? "") : "";
      const r = await decideCorrectionAction(id, decision, note);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(decision === "approve" ? t("Time corrected.") : t("Request rejected."));
      router.refresh();
    });
  return (
    <span className="flex gap-2">
      <button type="button" disabled={pending} onClick={() => decide("approve")} className="inline-flex h-9 items-center gap-1 rounded-lg bg-ok-bg px-3 text-[13px] font-semibold text-ok-fg disabled:opacity-50">
        <Check className="size-4" aria-hidden /> {t("Approve")}
      </button>
      <button type="button" disabled={pending} onClick={() => decide("reject")} className="inline-flex h-9 items-center gap-1 rounded-lg bg-bad-bg px-3 text-[13px] font-semibold text-bad-fg disabled:opacity-50">
        <X className="size-4" aria-hidden /> {t("Reject")}
      </button>
    </span>
  );
}
