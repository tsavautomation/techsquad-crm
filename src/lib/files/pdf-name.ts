import type { FieldDef, TableDef } from "@/registry/types";

// The name of a record's PDF copy in OneDrive (SPEC §9.1 OD-c), Fred's order: job, technician, date,
// e.g. "Job Report – Stern Residence - 6070 NBR – Carlos Gurgel – 10-04-2026 (1234).pdf".
// The record number at the end keeps two reports of the same day apart. Pure: tests/od-record-pdf.test.ts.

const UPLOAD_TYPES = new Set(["file", "image", "signature"]);

/** Tables whose records get a PDF copy: top-level record types that can carry files (not utility lists, never a private one: OD-e). */
export const wantsPdf = (t: TableDef) => !t.parent && !t.privateFiles && t.module !== "utility" && Boolean(t.tab) && t.fields.some((f) => UPLOAD_TYPES.has(f.type));

/** The field that says who did the work: a single lookup to employees first, else a multi-lookup. */
export function technicianField(t: TableDef): FieldDef | null {
  const emp = t.fields.filter((f) => f.type === "lookup" && f.lookup?.table === "employees");
  return emp.find((f) => !f.multiple) ?? emp.find((f) => f.multiple) ?? null;
}

/** The record's own date (first date field), else the day it was created. */
export const dateField = (t: TableDef): FieldDef | null => t.fields.find((f) => f.type === "date") ?? null;

const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

/** "10-04-2026" from an ISO date or timestamp, in the record's own calendar day. */
export function fileDate(iso: string | null | undefined, fallback: string): string {
  const d = (iso ?? "").slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : fallback;
}

export function pdfFileName(o: { formLabel: string; job: string | null; technician: string | null; date: string; id: number }): string {
  const parts = [o.formLabel, o.job, o.technician, o.date].filter((x): x is string => Boolean(x && x.trim())).map(clean);
  // "(1234)" like the project folders; OneDrive names can't carry "#".
  return `${parts.join(" – ").slice(0, 160)} (${o.id}).pdf`;
}
