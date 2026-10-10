"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClient } from "@/lib/portal/session";
import { createUploadSession, oneDriveReady } from "@/lib/files/onedrive";
import { isPendingOneDrive, OD_UPLOAD, uploadIdOf } from "@/lib/files/paths";
import { confirmUpload } from "@/lib/files/store";
import { adminDb } from "@/lib/supabase/admin";
import { recordsDb } from "@/lib/records/data";
import { syncAttachments, BUCKET } from "@/lib/records/relations";
import type { UploadSlot } from "@/lib/records/field-actions";
import type { FileItem } from "@/lib/records/values";
import { getTable } from "@/registry";

// Customer portal (F6) writes. Customers hold no staff permission, so these never go through saveRecord():
// the row-level policies "client add" (service_requests) and "portal add" (attachments) are the whole rule,
// and the audit trigger records the insert like any other.

const TABLE = "service_requests";
const FIELD = "media";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_ONEDRIVE_BYTES = 10 * 1024 * 1024 * 1024;

/** A place to send one photo / video for a new request: OneDrive when connected, else CRM storage. */
export async function portalUploadAction(_table: string, _field: string, _recordId: number | null, file: { name: string; type: string; size: number }): Promise<UploadSlot | { ok: false; message: string }> {
  const user = await requireClient();
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return { ok: false, message: "Please choose a photo or a video." };
  if (await oneDriveReady()) {
    if (file.size > MAX_ONEDRIVE_BYTES) return { ok: false, message: `“${file.name}” is larger than 10 GB.` };
    const id = randomUUID();
    try {
      const uploadUrl = await createUploadSession(file.name, id);
      const { error } = await adminDb().from("onedrive_uploads").insert({ id, user_id: user.id, table_name: TABLE, field: FIELD, file_name: file.name.slice(0, 200), mime_type: file.type || null, size_bytes: file.size, upload_url: uploadUrl });
      if (error) return { ok: false, message: error.message };
      return { ok: true, kind: "onedrive", path: OD_UPLOAD + id, uploadUrl };
    } catch (e) {
      return { ok: false, message: `OneDrive: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: `“${file.name}” is larger than 50 MB.` };
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  // Same shape as the record form's paths: <table>/<scope>/<field>/<uploader>/<file> (syncAttachments checks it).
  const path = `${TABLE}/pending-${randomUUID()}/${FIELD}/${user.id}/${randomUUID()}-${safeName}`;
  const db = await recordsDb();
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: error?.message ?? "Could not prepare the upload" };
  return { ok: true, kind: "crm", path: data.path, token: data.token };
}

export async function portalFinishOneDriveAction(path: string, itemId: string): Promise<{ ok: true; url?: string } | { ok: false; message: string }> {
  const user = await requireClient();
  if (!isPendingOneDrive(path)) return { ok: false, message: "Not a OneDrive upload" };
  const r = await confirmUpload(uploadIdOf(path), itemId, user.id);
  return r.ok ? { ok: true } : r;
}

export async function portalCanResumeAction(path: string): Promise<boolean> {
  const user = await requireClient();
  if (!isPendingOneDrive(path)) return false;
  const { data } = await adminDb().from("onedrive_uploads").select("user_id, status").eq("id", uploadIdOf(path)).maybeSingle();
  const u = data as { user_id: string; status: string } | null;
  return Boolean(u && u.user_id === user.id && u.status === "open");
}

/** No preview before the request is saved: the thumbnail comes from the phone itself. */
export async function portalPreviewUrlAction(): Promise<string | null> {
  await requireClient();
  return null;
}

const RequestInput = z.object({
  projectId: z.number().int().positive(),
  kind: z.enum(["Service call", "Something stopped working", "Question", "Other"]),
  description: z.string().trim().min(1, "Tell us what is going on.").max(2000),
  media: z
    .array(z.object({ path: z.string(), name: z.string(), mime: z.string().nullable(), size: z.number().nullable() }))
    .max(10)
    .default([]),
});
export type RequestInput = z.input<typeof RequestInput>;

/** The customer asks for a visit, reports a problem or asks a question. The office sees it in the alerts bell. */
export async function createRequestAction(input: RequestInput): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const user = await requireClient();
  const parsed = RequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { projectId, kind, description, media } = parsed.data;
  const db = await recordsDb();
  const { data: p } = await db.from("portal_projects").select("id, title").eq("id", projectId).maybeSingle();
  if (!p) return { ok: false, message: "You don't have access to this project." };

  const { data, error } = await db
    .from(TABLE)
    .insert({ project_id: projectId, contact_id: user.contactId, kind, description, status: "Requested", title: `${kind} – ${(p as { title: string | null }).title ?? `#${projectId}`}` })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "Could not save the request." };
  const id = (data as { id: number }).id;

  if (media.length) {
    const t = getTable(TABLE);
    const f = t.fields.find((x) => x.name === FIELD)!;
    try {
      await syncAttachments(db, t, f, id, media as FileItem[], user.id);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
  revalidatePath(`/portal/p/${projectId}`, "layout");
  return { ok: true, id };
}
