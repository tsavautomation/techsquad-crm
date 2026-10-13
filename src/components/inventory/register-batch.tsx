"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { receiveBatchAction, type Purchase } from "@/lib/inventory/actions";
import type { PickLists, StockUnit } from "@/lib/inventory/load";
import { checkSerials, productMatches, type ProductChoice } from "@/lib/inventory/rules";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Combobox } from "./combobox";
import { NewProductModal } from "./new-product-modal";
import { EMPTY_PURCHASE, PurchaseFields } from "./purchase-fields";

// INV-e "Receive a batch": one product and its purchase data, then serials scanned or typed one after
// another (Enter adds); duplicates are flagged before saving; one Stock record + ledger row per unit.

const BOX = "w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50";
const LINK = "inline-flex h-10 items-center rounded-lg border px-3 text-[13px] hover:bg-muted";

export function RegisterBatch({ units, lists, canAddProduct, onDone }: { units: StockUnit[]; lists: PickLists; canAddProduct: boolean; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [products, setProducts] = useState<ProductChoice[]>(lists.products);
  const [productId, setProductId] = useState<number | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<number | null>(lists.locations.find((l) => l.kind === "Warehouse")?.id ?? lists.locations[0]?.id ?? null);
  const [purchase, setPurchase] = useState<Purchase>(EMPTY_PURCHASE);
  const [note, setNote] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [pending, start] = useTransition();
  const entryRef = useRef<HTMLInputElement>(null);
  const existing = useMemo(() => new Set(units.map((u) => (u.serial ?? "").toLowerCase()).filter(Boolean)), [units]);
  const checked = useMemo(() => checkSerials(serials, existing), [serials, existing]);
  const good = checked.filter((c) => !c.problem).length;
  const items = useMemo(() => products.map((p) => ({ ...p, label: p.title, hint: [p.brand, p.sku, p.description].filter(Boolean).join(" · ") || null })), [products]);

  const add = () => {
    const s = entry.trim();
    if (!s) return;
    setSerials((list) => [...list, s]);
    setEntry("");
    entryRef.current?.focus();
  };
  const submit = () =>
    start(async () => {
      if (!productId) return;
      const r = await receiveBatchAction({ productId, serials: checked.filter((c) => !c.problem).map((c) => c.serial), locationId, note, purchase });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("{n} units received into stock", { n: r.created }));
      if (r.skipped.length) toast.warning(t("{n} serials skipped: {list}", { n: r.skipped.length, list: r.skipped.map((s) => `${s.serial} (${t(s.why)})`).join(", ") }));
      router.refresh();
      onDone();
    });

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border bg-card px-[18px] py-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        // Only the button saves: Enter in a field (a scanner's Enter above all) must never send the batch.
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        if (submitter instanceof HTMLButtonElement && submitter.type === "submit" && productId && good > 0) submit();
      }}
    >
      <label className="block text-sm font-medium">
        {t("Product")}
        <Combobox
          className="mt-1"
          items={items}
          value={productId}
          onChange={(id) => setProductId(id)}
          matches={(p, q) => productMatches(p, q)}
          placeholder={t("Search by name, brand, model, SKU…")}
          onCreate={canAddProduct ? (q) => setCreating(q) : undefined}
          createLabel={t("Create product")}
        />
      </label>
      <label className="block text-sm font-medium">
        {t("Location")}
        <select value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`} required>
          <option value="">{t("Choose…")}</option>
          {lists.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <PurchaseFields value={purchase} onChange={setPurchase} lists={lists} />

      <div>
        <label className="block text-sm font-medium">
          {t("Serials")}
          <div className="mt-1 flex gap-2">
            <input
              ref={entryRef}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={t("Scan or type a serial, then Enter")}
              className={`${BOX} h-11 font-mono`}
              autoComplete="off"
              enterKeyHint="enter"
            />
            <button
              type="button"
              onClick={() => {
                entryRef.current?.focus();
                toast(t("Point a barcode scanner at the serial: each scan adds a line."));
              }}
              className={cn(LINK, "h-11 gap-1.5")}
            >
              <ScanLine className="size-4" aria-hidden /> {t("Scan")}
            </button>
            <button type="button" onClick={add} disabled={!entry.trim()} className={cn(LINK, "h-11")}>
              {t("Add")}
            </button>
          </div>
        </label>
        {checked.length > 0 && (
          <ul className="mt-2 divide-y rounded-lg border">
            {checked.map((c, i) => (
              <li key={i} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", c.problem && "bg-warn-bg")}>
                <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono">{c.serial}</span>
                {c.problem && (
                  <span className="inline-flex items-center gap-1 text-xs text-warn-fg">
                    <AlertTriangle className="size-3.5" aria-hidden /> {c.problem === "exists" ? t("already in the system") : t("repeated in the list")}
                  </span>
                )}
                <button type="button" onClick={() => setSerials((list) => list.filter((_, j) => j !== i))} aria-label={t("Remove")} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{checked.length ? t("{good} of {n} will be received; flagged serials are left out.", { good, n: checked.length }) : t("No serials yet.")}</p>
      </div>
      <label className="block text-sm font-medium">
        {t("Note")}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${BOX} mt-1 py-2`} placeholder={t("Optional")} />
      </label>
      <button type="submit" disabled={!productId || good === 0 || pending} className={BTN}>
        {pending ? t("Saving…") : t("Receive {n} units", { n: good })}
      </button>
      {creating !== null && (
        <NewProductModal
          lists={lists}
          initialModel={creating}
          onClose={() => setCreating(null)}
          onCreated={(p) => {
            setProducts((list) => [p, ...list]);
            setProductId(p.id);
            setCreating(null);
          }}
        />
      )}
    </form>
  );
}
