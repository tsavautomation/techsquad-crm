"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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

/** Finger/mouse signature (TV Installation › Signature). Saved as a PNG attachment. */
export function SignaturePad({ table, recordId, field: f, value, onChange, disabled }: Props) {
  const files = (Array.isArray(value) ? value : []) as FileItem[];
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // Sharp lines on retina screens.
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, [files.length]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep the stroke even if the finger leaves the box
    } catch {
      // not supported for this pointer; drawing still works
    }
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDirty(true);
  }
  const end = () => (drawing.current = false);

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDirty(false);
  }

  async function accept() {
    const c = canvas.current!;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
      if (!blob) return;
      const name = "signature.png";
      const slot = await createUploadAction(table, f.name, recordId, { name, type: "image/png", size: blob.size });
      if (!slot.ok) return void toast.error(slot.message);
      const { error } = await createClient().storage.from("attachments").uploadToSignedUrl(slot.path, slot.token, blob, { contentType: "image/png" });
      if (error) return void toast.error(error.message);
      onChange([{ path: slot.path, name, mime: "image/png", size: blob.size, url: (await previewUrlAction(slot.path)) ?? undefined }]);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  if (files[0]) {
    return (
      <div className="flex items-end gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        {files[0].url && <img src={files[0].url} alt="Signature" className="h-28 rounded-lg border bg-white object-contain p-1" />}
        {!disabled && (
          <button type="button" onClick={() => onChange([])} className="h-11 rounded-lg border px-4 text-sm hover:bg-muted">
            Sign again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        id={`f-${f.name}`}
        aria-label="Sign here"
        className="h-40 w-full touch-none rounded-lg border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="flex gap-2">
        <button type="button" onClick={accept} disabled={!dirty || saving || disabled} className="inline-flex h-11 items-center gap-2 rounded-lg bg-foreground px-4 text-sm text-background disabled:opacity-50">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Use this signature
        </button>
        <button type="button" onClick={clear} disabled={!dirty || saving} className="h-11 rounded-lg border px-4 text-sm disabled:opacity-50">
          Clear
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Sign with your finger inside the box.</p>
    </div>
  );
}
