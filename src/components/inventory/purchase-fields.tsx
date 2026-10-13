"use client";

import type { Purchase } from "@/lib/inventory/actions";
import type { PickLists } from "@/lib/inventory/load";
import { useT } from "@/i18n/client";

// INV-e: the optional purchase data of a receipt (supplier, PO, unit cost, date, bought for a project).

const BOX = "w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
export const EMPTY_PURCHASE: Purchase = { supplierId: null, poNumber: "", unitCost: null, receivedOn: null, purchasedForProjectId: null };

export function PurchaseFields({ value, onChange, lists }: { value: Purchase; onChange: (p: Purchase) => void; lists: PickLists }) {
  const t = useT();
  return (
    <fieldset className="rounded-xl border border-dashed px-3 py-2">
      <legend className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("Purchase (optional)")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          {t("Supplier")}
          <select value={value.supplierId ?? ""} onChange={(e) => onChange({ ...value, supplierId: e.target.value ? Number(e.target.value) : null })} className={`${BOX} mt-1 h-11`}>
            <option value="">{t("None")}</option>
            {lists.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          {t("Order / PO number")}
          <input value={value.poNumber} onChange={(e) => onChange({ ...value, poNumber: e.target.value })} maxLength={40} className={`${BOX} mt-1 h-11`} />
        </label>
        <label className="block text-sm font-medium">
          {t("Unit cost")}
          <input value={value.unitCost ?? ""} onChange={(e) => onChange({ ...value, unitCost: e.target.value.trim() ? Number(e.target.value) : null })} type="number" inputMode="decimal" step="0.01" min={0} className={`${BOX} mt-1 h-11`} />
        </label>
        <label className="block text-sm font-medium">
          {t("Received on")}
          <input value={value.receivedOn ?? ""} onChange={(e) => onChange({ ...value, receivedOn: e.target.value || null })} type="date" className={`${BOX} mt-1 h-11`} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          {t("Bought for the project")}
          <select value={value.purchasedForProjectId ?? ""} onChange={(e) => onChange({ ...value, purchasedForProjectId: e.target.value ? Number(e.target.value) : null })} className={`${BOX} mt-1 h-11`}>
            <option value="">{t("None (general stock)")}</option>
            {lists.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
