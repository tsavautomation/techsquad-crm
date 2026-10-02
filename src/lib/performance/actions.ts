"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { LEVELS, SKILLS } from "./score";

/** Save an employee's skills grid (P2): one level per skill, or none. Staff Performance "View all" holders. */
export async function saveSkillsAction(employeeId: number, skills: Record<string, string | null>): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!user.permissions.has("forms.staff-performance.view_all")) return { ok: false, message: "You don't have permission to do that." };
  const db = await recordsDb();
  const keep = Object.entries(skills).filter(([skill, level]) => (SKILLS as readonly string[]).includes(skill) && level && (LEVELS as readonly string[]).includes(level)) as [string, string][];
  const { error: delErr } = await db.from("employee_skills").delete().eq("employee_id", employeeId);
  if (delErr) return { ok: false, message: delErr.message };
  if (keep.length) {
    const { error } = await db.from("employee_skills").insert(keep.map(([skill, level]) => ({ employee_id: employeeId, skill, level, updated_by: user.id })));
    if (error) return { ok: false, message: error.message };
  }
  revalidatePath(recordHref(getTable("employees"), employeeId));
  return { ok: true };
}
