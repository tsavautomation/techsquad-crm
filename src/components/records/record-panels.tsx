"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FileText, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { Progress } from "@/lib/files/resumable";
import { uploadFile } from "@/lib/files/upload-file";
import { UploadBar } from "./file-field";
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
import { mentionQuery, splitMentions, type Mentionable } from "@/lib/records/mentions";
import { POD_FIELD, type FileItem } from "@/lib/records/values";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Base = { table: string; id: number };

const INPUT = "w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function useRun() {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(tr(r.message));
      onOk?.();
      router.refresh();
    });
  return { pending, run };
}

/** Links from the alerts bell end in #notes or #checklist: open that section and scroll to it. */
export function OpenFromLink() {
  useEffect(() => {
    const open = () => {
      const el = window.location.hash.length > 1 ? document.getElementById(window.location.hash.slice(1)) : null;
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

// ---------------------------------------------------------------- notes

export type NoteView = { id: number; body: string; follow_up_date: string | null; created_at: string; author: string; canDelete: boolean };

/** `people`: everyone who can be tagged (and whose @Name is highlighted); `meId` is left out of the picker. */
export function NotesPanel({ table, id, notes, canAdd, people, meId }: Base & { notes: NoteView[]; canAdd: boolean; people: Mentionable[]; meId: string }) {
  const tr = useT();
  const { pending, run } = useRun();
  const [body, setBody] = useState("");
  const [follow, setFollow] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [tagging, setTagging] = useState<{ start: number; query: string } | null>(null);
  const [pick, setPick] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const names = people.map((p) => p.name);

  const q = tagging?.query.toLowerCase() ?? "";
  const matches = tagging ? people.filter((p) => p.id !== meId).filter((p) => p.name.toLowerCase().split(" ").some((w, i, all) => all.slice(i).join(" ").startsWith(q))).slice(0, 6) : [];

  function typed(value: string, cursor: number) {
    setBody(value);
    setTagging(mentionQuery(value, cursor));
    setPick(0);
  }
  function choose(p: Mentionable) {
    if (!tagging || !box.current) return;
    const cursor = box.current.selectionStart;
    const next = `${body.slice(0, tagging.start)}@${p.name} ${body.slice(cursor)}`;
    const at = tagging.start + p.name.length + 2;
    setBody(next);
    setTagged((t) => (t.includes(p.id) ? t : [...t, p.id]));
    setTagging(null);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(at, at);
    });
  }
  function keys(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!matches.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setPick((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(matches[pick]);
    } else if (e.key === "Escape") setTagging(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {canAdd && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addNoteAction(table, id, body, follow || null, tagged), () => {
              setBody("");
              setFollow("");
              setTagged([]);
            });
          }}
        >
          <div className="relative">
            <textarea
              ref={box}
              aria-label={tr("New note")}
              placeholder={tr("Add a note… type @ to tag someone")}
              rows={3}
              className={cn(INPUT, "py-2")}
              value={body}
              onChange={(e) => typed(e.target.value, e.target.selectionStart)}
              onKeyDown={keys}
              onBlur={() => setTimeout(() => setTagging(null), 150)}
            />
            {matches.length > 0 && (
              <ul role="listbox" aria-label={tr("People to tag")} className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border bg-card p-1 shadow-float">
                {matches.map((p, i) => (
                  <li key={p.id} role="option" aria-selected={i === pick}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(p)}
                      className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[15px]", i === pick ? "bg-secondary" : "hover:bg-muted")}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {p.name
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden /> {tr("Follow up")}
              <input type="date" className={cn(INPUT, "h-11 w-auto")} value={follow} onChange={(e) => setFollow(e.target.value)} />
            </label>
            <button type="submit" disabled={pending || !body.trim()} className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-foreground px-4 text-sm text-background disabled:opacity-50">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {tr("Add note")}
            </button>
          </div>
        </form>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("No notes yet.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex items-start justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {n.author} · {formatDateTime(n.created_at)}
                  {n.follow_up_date && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">{tr("Follow up")} {formatDate(n.follow_up_date)}</span>}
                </span>
                {n.canDelete && (
                  <button type="button" disabled={pending} onClick={() => confirm(tr("Delete this note?")) && run(() => deleteNoteAction(table, id, n.id))} aria-label={tr("Delete note")} className="inline-flex size-8 items-center justify-center rounded hover:bg-muted">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap">
                {splitMentions(n.body, names).map((part, i) =>
                  part.tag ? (
                    <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
                      {part.text}
                    </span>
                  ) : (
                    part.text
                  ),
                )}
              </p>
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
  const tr = useT();
  const { pending, run } = useRun();
  const [text, setText] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.length === 0 && <li className="p-3 text-sm text-muted-foreground">{tr("No checklist items.")}</li>}
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
        <input aria-label={tr("New checklist item")} placeholder={tr("Add an item…")} className={cn(INPUT, "h-11")} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={pending || !text.trim()} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50">
          <Plus className="size-4" aria-hidden /> {tr("Add")}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- files pod

export function FilesPod({ table, id, files, canAdd, canRemove }: Base & { files: FileItem[]; canAdd: boolean; canRemove: boolean }) {
  const tr = useT();
  const { pending, run } = useRun();
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const busy = Object.keys(progress).length > 0;
  const input = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const done: FileItem[] = [];
    try {
      for (const file of [...list]) {
        setProgress((p) => ({ ...p, [file.name]: { sent: 0, total: file.size, state: "sending" } }));
        const r = await uploadFile(table, POD_FIELD, id, file, (x) => setProgress((p) => ({ ...p, [file.name]: x })));
        if (!r.ok) toast.error(tr(r.message));
        else done.push(r.item);
      }
      if (done.length) run(() => addPodFilesAction(table, id, done), () => toast.success(`${done.length} file${done.length > 1 ? "s" : ""} added`));
    } finally {
      setProgress({});
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("No files attached.")}</p>
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
                <button type="button" disabled={pending} onClick={() => confirm(tr("Remove {name}?", { name: x.name })) && run(() => removePodFileAction(table, id, x.id!))} aria-label={tr("Remove {name}", { name: x.name })} className="absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-full bg-card/90 shadow">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {Object.entries(progress).map(([name, p]) => (
        <UploadBar key={name} name={name} p={p} />
      ))}
      {canAdd && (
        <>
          <button type="button" disabled={busy || pending} onClick={() => input.current?.click()} className="inline-flex h-11 w-fit items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
            {tr(busy ? "Uploading…" : "Add files")}
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
