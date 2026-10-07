import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/dates";
import { isOneDrivePath } from "@/lib/files/paths";
import { BUCKET, downloadFile } from "@/lib/files/store";
import { recordHref } from "@/registry/routes";
import { getTable } from "@/registry";
import { recordPdf, type PdfImage } from "./pdf";
import { cardFields, displayStrings, loadEngineRecord } from "./record-view";

// All email goes through public.email_outbox (CLAUDE.md "Email"): queue, then deliver via Resend.
// EMAIL_TEST_MODE (default true) sends everything to EMAIL_TEST_RECIPIENT with "[TEST]" in the subject.

const MAX_ATTACH_BYTES = 25 * 1024 * 1024; // stay well under Resend's 40 MB per email
const LINK_DAYS = 7;

export type OutboxAttachment = { kind: "record_pdf" } | { kind: "file"; path: string; name: string; size: number | null };

export type QueuedEmail = {
  automationId: number | null;
  /** The record the email is about; null for system email such as sign-up links. */
  table: string | null;
  recordId: number | null;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments: OutboxAttachment[];
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** WebAuthor-style "item card": the record's fields as a small table, plus an optional link. */
export function cardHtml(opts: { title: string; tableLabel: string; fields: { label: string; value: string; heading?: string }[]; link?: string }) {
  const rows = opts.fields
    .map(
      (f) =>
        (f.heading ? `<tr><td colspan="2" style="padding:10px 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">${escape(f.heading)}</td></tr>` : "") +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${escape(f.label)}</td><td style="padding:4px 0">${escape(f.value).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");
  const button = opts.link
    ? `<p style="margin:20px 0"><a href="${escape(opts.link)}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open in the Managing System</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;max-width:640px">
<p style="margin:0 0 4px;color:#6b7280;font-size:12px">Tech Squad Managing System · ${escape(opts.tableLabel)}</p>
<h2 style="margin:0 0 12px;font-size:18px">${escape(opts.title)}</h2>
${rows ? `<table style="border-collapse:collapse;font-size:14px">${rows}</table>` : ""}
${button}</div>`;
}

/** "TS CRM" (a name only) → sent from info@tsav.net with that display name. */
export function fromHeader(from: string) {
  if (from.includes("@")) return from;
  return `${from} <info@tsav.net>`;
}

export async function queueEmail(db: SupabaseClient, e: QueuedEmail): Promise<string> {
  const { data, error } = await db
    .from("email_outbox")
    .insert({
      automation_id: e.automationId,
      table_name: e.table,
      record_id: e.recordId,
      from_address: fromHeader(e.from),
      to_addresses: e.to,
      cc_addresses: e.cc ?? [],
      bcc_addresses: e.bcc ?? [],
      subject: e.subject,
      html: e.html,
      attachments: e.attachments,
      test_mode: process.env.EMAIL_TEST_MODE !== "false",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not queue email: ${error.message}`);
  return (data as { id: string }).id;
}

type OutboxRow = {
  id: string;
  table_name: string | null;
  record_id: number | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  html: string;
  attachments: OutboxAttachment[];
  test_mode: boolean;
};

/** The record as a PDF (fields and up to six photos): e-mail attachments and the OneDrive copies (SPEC §9.1 OD-c). */
export async function buildRecordPdf(db: SupabaseClient, tableName: string, recordId: number, o: { withImages?: boolean } = {}) {
  const t = getTable(tableName);
  const rec = await loadEngineRecord(db, t, recordId);
  if (!rec) return null;
  const display = await displayStrings(db, t, rec);
  const images: PdfImage[] = [];
  for (const f of o.withImages === false ? [] : t.fields.filter((x) => x.type === "image" || x.type === "signature" || x.type === "file")) {
    for (const file of (rec.files[f.name] ?? []).filter((x) => (x.mime ?? "").match(/^image\/(jpeg|png)$/)).slice(0, 6)) {
      const got = await downloadFile(db, file.path);
      if (got) images.push({ label: f.label, data: got.bytes, signature: f.type === "signature" });
    }
  }
  const fields = cardFields(t, rec, display).filter((f) => !/\d+ files?$/.test(f.value));
  // F21-f (Fred 2026-10-07): a Job Report's PDF carries the visit's check-in and check-out times.
  if (tableName === "job_reports" && typeof rec.values.visit_id === "number") {
    const { data: v } = await db.from("visits").select("checked_in_at, checked_out_at").eq("id", rec.values.visit_id).maybeSingle();
    const visit = v as { checked_in_at: string | null; checked_out_at: string | null } | null;
    const times = [visit?.checked_in_at ? { label: "Check-in", value: formatDateTime(visit.checked_in_at) } : null, visit?.checked_out_at ? { label: "Check-out", value: formatDateTime(visit.checked_out_at) } : null].filter((x): x is { label: string; value: string } => x !== null);
    const at = fields.findIndex((f) => f.label === "Visit");
    fields.splice(at >= 0 ? at + 1 : fields.length, 0, ...times);
  }
  const buffer = await recordPdf({
    tableLabel: t.label,
    title: rec.title ?? `${t.itemLabel} #${recordId}`,
    generatedAt: formatDateTime(new Date().toISOString()),
    fields,
    images,
  });
  const safe = (rec.title ?? `${t.itemLabel}-${recordId}`).replace(/[^\w\- ]+/g, "").trim().slice(0, 80) || "record";
  return { filename: `${safe}.pdf`, content: buffer.toString("base64") };
}

/** Send one queued email through Resend and record the outcome in the outbox. */
export async function deliver(db: SupabaseClient, id: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await db.from("email_outbox").select("*").eq("id", id).eq("status", "queued").maybeSingle();
  if (!data) return { ok: false, error: "not queued" };
  const m = data as OutboxRow;

  const fail = async (error: string) => {
    await db.from("email_outbox").update({ status: "failed", error }).eq("id", id);
    return { ok: false, error };
  };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return fail("RESEND_API_KEY is not set");

  // Attachments: the record PDF, then files up to the size budget; larger files become download links.
  const attachments: { filename: string; content: string }[] = [];
  const links: string[] = [];
  let budget = MAX_ATTACH_BYTES;
  for (const a of m.attachments ?? []) {
    if (a.kind === "record_pdf") {
      const pdf = m.table_name && m.record_id ? await buildRecordPdf(db, m.table_name, m.record_id) : null;
      if (pdf) {
        attachments.push(pdf);
        budget -= pdf.content.length * 0.75;
      }
      continue;
    }
    if ((a.size ?? 0) <= budget) {
      const got = await downloadFile(db, a.path);
      if (got) {
        attachments.push({ filename: a.name, content: got.bytes.toString("base64") });
        budget -= a.size ?? got.bytes.length;
        continue;
      }
    }
    if (isOneDrivePath(a.path)) {
      // OneDrive links expire within the hour; point to the record instead (the reader signs in to see it).
      const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
      const t = m.table_name ? getTable(m.table_name) : null;
      links.push(`<li>${escape(a.name)}${t && m.record_id && site ? ` (open in the CRM: <a href="${escape(site + recordHref(t, m.record_id))}">${escape(t.itemLabel)} #${m.record_id}</a>)` : ""}</li>`);
      continue;
    }
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(a.path, LINK_DAYS * 86400);
    if (signed?.signedUrl) links.push(`<li><a href="${escape(signed.signedUrl)}">${escape(a.name)}</a></li>`);
  }

  let html = m.html;
  if (links.length) html += `<p style="font-family:Arial,sans-serif;font-size:13px">Files (links valid ${LINK_DAYS} days):</p><ul style="font-family:Arial,sans-serif;font-size:13px">${links.join("")}</ul>`;

  let to = m.to_addresses;
  let cc = m.cc_addresses;
  let bcc = m.bcc_addresses;
  let subject = m.subject;
  if (m.test_mode) {
    const intended = [`To: ${m.to_addresses.join(", ") || "—"}`, m.cc_addresses.length ? `Cc: ${m.cc_addresses.join(", ")}` : "", m.bcc_addresses.length ? `Bcc: ${m.bcc_addresses.join(", ")}` : ""].filter(Boolean).join(" · ");
    html = `<p style="font-family:Arial,sans-serif;font-size:12px;background:#fef3c7;padding:8px 12px;border-radius:6px">TEST MODE — this email would have gone to ${escape(intended)}</p>${html}`;
    to = [process.env.EMAIL_TEST_RECIPIENT || "fred@tsav.net"];
    cc = [];
    bcc = [];
    subject = `[TEST] ${subject}`;
  }
  if (!to.length) return fail("No recipients");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: m.from_address, to, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined, subject, html, attachments: attachments.length ? attachments : undefined }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return fail(`Resend ${res.status}: ${body.message ?? "error"}`);
  await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: body.id ?? null, error: null }).eq("id", id);
  return { ok: true };
}

/** Retry anything still queued (called by the scheduled job, M11). */
export async function deliverQueued(db: SupabaseClient, limit = 20) {
  const { data } = await db.from("email_outbox").select("id").eq("status", "queued").order("created_at").limit(limit);
  for (const r of (data ?? []) as { id: string }[]) await deliver(db, r.id);
}
