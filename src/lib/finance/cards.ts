import "server-only";
import type { ReviewCardData } from "@/components/finance/portal-review";
import { proposalUrl } from "@/lib/portalio/client";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import type { ReviewCard } from "./load";

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
  }));
}
