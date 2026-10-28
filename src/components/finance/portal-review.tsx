"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { searchProjectsAction } from "@/lib/mail/actions";
import { contactMatchesAction, createProjectFromProposalAction, ignoreProposalAction, keepProposalAction, linkProposalAction, organizationByNameAction, refreshFromPortalAction, refreshProposalAction, replaceProposalAction, searchContactsAction, type NewContactInput } from "@/lib/portalio/actions";
import type { ContactMatch } from "@/lib/portalio/match";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// PI-c / PI-d / PI-e (SPEC §9.1): one card per accepted Portal.io proposal to deal with. The person decides
// everything: which project (suggestions are chips), whether a client exists (matches are offered, never applied),
// and what to do when a linked proposal changed (Refresh / Replace / Keep as is).

export type ReviewCardData = {
  id: number;
  number: number | null;
  name: string | null;
  total: number | null;
  accepted_at: string | null;
  customer: { firstName?: string | null; lastName?: string | null; companyName?: string | null; email?: string | null; phone?: string | null } | null;
  location: { street?: string | null; suite?: string | null; city?: string | null; stateAbbrev?: string | null; postalCode?: string | null } | null;
  suggestions: { id: number; title: string; reason: string; score: number }[];
  kind: "new" | "changed";
  changes: { total?: [number | null, number | null]; name?: [string | null, string | null]; change_orders?: [number, number] } | null;
  project_id: number | null;
  projectTitle: string | null;
  projectHref: string | null;
  portalUrl: string;
};

const money = (n: number | null | undefined) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50";
const PRIMARY = cn(BTN, "bg-primary text-primary-foreground");
const PLAIN = cn(BTN, "border font-medium hover:bg-muted");
const INPUT = "h-11 w-full rounded-[10px] border bg-background px-3 text-base";

type Res = { ok: true } | { ok: false; message: string };

export function PortalReview({ cards, compact }: { cards: ReviewCardData[]; compact?: boolean }) {
  if (!cards.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {cards.map((c) => (
        <li key={c.id}>{c.kind === "new" ? <NewCard card={c} compact={compact} /> : <ChangedCard card={c} />}</li>
      ))}
    </ul>
  );
}

function Head({ card }: { card: ReviewCardData }) {
  const t = useT();
  const c = card.customer;
  const who = [[c?.firstName, c?.lastName].filter(Boolean).join(" "), c?.companyName].filter(Boolean).join(" · ");
  const l = card.location;
  const where = l ? [[l.street, l.suite].filter(Boolean).join(" "), l.city, l.stateAbbrev, l.postalCode].filter(Boolean).join(", ") : "";
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">
          #{card.number ?? card.id} · {card.name || t("(no name)")}
        </span>
        <b className="text-[15px]">{money(card.total)}</b>
        <a href={card.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Portal.io <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
      <p className="text-xs text-text-2">
        {card.accepted_at ? `${t("Accepted")} ${formatDate(card.accepted_at)}` : ""}
        {who ? ` · ${who}` : ""}
        {c?.email ? ` · ${c.email}` : ""}
        {c?.phone ? ` · ${c.phone}` : ""}
      </p>
      {where && <p className="text-xs text-text-2">{where}</p>}
    </>
  );
}

/** PI-c: an accepted proposal with no Transaction yet. */
function NewCard({ card, compact }: { card: ReviewCardData; compact?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<{ id: number; label: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (picked || q.trim().length < 2) return;
    const timer = setTimeout(() => void searchProjectsAction(q).then(setChoices), 250);
    return () => clearTimeout(timer);
  }, [q, picked]);

  const run = (fn: () => Promise<Res>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(t(r.message));
      else {
        if (done) toast.success(done);
        router.refresh();
      }
    });

  return (
    <div className="rounded-xl border px-3 py-2 text-sm">
      <Head card={card} />
      {card.suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-text-2">{t("Looks like:")}</span>
          {card.suggestions.map((s) => (
            <button key={s.id} type="button" title={t(s.reason)} onClick={() => setPicked({ id: s.id, label: s.title })} className={cn("min-h-8 rounded-full border px-2.5 hover:bg-muted", picked?.id === s.id && "border-primary bg-primary text-primary-foreground")}>
              {s.title} <span className="opacity-70">· {t(s.reason)}</span>
            </button>
          ))}
        </div>
      )}
      {!creating && (
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
              className={cn(INPUT, picked && "font-medium")}
            />
            {!picked && choices.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[10px] border bg-card shadow-float">
                {choices.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => (setPicked(c), setChoices([]))} className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-muted">
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!picked || pending} onClick={() => picked && run(() => linkProposalAction(card.id, picked.id), t("Approved Proposal transaction created."))} className={PRIMARY}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Link to project")}
            </button>
            {!compact && (
              <button type="button" disabled={pending} onClick={() => setCreating(true)} className={PLAIN}>
                {t("New project")}
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => run(() => ignoreProposalAction(card.id))} className={PLAIN}>
              {t("Ignore")}
            </button>
          </div>
        </div>
      )}
      {creating && <NewProjectBox card={card} onClose={() => setCreating(false)} />}
    </div>
  );
}

