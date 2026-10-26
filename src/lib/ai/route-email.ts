import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateTimeLocalET, todayET } from "@/lib/dates";
import { loadFieldDay, resolveScheduler } from "@/lib/field-day/return-card";
import { buildTitle } from "@/lib/records/title";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { aiConfigured, claude, describeError } from "./claude";
import { REVIEW_MODEL } from "./review-apply";
import { loadAiSettings } from "./review-queue";
import { BRIEF_SYSTEM, briefPrompt, decide, KIND_LABEL, parseRouteAnswer, REQUEST_TYPE, ROUTE_SYSTEM, routePrompt, scrubBrief, type EmailKind, type OpenRequest } from "./route-engine";

// F26-3 AI reading and routing (SPEC §9.1 F26-b): after an email lands on a project timeline, Claude reads it.
// An RFI or change order becomes a Project request line (the shared alert follows, F26-c); an answer closes the
// open request it settles; a scheduling request becomes a task for the office; documents and information are
// just filed. Then the project brief is rewritten. Every run is logged in automation_runs under 900502.
// The queue: project_events.ai_status pending → running → done / skipped / error, worked off by the mailbox
// check (every five minutes), the hourly tick, and right after the office assigns an email by hand.

export const AI_ROUTE_AUTOMATION_ID = 900502;
export const ROUTE_MODEL = REVIEW_MODEL;
export const BRIEF_MODEL = REVIEW_MODEL;

type EventRow = { id: number; project_id: number; occurred_at: string; actor: string | null; title: string; body: string | null; attachments: { name: string }[] | null; ai_status: string | null; ai_kind: EmailKind | null; request_id: number | null; task_id: number | null };

async function log(db: SupabaseClient, eventId: number, status: "done" | "error", detail: Record<string, unknown>) {
  await db.from("automation_runs").insert({ automation_id: AI_ROUTE_AUTOMATION_ID, table_name: "project_events", record_id: eventId, event: "ai_route", status, detail });
}

/** Puts an email event in the queue (when the switch is on and the key is set). */
export async function queueEmailEvent(db: SupabaseClient, eventId: number): Promise<boolean> {
  if (!aiConfigured() || !(await loadAiSettings(db)).route_emails) return false;
  const { data } = await db.from("project_events").select("ai_status").eq("id", eventId).maybeSingle();
  const st = (data as { ai_status: string | null } | null)?.ai_status;
  if (st === "running" || st === "done") return false;
  const { error } = await db.from("project_events").update({ ai_status: "pending" }).eq("id", eventId);
  return !error;
}

/** Open requests of a project, for the prompt and for closing. */
async function openRequests(db: SupabaseClient, projectId: number): Promise<OpenRequest[]> {
  const { data } = await db.from("project_requests").select("id, type, date, description").eq("project_id", projectId).eq("status", "Open").is("deleted_at", null).order("date", { ascending: false }).limit(20);
  return (data ?? []) as OpenRequest[];
}

/** Reads one email event and applies the decision. Never throws; the outcome lands on the event and in the log. */
export async function routeEmailEvent(db: SupabaseClient, eventId: number): Promise<{ ok: true; kind: EmailKind; actions: string[] } | { ok: false; message: string }> {
  const { data } = await db.from("project_events").select("id, project_id, occurred_at, actor, title, body, attachments, ai_status, ai_kind, request_id, task_id").eq("id", eventId).is("deleted_at", null).maybeSingle();
  const ev = data as EventRow | null;
  if (!ev) return { ok: false, message: "event not found" };
  if (ev.ai_status === "running") return { ok: false, message: "already running" };
  await db.from("project_events").update({ ai_status: "running" }).eq("id", eventId);
  try {
    const { data: p } = await db.from("projects").select("title").eq("id", ev.project_id).maybeSingle();
    const open = await openRequests(db, ev.project_id);
    const mail = { subject: ev.title, from: ev.actor ?? "", receivedAt: ev.occurred_at };
    const prompt = routePrompt({ projectTitle: (p as { title: string | null } | null)?.title ?? `Project ${ev.project_id}`, ...mail, text: ev.body ?? "", attachments: (ev.attachments ?? []).map((a) => a.name), openRequests: open });
    const res = await claude().messages.create({ model: ROUTE_MODEL, max_tokens: 600, system: ROUTE_SYSTEM, messages: [{ role: "user", content: prompt }] });
    const answer = parseRouteAnswer(res.content.find((b) => b.type === "text")?.text ?? "");
    if (!answer) throw new Error("The AI answer could not be read");

    const actions: string[] = [];
    const d = decide(answer, mail, open.map((r) => r.id));
    const patch: Record<string, unknown> = { ai_status: "done", ai_kind: answer.kind, ai_summary: answer.summary || null, ai_asked_by: answer.asked_by, ai_deadline: answer.deadline, ai_at: new Date().toISOString(), ai_error: null };
    if (d.createRequest && !ev.request_id) {
      const id = await createRequest(db, ev.project_id, ev.id, ev.occurred_at, d.createRequest.type, d.createRequest.description);
      if (id) {
        patch.request_id = id;
        actions.push(`${d.createRequest.type} request #${id} added`);
      }
    }
    if (d.closeRequestId) {
      const { error } = await db.from("project_requests").update({ status: "Done" }).eq("id", d.closeRequestId).eq("status", "Open");
      if (!error) actions.push(`request #${d.closeRequestId} closed`);
    }
    if (d.createTask && !ev.task_id) {
      const id = await createTask(db, ev.project_id, d.createTask.details, d.createTask.dueDate);
      if (id) {
        patch.task_id = id;
        actions.push(`task #${id} for the office`);
      }
    }
    await db.from("project_events").update(patch).eq("id", eventId);
    await log(db, eventId, "done", { kind: answer.kind, confidence: answer.confidence, actions, model: res.model });
    const brief = await rewriteBrief(db, ev.project_id);
    if (!brief.ok) await log(db, eventId, "error", { step: "brief", error: brief.message });
    return { ok: true, kind: answer.kind, actions };
  } catch (e) {
    const message = describeError(e);
    await db.from("project_events").update({ ai_status: "error", ai_error: message }).eq("id", eventId);
    await log(db, eventId, "error", { error: message });
    return { ok: false, message };
  }
}

