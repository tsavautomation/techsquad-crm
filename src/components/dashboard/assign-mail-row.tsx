"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { assignMailAction, ignoreMailAction, searchProjectsAction } from "@/lib/mail/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type MailToAssign = { id: number; received_at: string; from_name: string | null; from_email: string | null; subject: string | null; snippet: string | null; files: string[]; suggestions: { id: number; label: string }[] };

/** One email in Today › Emails to assign: who, subject, a line of text, the files, and the project picker. */
export function AssignMailRow({ mail }: { mail: MailToAssign }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<{ id: number; label: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(null);
  const [pending, start] = useTransition();

  // Suggestions a moment after typing stops; cleared as soon as the text changes or a project is picked.
  useEffect(() => {
    if (picked || q.trim().length < 2) return;
    const timer = setTimeout(() => void searchProjectsAction(q).then(setChoices), 250);
    return () => clearTimeout(timer);
  }, [q, picked]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(t(r.message));
      else router.refresh();
    });
  const who = mail.from_name ? `${mail.from_name} <${mail.from_email ?? ""}>` : (mail.from_email ?? "");

  return (
    <li className="rounded-xl border px-3 py-2 text-sm">
      <p className="font-semibold">{mail.subject || t("(no subject)")}</p>
      <p className="text-xs text-text-2">
        {who} · {formatDateTime(mail.received_at)}
      </p>
      {mail.snippet && <p className="mt-0.5 line-clamp-2 text-[13px] text-foreground/90">{mail.snippet}</p>}
      {mail.files.length > 0 && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-2">
          <Paperclip className="size-3" aria-hidden /> {mail.files.join(", ")}
        </p>
      )}
      {mail.suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-text-2">{t("Looks like:")}</span>
          {mail.suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => setPicked(s)} className={cn("min-h-8 rounded-full border px-2.5 hover:bg-muted", picked?.id === s.id && "border-primary bg-primary text-primary-foreground")}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="relative min-w-0 flex-1">
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
            className={cn("h-11 w-full rounded-[10px] border bg-background px-3 text-base", picked && "font-medium")}
          />
          {!picked && choices.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[10px] border bg-card shadow-float">
              {choices.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(c);
                      setChoices([]);
                    }}
                    className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-muted">
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={!picked || pending} onClick={() => picked && run(() => assignMailAction(mail.id, picked.id))} className="inline-flex h-11 items-center gap-1 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Assign")}
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => ignoreMailAction(mail.id))} className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
            {t("Ignore")}
          </button>
        </div>
      </div>
    </li>
  );
}
