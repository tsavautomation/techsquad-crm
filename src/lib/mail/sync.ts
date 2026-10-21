import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { oneDriveReady, ROOT, uploadBytes } from "@/lib/files/onedrive";
import { safeName } from "@/lib/files/paths";
import { adminDb } from "@/lib/supabase/admin";
import { fetchAnywhere, fetchRaw, findUid, IGNORED_LABEL, INBOX, loadSettings, moveToLabel, newUids, parseRaw, saveSettings, withMailbox, type GmailSettings, type Session } from "./client";
import { actorLabel, emailFolderName, isSystemMail, matchProject, parseMessage, projectLabel, type MailAttachment, type ParsedMail, type ProjectForMatch } from "./engine";

// F26-2 Gmail intake: every five minutes (pg_cron 'crm-mail' → /api/cron/mail) the mailbox is read over IMAP.
// New emails become mail_messages rows; the ones that match a project are filed at once (a project_events
// row, attachments in OneDrive) and moved out of the inbox into the label Projects/<project> (<id>) — the
// OneDrive folder's name (Fred 2026-10-21: an email still in the inbox was not processed). Google's own
// notices go to the label Ignored. The rest wait in the inbox and in the Assign list on Today.

export type SyncSummary = { read: number; filed: number; waiting: number; moved: number; errors: string[]; skipped?: string };
export type StoredAttachment = MailAttachment & { item_id?: string; error?: string };

const FIRST_LOOKBACK_MS = 30 * 24 * 3600_000;
const BUDGET_MS = 150_000;
const MAX_PER_RUN = 100;
/** gmail_label for an email that was no longer in the inbox when the CRM went to move it (someone moved it by hand). */
const NOT_IN_INBOX = "-";

type MailRow = { id: number; gmail_id: string; uid: number | null; uid_validity: number | null; received_at: string; from_name: string | null; from_email: string | null; subject: string | null; body_text: string | null; attachments: StoredAttachment[]; event_id: number | null };

/** Projects with their contacts' addresses, and the threads already filed, for the matching. */
export async function loadCatalog(db: SupabaseClient): Promise<{ projects: ProjectForMatch[]; threads: Map<string, number> }> {
  const [{ data: projects }, { data: contacts }, { data: threads }] = await Promise.all([
    db.from("projects").select("id, title, category, job_owner_id").is("deleted_at", null),
    db.from("contacts").select("id, email, alternate_email").is("deleted_at", null).or("email.not.is.null,alternate_email.not.is.null"),
    db.from("mail_messages").select("thread_id, project_id").not("project_id", "is", null).not("thread_id", "is", null),
  ]);
  const emails = new Map<number, string[]>();
  for (const c of (contacts ?? []) as { id: number; email: string | null; alternate_email: string | null }[]) emails.set(c.id, [c.email, c.alternate_email].filter((e): e is string => Boolean(e)).map((e) => e.trim().toLowerCase()));
  return {
    projects: ((projects ?? []) as { id: number; title: string | null; category: string | null; job_owner_id: number | null }[]).map((p) => ({ id: p.id, title: p.title, category: p.category, emails: p.job_owner_id ? (emails.get(p.job_owner_id) ?? []) : [] })),
    threads: new Map(((threads ?? []) as { thread_id: string; project_id: number }[]).map((t) => [t.thread_id, t.project_id])),
  };
}

async function readOne(box: Session, uid: number): Promise<ParsedMail | null> {
  const raw = await fetchRaw(box, uid);
  if (!raw) return null;
  const mail = await parseRaw(raw.source);
  return parseMessage(
    { from: mail.from?.text, to: Array.isArray(mail.to) ? mail.to.map((t) => t.text).join(", ") : mail.to?.text, subject: mail.subject, date: mail.date, messageId: mail.messageId, text: mail.text, html: mail.html, attachments: mail.attachments },
    { uid, uidValidity: box.uidValidity, emailId: raw.emailId, threadId: raw.threadId },
  );
}

/** Moves an inbox message into a label and remembers it on the row; false when it was no longer in the inbox. */
async function fileInGmail(db: SupabaseClient, box: Session, mailId: number, gmailId: string, uid: number | null, label: string): Promise<boolean> {
  if (box.path !== INBOX) return false;
  const target = (await findUid(box, gmailId)) ?? (box.uidValidity ? uid : null);
  const moved = target !== null && (await moveToLabel(box, target, label).catch(() => false));
  await db.from("mail_messages").update({ gmail_label: moved ? label : NOT_IN_INBOX }).eq("id", mailId);
  return moved;
}

