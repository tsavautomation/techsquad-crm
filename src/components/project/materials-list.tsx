"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, EyeOff, Package, Plus, RotateCcw, Trash2, Repeat, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { addExtraToListAction, addMaterialAction, editMaterialAction, ignoreExtraAction, replaceMaterialAction, searchProductsAction, setMaterialStatusAction, unignoreExtraAction, type NewLine } from "@/lib/purchasing/actions";
import type { Extra } from "@/lib/purchasing/allocation";
import { lineCost, materialState, orderMaterials, productLabel, summarize, toBuyQuantity, type MaterialRow, type MaterialState } from "@/lib/purchasing/materials";

// PU-a: the Materials card of a project. One row per line of the linked proposals (and every line added by hand):
// quantity, product, cost, and its state: To buy / In stock (today's ledger covers it) / Purchased / Replaced /
// Removed. Buttons: Purchased, Replace (pick or type another product), Remove, Undo, Edit qty / cost, Add material.
// PU-d: under each line, live: how many units of it are installed / staged on the job and how many are still
// needed; a line the job has in full is "On the job" (green, check). Units on the job that no line covers are
// listed in red at the bottom: Add to the list / Ignore (undo).

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const BTN = "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50";
type Res = { ok: true } | { ok: false; message: string };
type Choice = Awaited<ReturnType<typeof searchProductsAction>>[number];

