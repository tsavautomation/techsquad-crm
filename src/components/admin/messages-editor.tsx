"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveMessagesAction } from "@/lib/messages/actions";
import { LANG_NAMES, MSG_LANGS, TOKENS, type MessageSettings, type MessageTemplate } from "@/lib/messages/templates";
import { useT } from "@/i18n/client";

// Admin › Messages (F4): the review link and the message templates, one Save.

const BOX = "w-full rounded-lg border bg-card px-3 text-base";
const blank = (): MessageTemplate => ({ key: `custom_${Date.now().toString(36)}`, name: "", active: true, texts: { en: { subject: "", body: "" }, pt: { subject: "", body: "" }, es: { subject: "", body: "" } } });

export function MessagesEditor({ initial }: { initial: MessageSettings }) {
  const t = useT();
  const [s, setS] = useState<MessageSettings>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setTpl = (i: number, x: MessageTemplate) => setS({ ...s, templates: s.templates.map((y, j) => (j === i ? x : y)) });

  const save = () =>
    start(async () => {
      const r = await saveMessagesAction(s);
      setMsg(r.ok ? { ok: true, text: t("Saved.") } : { ok: false, text: t(r.message) });
    });

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <p className="text-sm text-muted-foreground">
          {t("Words you can use in a template:")} {TOKENS.map((x) => `{${x}}`).join(" ")}
        </p>
      </section>

      {s.templates.map((x, i) => (
        <section key={x.key} className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <input aria-label={t("Template name")} placeholder={t("Template name")} className={`${BOX} h-11 font-semibold`} value={x.name} onChange={(e) => setTpl(i, { ...x, name: e.target.value })} />
            <label className="flex h-11 shrink-0 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={x.active} onChange={(e) => setTpl(i, { ...x, active: e.target.checked })} />
              {t("In use")}
            </label>
            <button type="button" aria-label={t("Remove template")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border hover:bg-muted" onClick={() => setS({ ...s, templates: s.templates.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
          {MSG_LANGS.map((l) => (
            <fieldset key={l} className="mb-3 last:mb-0">
              <legend className="mb-1 text-sm font-medium">{LANG_NAMES[l]}</legend>
              <input aria-label={t("Email subject ({lang})", { lang: LANG_NAMES[l] })} placeholder={t("Email subject")} className={`${BOX} mb-1.5 h-11`} value={x.texts[l].subject} onChange={(e) => setTpl(i, { ...x, texts: { ...x.texts, [l]: { ...x.texts[l], subject: e.target.value } } })} />
              <textarea
                aria-label={t("Message ({lang})", { lang: LANG_NAMES[l] })}
                placeholder={l === "en" ? t("Message") : t("Message (blank = use the English)")}
                rows={4}
                className={`${BOX} py-2`}
                value={x.texts[l].body}
                onChange={(e) => setTpl(i, { ...x, texts: { ...x.texts, [l]: { ...x.texts[l], body: e.target.value } } })}
              />
            </fieldset>
          ))}
        </section>
      ))}

      <button type="button" onClick={() => setS({ ...s, templates: [...s.templates, blank()] })} className="inline-flex h-11 w-fit items-center gap-1.5 rounded-lg border px-4 text-sm hover:bg-muted">
        <Plus className="size-4" aria-hidden /> {t("Add a template")}
      </button>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:border-0 md:p-0">
        <Button type="button" className="h-11 flex-1 md:flex-none md:px-8" onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Save")}
        </Button>
        {msg && (
          <p role="status" className={msg.ok ? "text-sm text-ok-fg" : "text-sm text-destructive"}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
