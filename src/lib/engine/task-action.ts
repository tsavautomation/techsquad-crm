import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayET } from "@/lib/dates";
import { buildTitle } from "@/lib/records/title";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import type { TableDef } from "@/registry/types";
import { renderTokens } from "./conditions";
import type { EngineRecord } from "./record-view";

// F4 automation action "Create a task" (SPEC §9.1 F4-b): e.g. a follow-up 3 days after a proposal is sent.
// One open task per automation and record: while it isn't Completed, a re-run adds nothing.

export type TaskAction = { type: "task"; text: string; due_days: number; assign?: string; labels?: string[] };

/** The Employee linked to a login (same email), or null. */
export async function employeeForUser(db: SupabaseClient, userId: string | null): Promise<number | null> {
  if (!userId) return null;
  const { data: p } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = (p as { email: string | null } | null)?.email;
  if (!email) return null;
  const { data } = await db.from("employees").select("id").ilike("email", email).is("deleted_at", null).limit(1);
  return ((data ?? []) as { id: number }[])[0]?.id ?? null;
}

async function liveEmployee(db: SupabaseClient, id: unknown): Promise<number | null> {
  if (typeof id !== "number") return null;
  const { data } = await db.from("employees").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? id : null;
}

/** Creates the task and returns what it did, or null when an open one already exists. */
export async function createAutoTask(
  db: SupabaseClient,
  automationId: number,
  action: TaskAction,
  t: TableDef,
  rec: EngineRecord,
  token: (field: string) => string,
  actor: string | null,
): Promise<string | null> {
  const source = `automation:${automationId}:${t.name}:${rec.id}`;
  const { data: open } = await db.from("tasks").select("id").eq("source", source).neq("status", "Completed").is("deleted_at", null).limit(1);
  if (open?.length) return null;

  // The person in the chosen field (e.g. the project's Salesperson), else whoever made the change.
  const memberId = (action.assign ? await liveEmployee(db, rec.values[action.assign]) : null) ?? (await employeeForUser(db, actor));
  const projectId = t.name === "projects" ? rec.id : typeof rec.values.project_id === "number" ? rec.values.project_id : null;
  const values: Record<string, unknown> = {
    member_id: memberId,
    status: "Pending",
    due_date: addDays(todayET(), action.due_days),
    details: renderTokens(action.text, token).replace(/\s+/g, " ").trim(),
    project_id: projectId,
    labels: action.labels?.length ? action.labels : null,
    source,
  };
  values.title = await buildTitle(getTable("tasks"), values, null, db);
  const { data: task, error } = await db.from("tasks").insert(values).select("id").single();
  if (error || !task) throw new Error(`task: ${error?.message ?? "not created"}`);
  return `task #${(task as { id: number }).id}${memberId ? ` for employee #${memberId}` : " (unassigned)"}`;
}
