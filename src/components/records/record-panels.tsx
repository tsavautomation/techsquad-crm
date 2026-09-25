"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FileText, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/dates";
import { createUploadAction } from "@/lib/records/field-actions";
import {
  addChecklistItemAction,
  addNoteAction,
  addPodFilesAction,
  deleteChecklistItemAction,
  deleteNoteAction,
  removePodFileAction,
  toggleChecklistItemAction,
  type ActionResult,
} from "@/lib/records/record-actions";
import { POD_FIELD, type FileItem } from "@/lib/records/values";
import { cn } from "@/lib/utils";

type Base = { table: string; id: number };

const INPUT = "w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.message);
      onOk?.();
      router.refresh();
    });
  return { pending, run };
}

// ---------------------------------------------------------------- notes

export type NoteView = { id: number; body: string; follow_up_date: string | null; created_at: string; author: string; canDelete: boolean };

export function NotesPanel({ table, id, notes, canAdd }: Base & { notes: NoteView[]; canAdd: boolean }) {
  const { pending, run } = useRun();
  const [body, setBody] = useState("");
  const [follow, setFollow] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {canAdd && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addNoteAction(table, id, body, follow || null), () => {
              setBody("");
              setFollow("");
            });
          }}
        >
          <textarea aria-label="New note" placeholder="Add a note…" rows={3} className={cn(INPUT, "py-2")} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden /> Follow up
              <input type="date" className={cn(INPUT, "h-11 w-auto")} value={follow} onChange={(e) => setFollow(e.target.value)} />
            </label>
            <button type="submit" disabled={pending || !body.trim()} className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-foreground px-4 text-sm text-background disabled:opacity-50">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Add note
            </button>
          </div>
        </form>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex items-start justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {n.author} · {formatDateTime(n.created_at)}
                  {n.follow_up_date && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">Follow up {formatDate(n.follow_up_date)}</span>}
                </span>
                {n.canDelete && (
                  <button type="button" disabled={pending} onClick={() => confirm("Delete this note?") && run(() => deleteNoteAction(table, id, n.id))} aria-label="Delete note" className="inline-flex size-8 items-center justify-center rounded hover:bg-muted">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- checklist

export type ChecklistView = { id: number; item: string; due_date: string | null; completed_at: string | null; source: string | null; canDelete: boolean };

export function ChecklistPanel({ table, id, items }: Base & { items: ChecklistView[] }) {
  const { pending, run } = useRun();
  const [text, setText] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.length === 0 && <li className="p-3 text-sm text-muted-foreground">No checklist items.</li>}
        {items.map((c) => (
          <li key={c.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              aria-label={c.item}
              checked={Boolean(c.completed_at)}
              disabled={pending}
              onChange={(e) => run(() => toggleChecklistItemAction(table, id, c.id, e.target.checked))}
            />
            <span className={cn("flex-1 text-sm whitespace-pre-wrap", c.completed_at && "text-muted-foreground line-through")}>
              {c.item}
              {c.source && <span className="ml-2 text-xs text-muted-foreground no-underline">from {c.source.replace(/_/g, " ").replace(":", " #")}</span>}
            </span>
            {c.due_date && <span className="text-xs text-muted-foreground">{formatDate(c.due_date)}</span>}
            {c.canDelete && (
              <button type="button" disabled={pending} onClick={() => run(() => deleteChecklistItemAction(table, id, c.id))} aria-label={`Remove ${c.item}`} className="inline-flex size-8 items-center justify-center rounded hover:bg-muted">
                <Trash2 className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addChecklistItemAction(table, id, text, null), () => setText(""));
        }}
      >
        <input aria-label="New checklist item" placeholder="Add an item…" className={cn(INPUT, "h-11")} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={pending || !text.trim()} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50">
          <Plus className="size-4" aria-hidden /> Add
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- files pod

export function FilesPod({ table, id, files, canAdd, canRemove }: Base & { files: FileItem[]; canAdd: boolean; canRemove: boolean }) {
  const { pending, run } = useRun();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const supabase = createClient();
    const done: FileItem[] = [];
    try {
      for (const file of [...list]) {
        const slot = await createUploadAction(table, POD_FIELD, id, { name: file.name, type: file.type, size: file.size });
        if (!slot.ok) {
          toast.error(slot.message);
          continue;
        }
        const { error } = await supabase.storage.from("attachments").uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || undefined });
        if (error) toast.error(`${file.name}: ${error.message}`);
        else done.push({ path: slot.path, name: file.name, mime: file.type || null, size: file.size });
      }
      if (done.length) run(() => addPodFilesAction(table, id, done), () => toast.success(`${done.length} file${done.length > 1 ? "s" : ""} added`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((x) => (
            <li key={x.id} className="relative overflow-hidden rounded-lg border">
              <a href={x.url} target="_blank" rel="noreferrer" className="block">
                {(x.mime ?? "").startsWith("image/") && x.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img src={x.url} alt={x.name} className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center">
                    <FileText className="size-6 text-muted-foreground" aria-hidden />
                    <span className="line-clamp-2 text-xs break-all">{x.name}</span>
                  </span>
                )}
              </a>
              {canRemove && (
                <button type="button" disabled={pending} onClick={() => confirm(`Remove ${x.name}?`) && run(() => removePodFileAction(table, id, x.id!))} aria-label={`Remove ${x.name}`} className="absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-full bg-background/90 shadow">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <>
          <button type="button" disabled={busy || pending} onClick={() => input.current?.click()} className="inline-flex h-11 w-fit items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
            {busy ? "Uploading…" : "Add files"}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
