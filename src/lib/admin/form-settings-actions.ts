"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureFieldSettings } from "@/lib/admin/field-settings";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { REGISTRY } from "@/registry";
import { baseFields } from "@/registry/overrides";

// Form settings (PLAN M12): labels, dropdown options, required, order and help text.
// Holders of WebAuthor's "Design" page (and System Administrators). Only differences from
// the registry are stored, so "reset" is simply deleting the row.

const Option = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1, "Every option needs a label").max(120),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  retired: z.boolean().optional(),
});

const FieldInput = z.object({
  name: z.string(),
  label: z.string().trim().min(1, "Every field needs a label").max(120),
  required: z.boolean(),
  help: z.string().trim().max(300),
  options: z.array(Option).optional(),
});

export async function saveFormSettingsAction(table: string, fields: z.input<typeof FieldInput>[]): Promise<ActionResult & { saved?: number }> {
  const me = await requireUser();
  if (!me.permissions.has("projects.module.design_design")) return { ok: false, message: "You don't have permission to change forms." };
  const t = REGISTRY.find((x) => x.name === table);
  if (!t) return { ok: false, message: "Unknown form." };
  const parsed = z.array(FieldInput).safeParse(fields);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const base = baseFields(t);
  const baseIndex = new Map(base.map((f, i) => [f.name, i]));
  // The editor sends the visible fields; hidden ones (e.g. the generated title) keep their original place.
  const sent = new Set(parsed.data.map((f) => f.name));
  const missing = base.filter((f) => !sent.has(f.name));
  if (parsed.data.some((f) => !baseIndex.has(f.name)) || sent.size !== parsed.data.length || missing.some((f) => !f.hidden)) {
    return { ok: false, message: "The form changed while you were editing. Reload and try again." };
  }
  const order = parsed.data.map((f) => f.name);
  for (const f of missing) order.splice(Math.min(baseIndex.get(f.name)!, order.length), 0, f.name);
  const reordered = order.some((name, i) => baseIndex.get(name) !== i);
  const position = new Map(order.map((name, i) => [name, i]));

  const rows = [];
  const unchanged: string[] = [];
  for (const f of parsed.data) {
    const i = position.get(f.name)!;
    const b = base[baseIndex.get(f.name)!];
    if (f.options) {
      const values = f.options.map((o) => o.value);
      if (new Set(values).size !== values.length) return { ok: false, message: `${f.label}: two options have the same value.` };
      const labels = f.options.map((o) => o.label.toLowerCase());
      if (new Set(labels).size !== labels.length) return { ok: false, message: `${f.label}: two options have the same label.` };
      const missing = (b.options ?? []).filter((o) => !values.includes(o.value));
      if (missing.length) return { ok: false, message: `${f.label}: options can be retired but not removed (${missing[0].label}).` };
      if (!f.options.some((o) => !o.retired)) return { ok: false, message: `${f.label}: keep at least one option available.` };
    }
    const optionsChanged = f.options && JSON.stringify(f.options.map((o) => ({ ...o, retired: o.retired || undefined }))) !== JSON.stringify((b.options ?? []).map((o) => ({ value: o.value, label: o.label, color: o.color, retired: undefined })));
    const row = {
      table_name: t.name,
      field_name: f.name,
      label: f.label !== b.label ? f.label : null,
      required: f.required !== Boolean(b.required) && f.name !== t.parent?.field ? f.required : null,
      help: f.help ? f.help : null,
      sort_order: reordered ? i : null,
      options: optionsChanged ? f.options! : null,
    };
    if (row.label === null && row.required === null && row.help === null && row.sort_order === null && row.options === null) unchanged.push(f.name);
    else rows.push(row);
  }

  const db = await recordsDb();
  if (rows.length) {
    const { error } = await db.from("field_settings").upsert(rows, { onConflict: "table_name,field_name" });
    if (error) return { ok: false, message: error.message };
  }
  if (unchanged.length) {
    const { error } = await db.from("field_settings").delete().eq("table_name", t.name).in("field_name", unchanged);
    if (error) return { ok: false, message: error.message };
  }
  await ensureFieldSettings(true);
  revalidatePath("/", "layout");
  return { ok: true, saved: rows.length };
}

/** Put a whole form back as it came from WebAuthor. */
export async function resetFormSettingsAction(table: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.permissions.has("projects.module.design_design")) return { ok: false, message: "You don't have permission to change forms." };
  const db = await recordsDb();
  const { error } = await db.from("field_settings").delete().eq("table_name", table);
  if (error) return { ok: false, message: error.message };
  await ensureFieldSettings(true);
  revalidatePath("/", "layout");
  return { ok: true };
}
