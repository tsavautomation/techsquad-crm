"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { AutomationSchema, check, type AutomationInput } from "@/lib/engine/automation-schema";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { REGISTRY } from "@/registry";

// Automations editor (PLAN M12). System Administrators only (automations can email anyone);
// the database policy on public.automations enforces the same.

const FIRST_CUSTOM_ID = 100000; // ids below are WebAuthor trigger ids

export async function saveAutomationAction(id: number | null, table: string, input: AutomationInput): Promise<ActionResult & { id?: number; problems?: string[] }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only System Administrators can change automations." };
  const t = REGISTRY.find((x) => x.name === table);
  if (!t) return { ok: false, message: "Unknown table." };
  const parsed = AutomationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const problems = check(t, parsed.data);
  if (problems.length) return { ok: false, message: problems[0], problems };

  const db = await recordsDb();
  const row = { ...parsed.data, notes: parsed.data.notes || null, table_name: table, updated_at: new Date().toISOString() };
  if (id) {
    const { data, error } = await db.from("automations").update(row).eq("id", id).select("id");
    if (error) return { ok: false, message: error.message };
    if (!data?.length) return { ok: false, message: "Automation not found." };
  } else {
    const { data: last } = await db.from("automations").select("id").order("id", { ascending: false }).limit(1);
    id = Math.max(FIRST_CUSTOM_ID, ((last?.[0]?.id as number | undefined) ?? 0) + 1);
    const { error } = await db.from("automations").insert({ id, ...row });
    if (error) return { ok: false, message: error.message };
  }
  revalidatePath("/admin/automations");
  return { ok: true, id };
}

export async function setAutomationActiveAction(id: number, active: boolean): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only System Administrators can change automations." };
  const db = await recordsDb();
  const { data, error } = await db.from("automations").update({ active, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Automation not found." };
  revalidatePath("/admin/automations");
  return { ok: true };
}
