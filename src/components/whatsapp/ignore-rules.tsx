"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addIgnoreRuleAction, deleteIgnoreRuleAction } from "@/lib/whatsapp/actions";
import type { IgnoreRuleRow } from "@/lib/whatsapp/load";
import { useT } from "@/i18n/client";

// F28-d WhatsApp › Muted chats › Ignored messages: a chat (or any) plus a text; matching messages make no card.

export function IgnoreRules({ rules }: { rules: IgnoreRuleRow[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chat, setChat] = useState("");
  const [text, setText] = useState("");

  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(t(r.message));
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <section className="mt-6">
      <h2 className="text-[17px] font-semibold tracking-tight">{t("Ignored messages")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("Messages containing this text make no card. Leave the chat blank to apply to every chat. Capitals and accents do not matter.")}</p>
      {rules.length > 0 && (
        <ul className="mb-3 divide-y rounded-2xl border bg-card shadow-card">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 text-sm">
                <p className="truncate">
                  <span className="font-medium">{r.chat ?? t("Any chat")}</span>
                  <span className="text-text-2"> · </span>
                  <code className="rounded bg-muted px-1 py-0.5 text-[13px]">{r.pattern}</code>
                  {r.kind === "regex" && <span className="ml-1 text-xs text-text-2">{t("(pattern)")}</span>}
                </p>
                {r.note && <p className="text-xs text-text-2">{r.note}</p>}
              </div>
              <button type="button" disabled={pending} onClick={() => run(() => deleteIgnoreRuleAction(r.id))} aria-label={t("Remove rule")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-60">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addIgnoreRuleAction(chat, text),
            () => {
              setChat("");
              setText("");
            },
          );
        }}
      >
        <input type="text" value={chat} onChange={(e) => setChat(e.target.value)} placeholder={t("Chat or group name (blank = any)")} aria-label={t("Chat")} className="h-11 min-w-0 flex-1 rounded-[10px] border bg-background px-3 text-base" />
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Text to ignore")} aria-label={t("Text to ignore")} required className="h-11 min-w-0 flex-1 rounded-[10px] border bg-background px-3 text-base" />
        <button type="submit" disabled={pending || !text.trim()} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} {t("Add rule")}
        </button>
      </form>
    </section>
  );
}
