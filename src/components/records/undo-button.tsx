"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { undoChangeAction } from "@/lib/records/record-actions";
import { useT } from "@/i18n/client";

/** "Undo" on a history entry (F7): puts the fields that entry changed back, as a new audited change. */
export function UndoButton({ table, id, auditId }: { table: string; id: number; auditId: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await undoChangeAction(table, id, auditId);
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(r.skipped.length ? t("Undone, except fields changed since: {fields}", { fields: r.skipped.join(", ") }) : t("Change undone"));
          router.refresh();
        })
      }
      className="inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50"
    >
      <Undo2 className="size-3.5" aria-hidden /> {t("Undo")}
    </button>
  );
}
