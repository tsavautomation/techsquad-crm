"use client";

import { createClient } from "@/lib/supabase/client";
import { canResumeUploadAction, createUploadAction, finishOneDriveUploadAction, previewUrlAction } from "@/lib/records/field-actions";
import type { FileItem } from "@/lib/records/values";
import { forgetSession, rememberSession, savedSession, sendToOneDrive, SessionExpired, uploadEnded, uploadStarted, type Progress } from "./resumable";

/**
 * Upload one picked file for a field: to OneDrive (resumable) when connected, otherwise to CRM storage.
 * Returns the FileItem to put in the form, or an error message.
 */
export async function uploadFile(table: string, field: string, recordId: number | null, file: File, onProgress: (p: Progress) => void): Promise<{ ok: true; item: FileItem } | { ok: false; message: string }> {
  uploadStarted();
  try {
    // Same file picked again after an interruption: carry on with its earlier OneDrive session.
    const earlier = savedSession(file);
    if (earlier && (await canResumeUploadAction(earlier.path))) {
      const done = await finishOneDrive(file, earlier.path, earlier.uploadUrl, onProgress, true);
      if (done) return done;
    }
    const slot = await createUploadAction(table, field, recordId, { name: file.name, type: file.type, size: file.size });
    if (!slot.ok) return slot;
    if (slot.kind === "onedrive") {
      rememberSession(file, slot);
      const done = await finishOneDrive(file, slot.path, slot.uploadUrl, onProgress, false);
      return done ?? { ok: false, message: `${file.name}: the upload expired. Please choose it again.` };
    }
    onProgress({ sent: 0, total: file.size, state: "sending" });
    const { error } = await createClient().storage.from("attachments").uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || undefined });
    if (error) return { ok: false, message: `${file.name}: ${error.message}` };
    onProgress({ sent: file.size, total: file.size, state: "done" });
    const url = (await previewUrlAction(slot.path)) ?? undefined;
    return { ok: true, item: { path: slot.path, name: file.name, mime: file.type || null, size: file.size, url } };
  } finally {
    uploadEnded();
  }
}

async function finishOneDrive(file: File, path: string, uploadUrl: string, onProgress: (p: Progress) => void, resume: boolean): Promise<{ ok: true; item: FileItem } | { ok: false; message: string } | null> {
  try {
    const itemId = await sendToOneDrive(file, uploadUrl, onProgress, resume);
    const r = await finishOneDriveUploadAction(path, itemId);
    forgetSession(file);
    if (!r.ok) return r;
    return { ok: true, item: { path, name: file.name, mime: file.type || null, size: file.size, url: r.url } };
  } catch (e) {
    if (e instanceof SessionExpired) {
      forgetSession(file);
      return null;
    }
    return { ok: false, message: `${file.name}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
