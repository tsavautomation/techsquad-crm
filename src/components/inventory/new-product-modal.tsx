"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { createProductAction } from "@/lib/inventory/actions";
import type { PickLists } from "@/lib/inventory/load";
import type { ProductChoice } from "@/lib/inventory/rules";
import { useT } from "@/i18n/client";

// INV-e: "+ Create product" from the register screen. A short form (brand, model, type, supplier, cost,
// SKU); the product is created through the ordinary Products rules and comes back selected.

const BOX = "w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50";

export function NewProductModal({ lists, initialModel, onClose, onCreated }: { lists: PickLists; initialModel: string; onClose: () => void; onCreated: (p: ProductChoice) => void }) {
  const t = useT();
  const [brandId, setBrandId] = useState<number | null>(null);
  const [model, setModel] = useState(initialModel);
  const [productType, setProductType] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [cost, setCost] = useState("");
  const [sku, setSku] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const submit = () =>
    start(async () => {
      const r = await createProductAction({ brandId, model, productType: productType || null, supplierId, cost: cost.trim() ? Number(cost) : null, sku });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Product created: {name}", { name: r.product.title }));
      onCreated(r.product);
    });
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-4 shadow-card md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (model.trim() && !pending) submit();
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-[15px] font-semibold">{t("New product")}</h2>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="block text-sm font-medium">
            {t("Brand")}
            <select value={brandId ?? ""} onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
              <option value="">{t("None")}</option>
              {lists.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {t("Model")}
            <input value={model} onChange={(e) => setModel(e.target.value)} maxLength={80} required autoFocus className={`${BOX} mt-1 h-11`} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              {t("Product Type")}
              <select value={productType} onChange={(e) => setProductType(e.target.value)} className={`${BOX} mt-1 h-11`}>
                <option value="">{t("None")}</option>
                {lists.productTypes.map((p) => (
                  <option key={p} value={p}>
                    {t(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t("Supplier")}
              <select value={supplierId ?? ""} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
                <option value="">{t("None")}</option>
                {lists.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t("Cost")}
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" type="number" step="0.01" min={0} className={`${BOX} mt-1 h-11`} />
            </label>
            <label className="block text-sm font-medium">
              {t("SKU")}
              <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={20} className={`${BOX} mt-1 h-11`} />
            </label>
          </div>
          <button type="submit" disabled={pending || !model.trim()} className={BTN}>
            {pending ? t("Saving…") : t("Create product")}
          </button>
        </div>
      </form>
    </div>
  );
}
