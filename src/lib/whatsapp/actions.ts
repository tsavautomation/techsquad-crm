"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiConfigured, claude, describeError } from "@/lib/ai/claude";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { canSeeWhatsApp, loadBoard, WINDOWS } from "./load";
import { CATEGORY_LABEL, STATUSES } from "./triage-engine";
import { TRIAGE_MODEL } from "./triage";

// F28: working the WhatsApp board. Everyone with the WhatsApp permission sees the same cards, so a status or
// an assignment set here shows for the whole team on the next refresh (the board refreshes itself every 20 s).

export type ActionResult = { ok: true } | { ok: false; message: string };

const Patch = z.object({ status: z.enum(STATUSES).optional(), assigned_to: z.string().trim().max(120).nullable().optional() });

/** Changes a card's status and / or who it is assigned to. */
export async function updateWaTaskAction(id: number, patch: { status?: string; assigned_to?: string | null }): Promise<ActionResult> {
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) return { ok: false, message: "You don't have the WhatsApp permission." };
  const p = Patch.safeParse(patch);
  if (!p.success || !Number.isInteger(id)) return { ok: false, message: "Bad request." };
  const values: Record<string, unknown> = {};
  if (p.data.status) values.status = p.data.status;
  if (p.data.assigned_to !== undefined) values.assigned_to = p.data.assigned_to || null;
  if (!Object.keys(values).length) return { ok: true };
  const db = await recordsDb();
  const { data, error } = await db.from("wa_tasks").update(values).eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!(data as unknown[] | null)?.length) return { ok: false, message: "That card is gone or you may not change it." };
  revalidatePath("/whatsapp");
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
  if (!board.tasks.length) return { ok: false, message: "Nothing to summarize." };
  const lines = board.tasks.slice(0, 150).map((t) => `- [${CATEGORY_LABEL[t.category]} · ${t.priority} · ${t.status}] ${formatDateTime(t.occurred_at)} ${t.customer ?? t.chat}: ${t.summary}`);
  const language = user.language === "pt" ? "Brazilian Portuguese" : "English";
  try {
    const res = await claude().messages.create({
      model: TRIAGE_MODEL,
      max_tokens: 400,
      system: `You write a 2-3 sentence status summary of WhatsApp activity for the office of a technology/AV service company. Plain prose in ${language}, no lists, no headings. Lead with what is urgent and still open, then what else needs follow-up, then the tone of the rest. Name customers. Never include passwords, codes or keys.`,
      messages: [{ role: "user", content: `Period: the last ${window} day(s). ${board.tasks.length} messages.\n${lines.join("\n")}` }],
    });
    const text = res.content.find((b) => b.type === "text")?.text.trim() ?? "";
    return text ? { ok: true, text } : { ok: false, message: "The AI gave an empty answer." };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
