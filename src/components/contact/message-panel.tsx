"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Mail, MessageSquareText, Phone } from "lucide-react";
import { toast } from "sonner";
import { logContactAction } from "@/lib/messages/actions";
import type { MessagePanelData } from "@/lib/messages/load";
import { fillTemplate, LANG_NAMES, mailLink, MSG_LANGS, smsLink, templateText, type MsgLang } from "@/lib/messages/templates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F4 "Contact the client" (SPEC §9.1 F4-c, F4-d): send a template through the phone's own Messages /
// Mail app (free; logged as an Interaction), or log a call. The message itself never leaves the phone.

const BOX = "w-full rounded-[10px] border bg-card px-3 text-base";
const CHIP = "inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-3 text-sm";

export function MessagePanel({ data, projectId }: { data: MessagePanelData; projectId: number | null }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"message" | "log">(data.templates.length ? "message" : "log");
  const [personId, setPersonId] = useState(data.people[0]?.id ?? 0);
  const [projId, setProjId] = useState(projectId ?? data.projects[0]?.id ?? 0);
  const person = data.people.find((p) => p.id === personId);
  const [key, setKey] = useState("");
  const [lang, setLang] = useState<MsgLang>(person?.lang ?? "en");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  // Log a call
  const [type, setType] = useState(data.types[0] ?? "Phone Call");
  const [result, setResult] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");

  if (!data.people.length) return <p className="text-sm text-muted-foreground">{t(projectId ? "Pick the Job Owner (client) on this project to message them or log calls." : "No contact to message.")}</p>;

  const fill = (k: string, l: MsgLang, pid: number, cid: number) => {
    const tpl = data.templates.find((x) => x.key === k);
    const who = data.people.find((p) => p.id === cid);
    const pr = data.projects.find((p) => p.id === pid);
    if (!tpl) return { subject: "", body: "" };
    const values = { first_name: who?.firstName, client_name: who?.name, project: pr?.title, address: pr?.address, plan: pr?.plan, visit_date: pr?.visitDate, visit_time: pr?.visitTime, sender: data.sender };
    const x = templateText(tpl, l);
    return { subject: fillTemplate(x.subject, values), body: fillTemplate(x.body, values) };
  };
  const pick = (next: { k?: string; l?: MsgLang; pid?: number; cid?: number }) => {
    const k = next.k ?? key;
    const cid = next.cid ?? personId;
    const l = next.l ?? (next.cid ? (data.people.find((p) => p.id === next.cid)?.lang ?? lang) : lang);
    const pid = next.pid ?? projId;
    setKey(k);
    setLang(l);
    setPersonId(cid);
    setProjId(pid);
    const f = fill(k, l, pid, cid);
    setBody(f.body);
    setSubject(f.subject);
  };

  const log = (how: "Text" | "Email") => {
    if (!data.canLog || !person) return;
    // Not awaited on purpose: the phone app opens straight away; the log is saved meanwhile.
    void logContactAction({ contactId: person.id, projectId: projId || null, type: how, notes: how === "Email" && subject ? `${subject}\n\n${body}` : body, template: key || null }).then((r) => {
      if (r.ok) {
        toast.success(t("Logged on {name}", { name: person.name }));
        router.refresh();
      } else toast.error(t(r.message));
    });
  };
  const saveLog = () =>
    start(async () => {
      const r = await logContactAction({ contactId: personId, projectId: projId || null, type, result, followUp, notes });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved."));
      setNotes("");
      setResult("");
      setFollowUp("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5" role="tablist">
        {data.templates.length > 0 && (
          <button type="button" role="tab" aria-selected={mode === "message"} onClick={() => setMode("message")} className={cn(CHIP, mode === "message" && "border-primary bg-primary/10 font-semibold text-primary")}>
            <MessageSquareText className="size-4" aria-hidden /> {t("Send a message")}
          </button>
        )}
        {data.canLog && (
          <button type="button" role="tab" aria-selected={mode === "log"} onClick={() => setMode("log")} className={cn(CHIP, mode === "log" && "border-primary bg-primary/10 font-semibold text-primary")}>
            <Phone className="size-4" aria-hidden /> {t("Log a call")}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          {t("To")}
          <select className={`${BOX} mt-1 h-11`} value={personId} onChange={(e) => pick({ cid: Number(e.target.value) })}>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {t(p.role)}
              </option>
            ))}
          </select>
        </label>
        {data.projects.length > (projectId ? 1 : 0) && (
          <label className="block text-sm">
            {t("Project")}
            <select className={`${BOX} mt-1 h-11`} value={projId} onChange={(e) => pick({ pid: Number(e.target.value) })}>
              {!projectId && <option value={0}>{t("(none)")}</option>}
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {mode === "message" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {data.templates.map((x) => (
              <button key={x.key} type="button" onClick={() => pick({ k: x.key })} className={cn(CHIP, "h-9", key === x.key && "border-primary bg-primary/10 font-semibold text-primary")}>
                {t(x.name)}
              </button>
            ))}
          </div>
          {key && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-sm" role="radiogroup" aria-label={t("Language")}>
                {MSG_LANGS.map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => pick({ l })} className={cn("h-9 rounded-full border px-3", lang === l && "border-primary bg-primary text-primary-foreground")}>
                    {LANG_NAMES[l]}
                  </button>
                ))}
                {person && person.lang !== lang && <span className="text-xs text-muted-foreground">{t("{name} prefers {lang}", { name: person.firstName, lang: LANG_NAMES[person.lang] })}</span>}
              </div>
              <textarea aria-label={t("Message")} value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={`${BOX} py-2`} />
              <div className="flex flex-wrap gap-2">
                {person?.phone ? (
                  <a href={smsLink(person.phone, body)} onClick={() => log("Text")} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground">
                    <MessageSquareText className="size-4" aria-hidden /> {t("Text")}
                  </a>
                ) : null}
                {person?.email ? (
                  <a href={mailLink(person.email, subject, body)} onClick={() => log("Email")} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-4 text-sm font-semibold">
                    <Mail className="size-4" aria-hidden /> {t("Email")}
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(body).then(() => toast.success(t("Copied. Paste it in WhatsApp or anywhere else.")))}
                  className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-4 text-sm"
                >
                  <Copy className="size-4" aria-hidden /> {t("Copy")}
                </button>
              </div>
              {person && !person.phone && !person.email && <p className="text-sm text-muted-foreground">{t("{name} has no phone or email on their contact.", { name: person.name })}</p>}
              {data.canLog && <p className="text-xs text-muted-foreground">{t("Text and Email open your phone's own app with the message filled in, and log it on the contact.")}</p>}
            </>
          )}
        </>
      ) : (
        <>
          {person?.phone && (
            <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-11 w-fit items-center gap-1.5 rounded-[10px] border px-4 text-sm font-semibold">
              <Phone className="size-4" aria-hidden /> {t("Call {name}", { name: person.firstName })}
            </a>
          )}
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Type")}>
            {data.types.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={type === x} onClick={() => setType(x)} className={cn(CHIP, "h-9", type === x && "border-primary bg-primary/10 font-semibold text-primary")}>
                {t(x)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              {t("Result")}
              <select className={`${BOX} mt-1 h-11`} value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="">—</option>
                {data.results.map((x) => (
                  <option key={x} value={x}>
                    {t(x)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              {t("Follow Up Date")}
              <input type="date" className={`${BOX} mt-1 h-11`} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </label>
          </div>
          <textarea aria-label={t("Notes")} placeholder={t("What was said…")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${BOX} py-2`} />
          <button type="button" disabled={pending} onClick={saveLog} className="h-11 w-fit rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {t("Save")}
          </button>
        </>
      )}
    </div>
  );
}
