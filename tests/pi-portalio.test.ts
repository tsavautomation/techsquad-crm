import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { matchContacts, nameSimilarity, normalizePhone, normalizeStreet, proposalChanges, suggestProjects, OPEN_REQUEST } from "@/lib/portalio/match";
import { canonicalMessage, sign, signedHeaders, verifyWebhookSignature } from "@/lib/portalio/sign";

// PI Portal.io (Fred 2026-10-28, SPEC §9.1 PI-a…PI-e): request signing, webhook signatures, project and contact
// suggestions, and the "changed in Portal.io" rule.

describe("PI-a request signing (docs.portal.io/authentication/signing-requests)", () => {
  const date = "Mon, 06 Apr 2026 00:22:19 GMT";
  it("builds the canonical message without separators and without the query string", () => {
    expect(canonicalMessage("get", "https://api.portal.io/public/proposals?PageNumber=1&PageSize=10", date, "USERKEY")).toBe(`GEThttps://api.portal.io/public/proposals${date}USERKEY`);
    expect(canonicalMessage("POST", "https://api.portal.io/public/webhook/subscribe", date, "USERKEY", "application/json")).toBe(`POSThttps://api.portal.io/public/webhook/subscribeapplication/jsonUSERKEY`.replace("application/json", `application/json${date}`));
  });
  it("the credential exchange signs with an empty user key", () => {
    expect(canonicalMessage("GET", "https://sandbox.api.portal.io/authenticate/apikeyexchange?username=a&password=b", date, "")).toBe(`GEThttps://sandbox.api.portal.io/authenticate/apikeyexchange${date}`);
  });
  it("signs with the secret as ASCII bytes and Base64 of the raw digest", () => {
    const secret = "0Zvi5o27P1q2cZWXYPPwYLh2jNgYMGVrYhIbSpM5T84=";
    const msg = canonicalMessage("GET", "https://sandbox.api.portal.io/public/proposals", date, "K");
    expect(sign(secret, msg)).toBe(createHmac("sha256", Buffer.from(secret, "ascii")).update(msg).digest("base64"));
    const h = signedHeaders({ method: "POST", url: "https://sandbox.api.portal.io/public/proposals", appId: "APP", secret, userKey: "K", contentType: "application/json", now: new Date("2026-04-06T00:22:19Z") });
    expect(h["X-MSS-CUSTOM-DATE"]).toBe(date);
    expect(h["X-MSS-API-APPID"]).toBe("APP");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["X-MSS-SIGNATURE"]).toBe(sign(secret, `POSThttps://sandbox.api.portal.io/public/proposalsapplication/json${date}K`));
  });
});

