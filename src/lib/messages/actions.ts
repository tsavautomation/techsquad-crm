"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { saveRecord } from "@/lib/records/save";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { MessagesSchema, type MessageSettings } from "./templates";

// F4 contact log and message templates (SPEC §9.1 F4-c, F4-d).

type Result = { ok: true } | { ok: false; message: string };

export type LogInput = {
  contactId: number;
  projectId: number | null;
  type: string;
  result?: string | null;
  followUp?: string | null;
  notes?: string | null;
  template?: string | null;
};

/** One Interaction on the contact (a call, or a message sent from a template), through the normal save path. */
export async function logContactAction(input: LogInput): Promise<Result> {
  if (!Number.isInteger(input.contactId)) return { ok: false, message: "Choose who it was with." };
  const r = await saveRecord("contact_interactions", null, {
    contact_id: input.contactId,
    project_id: input.projectId,
    type: input.type,
    date: todayET(),
    result: input.result || null,
    follow_up_date: input.followUp || null,
    notes: input.notes?.trim() || null,
    template: input.template || null,
  });
  if (!r.ok) return { ok: false, message: r.message ?? (Object.values(r.errors)[0] || "Could not save.") };
  revalidatePath(recordHref(getTable("contacts"), input.contactId));
  if (input.projectId) revalidatePath(recordHref(getTable("projects"), input.projectId));
  revalidatePath("/");
  return { ok: true };
}

export async function saveMessagesAction(input: MessageSettings): Promise<Result> {
  await requireUser();
  const parsed = MessagesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the values." };
  const keys = parsed.data.templates.map((x) => x.key);
  if (new Set(keys).size !== keys.length) return { ok: false, message: "Two templates have the same key." };
  const db = await recordsDb();
  const { error } = await db.from("app_settings").upsert({ key: "messages", value: parsed.data });
  if (error) return { ok: false, message: /row-level security|permission/i.test(error.message) ? "You don't have permission to do that." : error.message };
  revalidatePath("/admin/messages");
  return { ok: true };
}
