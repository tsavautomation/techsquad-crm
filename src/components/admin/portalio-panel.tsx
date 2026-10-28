"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { connectPortalAction, disconnectPortalAction, listWebhooksAction, registerWebhookAction, removeWebhookAction, setReviewFromAction, syncPortalNowAction } from "@/lib/portalio/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// PI-a: Admin › Portal.io — Connect (the sign-in is exchanged for a user key once), Sync now / everything, the webhook.

const BTN = "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50";
const INPUT = "h-11 rounded-[10px] border bg-background px-3 text-base";

export function PortalConnectForm({ user }: { user: string }) {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState(user);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await connectPortalAction(email, password);
      setPassword("");
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Portal.io connected. Run Sync everything once to load the proposals."));
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("Portal.io e-mail")}</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("Portal.io password (used once to get the API key; not stored)")}</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" className={INPUT} />
      </label>
      <button type="submit" disabled={pending || !password} className={cn(BTN, "w-fit bg-primary text-primary-foreground")}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Connect Portal.io")}
      </button>
    </form>
  );
}

/** PI-i: which accepted proposals are offered for review: those accepted from this date on (empty = all). */
export function ReviewFromForm({ value }: { value: string }) {
  const t = useT();
  const router = useRouter();
  const [date, setDate] = useState(value);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await setReviewFromAction(date);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved."));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[10px] bg-muted/50 px-3 py-2">
      <label className="flex flex-col gap-1 text-xs text-text-2">
        {t("Offer for review proposals accepted from")}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(INPUT, "text-foreground")} />
      </label>
      <button type="button" onClick={save} disabled={pending || date === value} className={cn(BTN, "border bg-card font-medium hover:bg-muted")}>
        {t("Save")}
      </button>
      <p className="basis-full text-xs text-text-2">{t("Older accepted proposals stay in the mirror and still count for the Finance figures once linked; they are just not offered. Empty = every accepted proposal.")}</p>
    </div>
  );
}

export function PortalPanel({ hasWebhook }: { hasWebhook: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [last, setLast] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      if (ok) setLast(ok);
      router.refresh();
    });
  const sync = (full: boolean) =>
    start(async () => {
      const r = await syncPortalNowAction(full);
      if (!r.ok) return void toast.error(t(r.message));
      const s = r.summary;
      setLast(s.skipped ? t(s.skipped) : t("{checked} proposals checked, {updated} read again, {review} accepted ones waiting for a project{errors}", { checked: s.checked, updated: s.updated, review: s.toReview, errors: s.errors.length ? ` · ${s.errors.length} ${t("errors")}: ${s.errors.slice(0, 2).join("; ")}` : "" }) + (s.transactions?.proposals ? ` · ${t("{n} linked proposals followed: {c} transactions created, {u} updated, {a} linked automatically", { n: s.transactions.proposals, c: s.transactions.created, u: s.transactions.updated, a: s.transactions.autoLinked })}` : ""));
      router.refresh();
    });
  const list = () =>
    start(async () => {
      const r = await listWebhooksAction();
      if (!r.ok) return void toast.error(t(r.message));
      setLast(r.subscriptions.length ? r.subscriptions.map((s) => `${s.url} (${s.enabled ? "on" : "off"}; ${s.events.join(", ") || "all events"})`).join(" · ") : t("Portal.io has no webhook registered for this account."));
    });

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => sync(false)} disabled={pending} className={cn(BTN, "bg-primary text-primary-foreground")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Sync now")}
        </button>
        <button type="button" onClick={() => window.confirm(t("Read every proposal again, archived included? This takes a few minutes.")) && sync(true)} disabled={pending} className={cn(BTN, "border font-medium hover:bg-muted")}>
          {t("Sync everything")}
        </button>
        {hasWebhook ? (
          <button type="button" onClick={() => run(removeWebhookAction, t("Webhook removed."))} disabled={pending} className={cn(BTN, "border font-medium hover:bg-muted")}>
            {t("Remove webhook")}
          </button>
        ) : (
          <button type="button" onClick={() => run(registerWebhookAction, t("Webhook registered: Portal.io now tells the CRM at once when a proposal changes status."))} disabled={pending} className={cn(BTN, "border font-medium hover:bg-muted")}>
            {t("Register webhook")}
          </button>
        )}
        <button type="button" onClick={list} disabled={pending} className={cn(BTN, "border font-medium hover:bg-muted")}>
          {t("What Portal.io has registered")}
        </button>
        <button
          type="button"
          onClick={() => window.confirm(t("Disconnect Portal.io? The mirrored proposals are removed (transactions already linked stay, with their Portal #); nothing is read until it is connected again.")) && run(disconnectPortalAction)}
          disabled={pending}
          className={cn(BTN, "border font-medium text-bad-fg hover:bg-muted")}>
          {t("Disconnect")}
        </button>
      </div>
      {last && <p className="text-xs text-text-2">{last}</p>}
    </div>
  );
}