describe("PI-b webhook signature", () => {
  const secret = "whsec";
  const body = '{"id":10025,"number":4123}';
  const now = 1_780_000_000_000;
  const t = Math.floor(now / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  it("accepts a fresh, matching signature (hex or base64)", () => {
    expect(verifyWebhookSignature(secret, `t=${t},v1=${v1}`, body, now)).toEqual({ ok: true });
    const b64 = createHmac("sha256", secret).update(`${t}.${body}`).digest("base64");
    expect(verifyWebhookSignature(secret, `t=${t},v1=${b64}`, body, now)).toEqual({ ok: true });
  });
  it("rejects a changed body, a wrong secret, an old timestamp and a missing header", () => {
    expect(verifyWebhookSignature(secret, `t=${t},v1=${v1}`, body.replace("4123", "4124"), now).ok).toBe(false);
    expect(verifyWebhookSignature("other", `t=${t},v1=${v1}`, body, now).ok).toBe(false);
    expect(verifyWebhookSignature(secret, `t=${t},v1=${v1}`, body, now + 6 * 60_000).ok).toBe(false);
    expect(verifyWebhookSignature(secret, null, body, now).ok).toBe(false);
  });
});

describe("PI-c project suggestions", () => {
  const projects = [
    { id: 1, title: "Lazarus Residence", job_address: { street: "9701 Collins Ave", zip: "33154" }, owner_email: "guimar@design.com", owner_phone: "(305) 555-0100", owner_name: "Guimar Urbina" },
    { id: 2, title: "Smith Home Theater", job_address: { street: "12 Ocean Dr.", zip: "33139" }, owner_email: "smith@x.com", owner_phone: null, owner_name: "John Smith" },
    { id: 3, title: "Navicon Office", job_address: null, owner_email: null, owner_phone: null, owner_name: null },
  ];
  it("a Transaction already carrying the Portal number wins", () => {
    const s = suggestProjects({ number: 3204, name: "Something", customer: null, location: null }, projects, new Map([["3204", [3]]]));
    expect(s[0]).toMatchObject({ id: 3, score: 100 });
  });
  it("e-mail, address and phone are strong; a similar name is weak", () => {
    const s = suggestProjects({ number: 1, name: "Guimar Urbina - Lazarus Residence", customer: { firstName: "Guimar", lastName: "Urbina", email: "GUIMAR@design.com", phone: "+1 305 555 0100" }, location: { street: "9701 Collins Avenue", postalCode: "33154-1234" } }, projects, new Map());
    expect(s[0].id).toBe(1);
    expect(s[0].score).toBe(90);
    expect(s.find((x) => x.id === 2)).toBeUndefined();
    const weak = suggestProjects({ number: 2, name: "Smith - Theater", customer: null, location: null }, projects, new Map());
    expect(weak[0]).toMatchObject({ id: 2, reason: "Similar name" });
    expect(weak[0].score).toBeLessThan(80);
  });
  it("normalizes phones and streets", () => {
    expect(normalizePhone("+1 (305) 555-0100")).toBe("3055550100");
    expect(normalizeStreet("9701 Collins Avenue, Unit #1203")).toBe("9701 collins ave unit 1203");
    expect(nameSimilarity("Lazarus Residence", "Guimar Urbina - Lazarus Residence")).toBe(1);
  });
});

describe("PI-d contact matches (never applied by themselves)", () => {
  const contacts = [
    { id: 10, first_name: "Guimar", last_name: "Urbina", email: "guimar@design.com", alternate_email: null, main_phone: "305-555-0100", organization: "Urbina Design" },
    { id: 11, first_name: "John", last_name: "Smith", email: null, alternate_email: "js@alt.com", main_phone: null, organization: null },
    { id: 12, first_name: "John", last_name: "Smith", email: "other@x.com", alternate_email: null, main_phone: null, organization: null },
  ];
  it("e-mail or phone = certain, full name = likely, certain first", () => {
    expect(matchContacts({ email: "js@alt.com", firstName: "John", lastName: "Smith" }, contacts)).toEqual([
      { id: 11, label: "John Smith (#11)", reason: "Same e-mail", certain: true },
      { id: 12, label: "John Smith (#12)", reason: "Same first and last name", certain: false },
    ]);
    expect(matchContacts({ phone: "(305) 555-0100" }, contacts)[0]).toMatchObject({ id: 10, certain: true, reason: "Same phone" });
    expect(matchContacts({ firstName: "Nobody", lastName: "Here" }, contacts)).toEqual([]);
    expect(matchContacts(null, contacts)).toEqual([]);
  });
});

describe("PI-e changed in Portal.io", () => {
  const base = { total: 1000, name: "A", change_orders: [], synced_total: 1000, synced_name: "A", synced_change_orders: [] };
  it("nothing changed → null; a new total, name or change order → the difference", () => {
    expect(proposalChanges(base)).toBeNull();
    expect(proposalChanges({ ...base, total: 1250.5 })).toEqual({ total: [1000, 1250.5] });
    expect(proposalChanges({ ...base, name: "B", change_orders: [{}] })).toEqual({ name: ["A", "B"], change_orders: [0, 1] });
  });
  it("payment requests still waiting for money", () => {
    expect(OPEN_REQUEST("Submitted")).toBe(true);
    expect(OPEN_REQUEST("Paid")).toBe(false);
    expect(OPEN_REQUEST("Cancelled")).toBe(false);
  });
});
