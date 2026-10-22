"use server";

import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";

// F30: who revealed or copied a masked value (a password, a PIN, an SSN) and when. Logged in the viewer's own
// name through RLS; the record page of a login shows the log to whoever may change it.

export async function logRevealAction(table: string, recordId: number, field: string, action: "show" | "copy"): Promise<void> {
  const user = await requireUser();
  const db = await recordsDb();
  await db.from("sensitive_reveals").insert({ table_name: table, record_id: recordId, field, action, user_id: user.id });
}
