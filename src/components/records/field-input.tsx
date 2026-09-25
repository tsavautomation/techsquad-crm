"use client";

import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import type { Address } from "@/lib/records/values";
import { cn } from "@/lib/utils";
import type { FieldDef } from "@/registry/types";

// Native inputs: on iPhone they bring up the right keyboard, date wheel and picker.
// text-base (16px) stops Safari zooming in on focus; h-11 = 44px tap targets.
const BOX =
  "w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-invalid:border-destructive";

type Props = {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid?: boolean;
  disabled?: boolean;
};

export function FieldInput({ field: f, value, onChange, invalid, disabled }: Props) {
  const id = `f-${f.name}`;
  const common = { id, name: f.name, disabled, "aria-invalid": invalid || undefined };
  const str = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);

  switch (f.type) {
    case "text":
    case "phone":
    case "email":
    case "url":
      return (
        <input
          {...common}
          type={f.type === "phone" ? "tel" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
          inputMode={f.type === "phone" || f.pattern ? "tel" : undefined}
          autoComplete="off"
          maxLength={f.maxLength}
          placeholder={f.placeholder}
          className={cn(BOX, "h-11")}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "textarea":
      return (
        <textarea
          {...common}
          rows={f.maxLength && f.maxLength > 1000 ? 6 : 3}
          maxLength={f.maxLength}
          placeholder={f.placeholder}
          className={cn(BOX, "min-h-24 py-2")}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "select":
      return (
        <select {...common} className={cn(BOX, "h-11")} value={str} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Select one</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case "radio":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
          {f.options?.map((o) => (
            <Choice key={o.value} selected={value === o.value} disabled={disabled} onClick={() => onChange(o.value)} color={o.color}>
              {o.label}
            </Choice>
          ))}
        </div>
      );

    case "checkboxes": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
          {f.options?.map((o) => {
            const on = selected.includes(o.value);
            return (
              <Choice
                key={o.value}
                role="checkbox"
                selected={on}
                disabled={disabled}
                color={o.color}
                onClick={() => onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])}
              >
                {o.label}
              </Choice>
            );
          })}
        </div>
      );
    }

    case "boolean":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-2">
          <Choice selected={value === true} disabled={disabled} onClick={() => onChange(true)} color="#77af63">
            Yes
          </Choice>
          <Choice selected={value !== true} disabled={disabled} onClick={() => onChange(false)} color="#d36c5e">
            No
          </Choice>
        </div>
      );

    case "date":
      return <input {...common} type="date" className={cn(BOX, "h-11")} value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} />;

    case "datetime":
      return (
        <input
          {...common}
          type="datetime-local"
          className={cn(BOX, "h-11")}
          value={toDateTimeLocalET(str || null)}
          onChange={(e) => onChange(e.target.value ? fromDateTimeLocalET(e.target.value) : null)}
        />
      );

    case "money":
    case "number":
      return (
        <div className="relative">
          {f.type === "money" && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>}
          <input
            {...common}
            type="text"
            inputMode={f.type === "money" ? "decimal" : "numeric"}
            className={cn(BOX, "h-11", f.type === "money" && "pl-7")}
            value={typeof value === "number" ? String(value) : str}
            onChange={(e) => {
              const raw = e.target.value.replace(/[,$\s]/g, "");
              if (raw === "") return onChange(null);
              const n = Number(raw);
              onChange(Number.isFinite(n) && /^-?\d*\.?\d*$/.test(raw) ? n : raw);
            }}
          />
        </div>
      );

    case "address": {
      const a = (value && typeof value === "object" ? value : {}) as Address;
      const set = (k: keyof Address, v: string) => onChange({ ...a, [k]: v });
      return (
        <div className="grid grid-cols-6 gap-2">
          <input aria-label="Street" placeholder="Street" autoComplete="off" disabled={disabled} className={cn(BOX, "col-span-6 h-11")} value={a.street ?? ""} onChange={(e) => set("street", e.target.value)} />
          <input aria-label="Address line 2" placeholder="Apt, suite (optional)" autoComplete="off" disabled={disabled} className={cn(BOX, "col-span-6 h-11")} value={a.address_2 ?? ""} onChange={(e) => set("address_2", e.target.value)} />
          <input aria-label="City" placeholder="City" autoComplete="off" disabled={disabled} className={cn(BOX, "col-span-3 h-11")} value={a.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          <input aria-label="State" placeholder="State" autoComplete="off" maxLength={2} disabled={disabled} className={cn(BOX, "col-span-1 h-11 uppercase")} value={a.state ?? ""} onChange={(e) => set("state", e.target.value.toUpperCase())} />
          <input aria-label="ZIP" placeholder="ZIP" inputMode="numeric" autoComplete="off" maxLength={10} disabled={disabled} className={cn(BOX, "col-span-2 h-11")} value={a.zip ?? ""} onChange={(e) => set("zip", e.target.value)} />
        </div>
      );
    }

    default:
      return (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          {TYPE_SOON[f.type] ?? "This field type"} arrives in the next update (M6).
        </p>
      );
  }
}

const TYPE_SOON: Partial<Record<FieldDef["type"], string>> = {
  lookup: "Choosing a linked record",
  user: "Choosing a user",
  group: "Choosing user groups",
  file: "File upload",
  image: "Image upload",
  signature: "Signature",
  richtext: "Rich text editing",
  ssn: "SSN entry",
  ein: "EIN entry",
};

function Choice({
  selected,
  onClick,
  children,
  color,
  disabled,
  role = "radio",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
  disabled?: boolean;
  role?: "radio" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors disabled:opacity-60",
        selected ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
      )}
    >
      {color && <span className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  );
}
