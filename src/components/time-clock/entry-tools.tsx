"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { correctEntryAction, removeEntryAction } from "@/lib/time-clock/actions";
import { useT } from "@/i18n/client";

/** Correct an entry's time or remove it (people who may edit Employees). */
export function EntryTools({ id, time }: { id: number; time: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(time);
  const BTN = "inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50";

  if (editing)
    return (
      <span className="flex items-center gap-1">
        <input type="time" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-base" aria-label={t("New time")} />
        <button
          type="button"
          className={BTN}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await correctEntryAction(id, value);
              if (!r.ok) return void toast.error(t(r.message));
              toast.success(t("Time corrected"));
              setEditing(false);
              router.refresh();
            })
          }
        >
          {t("Save")}
        </button>
        <button type="button" className={BTN} onClick={() => setEditing(false)}>
          {t("Cancel")}
        </button>
      </span>
    );

  return (
    <span className="flex items-center gap-1">
      <button type="button" className={BTN} onClick={() => setEditing(true)} aria-label={t("Correct the time")}>
        <Pencil className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className={`${BTN} text-destructive`}
        disabled={pending}
        aria-label={t("Remove this entry")}
        onClick={() => {
          if (!confirm(t("Remove this entry?"))) return;
          start(async () => {
            const r = await removeEntryAction(id);
            if (!r.ok) return void toast.error(t(r.message));
            toast.success(t("Entry removed"));
            router.refresh();
          });
        }}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
