import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { Address } from "@/lib/records/values";
import type { FieldDef } from "@/registry/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatAddress(a: Address | null | undefined): string {
  if (!a) return "";
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a.street, a.address_2, cityLine].filter(Boolean).join(", ");
}

/** A coloured option chip, as WebAuthor showed dropdown values. */
export function OptionChip({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
      {color && <span className="size-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: color }} aria-hidden />}
      {label}
    </span>
  );
}

type Props = {
  field: FieldDef;
  value: unknown;
  /** Linked record title (lookups) or person's name (user fields). */
  display?: string;
  href?: string;
  compact?: boolean;
};

/** Read-only rendering of one field's value (lists and detail pages). */
export function FieldValue({ field: f, value, display, href, compact }: Props) {
  const empty = <span className="text-muted-foreground">—</span>;
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return empty;

  // Lists put each row inside one link, so values there must not be links themselves.
  if (compact) {
    if (f.type === "phone" || f.type === "email" || f.type === "url") return <>{String(value)}</>;
    if (f.type === "lookup" || f.type === "user") return display ? <>{display}</> : <span className="text-muted-foreground">#{String(value)}</span>;
  }

  switch (f.type) {
    case "select":
    case "radio": {
      const o = f.options?.find((x) => x.value === value);
      return <OptionChip label={o?.label ?? String(value)} color={o?.color} />;
    }
    case "checkboxes":
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((v) => {
            const o = f.options?.find((x) => x.value === v);
            return <OptionChip key={v} label={o?.label ?? v} color={o?.color} />;
          })}
        </span>
      );
    case "boolean":
      return <OptionChip label={value ? "Yes" : "No"} color={value ? "#77af63" : "#d36c5e"} />;
    case "date":
      return <>{formatDate(String(value))}</>;
    case "datetime":
      return <>{formatDateTime(String(value))}</>;
    case "money":
      return <>{money.format(Number(value))}</>;
    case "number":
      return <>{String(value)}</>;
    case "phone":
      return (
        <a href={`tel:${String(value).replace(/[^\d+]/g, "")}`} className="underline-offset-4 hover:underline">
          {String(value)}
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${String(value)}`} className="break-all underline-offset-4 hover:underline">
          {String(value)}
        </a>
      );
    case "url": {
      const url = /^https?:\/\//i.test(String(value)) ? String(value) : `https://${value}`;
      return (
        <a href={url} target="_blank" rel="noreferrer" className="break-all underline-offset-4 hover:underline">
          {String(value)}
        </a>
      );
    }
    case "address":
      return <>{formatAddress(value as Address)}</>;
    case "lookup":
    case "user":
      if (!display) return <span className="text-muted-foreground">#{String(value)}</span>;
      return href ? (
        <Link href={href} className="underline-offset-4 hover:underline">
          {display}
        </Link>
      ) : (
        <>{display}</>
      );
    case "textarea":
      return <span className={compact ? "line-clamp-2" : "whitespace-pre-wrap"}>{String(value)}</span>;
    default:
      return <>{String(value)}</>;
  }
}