async function createRequest(db: SupabaseClient, projectId: number, eventId: number, occurredAt: string, type: "RFI" | "Change order", description: string): Promise<number | null> {
  const t = getTable("project_requests");
  const values: Record<string, unknown> = { project_id: projectId, date: toDateTimeLocalET(occurredAt).slice(0, 10), type, description, status: "Open", source_event_id: eventId };
  values.title = await buildTitle(t, values, null, db);
  const { data, error } = await db.from("project_requests").insert(values).select("id").single();
  if (error) throw new Error(`request line: ${error.message}`);
  return (data as { id: number }).id;
}

/** A task for the person who schedules (Admin › Field day), due on the deadline or in two days. */
async function createTask(db: SupabaseClient, projectId: number, details: string, dueDate: string | null): Promise<number | null> {
  const settings = await loadFieldDay(db);
  const memberId = await resolveScheduler(db, settings, projectId);
  const values: Record<string, unknown> = { member_id: memberId, status: "Pending", details, due_date: dueDate ?? addDays(todayET(), 2), project_id: projectId, labels: ["Email"] };
  values.title = await buildTitle(getTable("tasks"), values, null, db);
  const { data, error } = await db.from("tasks").insert(values).select("id").single();
  if (error) throw new Error(`task: ${error.message}`);
  return (data as { id: number }).id;
}

/** Works off the queue: up to `limit` events, within `budgetMs`. */
export async function routeBacklog(db: SupabaseClient, budgetMs = 60_000, limit = 10): Promise<{ routed: number; errors: number }> {
  const out = { routed: 0, errors: 0 };
  if (!aiConfigured() || !(await loadAiSettings(db)).route_emails) return out;
  const started = Date.now();
  const { data } = await db.from("project_events").select("id").eq("ai_status", "pending").is("deleted_at", null).order("occurred_at").limit(limit);
  for (const r of (data ?? []) as { id: number }[]) {
    if (Date.now() - started > budgetMs) break;
    const res = await routeEmailEvent(db, r.id);
    if (res.ok) out.routed++;
    else out.errors++;
  }
  return out;
}

// ---------------------------------------------------------------- correcting the kind by hand

/**
 * The office says what the email really is. An RFI / change order without a request line gets one; a request
 * the AI made that is still Open loses its line when the kind moves away from those two.
 */
export async function setEventKind(db: SupabaseClient, eventId: number, kind: EmailKind, userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data } = await db.from("project_events").select("id, project_id, occurred_at, actor, title, body, attachments, ai_status, ai_kind, ai_summary, request_id, task_id").eq("id", eventId).is("deleted_at", null).maybeSingle();
  const ev = data as (EventRow & { ai_summary: string | null }) | null;
  if (!ev) return { ok: false, message: "This event no longer exists." };
  const patch: Record<string, unknown> = { ai_kind: kind, kind_set_by: userId, ai_status: ev.ai_status ?? "done" };
  const type = REQUEST_TYPE[kind];
  if (type && !ev.request_id) {
    const description = `${ev.ai_summary || ev.title}\nFrom the email "${ev.title}" of ${ev.occurred_at.slice(0, 10)}${ev.actor ? ` (${ev.actor})` : ""}`;
    patch.request_id = await createRequest(db, ev.project_id, ev.id, ev.occurred_at, type, description);
  } else if (type && ev.request_id) {
    await db.from("project_requests").update({ type }).eq("id", ev.request_id).is("deleted_at", null);
  } else if (!type && ev.request_id) {
    // Only a line the AI made and nobody closed goes away.
    const { data: r } = await db.from("project_requests").select("status, created_by").eq("id", ev.request_id).maybeSingle();
    const row = r as { status: string; created_by: string | null } | null;
    if (row && row.status === "Open" && !row.created_by) {
      await db.from("project_requests").update({ deleted_at: new Date().toISOString() }).eq("id", ev.request_id);
      patch.request_id = null;
    }
  }
  const { error } = await db.from("project_events").update(patch).eq("id", eventId);
  if (error) return { ok: false, message: error.message };
  await log(db, eventId, "done", { kind, by: "hand" });
  return { ok: true };
}

