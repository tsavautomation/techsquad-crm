import { describe, expect, it } from "vitest";
import { ackLog, fieldChanges, isCleared, isRequestRecipient, parseSharedAlerts, pendingForMe, type Ack, type AuditRow } from "@/lib/requests/engine";

// F26-1 Project requests and shared alerts (SPEC §9.1 F26-a / F26-c).

const ME = "u-fred";
const OTHER = "u-jessica";
const open = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("shared alerts", () => {
  it("defaults the recipients to Saulo, Jessica, Lucas, Luana and Fred", () => {
    const s = parseSharedAlerts(undefined);
    expect(s.request_recipient_emails).toEqual(["saulo@tsav.net", "jessica@tsav.net", "lucas@tsav.net", "luana@tsav.net", "fred@tsav.net"]);
    expect(isRequestRecipient(s, "Fred@TSAV.net")).toBe(true);
    expect(isRequestRecipient(s, "roberto@tsav.net")).toBe(false);
  });

  it("falls back to the defaults when the stored value is broken", () => {
    expect(parseSharedAlerts({ request_recipient_emails: ["not an email"] }).request_recipient_emails).toHaveLength(5);
    expect(parseSharedAlerts({ request_recipient_emails: ["ana@tsav.net"] }).request_recipient_emails).toEqual(["ana@tsav.net"]);
  });

  it("one clear clears for everyone; an acknowledgement only for that person; reading changes nothing", () => {
    const acks: Ack[] = [
      { ref_id: 1, user_id: OTHER, action: "cleared", at: "2026-10-21T10:00:00Z" },
      { ref_id: 2, user_id: OTHER, action: "acknowledged", at: "2026-10-21T10:01:00Z" },
      { ref_id: 3, user_id: ME, action: "read", at: "2026-10-21T10:02:00Z" },
    ];
    expect(pendingForMe(open, acks, ME).map((r) => r.id)).toEqual([2, 3]);
    expect(pendingForMe(open, acks, OTHER).map((r) => r.id)).toEqual([3]);
    expect(isCleared(acks, 1)).toBe(true);
    expect(isCleared(acks, 2)).toBe(false);
  });

  it("lists the log of one request in time order with names", () => {
    const acks: Ack[] = [
      { ref_id: 7, user_id: ME, action: "cleared", at: "2026-10-21T12:00:00Z" },
      { ref_id: 7, user_id: OTHER, action: "read", at: "2026-10-21T09:00:00Z" },
      { ref_id: 8, user_id: OTHER, action: "read", at: "2026-10-21T08:00:00Z" },
      { ref_id: 7, user_id: OTHER, action: "acknowledged", at: "2026-10-21T09:00:00Z" },
    ];
    const names = new Map([[ME, "Fred"], [OTHER, "Jessica"]]);
    expect(ackLog(acks, 7, names)).toEqual([
      { action: "read", who: "Jessica", at: "2026-10-21T09:00:00Z" },
      { action: "acknowledged", who: "Jessica", at: "2026-10-21T09:00:00Z" },
      { action: "cleared", who: "Fred", at: "2026-10-21T12:00:00Z" },
    ]);
    expect(ackLog(acks, 9, names)).toEqual([]);
  });
});

describe("timeline: status changes from the audit log", () => {
  it("reads the job status changes, including the first value set on create", () => {
    const rows: AuditRow[] = [
      { id: 1, record_id: 5, action: "create", at: "2026-10-01T10:00:00Z", actor: ME, changes: { job_status: [null, "Surveying"], title: [null, "Villa"] } },
      { id: 2, record_id: 5, action: "update", at: "2026-10-02T10:00:00Z", actor: OTHER, changes: { title: ["Villa", "Villa 2"] } },
      { id: 3, record_id: 5, action: "update", at: "2026-10-03T10:00:00Z", actor: OTHER, changes: { job_status: ["Surveying", "Create Proposal"] } },
      { id: 4, record_id: 5, action: "update", at: "2026-10-04T10:00:00Z", actor: null, changes: { job_status: ["Create Proposal", null] } },
    ];
    expect(fieldChanges(rows, "job_status")).toEqual([
      { auditId: 1, recordId: 5, at: "2026-10-01T10:00:00Z", actor: ME, from: null, to: "Surveying" },
      { auditId: 3, recordId: 5, at: "2026-10-03T10:00:00Z", actor: OTHER, from: "Surveying", to: "Create Proposal" },
    ]);
  });

  it("skips a create row without the field and rows where nothing changed", () => {
    const rows: AuditRow[] = [
      { id: 1, record_id: 5, action: "create", at: "2026-10-01T10:00:00Z", actor: null, changes: { title: [null, "x"] } },
      { id: 2, record_id: 5, action: "update", at: "2026-10-02T10:00:00Z", actor: null, changes: { status: ["Pending", "Pending"] } },
      { id: 3, record_id: 6, action: "update", at: "2026-10-02T11:00:00Z", actor: null, changes: { status: ["Working", "Completed"] } },
    ];
    expect(fieldChanges(rows, "status").map((c) => [c.recordId, c.to])).toEqual([[6, "Completed"]]);
  });
});
