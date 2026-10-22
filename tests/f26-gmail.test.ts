import { describe, expect, it } from "vitest";
import { addressKey, attachmentsOf, cleanSubject, emailFolderName, htmlToText, innerSenders, isSystemMail, matchProject, parseAddress, parseAddressList, parseMessage, projectIdInSubject, projectLabel, subjectDiscipline } from "@/lib/mail/engine";

// F26-2 Gmail intake (SPEC §9.1 F26-a): reading a parsed email and matching it to a project.

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

  it("knows Google's own notices from the mailbox", () => {
    expect(isSystemMail("no-reply@accounts.google.com")).toBe(true);
    expect(isSystemMail("no-reply@google.com")).toBe(true);
    expect(isSystemMail("jessica@tsav.net")).toBe(false);
    expect(isSystemMail("noreply@client-google.com")).toBe(false);
  });

  it("finds the original senders in a forwarded body", () => {
    const text = "Hi, see below.\n\n---------- Forwarded message ---------\nFrom: Client One <client@gmail.com>\nDate: Tue\nSubject: x\n\n> From: Other <other@x.com>\n";
    expect(innerSenders(text)).toEqual(["client@gmail.com", "other@x.com"]);
    expect(innerSenders("**De:** Maria <maria@x.com>")).toEqual(["maria@x.com"]);
  });
});

