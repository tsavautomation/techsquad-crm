"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Loader2, Package, PackageCheck, Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { markShippedAction, saveSaleFieldsAction, unshipAction } from "@/lib/ebay/actions";
import type { Sale } from "@/lib/ebay/load";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F32 Ebay board: tiles to ship (item, price, buyer, address with Copy, Print label, Mark shipped + tracking),
// then the history of shipped sales. Phones first: one column, 44 px targets.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function SalesBoard({ toShip, shipped }: { toShip: Sale[]; shipped: Sale[] }) {
  const t = useT();
  return (
    <>
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Package className="size-4" aria-hidden /> {t("To ship")} <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{toShip.length}</span>
      </h2>
      {toShip.length === 0 ? (
        <p className="mb-6 rounded-2xl border border-dashed bg-card px-6 py-8 text-center text-text-2">{t("Nothing to ship. New eBay sales appear here within five minutes of eBay's email.")}</p>
      ) : (
        <ul className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {toShip.map((s) => (
            <li key={s.id}>
              <Tile sale={s} />
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <PackageCheck className="size-4" aria-hidden /> {t("Shipped")} <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{shipped.length}</span>
      </h2>
      {shipped.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-8 text-center text-text-2">{t("No shipped sales yet.")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shipped.map((s) => (
            <li key={s.id}>
              <Tile sale={s} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Tile({ sale: s }: { sale: Sale }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tracking, setTracking] = useState(s.tracking ?? "");
  const [notes, setNotes] = useState(s.notes ?? "");
  const [copied, setCopied] = useState(false);
  const shipped = s.status === "shipped";
  const labelReady = Boolean(s.label_mail_id);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(t(r.message));
      else {
        if (done) toast.success(done);
        router.refresh();
      }
    });

  const copy = async () => {
    if (!s.ship_to) return;
    try {
      await navigator.clipboard.writeText(s.ship_to);
      setCopied(true);
      toast.success(t("Address copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("Address copied"));
    }
  };

  return (
    <article className={cn("rounded-2xl border bg-card px-[18px] py-3 shadow-card", shipped ? "opacity-80" : labelReady ? "border-l-4 border-l-ok-fg" : "border-l-4 border-l-warn-fg", pending && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold tracking-tight">{s.item_title ?? t("Order {n}", { n: s.order_number ?? `#${s.id}` })}</p>
        {s.price !== null && <span className="shrink-0 font-semibold tabular-nums">{money.format(s.price)}</span>}
      </div>
      <p className="text-xs text-text-2 tabular-nums">
        {s.order_number && <>{t("Order {n}", { n: s.order_number })} · </>}
        {s.item_id && <>{t("Item {n}", { n: s.item_id })} · </>}
        {s.quantity && s.quantity > 1 && <>{t("Qty {n}", { n: s.quantity })} · </>}
        {s.sold_at && t("Sold {when}", { when: formatDateTime(s.sold_at) })}
        {(s.shipping !== null || s.total !== null) && (
          <>
            {" · "}
            {s.shipping !== null && `+${money.format(s.shipping)} `}
            {s.total !== null && `= ${money.format(s.total)}`}
          </>
        )}
      </p>

      <div className="mt-2 text-[14px]">
        <p className="text-xs text-text-2">{t("Buyer")}</p>
        <p className="font-medium">
          {s.buyer_name ?? "—"}
          {s.buyer_username && <span className="font-normal text-text-2"> · {s.buyer_username}</span>}
        </p>
        {s.ship_to ? <pre className="mt-1 font-sans text-[14px] whitespace-pre-wrap">{s.ship_to}</pre> : <p className="mt-1 text-text-2">{t("No address in the email")}</p>}
      </div>

      {s.extraction === "fallback" && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warn-fg">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("The email could not be fully read ({reason}); check the details against eBay.", { reason: s.extraction_error ?? "?" })}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {s.ship_to && (
          <button type="button" onClick={copy} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-3 text-sm hover:bg-muted">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {t("Copy address")}
          </button>
        )}
        {s.label_url ? (
          <a href={s.label_url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-95">
            <Printer className="size-4" aria-hidden /> {t("Print label")}
          </a>
        ) : (
          !shipped && (
            <span className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-warn-bg px-3 text-sm text-warn-fg">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {labelReady ? t("Label ready") : t("Waiting for the shipping label email")}
            </span>
          )
        )}
      </div>

      {shipped ? (
        <div className="mt-3 text-[13px]">
          <p className="text-ok-fg">
            <PackageCheck className="inline size-4 align-[-3px]" aria-hidden /> {t("Shipped {when} by {who}", { when: s.shipped_at ? formatDateTime(s.shipped_at) : "?", who: s.shipped_by_name ?? "?" })}
          </p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveSaleFieldsAction(s.id, { tracking }), t("Saved"));
            }}
          >
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={t("Tracking number")} aria-label={t("Tracking number")} className="h-11 min-w-0 flex-1 rounded-[10px] border bg-background px-3 text-base" />
            <button type="submit" disabled={pending || tracking === (s.tracking ?? "")} className="inline-flex h-11 items-center rounded-[10px] border px-3 text-sm hover:bg-muted disabled:opacity-50">
              {t("Save tracking")}
            </button>
          </form>
          <button type="button" disabled={pending} onClick={() => run(() => unshipAction(s.id))} className="mt-2 inline-flex min-h-11 items-center gap-1 text-text-2 hover:underline md:min-h-0">
            <Undo2 className="size-3.5" aria-hidden /> {t("Not shipped after all")}
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => markShippedAction(s.id, tracking));
          }}
        >
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={t("Tracking number")} aria-label={t("Tracking number")} className="h-11 min-w-0 flex-1 rounded-[10px] border bg-background px-3 text-base" />
          <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-ok-fg px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50">
            <PackageCheck className="size-4" aria-hidden /> {t("Mark shipped")}
          </button>
        </form>
      )}

      <details className="mt-2 text-[13px]">
        <summary className="cursor-pointer text-text-2 hover:underline">{t("Notes for the office")}</summary>
        <form
          className="mt-1 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveSaleFieldsAction(s.id, { notes }), t("Saved"));
          }}
        >
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-[10px] border bg-background px-3 py-2 text-base" />
          <button type="submit" disabled={pending || notes === (s.notes ?? "")} className="inline-flex h-11 items-center self-start rounded-[10px] border px-3 text-sm hover:bg-muted disabled:opacity-50">
            {t("Save notes")}
          </button>
        </form>
      </details>
      {(s.raw_sale_text || s.raw_label_text) && (
        <details className="mt-1 text-[13px]">
          <summary className="cursor-pointer text-text-2 hover:underline">{t("Show the emails")}</summary>
          {s.raw_sale_text && (
            <>
              <p className="mt-1 text-xs font-medium text-text-2">{t("Sale email")}</p>
              <pre className="max-h-64 overflow-auto rounded-lg bg-muted px-3 py-2 font-sans text-xs whitespace-pre-wrap">{s.raw_sale_text}</pre>
            </>
          )}
          {s.raw_label_text && (
            <>
              <p className="mt-1 text-xs font-medium text-text-2">{t("Label email")}</p>
              <pre className="max-h-64 overflow-auto rounded-lg bg-muted px-3 py-2 font-sans text-xs whitespace-pre-wrap">{s.raw_label_text}</pre>
            </>
          )}
        </details>
      )}
    </article>
  );
}
