"use server";

import { revalidatePath } from "next/cache";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { canSeeFinance } from "@/lib/finance/access";
import { saveRecord } from "@/lib/records/save";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { contactMatches } from "@/lib/portalio/sync";
import type { ContactMatch } from "@/lib/portalio/match";
import type { NewContactInput } from "@/lib/portalio/actions";
import { cleanTitle } from "./sheet";
import { linkSheetRow, SHEET_COLS, type SheetLinkSummary, type SheetRowRecord } from "./sheet-link";

// FIN-m: what the office does with a row of the Sales Projections sheet on Finance › Portal.io: Link to project,
// New project (pick or create the Job Owner, never automatic), Ignore. Same rules as the Portal.io cards.

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function finance(): Promise<Result<{ me: CurrentUser }>> {
  const me = await requireUser();
  if (!canSeeFinance(me)) return { ok: false, message: "You don't have permission to do that." };
  if (!canDo(me.permissions, getTable("transactions"), "create", getTable)) return { ok: false, message: "You need permission to create Transactions." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  return { ok: true, me };
}

function refreshPaths(projectId?: number | null) {
  revalidatePath("/administrative/finance");
  revalidatePath("/");
  if (projectId) revalidatePath(recordHref(getTable("projects"), projectId));
}

async function row(id: number): Promise<SheetRowRecord | null> {
  const { data } = await adminDb().from("sheet_proposals").select(SHEET_COLS).eq("id", id).maybeSingle();
  return (data as unknown as SheetRowRecord | null) ?? null;
}

/** The customer cell as a person: "2687 Flamingo: Simcha Hyman" → Simcha Hyman; "Navicon" → Navicon. */
function customerName(customer: string | null): { firstName: string | null; lastName: string | null; street: string | null } {
  const c = (customer ?? "").trim();
  const street = /^\d/.test(c) ? c.split(/[:,]/)[0].trim() : null;
  const who = c.includes(":") ? c.split(":").pop()!.trim() : street ? "" : c;
  const [first, ...rest] = who.split(/\s+/).filter(Boolean);
  return { firstName: first ?? null, lastName: rest.join(" ") || null, street };
}

export async function linkSheetRowAction(rowId: number, projectId: number): Promise<Result<{ sync: SheetLinkSummary }>> {
  const a = await finance();
  if (!a.ok) return a;
  const r = await linkSheetRow(adminDb(), rowId, projectId, { actor: a.me.id });
  if (!r.ok) return r;
  refreshPaths(projectId);
  return { ok: true, sync: r.summary };
}

export async function ignoreSheetRowAction(rowId: number, back = false): Promise<Result> {
  const a = await finance();
  if (!a.ok) return a;
  await adminDb().from("sheet_proposals").update({ link_status: back ? "new" : "ignored", linked_by: a.me.id }).eq("id", rowId).neq("link_status", "linked");
  refreshPaths();
  return { ok: true };
}

/** Contacts that look like the row's customer (by name only: the sheet has no e-mail or phone). */
export async function sheetContactMatchesAction(rowId: number): Promise<ContactMatch[]> {
  const a = await finance();
  if (!a.ok) return [];
  const r = await row(rowId);
  if (!r) return [];
  const n = customerName(r.customer);
  if (!n.firstName || !n.lastName) return [];
  return contactMatches(adminDb(), { firstName: n.firstName, lastName: n.lastName });
}

/** The prefilled new-contact box for a sheet row. */
export async function sheetCustomerAction(rowId: number): Promise<{ firstName: string | null; lastName: string | null; street: string | null }> {
  const a = await finance();
  if (!a.ok) return { firstName: null, lastName: null, street: null };
  const r = await row(rowId);
  return customerName(r?.customer ?? null);
}

/** New project from a sheet row: the Job Owner is picked or typed by the person (PI-d), then the project, then Link. */
export async function createProjectFromSheetRowAction(rowId: number, owner: { contactId: number } | { newContact: NewContactInput }): Promise<Result<{ projectId: number }>> {
  const a = await finance();
  if (!a.ok) return a;
  if (!canDo(a.me.permissions, getTable("projects"), "create", getTable)) return { ok: false, message: "You need permission to create Projects." };
  const r = await row(rowId);
  if (!r) return { ok: false, message: "This sheet row is no longer there." };
  let contactId: number;
  if ("contactId" in owner) contactId = owner.contactId;
  else {
    if (!canDo(a.me.permissions, getTable("contacts"), "create", getTable)) return { ok: false, message: "You need permission to create Contacts." };
    const c = owner.newContact;
    const s = await saveRecord("contacts", null, { type: c.type || "End Customer", first_name: c.first_name.trim(), last_name: c.last_name.trim(), email: c.email.trim() || null, main_phone: c.main_phone.trim() || null, organization_id: c.organization_id });
    if (!s.ok) return { ok: false, message: s.message ?? Object.values(s.errors).join("; ") };
    contactId = s.id;
  }
  const n = customerName(r.customer);
  const pr = await saveRecord("projects", null, {
    title: (cleanTitle(r.title, r.number) ?? `Proposal ${r.number ?? ""}`).slice(0, 200),
    job_owner_id: contactId,
    job_address: n.street ? { street: n.street, address_2: "", city: "", state: "", zip: "" } : null,
    job_status: r.status === "Completed" ? "Complete" : r.status === "On Hold" ? "ON HOLD" : "Proposal Approved",
  });
  if (!pr.ok) return { ok: false, message: pr.message ?? Object.values(pr.errors).join("; ") };
  const link = await linkSheetRow(adminDb(), rowId, pr.id, { actor: a.me.id });
  if (!link.ok) return link;
  refreshPaths(pr.id);
  return { ok: true, projectId: pr.id };
}
