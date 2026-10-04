"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { disconnectOneDriveAction, moveFilesBatchAction, writePdfsBatchAction } from "@/lib/files/onedrive-admin";
import { useT } from "@/i18n/client";

/** Disconnect and "move existing files" buttons for Admin › OneDrive. */
export function OneDrivePanel({ connected, toMove, pdfsToWrite = 0 }: { connected: boolean; toMove: number; pdfsToWrite?: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moving, setMoving] = useState<{ moved: number; left: number } | null>(null);
  const [writing, setWriting] = useState<{ written: number; left: number } | null>(null);

  // PDF copies for records saved before this existed (SPEC §9.1 OD-c); the hourly tick also chips away at them.
  const writeAll = () =>
    start(async () => {
      let total = 0;
      for (let round = 0; round < 400; round++) {
        const r = await writePdfsBatchAction();
        if (!r.ok) return void toast.error(t(r.message));
        total += r.written ?? 0;
        setWriting({ written: total, left: r.left ?? 0 });
        if (r.failed?.length) toast.error(`${t("Some PDFs weren't written:")} ${r.failed.join("; ")}`);
        if (!r.left || !r.written) break;
      }
      toast.success(t("{n} PDF copies written to OneDrive", { n: total }));
      router.refresh();
    });

  const moveAll = () =>
    start(async () => {
      let total = 0;
      for (let round = 0; round < 200; round++) {
        const r = await moveFilesBatchAction();
        if (!r.ok) return void toast.error(t(r.message));
        total += r.moved ?? 0;
        setMoving({ moved: total, left: r.left ?? 0 });
        if (r.failed?.length) toast.error(`${t("Some files didn't move:")} ${r.failed.join("; ")}`);
        if (!r.left || !r.moved) break;
      }
      toast.success(`${total} file${total === 1 ? "" : "s"} moved to OneDrive`);
      router.refresh();
    });

  if (!connected) return null;
  return (
    <div className="flex flex-col gap-3">
      {toMove > 0 && (
        <div className="rounded-xl border bg-muted px-4 py-3">
          <p className="text-sm">
            <b>{toMove}</b> file{toMove === 1 ? " is" : "s are"} still in the CRM&apos;s own storage. Move {toMove === 1 ? "it" : "them"} into the project folders in OneDrive (signatures stay in the CRM).
          </p>
          <button type="button" disabled={pending} onClick={moveAll} className="mt-2 h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {moving ? t("Moving… {done} done, {left} left", { done: moving.moved, left: moving.left }) : t("Move existing files to OneDrive")}
          </button>
        </div>
      )}
      {pdfsToWrite > 0 && (
        <div className="rounded-xl border bg-muted px-4 py-3">
          <p className="text-sm">{t("{n} records have no PDF copy in OneDrive yet (or an outdated one). Writing them takes a few seconds each; you can stop and come back, and the hourly check carries on by itself.", { n: pdfsToWrite })}</p>
          <button type="button" disabled={pending} onClick={writeAll} className="mt-2 h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {writing ? t("Writing… {done} done, {left} left", { done: writing.written, left: writing.left }) : t("Write the PDF copies now")}
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t("Disconnect OneDrive? New uploads go back to the CRM's own storage (50 MB limit). Files already in OneDrive stay there but can't be opened from the CRM until you reconnect the same account."))) return;
          start(async () => {
            const r = await disconnectOneDriveAction();
            if (!r.ok) return void toast.error(t(r.message));
            toast.success(t("OneDrive disconnected"));
            router.refresh();
          });
        }}
        className="h-11 w-fit rounded-[10px] border bg-card px-4 text-sm hover:bg-muted"
      >
        {t("Disconnect")}
      </button>
    </div>
  );
}