/** Reads the new emails since the last check (never throws: the outcome is kept in the settings). */
export async function syncMail(): Promise<SyncSummary> {
  const s = await loadSettings();
  if (!s) return { read: 0, filed: 0, waiting: 0, moved: 0, errors: [], skipped: "Gmail is not connected" };
  const db = adminDb();
  const out: SyncSummary = { read: 0, filed: 0, waiting: 0, moved: 0, errors: [] };
  const started = Date.now();
  let lastUid = s.last_uid;
  let uidValidity = s.uid_validity;
  try {
    await withMailbox(s, async (box) => {
      // A new UIDVALIDITY means Gmail renumbered the mailbox: start again (known emails are skipped by their id).
      if (uidValidity !== null && uidValidity !== box.uidValidity) lastUid = null;
      uidValidity = box.uidValidity;
      const uids = (await newUids(box, lastUid, new Date(Date.parse(s.connected_at) - FIRST_LOOKBACK_MS))).slice(0, MAX_PER_RUN);
      const catalog = uids.length ? await loadCatalog(db) : null;
      for (const uid of uids) {
        if (Date.now() - started > BUDGET_MS) break;
        try {
          const parsed = await readOne(box, uid);
          lastUid = uid;
          if (!parsed) continue;
          const system = isSystemMail(parsed.from.email);
          const match = system ? null : matchProject({ subject: parsed.subject, senders: [parsed.from.email, ...parsed.innerSenders], threadId: parsed.threadId }, catalog!.projects, catalog!.threads);
          const { data: row, error } = await db
            .from("mail_messages")
            .insert({
              gmail_id: parsed.gmailId,
              thread_id: parsed.threadId,
              uid,
              uid_validity: box.uidValidity,
              received_at: parsed.receivedAt,
              from_name: parsed.from.name || null,
              from_email: parsed.from.email || null,
              to_text: parsed.to || null,
              subject: parsed.cleanSubject,
              snippet: parsed.snippet || null,
              body_text: parsed.text || null,
              inner_senders: parsed.innerSenders,
              attachments: parsed.attachments,
              project_id: match?.projectId ?? null,
              matched_by: match?.by ?? null,
              status: system ? "ignored" : "unassigned",
            })
            .select("id")
            .single();
          if (error) {
            if (!/duplicate|unique/i.test(error.message)) out.errors.push(`${parsed.cleanSubject}: ${error.message}`);
            continue;
          }
          const mailId = (row as { id: number }).id;
          out.read++;
          if (system) {
            if (await fileInGmail(db, box, mailId, parsed.gmailId, uid, IGNORED_LABEL)) out.moved++;
          } else if (match) {
            const filed = await fileMessage(db, mailId, match.projectId, match.by, null, box);
            if (filed.ok) {
              out.filed++;
              if (filed.moved) out.moved++;
              if (parsed.threadId) catalog!.threads.set(parsed.threadId, match.projectId);
            } else out.errors.push(`${parsed.cleanSubject}: ${filed.message}`);
          } else out.waiting++;
        } catch (e) {
          out.errors.push(`UID ${uid}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // Emails processed earlier that are still in the inbox (assigned by hand before this, a move that failed).
      out.moved += await labelBacklog(db, box);
    });
    await save({ last_uid: lastUid, uid_validity: uidValidity, last_sync_at: new Date().toISOString(), last_sync_error: out.errors.length ? out.errors.slice(0, 3).join(" · ") : null, read_total: s.read_total + out.read });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    out.errors.push(message);
    await save({ last_uid: lastUid, uid_validity: uidValidity, last_sync_at: new Date().toISOString(), last_sync_error: message, read_total: s.read_total + out.read });
  }
  return out;
}

async function save(patch: Partial<GmailSettings>) {
  const cur = await loadSettings();
  if (cur) await saveSettings({ ...cur, ...patch });
}

/** Processed emails not yet moved out of the inbox: filed ones to their project's label, ignored ones to Ignored. */
async function labelBacklog(db: SupabaseClient, box: Session, limit = 20): Promise<number> {
  const { data } = await db.from("mail_messages").select("id, gmail_id, uid, status, project_id, projects(title)").in("status", ["assigned", "ignored"]).is("gmail_label", null).order("received_at", { ascending: false }).limit(limit);
  let moved = 0;
  for (const r of (data ?? []) as unknown as { id: number; gmail_id: string; uid: number | null; status: string; project_id: number | null; projects: { title: string | null } | null }[]) {
    const label = r.status === "ignored" || !r.project_id ? IGNORED_LABEL : projectLabel(r.projects?.title ?? null, r.project_id);
    if (await fileInGmail(db, box, r.id, r.gmail_id, r.uid, label)) moved++;
  }
  return moved;
}

/**
 * Files one email under a project: its attachments go to OneDrive (<project> (<id>) › Email › <date> <subject>),
 * a project_events row (channel 'email') joins the timeline, and the email moves to the Gmail label
 * Projects/<project> (<id>). Running it again on the same email is safe: files already in OneDrive stay,
 * the event is reused. The bytes are read from the mailbox again (by Gmail's message id, wherever it is now).
 */
export async function fileMessage(db: SupabaseClient, mailId: number, projectId: number, by: string, userId: string | null, session?: Session): Promise<{ ok: true; eventId: number; moved: boolean } | { ok: false; message: string }> {
  if (!session) {
    const s = await loadSettings();
    if (!s) return { ok: false, message: "Gmail is not connected" };
    return withMailbox(s, (box) => fileMessage(db, mailId, projectId, by, userId, box));
  }
  const box = session;
  const { data } = await db.from("mail_messages").select("id, gmail_id, uid, uid_validity, received_at, from_name, from_email, subject, body_text, attachments, event_id").eq("id", mailId).maybeSingle();
  const row = data as MailRow | null;
  if (!row) return { ok: false, message: "This email no longer exists." };
  const { data: project } = await db.from("projects").select("id, title").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) return { ok: false, message: "This project no longer exists." };
  const title = (project as { title: string | null }).title ?? `Project ${projectId}`;

  // Attachments → OneDrive. Each file is tried once per run; a failure is kept on the file and tried again next time.
  const attachments: StoredAttachment[] = Array.isArray(row.attachments) ? row.attachments : [];
  const pending = attachments.filter((a) => !a.item_id);
  if (pending.length) {
    if (!(await oneDriveReady().catch(() => false))) for (const a of pending) a.error = "OneDrive is not connected";
    else {
      const folder = `${ROOT}/Projects/${safeName(`${title} (${projectId})`)}/Email/${emailFolderName(row.received_at, row.subject ?? "")}`;
      try {
        const raw = await fetchAnywhere(box, row.gmail_id, row.uid, row.uid_validity);
        if (!raw) throw new Error("The email is no longer in the mailbox");
        const mail = await parseRaw(raw.source);
        for (const a of pending) {
          try {
            const part = mail.attachments[a.index];
            if (!part) throw new Error("attachment not found in the email");
            const item = await uploadBytes(folder, a.name, part.content);
            a.item_id = item.id;
            a.size = item.size ?? a.size;
            delete a.error;
          } catch (e) {
            a.error = e instanceof Error ? e.message : String(e);
          }
        }
      } catch (e) {
        for (const a of pending) if (!a.item_id) a.error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // The timeline event (one per email).
  let eventId = row.event_id;
  const eventAttachments = attachments.map((a) => ({ name: a.name, mime: a.mime, size: a.size, item_id: a.item_id ?? null, error: a.error ?? null }));
  if (!eventId) {
    const { data: existing } = await db.from("project_events").select("id").eq("channel", "email").eq("source_ref", row.gmail_id).maybeSingle();
    eventId = (existing as { id: number } | null)?.id ?? null;
  }
  if (eventId) {
    await db.from("project_events").update({ project_id: projectId, attachments: eventAttachments, deleted_at: null }).eq("id", eventId);
  } else {
    const { data: ev, error } = await db
      .from("project_events")
      .insert({
        project_id: projectId,
        channel: "email",
        occurred_at: row.received_at,
        actor: actorLabel({ name: row.from_name ?? "", email: row.from_email ?? "" }),
        title: row.subject || "(no subject)",
        body: row.body_text,
        source_table: "mail_messages",
        source_id: row.id,
        source_ref: row.gmail_id,
        attachments: eventAttachments,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !ev) return { ok: false, message: error?.message ?? "Could not create the timeline event" };
    eventId = (ev as { id: number }).id;
  }
  const errors = attachments.filter((a) => a.error).map((a) => `${a.name}: ${a.error}`);
  await db
    .from("mail_messages")
    .update({ project_id: projectId, matched_by: by, status: "assigned", event_id: eventId, filed_at: new Date().toISOString(), file_error: errors.length ? errors.join(" · ") : null, attachments, assigned_by: userId })
    .eq("id", mailId);
  // Out of the inbox, into the project's label.
  const moved = await fileInGmail(db, box, mailId, row.gmail_id, row.uid, projectLabel(title, projectId)).catch(() => false);
  return { ok: true, eventId, moved };
}

/** Not a project email: out of the Assign list and into the Ignored label. */
export async function ignoreMessage(db: SupabaseClient, mailId: number, userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await db.from("mail_messages").update({ status: "ignored", assigned_by: userId }).eq("id", mailId).eq("status", "unassigned").select("id, gmail_id, uid").maybeSingle();
  if (error) return { ok: false, message: error.message };
  const row = data as { id: number; gmail_id: string; uid: number | null } | null;
  if (!row) return { ok: false, message: "This email was already handled." };
  const s = await loadSettings();
  if (s) await withMailbox(s, (box) => fileInGmail(db, box, row.id, row.gmail_id, row.uid, IGNORED_LABEL)).catch(() => false);
  return { ok: true };
}

/** Emails whose attachments could not be filed yet (OneDrive was off, a transient error): tried again by the sync. */
export async function retryFiling(db: SupabaseClient, limit = 10): Promise<number> {
  const { data } = await db.from("mail_messages").select("id, project_id, matched_by").eq("status", "assigned").not("file_error", "is", null).not("project_id", "is", null).order("received_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as { id: number; project_id: number; matched_by: string | null }[];
  if (!rows.length) return 0;
  const s = await loadSettings();
  if (!s) return 0;
  let fixed = 0;
  await withMailbox(s, async (box) => {
    for (const r of rows) {
      const res = await fileMessage(db, r.id, r.project_id, r.matched_by ?? "manual", null, box);
      if (res.ok) fixed++;
    }
  });
  return fixed;
}
