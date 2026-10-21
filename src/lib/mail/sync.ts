import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { oneDriveReady, ROOT, uploadBytes } from "@/lib/files/onedrive";
import { safeName } from "@/lib/files/paths";
import { adminDb } from "@/lib/supabase/admin";
import { getAttachment, getMessage, listMessageIds, loadSettings, saveSettings } from "./client";
import { actorLabel, emailFolderName, matchProject, parseMessage, type MailAttachment, type ProjectForMatch } from "./engine";

// F26-2 Gmail intake: every five minutes (pg_cron 'crm-mail' → /api/cron/mail) the mailbox is read.
// New emails become mail_messages rows; the ones that match a project are filed at once (a project_events
// row, attachments in OneDrive); the rest wait in the Assign list on Today until the office picks a project.

export type SyncSummary = { read: number; filed: number; waiting: number; errors: string[]; skipped?: string };
export type StoredAttachment = MailAttachment & { item_id?: string; error?: string };

const OVERLAP_MS = 6 * 3600_000;
const FIRST_LOOKBACK_MS = 30 * 24 * 3600_000;
const BUDGET_MS = 150_000;

type MailRow = { id: number; gmail_id: string; thread_id: string | null; received_at: string; from_name: string | null; from_email: string | null; subject: string | null; body_text: string | null; attachments: StoredAttachment[]; event_id: number | null };

/** Projects with their contacts' addresses, and the threads already filed, for the matching. */
export async function loadCatalog(db: SupabaseClient): Promise<{ projects: ProjectForMatch[]; threads: Map<string, number> }> {
  const [{ data: projects }, { data: contacts }, { data: threads }] = await Promise.all([
    db.from("projects").select("id, title, job_owner_id").is("deleted_at", null),
    db.from("contacts").select("id, email, alternate_email").is("deleted_at", null).or("email.not.is.null,alternate_email.not.is.null"),
    db.from("mail_messages").select("thread_id, project_id").not("project_id", "is", null).not("thread_id", "is", null),
  ]);
  const emails = new Map<number, string[]>();
  for (const c of (contacts ?? []) as { id: number; email: string | null; alternate_email: string | null }[]) emails.set(c.id, [c.email, c.alternate_email].filter((e): e is string => Boolean(e)).map((e) => e.trim().toLowerCase()));
  return {
    projects: ((projects ?? []) as { id: number; title: string | null; job_owner_id: number | null }[]).map((p) => ({ id: p.id, title: p.title, emails: p.job_owner_id ? (emails.get(p.job_owner_id) ?? []) : [] })),
    threads: new Map(((threads ?? []) as { thread_id: string; project_id: number }[]).map((t) => [t.thread_id, t.project_id])),
  };
}

