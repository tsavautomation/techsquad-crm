import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moveIntoFolder, oneDriveReady, ROOT, uploadBytes } from "@/lib/files/onedrive";
import { safeName } from "@/lib/files/paths";
import { aiPickProject, MIN_CONFIDENCE } from "@/lib/ai/pick-project";
import { queueEmailEvent, routeBacklog } from "@/lib/ai/route-email";
import { loadAiSettings } from "@/lib/ai/review-queue";
import { adminDb } from "@/lib/supabase/admin";
import { fileMessage as fileText, readPending } from "@/lib/whatsapp/triage";
import { formatPhone, isRingCentralText, parseRingCentralText } from "./sms";
import { fetchAnywhere, fetchRaw, findUid, IGNORED_LABEL, INBOX, loadSettings, moveToLabel, newUids, openPath, parseRaw, saveSettings, trashMessage, TRASH, withMailbox, type GmailSettings, type Session } from "./client";
import { actorLabel, emailFolderName, isSystemMail, matchProject, parseMessage, projectLabel, scoreCandidates, strongPick, type MailAttachment, type MatchBy, type ParsedMail, type ProjectForMatch } from "./engine";

// F26-2 Gmail intake: every five minutes (pg_cron 'crm-mail' → /api/cron/mail) the mailbox is read over IMAP.
// New emails become mail_messages rows; the ones that match a project are filed at once (a project_events
// row, attachments in OneDrive) and moved out of the inbox into the label Projects/<project> (<id>) — the
// OneDrive folder's name (Fred 2026-10-21: an email still in the inbox was not processed). Google's own
// notices go to the label Ignored. The rest wait in the inbox and in the Assign list on Today.