describe("matching an email to a project", () => {
  const projects = [
    { id: 1249, title: "O'Reilly - Miami", emails: ["oreilly@gmail.com"], ownerType: "End Customer", ownerLastName: "O'Reilly" },
    { id: 1300, title: "Villa Serena", emails: ["serena@x.com", "shared@x.com"], ownerType: "End Customer", ownerLastName: "Serena" },
    { id: 1301, title: "Villa Serena Phase 2", emails: ["shared@x.com"], ownerType: "End Customer", ownerLastName: "Serena" },
    { id: 1302, title: "Rua", emails: [] },
    { id: 1054, title: "Miguel Circelli - Coral Gables", emails: ["miguel@naviconus.com"], ownerType: "Developer Builder", ownerLastName: "Circelli" },
    { id: 1278, title: "Roth, Michael - Miami Shores", emails: [], ownerType: "End Customer", ownerLastName: "Roth" },
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

  it("LV or EL in the subject picks between a client's low-voltage and electrical projects (Fred 2026-10-21)", () => {
    const womack = [
      { id: 1260, title: "Womack, Chloe - Miami Beach (Lv)", emails: ["chloecromarty@gmail.com"], category: "Low Voltage", ownerType: "End Customer", ownerLastName: "Womack" },
      { id: 1265, title: "Womack, Chloe - Miami Beach (Elec)", emails: ["chloecromarty@gmail.com"], category: "Electrical", ownerType: "End Customer", ownerLastName: "Womack" },
    ];
    const none = new Map<string, number>();
    expect(subjectDiscipline("Fwd: LV - Womack Residence - window treatments")).toBe("Low Voltage");
    expect(subjectDiscipline("EL: panel schedule")).toBe("Electrical");
    expect(subjectDiscipline("Low voltage and electrical walk")).toBeNull();
    expect(subjectDiscipline("Elevator keys")).toBeNull(); // "el" only as a whole word
    expect(matchProject(mail({ subject: "Fwd: LV - Womack Residence", senders: ["fred@techsquadfl.com", "chloecromarty@gmail.com"] }), womack, none)).toEqual({ projectId: 1260, by: "surname" });
    expect(matchProject(mail({ subject: "Fwd: LV - details", senders: ["chloecromarty@gmail.com"] }), womack, none)).toEqual({ projectId: 1260, by: "sender" });
    expect(matchProject(mail({ subject: "Fwd: Womack Residence EL", senders: ["chloecromarty@gmail.com"] }), womack, none)).toEqual({ projectId: 1265, by: "surname" });
    expect(matchProject(mail({ subject: "Fwd: Womack Residence", senders: ["chloecromarty@gmail.com"] }), womack, none)).toBeNull();
    // The same word settles two projects with the same name in the subject.
    const twins = [
      { id: 1, title: "Palm House", emails: [], category: "Low Voltage" },
      { id: 2, title: "Palm House", emails: [], category: "Electrical" },
    ];
    expect(matchProject(mail({ subject: "Palm House LV doors" }), twins, none)).toEqual({ projectId: 1, by: "subject" });
    expect(matchProject(mail({ subject: "Palm House doors" }), twins, none)).toBeNull();
  });

  it("the job's street address in the subject finds the project (441 Rivo Alto, 2026-10-22)", () => {
    expect(addressKey("441 E Rivo Alto Dr")).toBe("441 rivo alto");
    expect(addressKey("226 W Rivo Alto Dr")).toBe("226 rivo alto");
    expect(addressKey("1666 John F Kennedy Cswy")).toBe("1666 john f kennedy");
    expect(addressKey("Villa Serena")).toBeNull();
    expect(addressKey("")).toBeNull();
    const rivo = [
      { id: 1198, title: "441 E Rivo Alto Dr", emails: [], ownerType: "End Customer", ownerLastName: "Dyke", street: "441 E Rivo Alto Dr", category: "Low Voltage" },
      { id: 1014, title: "Edwin Verdezoto - Rivo Alto", emails: [], ownerType: "End Customer", ownerLastName: "Verdezoto", street: "226 W Rivo Alto Dr", category: "Low Voltage" },
      { id: 1254, title: "Builcore Warehouse", emails: ["dany@builcore.com"], ownerType: "General Contractor", ownerLastName: "Sebaaly", street: "1091 NW 23rd St", category: "Low Voltage" },
    ];
    expect(matchProject(mail({ subject: "441 Rivo Alto - Builcore Meeting Notes from 10-22-26", senders: ["smiliansky@gmail.com"] }), rivo, new Map())).toEqual({ projectId: 1198, by: "address" });
    expect(matchProject(mail({ subject: "Rivo Alto meeting notes" }), rivo, new Map())).toBeNull(); // no number: two projects on that street
    expect(matchProject(mail({ subject: "4410 Rivo Alto" }), rivo, new Map())).toBeNull(); // another number
  });

  it("a partner's address never decides the project (Miguel Circelli writes about many sites), and the end customer's last name does", () => {
    expect(matchProject(mail({ subject: "Fwd: Window Treatment RFP", senders: ["fred@techsquadfl.com", "miguel@naviconus.com"] }), projects, threads)).toBeNull();
    expect(matchProject(mail({ subject: "Roth Residence | Window Treatment RFP", senders: ["miguel@naviconus.com"] }), projects, threads)).toEqual({ projectId: 1278, by: "surname" });
    expect(matchProject(mail({ subject: "Rothschild bank" }), projects, threads)).toBeNull(); // whole word only
    const two = [...projects, { id: 1279, title: "Roth, Anna - Doral", emails: [], ownerType: "End Customer", ownerLastName: "Roth" }];
    expect(matchProject(mail({ subject: "Roth Residence" }), two, threads)).toBeNull(); // two different Roths
  });

  it("then the sender, only when exactly one project has that contact", () => {
    expect(matchProject(mail({ subject: "hello", senders: ["Serena@x.com"] }), projects, threads)).toEqual({ projectId: 1300, by: "sender" });
    expect(matchProject(mail({ subject: "hello", senders: ["shared@x.com"] }), projects, threads)).toBeNull();
    expect(matchProject(mail({ subject: "hello", senders: ["nobody@x.com"] }), projects, threads)).toBeNull();
  });
});

describe("parsed emails", () => {
  const meta = { uid: 42, uidValidity: 7, emailId: "gm-1", threadId: "thr-1" };
  const mail = {
    from: "Jessica Villegas <jessica@tsav.net>",
    to: "tsavcrm@gmail.com",
    subject: "Fwd: Villa Serena – RFI doors",
    date: new Date("2026-10-21T14:00:00Z"),
    messageId: "<abc@mail.gmail.com>",
    text: "See below.\r\n\r\nFrom: Client <client@x.com>\r\nWhich doors?",
    html: "<p>See below.</p>",
    attachments: [
      { filename: "plan.pdf", contentType: "application/pdf", size: 1234 },
      { filename: "image001.png", contentType: "image/png", size: 10, contentId: "<img1>", contentDisposition: "inline" },
      { contentType: "application/octet-stream", size: 5 },
    ],
  };

  it("prefers the plain text, lists the named attachments with their place, finds the inner sender", () => {
    const p = parseMessage(mail, meta);
    expect(p.gmailId).toBe("gm-1");
    expect(p.threadId).toBe("thr-1");
    expect(p.uid).toBe(42);
    expect(p.from).toEqual({ name: "Jessica Villegas", email: "jessica@tsav.net" });
    expect(p.subject).toBe("Fwd: Villa Serena – RFI doors");
    expect(p.cleanSubject).toBe("Villa Serena – RFI doors");
    expect(p.text).toBe("See below.\n\nFrom: Client <client@x.com>\nWhich doors?");
    expect(p.snippet).toBe("See below. From: Client <client@x.com> Which doors?");
    expect(p.innerSenders).toEqual(["client@x.com"]);
    expect(p.attachments).toEqual([{ name: "plan.pdf", mime: "application/pdf", size: 1234, index: 0 }]);
    expect(p.receivedAt).toBe("2026-10-21T14:00:00.000Z");
    expect(attachmentsOf(undefined)).toEqual([]);
  });

  it("falls back to the Message-ID, then the UID, and to the HTML made readable", () => {
    expect(parseMessage({ ...mail, text: "" }, { ...meta, emailId: null }).gmailId).toBe("<abc@mail.gmail.com>");
    expect(parseMessage({ ...mail, messageId: null }, { ...meta, emailId: null }).gmailId).toBe("uid:7:42");
    expect(parseMessage({ ...mail, text: "", html: "<div>Hello<br>there &amp; <b>you</b></div><p>Bye</p>" }, meta).text).toBe("Hello\nthere & you\nBye");
    expect(parseMessage({ subject: null, date: "not a date" }, meta).cleanSubject).toBe("(no subject)");
    expect(htmlToText("<style>p{}</style><p>a</p>\n\n\n<p>b</p>")).toBe("a\n\nb");
  });

  it("names the Gmail label like the OneDrive project folder", () => {
    expect(projectLabel("Womack, Chloe - Miami Beach (Lv)", 1260)).toBe("Projects/Womack, Chloe - Miami Beach (Lv) (1260)");
    expect(projectLabel("A/B: test?", 7)).toBe("Projects/A-B- test- (7)");
    expect(projectLabel(null, 7)).toBe("Projects/Project (7)");
  });

  it("names the OneDrive folder with the Eastern date and a safe subject", () => {
    expect(emailFolderName("2026-10-21T14:00:00.000Z", "Fwd: Villa Serena: RFI / doors?")).toBe("2026-10-21 Villa Serena- RFI - doors-");
  });
});
