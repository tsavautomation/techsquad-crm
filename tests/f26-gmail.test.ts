import { describe, expect, it } from "vitest";
import { attachmentsOf, bodyText, cleanSubject, emailFolderName, htmlToText, innerSenders, matchProject, parseAddress, parseAddressList, parseMessage, projectIdInSubject, type GmailMessage } from "@/lib/mail/engine";

// F26-2 Gmail intake (SPEC §9.1 F26-a): reading a Gmail message and matching it to a project.

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("addresses and subjects", () => {
  it("reads names and addresses in the usual shapes", () => {
    expect(parseAddress("Ana Lima <Ana@Example.com>")).toEqual({ name: "Ana Lima", email: "ana@example.com" });
    expect(parseAddress('"Lima, Ana" <ana@example.com>')).toEqual({ name: "Lima, Ana", email: "ana@example.com" });
    expect(parseAddress("ana@example.com")).toEqual({ name: "", email: "ana@example.com" });
    expect(parseAddressList('"Lima, Ana" <ana@x.com>, Bob <bob@x.com>').map((a) => a.email)).toEqual(["ana@x.com", "bob@x.com"]);
  });

  it("strips forwarding and reply prefixes in English and Portuguese", () => {
    expect(cleanSubject("Fwd: RE: Enc: Villa Serena – change order")).toBe("Villa Serena – change order");
    expect(cleanSubject("  FW:   [External]  Hello ")).toBe("Hello");
    expect(cleanSubject("Resumo do dia")).toBe("Resumo do dia"); // "Res" is a prefix only with a colon
  });

  it("finds #id in the subject", () => {
    expect(projectIdInSubject("Fwd: O'Reilly - Miami #1249 TV sizes")).toBe(1249);
    expect(projectIdInSubject("Invoice #12345678 (too long)")).toBeNull();
    expect(projectIdInSubject("no id here")).toBeNull();
  });

  it("finds the original senders in a forwarded body", () => {
    const text = "Hi, see below.\n\n---------- Forwarded message ---------\nFrom: Client One <client@gmail.com>\nDate: Tue\nSubject: x\n\n> From: Other <other@x.com>\n";
    expect(innerSenders(text)).toEqual(["client@gmail.com", "other@x.com"]);
    expect(innerSenders("**De:** Maria <maria@x.com>")).toEqual(["maria@x.com"]);
  });
});

describe("matching an email to a project", () => {
  const projects = [
    { id: 1249, title: "O'Reilly - Miami", emails: ["oreilly@gmail.com"] },
    { id: 1300, title: "Villa Serena", emails: ["serena@x.com", "shared@x.com"] },
    { id: 1301, title: "Villa Serena Phase 2", emails: ["shared@x.com"] },
    { id: 1302, title: "Rua", emails: [] },
  ];
  const threads = new Map([["t-1", 1300]]);
  const mail = (o: Partial<{ subject: string; senders: string[]; threadId: string }>) => ({ subject: o.subject ?? "", senders: o.senders ?? [], threadId: o.threadId ?? null });

  it("takes #id first, when the project exists", () => {
    expect(matchProject(mail({ subject: "Fwd: #1249 TV" }), projects, threads)).toEqual({ projectId: 1249, by: "id" });
    expect(matchProject(mail({ subject: "#9999 unknown" }), projects, threads)).toBeNull();
  });

  it("then the thread an earlier email was filed under", () => {
    expect(matchProject(mail({ subject: "Re: anything", threadId: "t-1" }), projects, threads)).toEqual({ projectId: 1300, by: "thread" });
  });

  it("then the longest project name in the subject, as whole words and without accents", () => {
    expect(matchProject(mail({ subject: "Fwd: villa serena phase 2 – doors" }), projects, threads)).toEqual({ projectId: 1301, by: "subject" });
    expect(matchProject(mail({ subject: "Fwd: Villa Serena doors" }), projects, threads)).toEqual({ projectId: 1300, by: "subject" });
    expect(matchProject(mail({ subject: "O’Reilly – Miami: TV sizes" }), projects, threads)).toEqual({ projectId: 1249, by: "subject" });
    expect(matchProject(mail({ subject: "Rua Augusta" }), projects, threads)).toBeNull(); // too short a name
    expect(matchProject(mail({ subject: "Villa Serenata" }), projects, threads)).toBeNull(); // not whole words
  });

  it("then the sender, only when exactly one project has that contact", () => {
    expect(matchProject(mail({ subject: "hello", senders: ["Serena@x.com"] }), projects, threads)).toEqual({ projectId: 1300, by: "sender" });
    expect(matchProject(mail({ subject: "hello", senders: ["shared@x.com"] }), projects, threads)).toBeNull();
    expect(matchProject(mail({ subject: "hello", senders: ["nobody@x.com"] }), projects, threads)).toBeNull();
  });
});

describe("Gmail payloads", () => {
  const msg: GmailMessage = {
    id: "m1",
    threadId: "t1",
    internalDate: "1792591200000", // 2026-10-21 14:00 UTC
    snippet: "Hi there",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Jessica Villegas <jessica@tsav.net>" },
        { name: "To", value: "tsavcrm@gmail.com" },
        { name: "Subject", value: "Fwd: Villa Serena – RFI doors" },
      ],
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64("See below.\r\n\r\nFrom: Client <client@x.com>\r\nWhich doors?") } },
            { mimeType: "text/html", body: { data: b64("<p>See below.</p>") } },
          ],
        },
        { mimeType: "application/pdf", filename: "plan.pdf", body: { attachmentId: "att-1", size: 1234 } },
        { mimeType: "image/png", body: { attachmentId: "att-inline", size: 10 } },
      ],
    },
  };

  it("prefers the plain text, lists the named attachments, finds the inner sender", () => {
    const p = parseMessage(msg);
    expect(p.from).toEqual({ name: "Jessica Villegas", email: "jessica@tsav.net" });
    expect(p.subject).toBe("Fwd: Villa Serena – RFI doors");
    expect(p.cleanSubject).toBe("Villa Serena – RFI doors");
    expect(p.text).toBe("See below.\n\nFrom: Client <client@x.com>\nWhich doors?");
    expect(p.innerSenders).toEqual(["client@x.com"]);
    expect(p.attachments).toEqual([{ name: "plan.pdf", mime: "application/pdf", size: 1234, attachment_id: "att-1" }]);
    expect(p.receivedAt).toBe("2026-10-21T14:00:00.000Z");
    expect(attachmentsOf(undefined)).toEqual([]);
  });

  it("falls back to the HTML made readable", () => {
    expect(bodyText({ mimeType: "text/html", body: { data: b64("<div>Hello<br>there &amp; <b>you</b></div><p>Bye</p>") } })).toBe("Hello\nthere & you\nBye");
    expect(htmlToText("<style>p{}</style><p>a</p>\n\n\n<p>b</p>")).toBe("a\n\nb");
  });

  it("names the OneDrive folder with the Eastern date and a safe subject", () => {
    expect(emailFolderName("2026-10-21T14:00:00.000Z", "Fwd: Villa Serena: RFI / doors?")).toBe("2026-10-21 Villa Serena- RFI - doors-");
  });
});
