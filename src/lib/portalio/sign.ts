import { createHmac, timingSafeEqual } from "node:crypto";

// PI-a (SPEC §9.1): Portal.io signs every API request with HMAC-SHA256 (docs.portal.io/authentication/signing-requests).
// Pure functions, unit-tested in tests/pi-portalio.test.ts. No framework imports here.

/** Portal.io's canonical message: METHOD + URL without the query [+ Content-Type for non-GET] + date + user key, no separators. */
export function canonicalMessage(method: string, url: string, timestamp: string, userKey: string, contentType?: string): string {
  const u = new URL(url);
  const base = `${u.protocol}//${u.host}${u.pathname}`;
  const m = method.toUpperCase();
  return [m, base, ...(m === "GET" ? [] : [contentType ?? ""]), timestamp, userKey].join("");
}

/** Base64 of the raw HMAC-SHA256 digest; the secret is used as ASCII bytes, never Base64-decoded. */
export function sign(secret: string, canonical: string): string {
  return createHmac("sha256", Buffer.from(secret, "ascii")).update(canonical, "utf8").digest("base64");
}

/** RFC 7231 date ("Mon, 06 Apr 2026 00:22:19 GMT"), what X-MSS-CUSTOM-DATE wants. */
export const rfc7231 = (now: Date = new Date()) => now.toUTCString();

export type SignedHeaders = Record<string, string>;

/** The five headers of a signed request. The user key is "" for the credential exchange. */
export function signedHeaders(opts: { method: string; url: string; appId: string; secret: string; userKey: string; contentType?: string; now?: Date }): SignedHeaders {
  const date = rfc7231(opts.now);
  const h: SignedHeaders = {
    Accept: "application/json",
    "X-MSS-API-APPID": opts.appId,
    "X-MSS-API-USERKEY": opts.userKey,
    "X-MSS-CUSTOM-DATE": date,
    "X-MSS-SIGNATURE": sign(opts.secret, canonicalMessage(opts.method, opts.url, date, opts.userKey, opts.contentType)),
  };
  if (opts.method.toUpperCase() !== "GET" && opts.contentType) h["Content-Type"] = opts.contentType;
  return h;
}

/**
 * PI-b: a webhook's `X-Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + rawBody)>`.
 * Rejected when the signature differs or the timestamp is older than five minutes (docs.portal.io/concepts/webhooks).
 */
export function verifyWebhookSignature(secret: string, header: string | null, rawBody: string, nowMs: number = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "No X-Webhook-Signature header" };
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: "Malformed signature header" };
  if (Math.abs(nowMs / 1000 - t) > 5 * 60) return { ok: false, reason: "Signature timestamp is older than five minutes" };
  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(`${t}.${rawBody}`, "utf8").digest();
  const got = Buffer.from(v1, /^[0-9a-f]+$/i.test(v1) ? "hex" : "base64");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false, reason: "Signature does not match" };
  return { ok: true };
}
