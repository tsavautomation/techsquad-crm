"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";
import type { FileItem } from "@/lib/records/values";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const isImage = (x: FileItem) => (x.mime ?? "").startsWith("image/");
const isVideo = (x: FileItem) => (x.mime ?? "").startsWith("video/");
/** Photos and videos open in the viewer; other files (PDFs, documents) still open in a new tab. */
const inViewer = (x: FileItem) => !!x.url && (isImage(x) || isVideo(x));

type Props = {
  files: FileItem[];
  /** Signatures are drawn on white and shown whole rather than cropped to a square. */
  signature?: boolean;
  /** Something drawn over each tile, like the Files pod's remove button. */
  extra?: (file: FileItem) => ReactNode;
};

/**
 * Thumbnail grid for a record's files. Tapping a photo or video opens it full screen over the CRM
 * (SPEC §9.1 UI-l), with previous / next, swipe, keyboard arrows and Esc; the original can still be
 * downloaded from the viewer. Other file types open in a new tab as before.
 */
export function FileGallery({ files, signature, extra }: Props) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const media = files.filter(inViewer);

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {files.map((x) => {
          const idx = media.indexOf(x);
          const tile = isImage(x) && x.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img src={x.url} alt={x.name} className={cn("aspect-square w-full", signature ? "bg-white object-contain p-1" : "object-cover")} />
          ) : isVideo(x) && x.url ? (
            <video src={x.url} muted playsInline preload="metadata" className="aspect-square w-full bg-black object-cover" />
          ) : (
            <span className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center">
              <FileText className="size-6 text-muted-foreground" aria-hidden />
              <span className="line-clamp-2 text-xs break-all">{x.name}</span>
            </span>
          );
          return (
            <li key={x.id ?? x.path} className="relative overflow-hidden rounded-lg border">
              {idx >= 0 ? (
                <button type="button" onClick={() => setOpen(idx)} aria-label={t("Open {name}", { name: x.name })} className="block w-full hover:opacity-90">
                  {tile}
                </button>
              ) : (
                <a href={x.url} target="_blank" rel="noreferrer" className="block hover:opacity-90">
                  {tile}
                </a>
              )}
              {extra?.(x)}
            </li>
          );
        })}
      </ul>
      {open !== null && media[open] && <Viewer files={media} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function Viewer({ files, index, onIndex, onClose }: { files: FileItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useT();
  const file = files[index];
  const many = files.length > 1;
  const touchX = useRef<number | null>(null);
  const prev = useCallback(() => onIndex((index - 1 + files.length) % files.length), [index, files.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % files.length), [index, files.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowLeft") prev();
      else if (many && e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind must not scroll
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [many, prev, next, onClose]);

  // Dark enough to stay visible over a white photo.
  const ctl = "inline-flex size-11 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 hover:bg-black/80";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX);
        touchX.current = null;
        if (many && Math.abs(dx) > 50) (dx > 0 ? prev : next)();
      }}
    >
      <div className="flex items-center gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-sm">
          {many && <span className="mr-2 text-white/60">{t("{n} of {total}", { n: index + 1, total: files.length })}</span>}
          {file.name}
        </span>
        <a href={file.url} download={file.name} target="_blank" rel="noreferrer" aria-label={t("Download")} className={ctl}>
          <Download className="size-5" aria-hidden />
        </a>
        <button type="button" onClick={onClose} aria-label={t("Close")} className={ctl}>
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-3">
        {isVideo(file) ? (
          <video key={file.path} src={file.url} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          <img key={file.path} src={file.url} alt={file.name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        )}
        {many && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label={t("Previous")} className={cn(ctl, "absolute top-1/2 left-3 -translate-y-1/2")}>
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); next(); }} aria-label={t("Next")} className={cn(ctl, "absolute top-1/2 right-3 -translate-y-1/2")}>
              <ChevronRight className="size-6" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
