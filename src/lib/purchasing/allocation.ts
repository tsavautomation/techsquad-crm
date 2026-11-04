import type { MaterialRow } from "./materials";

// PU-d (Fred 2026-11-04): "the same project has a table for equipment installed on this job … that should
// subtract from the material list automatically". The units whose destination is the project (Stock records
// Installed = On Project, or Staged = Separated for it) are laid over the pick list: each line gets how many of
// its product are installed / staged, and only the rest is still to buy. A unit the list has no line for is an
// "extra" (red): the buyer adds it to the list or ignores it. Pure (tests/pu-allocation.test.ts); nothing stored.

export type ProjectUnit = { id: number; product_id: number | null; model: string | null; title: string | null; status: "On Project" | "Separated" };
export type IgnoredExtra = { id: number; product_id: number | null; model: string | null };
export type Extra = {
  /** `p:<product_id>` or `m:<model>`: what the ignore list stores. */
  key: string;
  product_id: number | null;
  model: string | null;
  title: string | null;
  installed: number;
  staged: number;
  count: number;
  /** The ignore row, when the buyer said to leave it. */
  ignored_id: number | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
export const extraKey = (u: { product_id: number | null; model: string | null }) => (u.product_id ? `p:${u.product_id}` : `m:${norm(u.model)}`);

/** Which line a unit belongs to: the same product (the line's picked or model-matched product), else the same model. Open and purchased lines only, oldest first. */
function lineKeys(m: MaterialRow): string[] {
  const keys: string[] = [];
  if (m.product_id) keys.push(`p:${m.product_id}`);
  if (norm(m.model)) keys.push(`m:${norm(m.model)}`);
  return keys;
}

/** Lays the project's units over its lines. Returns the lines with installed / staged / allocated filled and the units no line takes. */
export function allocate(rows: MaterialRow[], units: ProjectUnit[], ignored: IgnoredExtra[] = []): { rows: MaterialRow[]; extras: Extra[] } {
  const out = rows.map((m) => ({ ...m, installed: 0, staged: 0, allocated: 0 }));
  const open = out.filter((m) => m.status === "open" || m.status === "purchased").sort((a, b) => a.id - b.id);
  const byKey = new Map<string, typeof open>();
  for (const m of open) for (const k of lineKeys(m)) byKey.set(k, [...(byKey.get(k) ?? []), m]);
  const left: ProjectUnit[] = [];
  for (const u of [...units].sort((a, b) => (a.status === "On Project" ? 0 : 1) - (b.status === "On Project" ? 0 : 1) || a.id - b.id)) {
    const keys = [u.product_id ? `p:${u.product_id}` : null, norm(u.model) ? `m:${norm(u.model)}` : null].filter((k): k is string => Boolean(k));
    const line = keys.flatMap((k) => byKey.get(k) ?? []).find((m) => m.allocated < Number(m.quantity));
    if (!line) {
      left.push(u);
      continue;
    }
    line.allocated++;
    if (u.status === "On Project") line.installed++;
    else line.staged++;
  }
  const ignoredBy = new Map(ignored.map((i) => [extraKey(i), i.id]));
  const extras = new Map<string, Extra>();
  for (const u of left) {
    const key = extraKey(u);
    const e = extras.get(key) ?? { key, product_id: u.product_id, model: u.model, title: u.title ?? u.model, installed: 0, staged: 0, count: 0, ignored_id: ignoredBy.get(key) ?? null };
    e.count++;
    if (u.status === "On Project") e.installed++;
    else e.staged++;
    extras.set(key, e);
  }
  return { rows: out, extras: [...extras.values()].sort((a, b) => Number(Boolean(a.ignored_id)) - Number(Boolean(b.ignored_id)) || b.count - a.count || (a.title ?? "").localeCompare(b.title ?? "")) };
}

/** Units of several projects at once (Administrative › Purchasing): each project's lines get its own units. */
export function allocateAll(rows: MaterialRow[], units: (ProjectUnit & { project_id: number })[]): MaterialRow[] {
  const byProject = new Map<number, (ProjectUnit & { project_id: number })[]>();
  for (const u of units) byProject.set(u.project_id, [...(byProject.get(u.project_id) ?? []), u]);
  const projects = [...new Set(rows.map((m) => m.project_id))];
  const out: MaterialRow[] = [];
  for (const p of projects) out.push(...allocate(rows.filter((m) => m.project_id === p), byProject.get(p) ?? []).rows);
  return out;
}
