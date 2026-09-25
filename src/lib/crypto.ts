import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Sensitive fields (SSN, portal passwords, system credentials — SPEC §9 Q18) are
// encrypted by the app with AES-256-GCM before they reach the database.
// Stored format: enc:v1:<iv>:<tag>:<ciphertext>, all base64.

const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set (see .env.example)");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

export function isEncrypted(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(PREFIX);
}

export function decrypt(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy/plain value
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export const MASK = "••••••••";
