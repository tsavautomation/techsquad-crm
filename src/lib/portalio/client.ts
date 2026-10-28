import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { adminDb } from "@/lib/supabase/admin";
import { signedHeaders } from "./sign";

// PI-a (SPEC §9.1, Fred 2026-10-28): the Portal.io API. Application key + secret come from the environment
// (PORTAL_ENV picks sandbox or production); the user key is obtained once from Fred's Portal.io sign-in on
// Admin › Portal.io and kept encrypted in app_integrations under 'portalio'. The CRM only reads from Portal.io.

export const KEY = "portalio";
/** PI-i (Fred 2026-10-28, going to production): review starts with this year's proposals; changeable on Admin › Portal.io. */
export const DEFAULT_REVIEW_FROM = "2026-01-01";

/** The accepted date a proposal needs to be offered for review (null = every proposal). */
export async function reviewFrom(): Promise<string | null> {
  const s = await loadSettings().catch(() => null);
  return s ? s.review_from : DEFAULT_REVIEW_FROM;
}

/** PI-i: switching environments (sandbox → production) or disconnecting empties the mirror; links live on in the Transactions (they carry the Portal #). */
export async function clearMirror() {
  const { error } = await adminDb().from("portal_proposals").delete().gte("id", 0);
  if (error) throw new Error(`Could not clear the Portal.io mirror: ${error.message}`);
}

export type PortalEnv = "sandbox" | "production";

export type PortalSettings = {
  env: PortalEnv;
  user_key: string;
  user_name: string;
  display_name: string | null;
  connected_at: string;
  connected_by: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_full_sync_at: string | null;
  /** PI-i: only proposals accepted on or after this date are offered for review (older ones stay in the mirror). */
  review_from: string | null;
  webhook: { subscription_id: number | string; secret: string; url: string; events: string[]; created_at: string } | null;
};

export function portalEnv(): { env: PortalEnv; apiUrl: string; appUrl: string; appId: string; secret: string } | null {
  const env: PortalEnv = process.env.PORTAL_ENV === "production" ? "production" : "sandbox";
  const appId = env === "production" ? process.env.PORTAL_PROD_APP_ID : process.env.PORTAL_SANDBOX_APP_ID;
  const secret = env === "production" ? process.env.PORTAL_PROD_SECRET : process.env.PORTAL_SANDBOX_SECRET;
  if (!appId || !secret) return null;
  return { env, apiUrl: env === "production" ? "https://api.portal.io" : "https://sandbox.api.portal.io", appUrl: env === "production" ? "https://portal.io" : "https://sandbox.portal.io", appId, secret };
}

// ---------------------------------------------------------------- settings

export async function loadSettings(): Promise<PortalSettings | null> {
  const { data } = await adminDb().from("app_integrations").select("data").eq("key", KEY).maybeSingle();
  const d = (data as { data: Partial<PortalSettings> } | null)?.data;
  if (!d?.user_key) return null;
  const s = d as PortalSettings;
  return { ...s, user_key: decrypt(s.user_key), webhook: s.webhook ? { ...s.webhook, secret: decrypt(s.webhook.secret) } : null, last_sync_at: s.last_sync_at ?? null, last_sync_error: s.last_sync_error ?? null, last_full_sync_at: s.last_full_sync_at ?? null, review_from: s.review_from === undefined ? DEFAULT_REVIEW_FROM : s.review_from };
}