export type SyncSummary = { read: number; filed: number; waiting: number; moved: number; routed: number; texts: number; errors: string[]; skipped?: string };
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
    db.from("projects").select("id, title, category, job_owner_id, job_address").is("deleted_at", null),
    db.from("contacts").select("id, type, last_name, email, alternate_email").is("deleted_at", null),
    db.from("mail_messages").select("thread_id, project_id").not("project_id", "is", null).not("thread_id", "is", null),
  ]);
  const owners = new Map<number, { emails: string[]; type: string | null; lastName: string | null }>();
  for (const c of (contacts ?? []) as { id: number; type: string | null; last_name: string | null; email: string | null; alternate_email: string | null }[])
    owners.set(c.id, { emails: [c.email, c.alternate_email].filter((e): e is string => Boolean(e)).map((e) => e.trim().toLowerCase()), type: c.type, lastName: c.last_name });
  return {
    projects: ((projects ?? []) as { id: number; title: string | null; category: string | null; job_owner_id: number | null; job_address: { street?: string | null } | null }[]).map((p) => {
      const o = p.job_owner_id ? owners.get(p.job_owner_id) : undefined;
      return { id: p.id, title: p.title, category: p.category, emails: o?.emails ?? [], ownerType: o?.type ?? null, ownerLastName: o?.lastName ?? null, street: p.job_address?.street ?? null };
    }),
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

type Catalog = { projects: ProjectForMatch[]; threads: Map<string, number> };
type Suggestion = { id: number; title: string | null; score: number };

/**
 * Which project, with the tolerance Fred asked for (2026-10-22): the exact rules first; then the words the email
 * shares with each project, filed when one project clearly stands out; then Claude choosing among the best
 * candidates, filed only when sure (once per email). What is left waits with its candidates as suggestions.
 */
async function decideProject(db: SupabaseClient, m: { subject: string | null; text: string | null; from: string; senders: string[]; threadId: string | null; attachments: string[] }, catalog: Catalog, askAi: boolean): Promise<{ match: { projectId: number; by: MatchBy } | null; suggestions: Suggestion[]; aiTried: boolean }> {
  const exact = matchProject({ subject: m.subject, senders: m.senders, threadId: m.threadId }, catalog.projects, catalog.threads);
  if (exact) return { match: exact, suggestions: [], aiTried: false };
  const scored = scoreCandidates({ subject: m.subject, text: m.text }, catalog.projects);
  const suggestions = scored.slice(0, 5).map((c) => ({ id: c.project.id, title: c.project.title, score: c.score }));
  const strong = strongPick(scored, m.subject);
  if (strong) return { match: { projectId: strong.id, by: "words" }, suggestions, aiTried: false };
  if (!askAi || !scored.length) return { match: null, suggestions, aiTried: false };
  const pick = await aiPickProject({ subject: m.subject ?? "", from: m.from, text: m.text ?? "", attachments: m.attachments }, scored);
  if (pick.projectId && pick.confidence >= MIN_CONFIDENCE) return { match: { projectId: pick.projectId, by: "ai" }, suggestions, aiTried: true };
  return { match: null, suggestions, aiTried: true };
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
  if (!s) return { read: 0, filed: 0, waiting: 0, moved: 0, routed: 0, texts: 0, errors: [], skipped: "Gmail is not connected" };
  const db = adminDb();
  const out: SyncSummary = { read: 0, filed: 0, waiting: 0, moved: 0, routed: 0, texts: 0, errors: [] };
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
      const askAi = (await loadAiSettings(db)).route_emails;
      for (const uid of uids) {
        if (Date.now() - started > BUDGET_MS) break;
        try {
          const parsed = await readOne(box, uid);
          lastUid = uid;
          if (!parsed) continue;
          // F31: a text message RingCentral emailed us joins the WhatsApp board and leaves the mailbox.
          if (isRingCentralText(parsed.from.email, parsed.subject)) {
            if (await ingestText(db, box, parsed, uid)) out.texts++;
            continue;
          }
          const system = isSystemMail(parsed.from.email);
          const decided = system
            ? { match: null, suggestions: [] as Suggestion[], aiTried: false }
            : await decideProject(db, { subject: parsed.subject, text: parsed.text, from: actorLabel(parsed.from), senders: [parsed.from.email, ...parsed.innerSenders], threadId: parsed.threadId, attachments: parsed.attachments.map((a) => a.name) }, catalog!, askAi);
          const match = decided.match;
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
              suggestions: decided.suggestions,
              match_tried_at: decided.aiTried ? new Date().toISOString() : null,
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
      // Emails still waiting get another try: a project added since, a thread filed since, a better rule.
      const again = await rematchWaiting(db, box, catalog ?? (await loadCatalog(db)), askAi);
      out.filed += again.filed;
      out.moved += again.moved;
      out.errors.push(...again.errors);
      // Emails processed earlier that are still in the inbox (assigned by hand before this, a move that failed).
      out.moved += await labelBacklog(db, box);
      // F31: texts whose chat has been quiet for two minutes get their card read (the crm-push cron is the fallback).
      if (out.texts) await readPending(db).catch(() => 0);
    });
    await save({ last_uid: lastUid, uid_validity: uidValidity, last_sync_at: new Date().toISOString(), last_sync_error: out.errors.length ? out.errors.slice(0, 3).join(" · ") : null, read_total: s.read_total + out.read });
    // F26-3: Claude reads the emails filed just now (and any left from before), within what is left of the budget.
    const ai = await routeBacklog(db, Math.max(20_000, BUDGET_MS - (Date.now() - started)));
    out.routed = ai.routed;
    if (ai.errors) out.errors.push(`${ai.errors} email(s) the AI could not read (see Admin › AI)`);
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

/**
 * F31: one RingCentral "New Text Message" email → a wa_messages row (source 'sms', chat "SMS · name or number")
 * filed on its conversation like a WhatsApp notification, a mail_messages row for the record, and the email
 * into Gmail's Trash. Returns false when the email had no readable text (it is then ignored, not trashed).
 */
async function ingestText(db: SupabaseClient, box: Session, parsed: ParsedMail, uid: number): Promise<boolean> {
  const text = parseRingCentralText({ subject: parsed.subject, text: parsed.text });
  const who = text ? await contactByPhone(db, text.phone) : null;
  const number = text?.phone ? formatPhone(text.phone) : null;
  const chat = text ? `SMS · ${who ?? number ?? text.sender}` : null;
  const row = {
    gmail_id: parsed.gmailId,
    thread_id: parsed.threadId,
    uid,
    uid_validity: box.uidValidity,
    received_at: parsed.receivedAt,
    from_name: text ? (who ?? text.sender) : parsed.from.name || null,
    from_email: parsed.from.email || null,
    to_text: parsed.to || null,
    subject: parsed.cleanSubject,
    snippet: text?.body.replace(/\s+/g, " ").slice(0, 200) ?? parsed.snippet,
    body_text: text?.body ?? parsed.text,
    inner_senders: [],
    attachments: [],
    status: "ignored",
    matched_by: text ? "sms" : null,
  };
  const { data: inserted, error } = await db.from("mail_messages").insert(row).select("id").single();
  if (error) return false;
  const mailId = (inserted as { id: number }).id;
  if (!text || !chat) {
    await fileInGmail(db, box, mailId, parsed.gmailId, uid, IGNORED_LABEL);
    return false;
  }
  const notifId = /^\d{1,18}$/.test(parsed.gmailId) ? parsed.gmailId : String(hash53(parsed.gmailId));
  const { data: wa } = await db
    .from("wa_messages")
    .upsert({ source: "sms", device: "ringcentral-email", notif_id: notifId, captured_at: parsed.receivedAt, chat, sender: who ?? number ?? text.sender, body: text.body }, { onConflict: "device,notif_id", ignoreDuplicates: true })
    .select("id");
  const waId = (wa as { id: number }[] | null)?.[0]?.id;
  if (waId) {
    const convId = await fileText(db, waId);
    if (convId) await db.from("wa_conversations").update({ source: "sms" }).eq("id", convId).eq("chat", chat);
  }
  const trashed = await trashMessage(box, uid).catch(() => false);
  await db.from("mail_messages").update({ gmail_label: trashed ? TRASH : NOT_IN_INBOX }).eq("id", mailId);
  return true;
}

/** The contact whose phone this is (main or alternate), as "First Last", else null. */
async function contactByPhone(db: SupabaseClient, phone: string | null): Promise<string | null> {
  if (!phone) return null;
  const tail = phone.slice(-7);
  const like = `%${tail.slice(0, 3)}%${tail.slice(3)}%`;
  const cols = ["main_phone", "alternate_phone", "intl_phone", "alternate_intl_phone"] as const;
  const { data } = await db.from("contacts").select(`title, ${cols.join(", ")}`).is("deleted_at", null).or(cols.map((c) => `${c}.ilike.${like}`).join(",")).limit(10);
  const digits = (s: string | null) => (s ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  const hit = ((data ?? []) as unknown as ({ title: string | null } & Record<(typeof cols)[number], string | null>)[]).find((c) => cols.some((k) => digits(c[k]) === phone));
  return hit?.title?.trim() || null;
}

/** A stable 53-bit number for a Message-ID (only when Gmail gave no numeric id). */
function hash53(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % Number.MAX_SAFE_INTEGER;
  return h;
}

/** The emails in the Assign list, matched again with today's projects, threads and rules (newest 30). */
async function rematchWaiting(db: SupabaseClient, box: Session, catalog: Catalog, askAi: boolean): Promise<{ filed: number; moved: number; errors: string[] }> {
  const out = { filed: 0, moved: 0, errors: [] as string[] };
  const { data } = await db.from("mail_messages").select("id, subject, body_text, from_name, from_email, inner_senders, thread_id, attachments, match_tried_at").eq("status", "unassigned").order("received_at", { ascending: false }).limit(30);
  for (const r of (data ?? []) as { id: number; subject: string | null; body_text: string | null; from_name: string | null; from_email: string | null; inner_senders: string[] | null; thread_id: string | null; attachments: { name: string }[] | null; match_tried_at: string | null }[]) {
    // Claude is asked once per email; the word rules run every time (a project or thread may be new).
    const decided = await decideProject(db, { subject: r.subject, text: r.body_text, from: actorLabel({ name: r.from_name ?? "", email: r.from_email ?? "" }), senders: [r.from_email ?? "", ...(r.inner_senders ?? [])], threadId: r.thread_id, attachments: (r.attachments ?? []).map((a) => a.name) }, catalog, askAi && !r.match_tried_at);
    if (decided.aiTried || decided.suggestions.length) await db.from("mail_messages").update({ suggestions: decided.suggestions, ...(decided.aiTried ? { match_tried_at: new Date().toISOString() } : {}) }).eq("id", r.id);
    const match = decided.match;
    if (!match) continue;
    const filed = await fileMessage(db, r.id, match.projectId, match.by, null, box);
    if (filed.ok) {
      out.filed++;
      if (filed.moved) out.moved++;
      if (r.thread_id) catalog.threads.set(r.thread_id, match.projectId);
    } else out.errors.push(`${r.subject ?? r.id}: ${filed.message}`);
  }
  return out;
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
  await queueEmailEvent(db, eventId).catch(() => false);
  const errors = attachments.filter((a) => a.error).map((a) => `${a.name}: ${a.error}`);
  await db
    .from("mail_messages")
    .update({ project_id: projectId, matched_by: by, status: "assigned", event_id: eventId, filed_at: new Date().toISOString(), file_error: errors.length ? errors.join(" · ") : null, attachments, assigned_by: userId })
    .eq("id", mailId);
  // Out of the inbox, into the project's label.
  const moved = await fileInGmail(db, box, mailId, row.gmail_id, row.uid, projectLabel(title, projectId)).catch(() => false);
  return { ok: true, eventId, moved };
}

/**
 * A filed email was put under the wrong project: the timeline entry, the request line or task the AI made,
 * the OneDrive files and the Gmail label all move to the right one. Returns both project ids for the briefs.
 */
export async function reassignMessage(db: SupabaseClient, mailId: number, projectId: number, userId: string): Promise<{ ok: true; from: number | null; eventId: number | null } | { ok: false; message: string }> {
  const { data } = await db.from("mail_messages").select("id, gmail_id, uid, uid_validity, received_at, subject, attachments, event_id, project_id, gmail_label, status").eq("id", mailId).maybeSingle();
  const row = data as (MailRow & { project_id: number | null; gmail_label: string | null; status: string }) | null;
  if (!row) return { ok: false, message: "This email no longer exists." };
  if (row.project_id === projectId) return { ok: true, from: projectId, eventId: row.event_id };
  const { data: project } = await db.from("projects").select("id, title").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) return { ok: false, message: "This project no longer exists." };
  const title = (project as { title: string | null }).title ?? `Project ${projectId}`;
  const from = row.project_id;

  // OneDrive: the files go to the new project's folder (a failure is kept on the file, like an upload failure).
  const attachments: StoredAttachment[] = Array.isArray(row.attachments) ? row.attachments : [];
  const folder = `${ROOT}/Projects/${safeName(`${title} (${projectId})`)}/Email/${emailFolderName(row.received_at, row.subject ?? "")}`;
  for (const a of attachments) {
    if (!a.item_id) continue;
    try {
      await moveIntoFolder(a.item_id, folder, a.name);
      delete a.error;
    } catch (e) {
      a.error = `not moved: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const errors = attachments.filter((a) => a.error).map((a) => `${a.name}: ${a.error}`);

  // Gmail: out of the old label (or the inbox) into the new one.
  const newLabel = projectLabel(title, projectId);
  let moved = false;
  const s = await loadSettings();
  if (s) {
    moved = await withMailbox(s, async (box) => {
      for (const path of [...new Set([row.gmail_label && row.gmail_label !== "-" ? row.gmail_label : null, INBOX].filter((p): p is string => Boolean(p)))]) {
        try {
          const b = path === box.path ? box : await openPath(box.client, path, false);
          const uid = await findUid(b, row.gmail_id);
          if (uid !== null && (await moveToLabel(b, uid, newLabel))) return true;
        } catch {
          // try the next place
        }
      }
      return false;
    }).catch(() => false);
  }

  // The records.
  await db.from("mail_messages").update({ project_id: projectId, matched_by: "manual", status: "assigned", assigned_by: userId, attachments, file_error: errors.length ? errors.join(" · ") : null, gmail_label: moved ? newLabel : row.gmail_label }).eq("id", mailId);
  if (row.event_id) {
    await db.from("project_events").update({ project_id: projectId, attachments: attachments.map((a) => ({ name: a.name, mime: a.mime, size: a.size, item_id: a.item_id ?? null, error: a.error ?? null })) }).eq("id", row.event_id);
    await db.from("project_requests").update({ project_id: projectId }).eq("source_event_id", row.event_id).is("deleted_at", null);
    const { data: ev } = await db.from("project_events").select("task_id").eq("id", row.event_id).maybeSingle();
    const taskId = (ev as { task_id: number | null } | null)?.task_id;
    if (taskId) await db.from("tasks").update({ project_id: projectId }).eq("id", taskId);
  }
  return { ok: true, from, eventId: row.event_id };
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