/** PI-d: the Job Owner is picked (matches offered, never applied) or typed in by the person; the project follows. */
function NewProjectBox({ card, onClose }: { card: ReviewCardData; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [matches, setMatches] = useState<ContactMatch[] | null>(null);
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<{ id: number; label: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(null);
  const c = card.customer;
  const [form, setForm] = useState<NewContactInput>({ first_name: c?.firstName ?? "", last_name: c?.lastName ?? "", email: c?.email ?? "", main_phone: c?.phone ?? "", organization_id: null, type: "End Customer" });
  const [org, setOrg] = useState<{ id: number; label: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void contactMatchesAction(card.id).then(setMatches);
    if (c?.companyName) void organizationByNameAction(c.companyName).then((o) => (setOrg(o), setForm((f) => ({ ...f, organization_id: o?.id ?? null }))));
  }, [card.id, c?.companyName]);
  useEffect(() => {
    if (picked || q.trim().length < 2) return;
    const timer = setTimeout(() => void searchContactsAction(q).then(setChoices), 250);
    return () => clearTimeout(timer);
  }, [q, picked]);

  const create = () =>
    start(async () => {
      const r = await createProjectFromProposalAction(card.id, mode === "pick" ? { contactId: picked!.id } : { newContact: form });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Project created and the proposal linked."));
      router.refresh();
    });
  const canCreate = mode === "pick" ? Boolean(picked) : form.first_name.trim().length > 0 && form.last_name.trim().length > 0;
  const field = (label: string, key: keyof NewContactInput, type = "text") => (
    <label className="flex flex-col gap-1 text-xs text-text-2">
      {label}
      <input type={type} value={String(form[key] ?? "")} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={cn(INPUT, "text-foreground")} />
    </label>
  );

  return (
    <div className="mt-3 rounded-xl border bg-muted/40 p-3">
      <p className="mb-2 font-semibold">{t("New project from this proposal")}</p>
      <p className="mb-2 text-xs text-text-2">{t("Who is the Job Owner? Pick an existing contact or create one; nothing is created without you.")}</p>
      {matches === null ? (
        <p className="text-xs text-text-2">{t("Looking for matching contacts…")}</p>
      ) : matches.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-text-2">{t("Matches:")}</span>
          {matches.map((m) => (
            <button key={m.id} type="button" onClick={() => (setMode("pick"), setPicked({ id: m.id, label: m.label }))} className={cn("min-h-8 rounded-full border px-2.5 hover:bg-muted", picked?.id === m.id && mode === "pick" && "border-primary bg-primary text-primary-foreground")}>
              {m.label} <span className="opacity-70">· {t(m.reason)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-xs text-text-2">{t("No contact with this e-mail, phone or name.")}</p>
      )}
      <div className="mb-2 flex gap-2 text-xs">
        <button type="button" onClick={() => setMode("pick")} className={cn("min-h-9 rounded-full border px-3", mode === "pick" && "border-primary bg-primary text-primary-foreground")}>
          {t("Existing contact")}
        </button>
        <button type="button" onClick={() => setMode("new")} className={cn("min-h-9 rounded-full border px-3", mode === "new" && "border-primary bg-primary text-primary-foreground")}>
          {t("Create a new contact")}
        </button>
      </div>
      {mode === "pick" ? (
        <div className="relative">
          <input type="text" value={picked ? picked.label : q} onChange={(e) => (setPicked(null), setChoices([]), setQ(e.target.value))} placeholder={t("Contact name, e-mail or #number")} aria-label={t("Contact")} className={cn(INPUT, picked && "font-medium")} />
          {!picked && choices.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[10px] border bg-card shadow-float">
              {choices.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => (setPicked(x), setChoices([]))} className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-muted">
                    {x.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {field(t("First name"), "first_name")}
          {field(t("Last name"), "last_name")}
          {field(t("E-mail"), "email", "email")}
          {field(t("Phone"), "main_phone", "tel")}
          <p className="text-xs text-text-2 sm:col-span-2">
            {c?.companyName ? (org ? t("Company: {name} (an existing organization; the contact is placed under it).", { name: org.label }) : t("Company in Portal.io: {name}. No organization with that name exists; the contact is created without one.", { name: c.companyName })) : t("Type: End Customer")}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!canCreate || pending} onClick={create} className={PRIMARY}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Create project and link")}
        </button>
        <button type="button" disabled={pending} onClick={onClose} className={PLAIN}>
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

/** PI-e: linked, but Portal.io changed the proposal since. */
function ChangedCard({ card }: { card: ReviewCardData }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(t(r.message));
      else router.refresh();
    });
  const ch = card.changes ?? {};
  return (
    <div className="rounded-xl border border-warn-fg/40 px-3 py-2 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warn-fg">{t("Changed in Portal.io")}</p>
      <Head card={card} />
      <ul className="mt-1 text-[13px]">
        {ch.total && (
          <li>
            {t("Total")}: <s className="text-text-2">{money(ch.total[0])}</s> → <b>{money(ch.total[1])}</b>
          </li>
        )}
        {ch.name && (
          <li>
            {t("Name")}: <s className="text-text-2">{ch.name[0]}</s> → <b>{ch.name[1]}</b>
          </li>
        )}
        {ch.change_orders && <li>{t("Change orders: {a} → {b}", { a: ch.change_orders[0], b: ch.change_orders[1] })}</li>}
        {card.projectHref && (
          <li>
            {t("Project")}:{" "}
            <Link href={card.projectHref} className="text-primary hover:underline">
              {card.projectTitle ?? `#${card.project_id}`}
            </Link>
          </li>
        )}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => refreshProposalAction(card.id))} className={PRIMARY} title={t("Update the existing transaction's amount and description")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Refresh")}
        </button>
        <button type="button" disabled={pending} onClick={() => window.confirm(t("Delete the old transaction and create a new one dated today with the new total?")) && run(() => replaceProposalAction(card.id))} className={PLAIN}>
          {t("Replace")}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => keepProposalAction(card.id))} className={PLAIN}>
          {t("Keep as is")}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => refreshFromPortalAction(card.id))} className="inline-flex h-11 items-center px-2 text-xs text-text-2 hover:underline">
          {t("Check Portal.io now")}
        </button>
      </div>
    </div>
  );
}
