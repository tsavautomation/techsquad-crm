import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/dates";
import { BUCKET } from "@/lib/records/relations";
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
  table: string;
  recordId: number;
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
    ? `<p style="margin:20px 0"><a href="${escape(opts.link)}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open in TechSquad CRM</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;max-width:640px">
<p style="margin:0 0 4px;color:#6b7280;font-size:12px">TechSquad CRM · ${escape(opts.tableLabel)}</p>
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
  table_name: string;
  record_id: number;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  html: string;
  attachments: OutboxAttachment[];
  test_mode: boolean;
};

async function buildRecordPdf(db: SupabaseClient, tableName: string, recordId: number) {
  const t = getTable(tableName);
  const rec = await loadEngineRecord(db, t, recordId);
  if (!rec) return null;
  const display = await displayStrings(db, t, rec);
  const images: PdfImage[] = [];
  for (const f of t.fields.filter((x) => x.type === "image" || x.type === "signature" || x.type === "file")) {
    for (const file of (rec.files[f.name] ?? []).filter((x) => (x.mime ?? "").match(/^image\/(jpeg|png)$/)).slice(0, 6)) {
      const { data } = await db.storage.from(BUCKET).download(file.path);
      if (data) images.push({ label: f.label, data: Buffer.from(await data.arrayBuffer()), signature: f.type === "signature" });
    }
  }
  const buffer = await recordPdf({
    tableLabel: t.label,
    title: rec.title ?? `${t.itemLabel} #${recordId}`,
    generatedAt: formatDateTime(new Date().toISOString()),
    fields: cardFields(t, rec, display).filter((f) => !/\d+ files?$/.test(f.value)),
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
      const pdf = await buildRecordPdf(db, m.table_name, m.record_id);
      if (pdf) {
        attachments.push(pdf);
        budget -= pdf.content.length * 0.75;
      }
      continue;
    }
    if ((a.size ?? 0) <= budget) {
      const { data: blob } = await db.storage.from(BUCKET).download(a.path);
      if (blob) {
        attachments.push({ filename: a.name, content: Buffer.from(await blob.arrayBuffer()).toString("base64") });
        budget -= a.size ?? blob.size;
        continue;
      }
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
