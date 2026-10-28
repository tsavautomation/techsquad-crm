// PI-c / PI-d (SPEC §9.1): suggestions, never decisions. Which projects an accepted Portal.io proposal probably
// belongs to, and which existing contacts are probably its customer. Pure functions; the loaders live in sync.ts.

export type PortalCustomer = { id?: number | null; firstName?: string | null; lastName?: string | null; companyName?: string | null; email?: string | null; phone?: string | null; partyType?: string | null; contactType?: string | null };
export type PortalLocation = { street?: string | null; suite?: string | null; city?: string | null; state?: string | null; stateAbbrev?: string | null; postalCode?: string | null };
export type ProposalLite = { number: number | null; name: string | null; customer: PortalCustomer | null; location: PortalLocation | null };

export type ProjectLite = { id: number; title: string | null; job_address: { street?: string | null; zip?: string | null; city?: string | null } | null; owner_email: string | null; owner_phone: string | null; owner_name: string | null };
export type ContactLite = { id: number; first_name: string | null; last_name: string | null; email: string | null; alternate_email: string | null; main_phone: string | null; organization: string | null };

export type Suggestion = { id: number; title: string; reason: string; score: number };
export type ContactMatch = { id: number; label: string; reason: string; certain: boolean };

export const normalizeEmail = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
/** Digits only, without a leading US country code. */
export function normalizePhone(s: string | null | undefined): string {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}
/** "9701 Collins Ave., Unit 1203" → "9701 collins ave unit 1203" (punctuation and doubled spaces gone). */
export const normalizeStreet = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["the", "and", "of", "at", "a", "an", "residence", "res", "home", "house", "project", "proposal", "llc", "inc"]);
export const tokens = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9À-ſ ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/** Share of the shorter name's words found in the other (0..1). */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (!ta.length || !tb.size) return 0;
  const hits = ta.filter((w) => tb.has(w)).length;
  return hits / Math.min(ta.length, tb.size);
}

/**
 * Projects an accepted proposal could belong to, best first. `txByNumber`: project ids of Transactions already
 * carrying each Portal number (the strongest sign: the office typed it by hand before the integration).
 */
export function suggestProjects(p: ProposalLite, projects: ProjectLite[], txByNumber: Map<string, number[]>): Suggestion[] {
  const byId = new Map(projects.map((x) => [x.id, x]));
  const out = new Map<number, Suggestion>();
  const add = (id: number, reason: string, score: number) => {
    const pr = byId.get(id);
    if (!pr) return;
    const cur = out.get(id);
    if (!cur || cur.score < score) out.set(id, { id, title: `${pr.title ?? "Project"} (#${id})`, reason, score });
  };
  if (p.number !== null) for (const id of txByNumber.get(String(p.number)) ?? []) add(id, `A Transaction already carries Portal #${p.number}`, 100);
  const email = normalizeEmail(p.customer?.email);
  const phone = normalizePhone(p.customer?.phone);
  const street = normalizeStreet(p.location?.street);
  const zip = (p.location?.postalCode ?? "").trim().slice(0, 5);
  for (const pr of projects) {
    if (email && normalizeEmail(pr.owner_email) === email) add(pr.id, "The Job Owner has the same e-mail", 90);
    if (street && pr.job_address?.street && normalizeStreet(pr.job_address.street) === street && (!zip || !pr.job_address.zip || pr.job_address.zip.slice(0, 5) === zip)) add(pr.id, "Same job address", 85);
    if (phone.length >= 10 && normalizePhone(pr.owner_phone) === phone) add(pr.id, "The Job Owner has the same phone", 80);
    const sim = Math.max(nameSimilarity(p.name, pr.title), nameSimilarity([p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(" "), pr.title), nameSimilarity([p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(" "), pr.owner_name));
    if (sim >= 0.5) add(pr.id, "Similar name", Math.round(40 + sim * 30));
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Existing contacts that look like the proposal's customer: e-mail or phone = certain, full name = likely. */
export function matchContacts(c: PortalCustomer | null, contacts: ContactLite[]): ContactMatch[] {
  if (!c) return [];
  const email = normalizeEmail(c.email);
  const phone = normalizePhone(c.phone);
  const first = (c.firstName ?? "").trim().toLowerCase();
  const last = (c.lastName ?? "").trim().toLowerCase();
  const out: ContactMatch[] = [];
  for (const k of contacts) {
    const label = `${[k.first_name, k.last_name].filter(Boolean).join(" ") || "Contact"}${k.organization ? ` · ${k.organization}` : ""} (#${k.id})`;
    if (email && (normalizeEmail(k.email) === email || normalizeEmail(k.alternate_email) === email)) out.push({ id: k.id, label, reason: "Same e-mail", certain: true });
    else if (phone.length >= 10 && normalizePhone(k.main_phone) === phone) out.push({ id: k.id, label, reason: "Same phone", certain: true });
    else if (first && last && (k.first_name ?? "").trim().toLowerCase() === first && (k.last_name ?? "").trim().toLowerCase() === last) out.push({ id: k.id, label, reason: "Same first and last name", certain: false });
  }
  return out.sort((a, b) => Number(b.certain) - Number(a.certain)).slice(0, 6);
}

/** PI-e: what differs between the proposal now and the Transaction created from it (null = nothing). */
export function proposalChanges(row: { total: number | null; name: string | null; change_orders: unknown[] | null; synced_total: number | null; synced_name: string | null; synced_change_orders: unknown[] | null }): { total?: [number | null, number | null]; name?: [string | null, string | null]; change_orders?: [number, number] } | null {
  const out: NonNullable<ReturnType<typeof proposalChanges>> = {};
  if (Number(row.total ?? 0) !== Number(row.synced_total ?? 0)) out.total = [row.synced_total, row.total];
  if ((row.name ?? "") !== (row.synced_name ?? "")) out.name = [row.synced_name, row.name];
  const a = row.synced_change_orders?.length ?? 0;
  const b = row.change_orders?.length ?? 0;
  if (a !== b) out.change_orders = [a, b];
  return Object.keys(out).length ? out : null;
}

/** The Portal.io payment-request statuses that still wait for money. */
export const OPEN_REQUEST = (status: string | null | undefined) => !["Paid", "Cancelled", "Draft", "Refunded"].includes(status ?? "");
