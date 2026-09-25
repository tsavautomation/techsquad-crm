import Link from "next/link";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { HistoryEntry, Related, SubList } from "@/lib/records/extras";
import { listFields } from "@/lib/records/data";
import type { TableDef } from "@/registry/types";
import { FieldValue } from "./field-value";
import { formatAddress } from "./field-value";

/** Collapsible section used under a record (WebAuthor showed these as accordions). */
export function Section({ title, count, open, children }: { title: string; count?: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {count !== undefined && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>}
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------- history

const ACTION_LABEL: Record<string, string> = {
  create: "Created",
  update: "Changed",
  submit: "Submitted",
  unsubmit: "Unsubmitted",
  archive: "Archived",
  unarchive: "Unarchived",
  delete: "Deleted",
  restore: "Restored",
};

const SYSTEM_LABELS: Record<string, string> = { title: "Title", locked: "Locked", submitted_at: "Date Submitted", archived_at: "Archived", deleted_at: "Deleted" };

function describe(t: TableDef, col: string, value: unknown): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return "—";
  if (value === "***") return "•••";
  const f = t.fields.find((x) => x.name === col);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (f?.options) {
    const labels = (Array.isArray(value) ? value : [value]).map((v) => f.options!.find((o) => o.value === v)?.label ?? String(v));
    return labels.join(", ");
  }
  if (f?.type === "address") return formatAddress(value as never) || "—";
  if (f?.type === "date") return formatDate(String(value));
  if (f?.type === "datetime" || col.endsWith("_at")) return formatDateTime(String(value));
  if (f?.type === "lookup" || f?.type === "user") return `#${String(value).slice(0, 8)}`;
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export function HistoryList({ table, entries }: { table: TableDef; entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e) => {
        const changes = Object.entries(e.changes).filter(([k]) => e.action === "update" || e.action === "create" ? !["id"].includes(k) : false);
        return (
          <li key={e.id} className="text-sm">
            <p>
              <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
              <span className="text-muted-foreground">
                {" "}
                by {e.actor} · {formatDateTime(e.at)}
              </span>
            </p>
            {changes.length > 0 && e.action === "update" && (
              <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
                {changes.map(([col, [from, to]]) => (
                  <li key={col}>
                    {table.fields.find((f) => f.name === col)?.label ?? SYSTEM_LABELS[col] ?? col}: {describe(table, col, from)} → {describe(table, col, to)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- related records

export function RelatedList({ items }: { items: Related[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing links to this record yet.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((r) => (
        <li key={`${r.table.name}.${r.field}`}>
          <Link href={r.href} className="flex min-h-12 items-center justify-between px-3 text-sm hover:bg-muted/50">
            {r.label}
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.count}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- sub-lists

export function SubListTable({ list, baseHref }: { list: SubList; baseHref: string }) {
  const cols = listFields(list.table);
  const slug = list.table.name;
  return (
    <div className="flex flex-col gap-2">
      {list.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{r.title ?? `#${r.id}`}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {cols.map((c) => (
                    <span key={c.name}>
                      {c.label}: <FieldValue field={c} value={r[c.name]} compact />
                    </span>
                  ))}
                </p>
              </div>
              {list.canEdit && (
                <Link href={`${baseHref}/sub/${slug}/${r.id}/edit`} aria-label={`Edit ${r.title ?? r.id}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded border hover:bg-muted">
                  <Pencil className="size-4" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.canAdd && (
        <Link href={`${baseHref}/sub/${slug}/new`} className="inline-flex h-11 w-fit items-center gap-1.5 rounded-lg border px-4 text-sm hover:bg-muted">
          <Plus className="size-4" aria-hidden /> {list.table.newRecordLabel}
        </Link>
      )}
    </div>
  );
}
