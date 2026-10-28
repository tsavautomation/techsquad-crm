import "server-only";
import type { ReviewCardData } from "@/components/finance/portal-review";
import { proposalUrl } from "@/lib/portalio/client";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import type { ReviewCard } from "./load";
import type { SheetRowRecord } from "./sheet-link";
import { cleanTitle } from "./sheet";

/** Review rows → what the client card needs (plain data, no detail JSON). */
export function toCardData(cards: ReviewCard[]): ReviewCardData[] {
  const projects = getTable("projects");
  return cards.map(({ proposal: p, kind, changes, projectTitle }) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    total: p.total,
    accepted_at: p.accepted_at,
    customer: p.customer ? { firstName: p.customer.firstName, lastName: p.customer.lastName, companyName: p.customer.companyName, email: p.customer.email, phone: p.customer.phone } : null,
    location: p.location ? { street: p.location.street, suite: p.location.suite, city: p.location.city, stateAbbrev: p.location.stateAbbrev, postalCode: p.location.postalCode } : null,
    suggestions: p.suggestions ?? [],
    kind,
    changes,
    project_id: p.project_id,
    projectTitle,
    projectHref: p.project_id ? recordHref(projects, p.project_id) : null,
    portalUrl: proposalUrl(p.id),
    source: "portal" as const,
  }));
}

/** FIN-m: a sheet row as a review card (same choices as a Portal.io proposal). */
export function sheetCardData(rows: SheetRowRecord[]): ReviewCardData[] {
  return rows.map((r) => ({
    id: r.id,
    number: r.main_number,
    name: `${r.number && !/^\d+$/.test(r.number) ? `${r.number} · ` : ""}${cleanTitle(r.title, r.number) ?? ""}`,
    total: r.amount,
    accepted_at: null,
    customer: null,
    location: null,
    suggestions: r.suggestions ?? [],
    kind: "new" as const,
    changes: null,
    project_id: null,
    projectTitle: null,
    projectHref: null,
    portalUrl: null,
    source: "sheet" as const,
    sheet: { customer: r.customer, designer: r.designer, paid: Math.round(r.payments.reduce((n, p) => n + p.amount, 0) * 100) / 100, payments: r.payments.length, status: r.status, receivable: r.receivable, commission: r.commission, date: r.date },
  }));
}