export async function saveSettings(s: PortalSettings, userId: string | null = null) {
  const { error } = await adminDb()
    .from("app_integrations")
    .upsert({ key: KEY, data: { ...s, user_key: encrypt(s.user_key), webhook: s.webhook ? { ...s.webhook, secret: encrypt(s.webhook.secret) } : null }, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(`Could not save the Portal.io connection: ${error.message}`);
}

export async function patchSettings(patch: Partial<PortalSettings>) {
  const s = await loadSettings();
  if (!s) return;
  await saveSettings({ ...s, ...patch });
}

export const disconnect = async () => {
  await adminDb().from("app_integrations").delete().eq("key", KEY);
};

// ---------------------------------------------------------------- requests

export class PortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, opts: { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string | number | boolean | undefined>; body?: unknown; userKey: string }): Promise<T> {
  const env = portalEnv();
  if (!env) throw new PortalError("Portal.io keys are not set (PORTAL_SANDBOX_* / PORTAL_PROD_* in the environment)", 0);
  const url = new URL(path, env.apiUrl);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const method = opts.method ?? "GET";
  const contentType = method === "GET" ? undefined : "application/json";
  const headers = signedHeaders({ method, url: url.toString(), appId: env.appId, secret: env.secret, userKey: opts.userKey, contentType });
  const res = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const hint = res.status === 401 ? "Portal.io refused the signature or the user key" : res.status === 402 ? "Portal.io says an active subscription is required" : res.status === 403 ? "The Portal.io user may not do this" : `Portal.io answered ${res.status}`;
    throw new PortalError(`${hint}${text ? `: ${text.slice(0, 300)}` : ""}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Admin › Portal.io › Connect: trade the Portal.io sign-in for the user key, once. The password is used here and nowhere else. */
export async function exchangeCredentials(username: string, password: string): Promise<{ apiKey: string; userName: string; displayName: string | null }> {
  const r = await request<{ userName?: string; displayName?: string; meta?: { apiKey?: string } }>("/authenticate/apikeyexchange", { query: { username, password }, userKey: "" });
  const apiKey = r.meta?.apiKey;
  if (!apiKey) throw new PortalError("Portal.io did not return a user key", 200);
  return { apiKey, userName: r.userName ?? username, displayName: r.displayName ?? null };
}

export type ProposalStatus = "Undefined" | "Draft" | "Submitted" | "ViewedByClient" | "Accepted" | "Declined" | "Delayed" | "Completed" | "EmailFailed" | "Expired";
export type ProposalSummary = {
  id: number;
  number: number;
  name: string | null;
  status: ProposalStatus;
  total?: { proposalTotal?: number; currency?: { code?: string; symbol?: string } } | null;
  createdDate?: string;
  lastModifiedDate?: string;
  lastModifiedByUserDate?: string;
  customer?: { id?: number; partyType?: string; contactType?: string; firstName?: string | null; lastName?: string | null; companyName?: string | null; contactEmail?: string | null; contactEmailCC?: string | null; contactPhone?: string | null } | null;
  salesperson?: { id?: number; email?: string | null; firstName?: string | null; lastName?: string | null } | null;
};
export type PortalAddress = { id?: number; street?: string | null; suite?: string | null; city?: string | null; postalCode?: string | null; state?: string | null; stateAbbrev?: string | null; country?: string | null; phone?: string | null };
export type ProposalDetail = ProposalSummary & {
  clientLastDecisionDate?: string | null;
  lastCompletedDate?: string | null;
  lastSubmittedDate?: string | null;
  projectDescription?: string | null;
  customer?: (ProposalSummary["customer"] & { location?: PortalAddress | null }) | null;
  partsTotal?: number;
  laborTotal?: number;
  feeTotal?: number;
  proposalSubtotal?: number;
  proposalTotal?: number;
  salesTax?: { total?: number } | null;
  /** Where the sandbox really keeps the money (2026-10-28): financialSummary.proposalTotal etc. */
  financialSummary?: { partsTotal?: number; laborTotal?: number; feeTotal?: number; proposalSubtotal?: number; proposalTotal?: number; salesTax?: { total?: number } | null; currency?: { code?: string; symbol?: string } } | null;
  paymentRequests?: { id?: number; status?: string; amount?: number; dueDate?: string | null; description?: string | null; paymentMethod?: string | null }[] | null;
  paymentSchedule?: unknown;
  changeOrders?: { id: number; number?: number; name?: string | null; status?: string; total?: { changeOrderTotal?: number } | null }[] | null;
  areas?: { id: number; name?: string; options?: { id: number; status?: string; items?: unknown[] }[] }[] | null;
};

export async function listProposals(userKey: string, q: { modifiedAfter?: string; isArchive?: boolean; pageNumber: number; pageSize?: number }): Promise<{ proposals: ProposalSummary[]; proposalCount: number }> {
  return request("/public/proposals", { userKey, query: { ModifiedAfter: q.modifiedAfter, IsArchive: q.isArchive ?? false, PageNumber: q.pageNumber, PageSize: q.pageSize ?? 100, SortBy: "ModifiedDate", SortDirection: "Desc" } });
}

export const getProposal = (userKey: string, id: number) => request<ProposalDetail>(`/public/proposals/${id}`, { userKey });

// ---------------------------------------------------------------- webhooks

export type Subscription = { subscriptionId: number | string; secretKey?: string; url: string; description?: string; enabled?: boolean; events?: string[] };
export const WEBHOOK_EVENTS = ["proposal.status_changed"];

export const subscribeWebhook = (userKey: string, url: string) => request<Subscription>("/public/webhook/subscribe", { method: "POST", userKey, body: { Url: url, Description: "TechSquad CRM", Events: WEBHOOK_EVENTS } });
export const listSubscriptions = (userKey: string) => request<Subscription[]>("/public/webhook/subscriptions", { userKey });
export const unsubscribeWebhook = (userKey: string, id: number | string) => request<void>(`/public/webhook/unsubscribe/${id}`, { method: "DELETE", userKey });

/** The proposal in Portal.io's own app, for the links on the cards. */
export const proposalUrl = (id: number) => `${portalEnv()?.appUrl ?? "https://portal.io"}/proposals/${id}`;
