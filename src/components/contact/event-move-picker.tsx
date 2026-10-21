"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { moveMailAction, searchProjectsAction } from "@/lib/mail/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F26-2: an email filed under the wrong project moves to the right one — timeline entry, request line, task,
// OneDrive files and Gmail label go with it, and both briefs are rewritten.

export function EventMovePicker({ eventId }: { eventId: number }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<{ id: number; label: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || picked || q.trim().length < 2) return;
    const timer = setTimeout(() => void searchProjectsAction(q).then(setChoices), 250);
    return () => clearTimeout(timer);
  }, [q, picked, open]);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-md border px-2 text-xs hover:bg-muted">
        {t("Wrong project?")}
      </button>
    );
  return (
    <span className="relative inline-flex items-center gap-1">
      <input
        type="text"
        value={picked ? picked.label : q}
        onChange={(e) => {
          setPicked(null);
          setChoices([]);
          setQ(e.target.value);
        }}
        placeholder={t("Project name or #number")}
        aria-label={t("Project")}
        className={cn("h-8 w-56 rounded-md border bg-background px-2 text-xs", picked && "font-medium")}
      />
      {!picked && choices.length > 0 && (
        <ul className="absolute top-9 left-0 z-10 w-72 overflow-hidden rounded-[10px] border bg-card shadow-float">
          {choices.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setPicked(c);
                  setChoices([]);
                }}
                className="flex min-h-9 w-full items-center px-3 text-left text-xs hover:bg-muted"
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={!picked || pending}
        onClick={() =>
          picked &&
          start(async () => {
            const r = await moveMailAction(eventId, picked.id);
            if (!r.ok) toast.error(t(r.message));
            else {
              toast.success(t("Moved to {project}", { project: picked.label }));
              router.refresh();
            }
          })
        }
        className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending && <Loader2 className="size-3 animate-spin" aria-hidden />} {t("Move")}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-md border px-2 text-xs hover:bg-muted">
        {t("Cancel")}
      </button>
    </span>
  );
}
