import { describe, expect, it } from "vitest";
import { dateField, fileDate, pdfFileName, technicianField, wantsPdf } from "@/lib/files/pdf-name";
import { getTable, REGISTRY } from "@/registry";

// PDF copies in OneDrive (SPEC §9.1 OD-c): which records get one and what the file is called.

describe("PDF copies in OneDrive", () => {
  it("names the file job – technician – date – #id, without characters OneDrive refuses", () => {
    expect(pdfFileName({ formLabel: "Job Report", job: "Stern Residence - 6070 NBR", technician: "Carlos Gurgel", date: "10-04-2026", id: 1234 })).toBe("Job Report – Stern Residence - 6070 NBR – Carlos Gurgel – 10-04-2026 (1234).pdf");
    expect(pdfFileName({ formLabel: "Note", job: null, technician: null, date: "01-05-2026", id: 7 })).toBe("Note – 01-05-2026 (7).pdf");
    expect(pdfFileName({ formLabel: "Job Report", job: "Apt #903 / Jade: \"Signature\"", technician: "Lucas Oliveira, Carlos Gurgel", date: "10-04-2026", id: 9 })).toBe("Job Report – Apt #903 Jade Signature – Lucas Oliveira, Carlos Gurgel – 10-04-2026 (9).pdf");
  });

  it("writes the record's own date as MM-DD-YYYY and falls back to the creation day", () => {
    expect(fileDate("2026-10-04", "x")).toBe("10-04-2026");
    expect(fileDate("2026-10-04T15:11:04.301Z", "x")).toBe("10-04-2026");
    expect(fileDate(null, "09-30-2026")).toBe("09-30-2026");
  });

  it("covers the forms that carry files, and nothing else", () => {
    const names = REGISTRY.filter(wantsPdf).map((t) => t.name);
    expect(names).toContain("job_reports");
    expect(names).toContain("tv_installations");
    expect(names).not.toContain("visits"); // no files
    expect(names).not.toContain("contact_interactions"); // a sub-list
    expect(names).not.toContain("brands"); // a utility list
  });

  it("knows who did the work and when on a Job Report", () => {
    const t = getTable("job_reports");
    expect(technicianField(t)?.lookup?.table).toBe("employees");
    expect(dateField(t)?.name).toBe("date");
  });
});
