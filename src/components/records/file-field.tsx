"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import type { Progress } from "@/lib/files/resumable";
import { uploadFile } from "@/lib/files/upload-file";
import type { FileItem } from "@/lib/records/values";
import type { FieldDef } from "@/registry/types";
import { useT } from "@/i18n/client";

type Props = {
  table: string;
  recordId: number | null;
  field: FieldDef;
  value: unknown;
  onChange: (v: FileItem[]) => void;
  disabled?: boolean;
};

const isImage = (x: FileItem) => (x.mime ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/i.test(x.name);

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Upload field: files go straight from the phone to storage (not through our server),
 * then become attachments when the record is saved.
 */
export function FileField({ table, recordId, field: f, value, onChange, disabled }: Props) {
  const t = useT();
  const files = (Array.isArray(value) ? value : []) as FileItem[];
  const [busy, setBusy] = useState<Record<string, Progress>>({});
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = (Array.isArray(value) ? value : []) as FileItem[];
  }, [value]);

  const imagesOnly = f.type === "image" || (f.fileTypes?.every((e) => ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(e)) ?? false);
  const accept = f.fileTypes ? f.fileTypes.map((e) => `.${e}`).join(",") : imagesOnly ? "image/*" : undefined;
  const single = f.type === "image"; // image fields hold one picture; upload fields hold many

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const picked = single ? [list[0]] : [...list];
    // Files go one after another so a weak phone connection isn't split between them.
    for (const file of picked) {
      setBusy((b) => ({ ...b, [file.name]: { sent: 0, total: file.size, state: "sending" } }));
      try {
        const r = await uploadFile(table, f.name, recordId, file, (p) => setBusy((b) => ({ ...b, [file.name]: p })));
        if (!r.ok) {
          toast.error(t(r.message));
          continue;
        }
        onChange(single ? [r.item] : [...filesRef.current, r.item]);
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[file.name];
          return next;
        });
      }
    }
  }

  const remove = (x: FileItem) => onChange(files.filter((y) => y !== x));

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((x) => (
            <li key={x.path} className="relative overflow-hidden rounded-lg border bg-muted/30">
              {isImage(x) && x.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, sizes unknown
                <img src={x.url} alt={x.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center">
                  <FileText className="size-6 text-muted-foreground" aria-hidden />
                  <span className="line-clamp-2 text-xs break-all">{x.name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatSize(x.size)}</span>
                </div>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(x)}
                  className="absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-full bg-card/90 shadow"
                  aria-label={`Remove ${x.name}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {Object.entries(busy).map(([name, p]) => (
        <UploadBar key={name} name={name} p={p} />
      ))}

      {!disabled && (single ? files.length === 0 : true) && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            id={`f-${f.name}`}
            onClick={() => pickRef.current?.click()}
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted"
          >
            <Paperclip className="size-4" aria-hidden />
            {t(imagesOnly ? "Choose photo" : "Choose files")}
          </button>
          {(imagesOnly || !f.fileTypes) && (
            <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted">
              <Camera className="size-4" aria-hidden />
              {t("Take photo")}
            </button>
          )}
        </div>
      )}
      <input
        ref={pickRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        multiple={!single}
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">
        {f.fileTypes ? `Allowed: ${f.fileTypes.join(", ")}. ` : ""}Big videos are fine: if the upload is interrupted it continues when you come back.
      </p>
    </div>
  );
}

/** Progress of one upload; "paused" while the phone is in a call, locked or offline. */
export function UploadBar({ name, p }: { name: string; p: Progress }) {
  const t = useT();
  const pct = p.total ? Math.floor((p.sent / p.total) * 100) : 0;
  return (
    <div className="rounded-[10px] border bg-card px-3 py-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="min-w-0 truncate">{name}</span>
        <span className={p.state === "paused" ? "shrink-0 text-warn-fg" : "shrink-0 text-muted-foreground"}>{p.state === "paused" ? t("Paused") : `${pct}%`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className={p.state === "paused" ? "h-full rounded-full bg-warn-fg/60" : "h-full rounded-full bg-primary transition-[width]"} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {p.state === "paused" && <p className="mt-1 text-xs text-warn-fg">{t("Interrupted. Keep the CRM open: it continues from {pct}% when the connection is back.", { pct })}</p>}
    </div>
  );
}