// ---------------------------------------------------------------- the project brief

export type BriefResult = { ok: true; brief: string } | { ok: false; message: string };

/** Rewrites the project brief from the last events, notes, visits, reports, tasks and open requests. */
export async function rewriteBrief(db: SupabaseClient, projectId: number): Promise<BriefResult> {
  if (!aiConfigured()) return { ok: false, message: "ANTHROPIC_API_KEY is not set" };
  const { data: p } = await db.from("projects").select("title, job_status, brief").eq("id", projectId).maybeSingle();
  const project = p as { title: string | null; job_status: string | null; brief: string | null } | null;
  if (!project) return { ok: false, message: "project not found" };
  const [open, { data: events }, { data: notes }, { data: visits }, { data: reports }, { data: tasks }] = await Promise.all([
    openRequests(db, projectId),
    db.from("project_events").select("occurred_at, actor, title, body, ai_kind, ai_summary, channel").eq("project_id", projectId).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(15),
    db.from("record_notes").select("created_at, body").eq("table_name", "projects").eq("record_id", projectId).order("created_at", { ascending: false }).limit(8),
    db.from("visits").select("starts_at, status, service_type").eq("project_id", projectId).is("deleted_at", null).order("starts_at", { ascending: false }).limit(8),
    db.from("job_reports").select("date, result, report").eq("project_id", projectId).is("deleted_at", null).order("date", { ascending: false }).limit(6),
    db.from("tasks").select("created_at, status, details, due_date").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(8),
  ]);
  const items: { date: string; text: string }[] = [];
  const day = (iso: string) => toDateTimeLocalET(iso).slice(0, 10);
  for (const e of (events ?? []) as { occurred_at: string; actor: string | null; title: string; body: string | null; ai_kind: EmailKind | null; ai_summary: string | null; channel: string }[])
    items.push({ date: day(e.occurred_at), text: `${e.channel === "email" ? "Email" : "Message"}${e.ai_kind ? ` (${KIND_LABEL[e.ai_kind]})` : ""} from ${e.actor ?? "?"}: ${e.title}. ${e.ai_summary ?? (e.body ?? "").slice(0, 400)}` });
  for (const n of (notes ?? []) as { created_at: string; body: string }[]) items.push({ date: day(n.created_at), text: `Note: ${n.body.slice(0, 400)}` });
  for (const v of (visits ?? []) as { starts_at: string; status: string | null; service_type: string | null }[]) items.push({ date: day(v.starts_at), text: `Visit ${v.status ?? ""} ${v.service_type ?? ""}`.trim() });
  for (const r of (reports ?? []) as { date: string | null; result: string | null; report: string | null }[]) if (r.date) items.push({ date: r.date, text: `Job report${r.result ? ` (${r.result})` : ""}: ${(r.report ?? "").slice(0, 500)}` });
  for (const t of (tasks ?? []) as { created_at: string; status: string | null; details: string | null; due_date: string | null }[]) items.push({ date: day(t.created_at), text: `Task ${t.status ?? ""}${t.due_date ? ` due ${t.due_date}` : ""}: ${(t.details ?? "").split("\n")[0].slice(0, 200)}` });
  if (!items.length && !open.length) return { ok: false, message: "nothing to write about" };
  items.sort((a, b) => a.date.localeCompare(b.date));
  try {
    const res = await claude().messages.create({ model: BRIEF_MODEL, max_tokens: 900, system: BRIEF_SYSTEM, messages: [{ role: "user", content: briefPrompt({ title: project.title ?? `Project ${projectId}`, jobStatus: project.job_status, openRequests: open, events: items.slice(-40), previous: project.brief }) }] });
    const brief = scrubBrief(res.content.find((b) => b.type === "text")?.text ?? "");
    if (!brief) return { ok: false, message: "empty answer" };
    const { error } = await db.from("projects").update({ brief, brief_at: new Date().toISOString() }).eq("id", projectId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, brief };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
