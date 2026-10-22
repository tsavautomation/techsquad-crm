"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiConfigured, claude, describeError } from "@/lib/ai/claude";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { canSeeWhatsApp, loadBoard, WINDOWS } from "./load";
import { CATEGORY_LABEL, STATUSES } from "./triage-engine";
import { syncProjectEvent, TRIAGE_MODEL } from "./triage";

// F28: working the WhatsApp board. Everyone with the WhatsApp permission sees the same cards, so a status, an
// assignment or a project set here shows for the whole team on the next refresh (the board refreshes every 20 s).

export type ActionResult = { ok: true } | { ok: false; message: string };

const Patch = z.object({ status: z.enum(STATUSES).optional(), assigned_to: z.string().trim().max(120).nullable().optional() });

/** Changes a card's status and / or who it is assigned to. */
export async function updateWaCardAction(id: number, patch: { status?: string; assigned_to?: string | null }): Promise<ActionResult> {
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) return { ok: false, message: "You don't have the WhatsApp permission." };
  const p = Patch.safeParse(patch);
  if (!p.success || !Number.isInteger(id)) return { ok: false, message: "Bad request." };
  const values: Record<string, unknown> = {};
  if (p.data.status) values.status = p.data.status;
  if (p.data.assigned_to !== undefined) values.assigned_to = p.data.assigned_to || null;
  if (!Object.keys(values).length) return { ok: true };
  const db = await recordsDb();
  const { data, error } = await db.from("wa_conversations").update(values).eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!(data as unknown[] | null)?.length) return { ok: false, message: "That card is gone or you may not change it." };
  revalidatePath("/whatsapp");
  return { ok: true };
}

/** F28-b: says which project the conversation is about (or none); the thread then lives on that project's timeline. */
export async function assignWaProjectAction(id: number, projectId: number | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) return { ok: false, message: "You don't have the WhatsApp permission." };
  if (!Number.isInteger(id) || (projectId !== null && !Number.isInteger(projectId))) return { ok: false, message: "Bad request." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  const db = await recordsDb();
  if (projectId !== null) {
    const { data: p } = await db.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
    if (!p) return { ok: false, message: "That project was not found." };
  }
  const { data: before } = await db.from("wa_conversations").select("project_id").eq("id", id).maybeSingle();
  const { data, error } = await db.from("wa_conversations").update({ project_id: projectId }).eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!(data as unknown[] | null)?.length) return { ok: false, message: "That card is gone or you may not change it." };
  await syncProjectEvent(adminDb(), id, user.id);
  revalidatePath("/whatsapp");
  const projectsT = getTable("projects");
  if (projectId !== null) revalidatePath(recordHref(projectsT, projectId));
  const prev = (before as { project_id: number | null } | null)?.project_id;
  if (prev && prev !== projectId) revalidatePath(recordHref(projectsT, prev));
  return { ok: true };
}

/** F28-c: mutes a chat (its open cards are dismissed; new messages make no cards until Unmute). */
export async function muteChatAction(chat: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) return { ok: false, message: "You don't have the WhatsApp permission." };
  const name = chat.trim();
  if (!name || name.length > 300) return { ok: false, message: "Bad request." };
  const db = await recordsDb();
  const { error } = await db.from("wa_muted_chats").upsert({ chat: name, muted_by: user.id }, { onConflict: "chat", ignoreDuplicates: true });
  if (error) return { ok: false, message: error.message };
  await db.from("wa_conversations").update({ status: "dismissed", ai_pending: false }).eq("chat", name).in("status", ["open", "in_progress"]);
  revalidatePath("/whatsapp");
  revalidatePath("/whatsapp/muted");
  return { ok: true };
}

/** F28-c: the chat's messages make cards again. Messages that arrived while muted stay out. */
export async function unmuteChatAction(chat: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) return { ok: false, message: "You don't have the WhatsApp permission." };
  const db = await recordsDb();
  const { error } = await db.from("wa_muted_chats").delete().eq("chat", chat.trim());
  if (error) return { ok: false, message: error.message };
  revalidatePath("/whatsapp");
  revalidatePath("/whatsapp/muted");
  return { ok: true };
}

export type SummaryResult = { ok: true; text: string } | { ok: false; message: string };

/** Two or three sentences about the period, written by Claude from the cards (not from the raw messages). */
export async function summarizeWaPeriodAction(days: number): Promise<SummaryResult> {
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) return { ok: false, message: "You don't have the WhatsApp permission." };
  if (!aiConfigured()) return { ok: false, message: "ANTHROPIC_API_KEY is not set." };
  const window = (WINDOWS as readonly number[]).includes(days) ? days : 7;
  const board = await loadBoard(await recordsDb(), window);
  if (!board.cards.length) return { ok: false, message: "Nothing to summarize." };
  const lines = board.cards.slice(0, 150).map((c) => `- [${CATEGORY_LABEL[c.category]} · ${c.priority} · ${c.status}] ${formatDateTime(c.last_message_at)} ${c.customer ?? c.chat}${c.project_title ? ` (project ${c.project_title})` : ""}: ${c.summary}`);
  const language = user.language === "pt" ? "Brazilian Portuguese" : "English";
  try {
    const res = await claude().messages.create({
      model: TRIAGE_MODEL,
      max_tokens: 400,
      system: `You write a 2-3 sentence status summary of WhatsApp activity for the office of a technology/AV service company. Plain prose in ${language}, no lists, no headings. Lead with what is urgent and still open, then what else needs follow-up, then the tone of the rest. Name customers. Never include passwords, codes or keys.`,
      messages: [{ role: "user", content: `Period: the last ${window} day(s). ${board.cards.length} conversations.\n${lines.join("\n")}` }],
    });
    const text = res.content.find((b) => b.type === "text")?.text.trim() ?? "";
    return text ? { ok: true, text } : { ok: false, message: "The AI gave an empty answer." };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
