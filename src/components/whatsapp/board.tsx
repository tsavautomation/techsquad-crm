"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, CalendarPlus, FolderKanban, Loader2, MessageCircle, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { searchProjectsAction } from "@/lib/mail/actions";
import { assignWaProjectAction, muteChatAction, updateWaCardAction } from "@/lib/whatsapp/actions";
import type { WaCard } from "@/lib/whatsapp/load";
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, STATUSES, telHref, tone, type Tone } from "@/lib/whatsapp/triage-engine";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F28 WhatsApp board. One card per conversation (F28-b). Computers: one column per category (service calls,
// follow-ups, quotes, scheduling, FYI), urgent first in each. Phones: one list, urgent first. Every card is
// coloured by what it needs from us (red urgent, yellow follow-up, green nothing, grey finished), carries the
// status and the person on it, and can be tied to a project, which puts the thread on that project's timeline.
// The page refreshes itself every 20 seconds while it is on screen, so the whole team sees the same board.
// F28-c: a card set to done or dismissed leaves the board; Mute this chat silences a group; a service call tied
// to a project offers Schedule a visit (the visit form opens with the project and the request filled in).

const REFRESH_MS = 20_000;

const TONE: Record<Tone, string> = {
  bad: "border-l-bad-fg bg-bad-bg/60",
  warn: "border-l-warn-fg bg-warn-bg/60",
  ok: "border-l-ok-fg bg-ok-bg/60",
  muted: "border-l-border bg-muted/60 text-muted-foreground",
};

export function WaBoard({ cards, people, visitsNewHref }: { cards: WaCard[]; people: string[]; visitsNewHref: string }) {
  const t = useT();
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  if (!cards.length) return <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{t("No WhatsApp messages in this period.")}</p>;

  return (
    <>
      {/* Phones: one list, urgent first. */}
      <ul className="grid gap-3 md:hidden">
        {cards.map((card) => (
          <li key={card.id}>
            <Card card={card} people={people} visitsNewHref={visitsNewHref} showCategory />
          </li>
        ))}
      </ul>

      {/* Computers: a column per category. */}
      <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
        {CATEGORIES.map((c) => {
          const list = cards.filter((x) => x.category === c);
          return (
            <section key={c} className="flex min-w-[220px] flex-1 basis-0 flex-col gap-2 rounded-2xl bg-muted/60 p-2" aria-label={t(CATEGORY_LABEL[c])}>
              <h2 className="flex items-baseline justify-between px-1 pt-1 text-[13px] font-semibold tracking-tight">
                <span>
                  <span aria-hidden>{CATEGORY_ICON[c]}</span> {t(CATEGORY_LABEL[c])}
                </span>
                <span className="text-xs font-normal text-text-2 tabular-nums">{list.length}</span>
              </h2>
              {list.map((card) => (
                <Card key={card.id} card={card} people={people} visitsNewHref={visitsNewHref} />
              ))}
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-text-2">{t("Refreshes every 20 seconds.")}</p>
    </>
  );
}

function Card({ card, people, visitsNewHref, showCategory }: { card: WaCard; people: string[]; visitsNewHref: string; showCategory?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(card.status);
  const [who, setWho] = useState(card.assigned_to ?? "");
  const tn = tone({ category: card.category, priority: card.priority, status });

  const save = (patch: { status?: string; assigned_to?: string | null }) =>
    start(async () => {
      const r = await updateWaCardAction(card.id, patch);
      if (!r.ok) toast.error(r.message);
      // Done or dismissed: the card leaves the board (Show finished has it).
      else if (patch.status === "done" || patch.status === "dismissed") router.refresh();
    });
  const mute = () =>
    start(async () => {
      const r = await muteChatAction(card.chat);
      if (!r.ok) toast.error(r.message);
      else {
        toast.success(t("Chat muted. Undo under Muted chats."));
        router.refresh();
      }
    });
  const visitHref = `${visitsNewHref}?project_id=${card.project_id}&instructions=${encodeURIComponent([card.summary, card.details].filter(Boolean).join("\n").slice(0, 2000))}&back=${encodeURIComponent("/whatsapp")}`;

  const select = "h-11 min-w-0 flex-1 rounded-lg border bg-card px-2 text-[16px] md:h-9 md:text-[13px]";
  const name = card.customer ?? card.chat;

  return (
    <article className={cn("rounded-2xl border border-l-4 px-3.5 py-3 shadow-card", TONE[tn], pending && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight">{name}</p>
          <p className="text-xs text-text-2 tabular-nums">
            {formatDateTime(card.last_message_at)}
            {card.chat !== name && <> · {card.chat}</>}
            {" · "}
            <MessageCircle className="inline size-3 align-[-1px]" aria-hidden /> {card.message_count}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <button type="button" onClick={mute} disabled={pending} title={t("Mute this chat")} aria-label={t("Mute this chat")} className="inline-flex size-9 items-center justify-center rounded-md text-text-2 hover:bg-card hover:text-foreground md:size-7">
            <BellOff className="size-4" aria-hidden />
          </button>
          {showCategory && (
            <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] font-medium">
              <span aria-hidden>{CATEGORY_ICON[card.category]}</span> {t(CATEGORY_LABEL[card.category])}
            </span>
          )}
          {card.priority === "urgent" && status !== "done" && status !== "dismissed" && <span className="rounded-md bg-bad-fg px-1.5 py-0.5 text-[11px] font-semibold text-white uppercase">{t(PRIORITY_LABEL.urgent)}</span>}
        </div>
      </div>

      <p className="mt-1.5 text-[14px] leading-snug">{card.summary}</p>
      {card.ai_pending && <p className="mt-0.5 text-xs text-text-2">{t("New messages: the AI reads them once the chat goes quiet.")}</p>}
      {(card.system || card.phone) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {card.system && <span className="text-text-2">{card.system}</span>}
          {card.phone && (
            <a href={telHref(card.phone)} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline md:min-h-0">
              <Phone className="size-3.5" aria-hidden />
              {card.phone}
            </a>
          )}
        </p>
      )}
      {card.triage === "fallback" && !card.ai_pending && <p className="mt-1 text-xs text-warn-fg">{t("AI could not read this conversation: {reason}", { reason: card.triage_error ?? "?" })}</p>}

      <ProjectPick card={card} />
      {card.project_id && (card.category === "service_call" || card.category === "scheduling") && status !== "done" && status !== "dismissed" && (
        <Link href={visitHref} className="mt-2 inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-95 md:h-9 md:text-[13px]">
          <CalendarPlus className="size-4" aria-hidden /> {t("Schedule a visit")}
        </Link>
      )}

      <details className="mt-1.5 text-[13px]">
        <summary className="cursor-pointer text-text-2 hover:underline">{t("Details and the messages ({n})", { n: card.messages.length })}</summary>
        {card.details && <p className="mt-1">{card.details}</p>}
        <ol className="mt-1 grid gap-1">
          {card.messages.map((m) => (
            <li key={m.id} className="rounded-lg bg-card/80 px-3 py-1.5 whitespace-pre-wrap">
              <span className="text-xs text-text-2 tabular-nums">
                {formatDateTime(m.captured_at)} · {m.sender ?? card.chat}:{" "}
              </span>
              {m.body}
            </li>
          ))}
        </ol>
        <button type="button" onClick={mute} disabled={pending} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-text-2 hover:underline md:min-h-0">
          <BellOff className="size-3.5" aria-hidden /> {t("Mute this chat")}
        </button>
      </details>

      <div className="mt-2 flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-text-2">
          {t("Status")}
          <select
            className={select}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              save({ status: e.target.value });
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_LABEL[s])}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-text-2">
          {t("Assigned to")}
          <select
            className={select}
            value={who}
            onChange={(e) => {
              setWho(e.target.value);
              save({ assigned_to: e.target.value || null });
            }}
          >
            <option value="">{t("Nobody")}</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}

/** F28-b: which project the conversation is about. Type a name or #number, pick one; × takes it off the project. */
function ProjectPick({ card }: { card: WaCard }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<{ id: number; label: string }[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!editing || q.trim().length < 2) return;
    const timer = setTimeout(() => void searchProjectsAction(q).then(setChoices), 250);
    return () => clearTimeout(timer);
  }, [q, editing]);

  const assign = (projectId: number | null) =>
    start(async () => {
      const r = await assignWaProjectAction(card.id, projectId);
      if (!r.ok) toast.error(t(r.message));
      else {
        setEditing(false);
        setQ("");
        setChoices([]);
        router.refresh();
      }
    });

  if (card.project_id && !editing)
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px]">
        <FolderKanban className="size-3.5 shrink-0 text-text-2" aria-hidden />
        <Link href={`/projects/projects/${card.project_id}`} className="min-w-0 truncate font-medium text-primary hover:underline">
          {card.project_title ?? `#${card.project_id}`}
        </Link>
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-text-2 hover:underline">
          {t("Change")}
        </button>
        <button type="button" onClick={() => assign(null)} disabled={pending} aria-label={t("Take off the project")} className="inline-flex size-6 items-center justify-center rounded-md text-text-2 hover:bg-card">
          <X className="size-3.5" aria-hidden />
        </button>
      </p>
    );

  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-[13px] text-primary hover:underline md:min-h-0">
        <FolderKanban className="size-3.5" aria-hidden /> {t("Which project is this about?")}
      </button>
    );

  return (
    <div className="relative mt-1.5">
      <div className="flex gap-1">
        <input
          type="text"
          autoFocus
          value={q}
          onChange={(e) => {
            setChoices([]);
            setQ(e.target.value);
          }}
          placeholder={t("Project name or #number")}
          aria-label={t("Project")}
          className="h-11 min-w-0 flex-1 rounded-lg border bg-card px-3 text-[16px] md:h-9 md:text-[13px]"
        />
        <button type="button" onClick={() => setEditing(false)} aria-label={t("Close")} className="inline-flex size-11 items-center justify-center rounded-lg border bg-card md:size-9">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
        </button>
      </div>
      {choices.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[10px] border bg-card shadow-float">
          {choices.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => assign(c.id)} className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-muted">
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