/** Reads the new emails since the last check (never throws: the outcome is kept in the settings). */
export async function syncMail(): Promise<SyncSummary> {
  const s = await loadSettings();
  if (!s) return { read: 0, filed: 0, waiting: 0, errors: [], skipped: "Gmail is not connected" };
  const db = adminDb();
  const out: SyncSummary = { read: 0, filed: 0, waiting: 0, errors: [] };
  const started = Date.now();
  let newest = s.last_internal_date ?? 0;
  try {
    const since = s.last_internal_date ? s.last_internal_date - OVERLAP_MS : Date.parse(s.connected_at) - FIRST_LOOKBACK_MS;
    const ids = await listMessageIds(`after:${Math.floor(since / 1000)} -in:spam -in:trash -in:chats`);
    if (ids.length) {
      const { data: known } = await db.from("mail_messages").select("gmail_id").in("gmail_id", ids.map((m) => m.id));
      const seen = new Set(((known ?? []) as { gmail_id: string }[]).map((k) => k.gmail_id));
      const fresh = ids.filter((m) => !seen.has(m.id)).reverse(); // oldest first, so threads learn in order
      const catalog = fresh.length ? await loadCatalog(db) : null;
      for (const m of fresh) {
        if (Date.now() - started > BUDGET_MS) break;
        try {
          const parsed = parseMessage(await getMessage(m.id));
          const match = matchProject({ subject: parsed.subject, senders: [parsed.from.email, ...parsed.innerSenders], threadId: parsed.threadId }, catalog!.projects, catalog!.threads);
          const { data: row, error } = await db
            .from("mail_messages")
            .insert({
              gmail_id: parsed.gmailId,
              thread_id: parsed.threadId,
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
              status: "unassigned",
            })
            .select("id")
            .single();
          if (error) {
            if (!/duplicate|unique/i.test(error.message)) out.errors.push(`${m.id}: ${error.message}`);
            continue;
          }
          out.read++;
          newest = Math.max(newest, Date.parse(parsed.receivedAt));
          if (match) {
            const filed = await fileMessage(db, (row as { id: number }).id, match.projectId, match.by, null);
            if (filed.ok) {
              out.filed++;
              if (parsed.threadId) catalog!.threads.set(parsed.threadId, match.projectId);
            } else out.errors.push(`${parsed.cleanSubject}: ${filed.message}`);
          } else out.waiting++;
        } catch (e) {
          out.errors.push(`${m.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await saveSettings({ ...(await loadSettings())!, last_sync_at: new Date().toISOString(), last_sync_error: out.errors.length ? out.errors.slice(0, 3).join(" · ") : null, last_internal_date: newest || s.last_internal_date, read_total: s.read_total + out.read });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    out.errors.push(message);
    const cur = await loadSettings();
    if (cur) await saveSettings({ ...cur, last_sync_at: new Date().toISOString(), last_sync_error: message });
  }
  return out;
}

/**
 * Files one email under a project: its attachments go to OneDrive (<project> (<id>) › Email › <date> <subject>)
 * and a project_events row (channel 'email') joins the timeline. Running it again on the same email is safe:
 * files already in OneDrive stay, the event is reused.
 */
export async function fileMessage(db: SupabaseClient, mailId: number, projectId: number, by: string, userId: string | null): Promise<{ ok: true; eventId: number } | { ok: false; message: string }> {
  const { data } = await db.from("mail_messages").select("id, gmail_id, thread_id, received_at, from_name, from_email, subject, body_text, attachments, event_id").eq("id", mailId).maybeSingle();
  const row = data as MailRow | null;
  if (!row) return { ok: false, message: "This email no longer exists." };
  const { data: project } = await db.from("projects").select("id, title").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) return { ok: false, message: "This project no longer exists." };
  const title = (project as { title: string | null }).title ?? `Project ${projectId}`;

  // Attachments → OneDrive. Each file is tried once per run; a failure is kept on the file and tried again next time.
  const attachments: StoredAttachment[] = Array.isArray(row.attachments) ? row.attachments : [];
  const pending = attachments.filter((a) => !a.item_id);
  if (pending.length) {
    if (await oneDriveReady().catch(() => false)) {
      const folder = `${ROOT}/Projects/${safeName(`${title} (${projectId})`)}/Email/${emailFolderName(row.received_at, row.subject ?? "")}`;
      for (const a of pending) {
        try {
          const item = await uploadBytes(folder, a.name, await getAttachment(row.gmail_id, a.attachment_id));
          a.item_id = item.id;
          a.size = item.size ?? a.size;
          delete a.error;
        } catch (e) {
          a.error = e instanceof Error ? e.message : String(e);
        }
      }
    } else for (const a of pending) a.error = "OneDrive is not connected";
  }

  // The timeline event (one per Gmail message).
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
  return { ok: true, eventId };
}

/** Emails whose attachments could not be filed yet (OneDrive was off, a transient error): tried again by the sync. */
export async function retryFiling(db: SupabaseClient, limit = 10): Promise<number> {
  const { data } = await db.from("mail_messages").select("id, project_id, matched_by").eq("status", "assigned").not("file_error", "is", null).not("project_id", "is", null).order("received_at", { ascending: false }).limit(limit);
  let fixed = 0;
  for (const r of (data ?? []) as { id: number; project_id: number; matched_by: string | null }[]) {
    const res = await fileMessage(db, r.id, r.project_id, r.matched_by ?? "manual", null);
    if (res.ok) fixed++;
  }
  return fixed;
}
