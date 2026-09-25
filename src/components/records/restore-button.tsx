"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { restoreRecordAction } from "@/lib/records/record-actions";

export function RestoreButton({ table, id }: { table: string; id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await restoreRecordAction(table, id);
          if (!r.ok) return void toast.error(r.message);
          toast.success("Restored");
          router.refresh();
        })
      }
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50"
    >
      <RotateCcw className="size-4" aria-hidden /> Restore
    </button>
  );
}