export function MaterialsList({ rows, extras = [], projectId }: { rows: MaterialRow[]; extras?: Extra[]; projectId: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const warnings = extras.filter((e) => !e.ignored_id);
  const ignored = extras.filter((e) => e.ignored_id);
  const s = summarize(rows);
  const ordered = orderMaterials(rows);
  const hidden = ordered.filter((m) => ["replaced", "removed"].includes(materialState(m))).length;
  const visible = showDone ? ordered : ordered.filter((m) => !["replaced", "removed"].includes(materialState(m)));

  const run = (fn: () => Promise<Res>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(t(r.message));
      else {
        if (done) toast.success(done);
        setAdding(false);
        setReplacing(null);
        setEditing(null);
        router.refresh();
      }
    });

  const stateLabel = (m: MaterialRow, st: MaterialState) => {
    const need = toBuyQuantity(m);
    if (st === "to_buy") {
      if (m.allocated > 0) return m.on_hand > 0 ? t("To buy {n} · only {s} in stock ({where})", { n: need, s: m.on_hand, where: m.locations ?? "" }) : t("To buy {n}", { n: need });
      return m.on_hand > 0 ? t("To buy · only {n} in stock ({where})", { n: m.on_hand, where: m.locations ?? "" }) : t("To buy");
    }
    if (st === "in_stock") return m.allocated > 0 ? t("{n} in stock · {where}", { n: need, where: m.locations ?? "" }) : t("In stock · {where}", { where: m.locations ?? "" });
    if (st === "allocated") return t("On the job");
    if (st === "purchased") return t("Purchased");
    if (st === "replaced") return t("Replaced");
    return t("Removed");
  };
  const TONE: Record<MaterialState, string> = { to_buy: "bg-warn-bg text-warn-fg", in_stock: "bg-ok-bg text-ok-fg", allocated: "bg-ok-fg text-white", purchased: "bg-info-bg text-info-fg", replaced: "bg-muted text-text-2", removed: "bg-muted text-text-2" };
  /** PU-d, under the line: what the job has of it, live from Stock. */
  const liveLine = (m: MaterialRow, st: MaterialState) => {
    if (!m.allocated || st === "replaced" || st === "removed") return null;
    const parts = [m.installed ? t("installed {n}", { n: m.installed }) : null, m.staged ? t("staged {n}", { n: m.staged }) : null, st !== "allocated" ? t("still needed {n}", { n: toBuyQuantity(m) }) : null].filter(Boolean);
    return parts.join(" · ");
  };
  const extraLabel = (e: Extra) => [e.installed ? t("installed {n}", { n: e.installed }) : null, e.staged ? t("staged {n}", { n: e.staged }) : null].filter(Boolean).join(" · ");

  return (
    <div>
      <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-2">
        <span>{t("{n} lines", { n: s.lines })}</span>
        <span className={cn(s.toBuy && "font-medium text-warn-fg")}>{t("to buy {n} · {c}", { n: s.toBuy, c: money(s.toBuyCost) })}</span>
        <span>{t("in stock {n} · {c}", { n: s.inStock, c: money(s.inStockCost) })}</span>
        <span>{t("purchased {n} · {c}", { n: s.purchased, c: money(s.purchasedCost) })}</span>
        {s.allocated ? <span className="font-medium text-ok-fg">{t("on the job {n} · {c}", { n: s.allocated, c: money(s.allocatedCost) })}</span> : null}
        {warnings.length ? <span className="font-medium text-bad-fg">{t("{n} on the job but not on the list", { n: warnings.length })}</span> : null}
        {s.withoutCost ? <span>{t("{n} without cost", { n: s.withoutCost })}</span> : null}
      </p>
      <ul className="divide-y">
        {visible.map((m) => {
          const st = materialState(m);
          const dim = st === "replaced" || st === "removed";
          return (
            <li key={m.id} className={cn("py-2.5", dim && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", dim && "line-through")}>
                    <span className="tabular-nums">{m.quantity} ×</span> {productLabel(m) || t("(no description)")}
                    {m.product && !m.product_id && <Package className="ml-1 inline size-3.5 text-text-2" aria-label={t("Matched to a product in the inventory")} />}
                  </p>
                  {(m.name && productLabel(m) !== m.name) || m.proposal_number || m.replaces_id || m.source === "manual" ? (
                    <p className="truncate text-xs text-text-2">
                      {m.name && productLabel(m) !== m.name ? m.name : ""}
                      {m.proposal_number ? ` · #${m.proposal_number}` : ""}
                      {m.source === "manual" && !m.replaces_id ? ` · ${t("added by hand")}` : ""}
                      {m.replaces_id ? ` · ${t("replacement")}` : ""}
                    </p>
                  ) : null}
                  <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[st])}>
                    {st === "allocated" && <CheckCircle2 className="size-3" aria-hidden />}
                    {stateLabel(m, st)}
                  </span>
                  {liveLine(m, st) && <p className="mt-0.5 text-xs text-text-2">{liveLine(m, st)}</p>}
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums">
                  <p className="font-medium">{m.unit_cost === null ? "—" : money(lineCost(m))}</p>
                  {m.unit_cost !== null && m.quantity !== 1 && <p className="text-xs text-text-2">{money(m.unit_cost)} {t("each")}</p>}
                </div>
              </div>
              {!dim && replacing !== m.id && editing !== m.id && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {st === "allocated" ? null : st !== "purchased" ? (
                    <button type="button" disabled={pending} onClick={() => run(() => setMaterialStatusAction(m.id, projectId, "purchased"), t("Marked purchased."))} className={cn(BTN, "border-ok-fg/30 text-ok-fg")}>
                      <Check className="size-3.5" aria-hidden /> {t("Purchased")}
                    </button>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => run(() => setMaterialStatusAction(m.id, projectId, "open"))} className={BTN}>
                      <RotateCcw className="size-3.5" aria-hidden /> {t("Not purchased")}
                    </button>
                  )}
                  <button type="button" disabled={pending} onClick={() => (setReplacing(m.id), setAdding(false), setEditing(null))} className={BTN}>
                    <Repeat className="size-3.5" aria-hidden /> {t("Replace")}
                  </button>
                  <button type="button" disabled={pending} onClick={() => (setEditing(m.id), setReplacing(null), setAdding(false))} className={BTN} title={t("Quantity and cost")}>
                    <Pencil className="size-3.5" aria-hidden /> {t("Qty / cost")}
                  </button>
                  <button type="button" disabled={pending} onClick={() => run(() => setMaterialStatusAction(m.id, projectId, "removed"), t("Removed from the list."))} className={cn(BTN, "text-bad-fg")}>
                    <Trash2 className="size-3.5" aria-hidden /> {t("Remove")}
                  </button>
                </div>
              )}
              {dim && (
                <button type="button" disabled={pending} onClick={() => run(() => setMaterialStatusAction(m.id, projectId, "open"))} className={cn(BTN, "mt-2")}>
                  <RotateCcw className="size-3.5" aria-hidden /> {t("Undo")}
                </button>
              )}
              {replacing === m.id && (
                <LineForm title={t("Replace with")} initial={{ quantity: m.quantity }} pending={pending} onCancel={() => setReplacing(null)} onSave={(line) => run(() => replaceMaterialAction(m.id, projectId, line), t("Replaced."))} />
              )}
              {editing === m.id && (
                <EditForm row={m} pending={pending} onCancel={() => setEditing(null)} onSave={(patch) => run(() => editMaterialAction(m.id, projectId, patch), t("Saved."))} />
              )}
            </li>
          );
        })}
        {!visible.length && <li className="py-4 text-center text-sm text-text-2">{t("No materials yet. They come from the proposals linked to the project (Portal.io), or add them here.")}</li>}
      </ul>
      {warnings.length > 0 && (
        <div className="mt-3 rounded-xl border border-bad-fg/30 bg-bad-bg/40 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-bad-fg">
            <AlertTriangle className="size-4" aria-hidden /> {t("On the job but not on the list")}
          </p>
          <p className="mb-2 text-xs text-text-2">{t("Units in Stock whose destination is this project, with no line for their product in the list.")}</p>
          <ul className="divide-y divide-bad-fg/15">
            {warnings.map((e) => (
              <li key={e.key} className="py-2">
                <p className="text-sm font-medium">
                  <span className="tabular-nums">{e.count} ×</span> {e.title || e.model || t("(no description)")}
                </p>
                <p className="text-xs text-text-2">{extraLabel(e)}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button type="button" disabled={pending} onClick={() => run(() => addExtraToListAction(projectId, { productId: e.product_id, model: e.model, count: e.count, title: e.title }), t("Added to the list."))} className={cn(BTN, "border-primary text-primary")}>
                    <Plus className="size-3.5" aria-hidden /> {t("Add to the list")}
                  </button>
                  <button type="button" disabled={pending} onClick={() => run(() => ignoreExtraAction(projectId, { productId: e.product_id, model: e.model }), t("Ignored."))} className={BTN}>
                    <EyeOff className="size-3.5" aria-hidden /> {t("Ignore")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ignored.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowIgnored((v) => !v)} className="min-h-11 text-xs text-text-2 underline underline-offset-4">
            {showIgnored ? t("Hide ignored") : t("Show {n} ignored (on the job, not on the list)", { n: ignored.length })}
          </button>
          {showIgnored && (
            <ul className="divide-y text-sm opacity-70">
              {ignored.map((e) => (
                <li key={e.key} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span>
                    <span className="tabular-nums">{e.count} ×</span> {e.title || e.model || t("(no description)")}
                    <span className="ml-1 text-xs text-text-2">{extraLabel(e)}</span>
                  </span>
                  <button type="button" disabled={pending} onClick={() => run(() => unignoreExtraAction(e.ignored_id!, projectId))} className={cn(BTN, "ml-auto")}>
                    <RotateCcw className="size-3.5" aria-hidden /> {t("Undo")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!adding && (
          <button type="button" onClick={() => (setAdding(true), setReplacing(null), setEditing(null))} className={cn(BTN, "min-h-11 border-primary text-primary")}>
            <Plus className="size-4" aria-hidden /> {t("Add material")}
          </button>
        )}
        {hidden > 0 && (
          <button type="button" onClick={() => setShowDone((v) => !v)} className="min-h-11 text-xs text-text-2 underline underline-offset-4">
            {showDone ? t("Hide replaced and removed") : t("Show {n} replaced / removed", { n: hidden })}
          </button>
        )}
      </div>
      {adding && <LineForm title={t("Add material")} pending={pending} onCancel={() => setAdding(false)} onSave={(line) => run(() => addMaterialAction(projectId, line), t("Added."))} />}
    </div>
  );
}

const FIELD = "h-11 w-full rounded-[10px] border bg-background px-3 text-base";

/** Pick a product from the inventory (name / brand / model / SKU) or type a new one; quantity and unit cost. */
export function LineForm({ title, initial, pending, onCancel, onSave }: { title: string; initial?: Partial<NewLine>; pending: boolean; onCancel: () => void; onSave: (line: NewLine) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<{ q: string; hits: Choice[] }>({ q: "", hits: [] });
  const [line, setLine] = useState<NewLine>({ productId: null, brand: "", model: "", name: "", quantity: 1, unitCost: null, ...initial });
  const [cost, setCost] = useState(initial?.unitCost === null || initial?.unitCost === undefined ? "" : String(initial.unitCost));
  useEffect(() => {
    if (q.trim().length < 2) return;
    const timer = setTimeout(() => void searchProductsAction(q).then((hits) => setChoices({ q, hits })), 250);
    return () => clearTimeout(timer);
  }, [q]);
  const shown = q.trim().length >= 2 && choices.q === q ? choices.hits : [];
  const pick = (c: Choice) => {
    setLine((l) => ({ ...l, productId: c.id, brand: c.brand ?? "", model: c.model ?? "", name: c.title }));
    if (c.cost !== null) setCost(String(c.cost));
    setQ("");
  };
  const set = (k: keyof NewLine, v: string) => setLine((l) => ({ ...l, [k]: v, productId: k === "quantity" ? l.productId : null }));
  return (
    <div className="mt-2 rounded-xl border bg-muted/30 p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="relative">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search the inventory products (name, brand, model, SKU)")} className={FIELD} />
        {shown.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-card shadow-card">
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="min-w-0 truncate">
                    {c.title}
                    <span className="block truncate text-xs text-text-2">{[c.brand, c.model, c.sku].filter(Boolean).join(" · ")}</span>
                  </span>
                  {c.cost !== null && <span className="shrink-0 text-xs tabular-nums text-text-2">{money(c.cost)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-text-2">{line.productId ? t("Product from the inventory. Typing below unlinks it.") : t("Or type a new product:")}</p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <input value={line.brand} onChange={(e) => set("brand", e.target.value)} placeholder={t("Brand")} className={FIELD} />
        <input value={line.model} onChange={(e) => set("model", e.target.value)} placeholder={t("Model")} className={FIELD} />
        <input value={line.name} onChange={(e) => set("name", e.target.value)} placeholder={t("Description")} className={cn(FIELD, "sm:col-span-2")} />
        <label className="text-xs text-text-2">
          {t("Qty")}
          <input type="number" inputMode="decimal" min={0} step="any" value={line.quantity} onChange={(e) => setLine((l) => ({ ...l, quantity: Number(e.target.value) }))} className={FIELD} />
        </label>
        <label className="text-xs text-text-2">
          {t("Unit cost ($)")}
          <input type="number" inputMode="decimal" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} className={FIELD} />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={pending} onClick={() => onSave({ ...line, unitCost: cost.trim() === "" ? null : Number(cost) })} className={cn(BTN, "min-h-11 border-primary bg-primary px-4 text-primary-foreground hover:bg-primary")}>
          {t("Save")}
        </button>
        <button type="button" onClick={onCancel} className={cn(BTN, "min-h-11 px-4")}>
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

function EditForm({ row, pending, onCancel, onSave }: { row: MaterialRow; pending: boolean; onCancel: () => void; onSave: (patch: { quantity: number; unitCost: number | null }) => void }) {
  const t = useT();
  const [qty, setQty] = useState(String(row.quantity));
  const [cost, setCost] = useState(row.unit_cost === null ? "" : String(row.unit_cost));
  return (
    <div className="mt-2 grid gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-xs text-text-2">
        {t("Qty")}
        <input type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={FIELD} />
      </label>
      <label className="text-xs text-text-2">
        {t("Unit cost ($)")}
        <input type="number" inputMode="decimal" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} className={FIELD} />
      </label>
      <div className="flex items-end gap-2">
        <button type="button" disabled={pending} onClick={() => onSave({ quantity: Number(qty), unitCost: cost.trim() === "" ? null : Number(cost) })} className={cn(BTN, "min-h-11 border-primary bg-primary px-4 text-primary-foreground hover:bg-primary")}>
          {t("Save")}
        </button>
        <button type="button" onClick={onCancel} className={cn(BTN, "min-h-11 px-4")}>
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
