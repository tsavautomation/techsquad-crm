"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createUploadAction, previewUrlAction } from "@/lib/records/field-actions";
import type { FileItem } from "@/lib/records/values";
import type { FieldDef } from "@/registry/types";

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
  const files = (Array.isArray(value) ? value : []) as FileItem[];
  const [busy, setBusy] = useState<string[]>([]);
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
    const supabase = createClient();
    const picked = single ? [list[0]] : [...list];
    for (const file of picked) {
      setBusy((b) => [...b, file.name]);
      try {
        const slot = await createUploadAction(table, f.name, recordId, { name: file.name, type: file.type, size: file.size });
        if (!slot.ok) {
          toast.error(slot.message);
          continue;
        }
        const { error } = await supabase.storage.from("attachments").uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || undefined });
        if (error) {
          toast.error(`${file.name}: ${error.message}`);
          continue;
        }
        const url = (await previewUrlAction(slot.path)) ?? undefined;
        const item: FileItem = { path: slot.path, name: file.name, mime: file.type || null, size: file.size, url };
        onChange(single ? [item] : [...filesRef.current, item]);
      } finally {
        setBusy((b) => b.filter((n) => n !== file.name));
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
                  className="absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-full bg-background/90 shadow"
                  aria-label={`Remove ${x.name}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {busy.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Uploading {busy.join(", ")}…
        </p>
      )}

      {!disabled && (single ? files.length === 0 : true) && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            id={`f-${f.name}`}
            onClick={() => pickRef.current?.click()}
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted"
          >
            <Paperclip className="size-4" aria-hidden />
            {imagesOnly ? "Choose photo" : "Choose files"}
          </button>
          {(imagesOnly || !f.fileTypes) && (
            <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted">
              <Camera className="size-4" aria-hidden />
              Take photo
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
        {f.fileTypes ? `Allowed: ${f.fileTypes.join(", ")}. ` : ""}Up to 50 MB per file.
      </p>
    </div>
  );
}
