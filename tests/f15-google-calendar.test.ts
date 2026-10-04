import { describe, expect, it } from "vitest";
import {
  eventTimes,
  eventToVisit,
  findPeople,
  findVehicle,
  leadTechnician,
  matchEvent,
  nameStats,
  notAJobReason,
  scoreProjects,
  snapDuration,
  splitTitle,
  stripHtml,
  suggestColorMap,
  suggestNameMap,
  unitOf,
  visitToEvent,
  type Catalog,
  type GEvent,
} from "@/lib/google/match";

// F15 Google Calendar: the pure matching and conversion engine (SPEC §9.1 F15-b).
// The calendar's convention: "Technician – Client – Place", one entry per technician.

const cat: Catalog = {
  projects: [
    { id: 1, title: "Gonzalez Residence", street: "1200 Brickell Ave", city: "Miami", zip: "33131", unit: null, owner: "Carlos Gonzalez", createdAt: "2019-03-01T00:00:00Z" },
    { id: 2, title: "Roth Residence", street: "45 Palm Island Dr", city: "Miami Beach", zip: "33139", unit: null, owner: "David Roth", createdAt: "2020-06-01T00:00:00Z" },
    { id: 3, title: "Ocean Tower Lobby", street: "700 Ocean Dr", city: "Miami Beach", zip: "33139", unit: null, owner: "Ocean Tower Condo Assoc", createdAt: "2021-01-01T00:00:00Z" },
    { id: 4, title: "Smith Residence", street: "9 Bay Rd", city: "Miami", zip: "33137", unit: null, owner: "John Smith", createdAt: "2025-09-01T00:00:00Z" },
    { id: 5, title: "Salomone - Jade Signature", street: "16901 Collins Ave", city: "Sunny Isles Beach", zip: "33160", unit: "4705", owner: "Salomone", createdAt: null },
    { id: 6, title: "Belkin - Jade Signature #903", street: "16901 Collins Ave", city: "Sunny Isles Beach", zip: "33160", unit: null, owner: "Belkin", createdAt: null },
  ],
  employees: [
    { id: 10, name: "Lucas Pereira" },
    { id: 11, name: "Saulo Lima" },
    { id: 12, name: "Roberto Souza" },
    { id: 13, name: "Roberto Alves" },
    { id: 14, name: "Joao Paulo Amaral" },
  ],
  vehicles: [
    { id: 20, tag: "ABC 1234" },
    { id: 21, tag: "XYZ9876" },
  ],
  colorMap: { "7": 11 },
  nameMap: { jp: 14, roberto: 12 },
};

const ev = (o: Partial<GEvent>): GEvent => ({ id: "e1", status: "confirmed", start: { dateTime: "2024-05-10T13:00:00-04:00" }, end: { dateTime: "2024-05-10T15:00:00-04:00" }, ...o });

describe("event times", () => {
  it("reads timed events and all-day events", () => {
    const t = eventTimes(ev({}))!;
    expect(t.startIso).toBe("2024-05-10T17:00:00.000Z");
    expect(t.minutes).toBe(120);
    expect(t.allDay).toBe(false);
    const d = eventTimes(ev({ start: { date: "2024-05-10" }, end: { date: "2024-05-11" } }))!;
    expect(d.allDay).toBe(true);
    expect(d.minutes).toBe(480);
    expect(d.startIso).toBe("2024-05-10T12:00:00.000Z"); // 8:00 Eastern (EDT)
    expect(eventTimes({ id: "x" })).toBeNull();
  });

  it("snaps durations to the form's options", () => {
    expect(snapDuration(10)).toBe("30");
    expect(snapDuration(75)).toBe("60");
    expect(snapDuration(100)).toBe("90");
    expect(snapDuration(300)).toBe("240");
    expect(snapDuration(900)).toBe("480");
  });
});

describe("the title convention", () => {
  it("splits on dashes and reads the technician first", () => {
    expect(splitTitle("Carlos - Auriemo - Fendi # 1101")).toEqual(["Carlos", "Auriemo", "Fendi # 1101"]);
    expect(splitTitle("Lucas –  Warehouse")).toEqual(["Lucas", "Warehouse"]);
    expect(leadTechnician("Lucas - Gonzalez Residence", cat.employees, cat.nameMap)).toBe(10);
    expect(leadTechnician("JP - Roth Residence", cat.employees, cat.nameMap)).toBe(14);
    expect(leadTechnician("Roberto - Roth Residence", cat.employees, cat.nameMap)).toBe(12); // the names map decides
    expect(leadTechnician("Uli - Roth Residence", cat.employees, cat.nameMap)).toBeNull();
    // A client's name after the dash is never the technician.
    expect(leadTechnician("Uli - Lucas Pereira", cat.employees, cat.nameMap)).toBeNull();
  });

  it("knows which entries are not jobs", () => {
    expect(notAJobReason("Carlos - Warehouse")).toBe("warehouse");
    expect(notAJobReason("Daniel -  off")).toBe("off");
    expect(notAJobReason("Aniversario do Lucas")).toBe("birthday / payday");
    expect(notAJobReason("Payday")).toBe("birthday / payday");
    expect(notAJobReason("Uli - Brasil")).toBe("brasil");
    expect(notAJobReason("Carlos-OFF")).toBe("off");
    expect(notAJobReason("Raiane off")).toBe("off");
    expect(notAJobReason("Marcelo - Tiffany warehouse")).toBeNull(); // a client's warehouse is a job
    expect(notAJobReason("Carlos - Auriemo - Fendi # 1101")).toBeNull();
    expect(notAJobReason("")).toBe("empty title");
  });

  it("reads unit numbers", () => {
    expect(unitOf("Jade Signature #903")).toBe("903");
    expect(unitOf("Fendi # 1101")).toBe("1101");
    expect(unitOf("Oceana 706N")).toBe("706N");
    expect(unitOf("Apt 2103, 16901 Collins Ave")).toBe("2103");
    expect(unitOf("6070 NBR")).toBeNull(); // a street number, not a unit
    expect(unitOf("Roth Residence")).toBeNull();
  });

  it("counts the names that open titles and maps the clear ones", () => {
    const stats = nameStats(["Carlos - Warehouse", "Carlos - Roth", "Lucas - Roth", "JP - Roth", "Roberto - Roth", "Dentist", "2135 Lake Ave"]);
    expect(stats.map((s) => s.name)).toEqual(["carlos", "lucas", "jp", "roberto"]);
    expect(suggestNameMap(stats, cat.employees, { jp: 14 })).toEqual({ jp: 14, lucas: 10 }); // Carlos: nobody; Roberto: two people
  });
});

describe("people and vans", () => {
  it("finds people by name, in order, including unique first names", () => {
    expect(findPeople("Lucas + Saulo Lima", cat.employees).map((p) => p.id)).toEqual([10, 11]);
  });
  it("needs the last name when two people share a first name", () => {
    expect(findPeople("Roberto", cat.employees)).toEqual([]);
    expect(findPeople("Roberto Alves", cat.employees).map((p) => p.id)).toEqual([13]);
  });
  it("finds the van by tag, with or without the space", () => {
    expect(findVehicle("Lucas - Gonzalez - ABC1234", cat.vehicles)).toBe(20);
    expect(findVehicle("Lucas - Gonzalez - abc 1234", cat.vehicles)).toBe(20);
    expect(findVehicle("Lucas - Gonzalez", cat.vehicles)).toBeNull();
  });
});

describe("project matching", () => {
  it("matches the project named in the title", () => {
    const m = matchEvent(ev({ summary: "Lucas – Gonzalez Residence – ABC1234" }), cat);
    expect(m.projectId).toBe(1);
    expect(m.confidence).toBe("high");
    expect(m.technicianId).toBe(10);
    expect(m.vehicleId).toBe(20);
    expect(m.teamIds).toEqual([]);
  });
  it("matches by address when the title is only the client's name", () => {
    const m = matchEvent(ev({ summary: "Saulo - Carlos", location: "1200 Brickell Ave, Miami, FL 33131" }), cat);
    expect(m.projectId).toBe(1);
    expect(m.technicianId).toBe(11);
  });
  it("uses the colour only when it agrees with the name", () => {
    const two = { ...cat, employees: [...cat.employees, { id: 15, name: "Saulo Pereira" }] }; // "Saulo" alone is now ambiguous
    const m = matchEvent(ev({ summary: "Saulo - Ocean Tower lobby speakers", colorId: "7" }), two);
    expect(m.projectId).toBe(3);
    expect(m.technicianId).toBe(11); // colour 7 = Saulo Lima, and the title says Saulo
    expect(m.how).toContain("technician from colour");
    const other = matchEvent(ev({ summary: "Uli - Ocean Tower lobby speakers", colorId: "7" }), two);
    expect(other.technicianId).toBeNull(); // Uli in Saulo's colour: nobody
    expect(other.how).toContain("name and colour disagree");
    const unnamed = matchEvent(ev({ summary: "Ocean Tower lobby speakers", colorId: "7" }), two);
    expect(unnamed.technicianId).toBe(11);
  });
  it("tells units of the same building apart", () => {
    const loc = "16901 Collins Ave, Sunny Isles Beach, FL 33160";
    expect(matchEvent(ev({ summary: "Lucas - Belkin - Jade Signature #903", location: loc }), cat).projectId).toBe(6);
    expect(matchEvent(ev({ summary: "Lucas - Salomone - Jade Signature #4705", location: loc }), cat).projectId).toBe(5);
    // Another unit in the same building: neither project, even though the address matches both.
    const other = matchEvent(ev({ summary: "Lucas - Jade Signature # 2103", location: loc }), cat);
    expect(other.projectId).toBeNull();
  });
  it("leaves unclear events without a project but with candidates", () => {
    const m = matchEvent(ev({ summary: "Lucas - Residence follow up" }), cat);
    expect(m.projectId).toBeNull();
    expect(["medium", "none"]).toContain(m.confidence);
    const none = matchEvent(ev({ summary: "Dentist" }), cat);
    expect(none.projectId).toBeNull();
    expect(none.confidence).toBe("none");
    expect(none.candidates).toEqual([]);
  });
  it("does not take the technician's name for a project word", () => {
    const scores = scoreProjects(ev({ summary: "Lucas - Smith" }), cat.projects, ["Lucas"]);
    expect(scores[0]?.id).toBe(4);
    expect(scores.find((s) => s.why.includes("owner's name") && s.id !== 4)).toBeUndefined();
  });
});

describe("event → visit", () => {
  it("builds visit values, Done when in the past, titled from Google when there is no project", () => {
    const e = ev({ summary: "Lucas – Gonzalez Residence", description: "Install 2 TVs<br>bring ladder" });
    const v = eventToVisit(e, matchEvent(e, cat), Date.parse("2026-01-01T00:00:00Z"))!;
    expect(v.project_id).toBe(1);
    expect(v.title).toBeNull();
    expect(v.status).toBe("Done");
    expect(v.duration).toBe("120");
    expect(v.arrival_window).toBe("0");
    expect(v.instructions).toBe("Install 2 TVs\nbring ladder");
    expect(v.google_event_id).toBe("e1");
    const future = eventToVisit(ev({ summary: "Mystery job" }), matchEvent(ev({ summary: "Mystery job" }), cat), Date.parse("2024-01-01T00:00:00Z"))!;
    expect(future.status).toBe("Scheduled");
    expect(future.title).toBe("Mystery job");
    const gone = eventToVisit(ev({ summary: "x", status: "cancelled" }), matchEvent(ev({ summary: "x" }), cat))!;
    expect(gone.status).toBe("Cancelled");
  });
  it("strips HTML from descriptions", () => {
    expect(stripHtml("<p>Hello&nbsp;there</p><p>Line &amp; two</p>")).toBe("Hello there\nLine & two");
  });
});

describe("visit → event", () => {
  it("writes the calendar's convention: Project – Technician, address, details and the CRM link", () => {
    const body = visitToEvent(
      {
        id: 55,
        projectTitle: "Roth Residence",
        address: "45 Palm Island Dr, Miami Beach",
        startsAt: "2026-10-06T13:00:00.000Z",
        duration: 90,
        arrivalWindow: 60,
        technicianName: "Saulo Lima",
        technicianId: 11,
        teamNames: ["Lucas Pereira"],
        vehicleTag: "ABC 1234",
        serviceType: "Installation",
        instructions: "Rack in the closet",
        accessNotes: "Gate code 1234",
        status: "Scheduled",
        link: "https://crm.example/schedule/visits/55",
      },
      cat.colorMap,
    );
    expect(body.summary).toBe("Roth Residence – Saulo Lima");
    expect(body.location).toBe("45 Palm Island Dr, Miami Beach");
    expect(body.start).toEqual({ dateTime: "2026-10-06T09:00:00", timeZone: "America/New_York" });
    expect(body.end.dateTime).toBe("2026-10-06T10:30:00");
    expect(body.colorId).toBe("7");
    expect(body.description).toContain("Vehicle: ABC 1234");
    expect(body.description).toContain("Also going: Lucas Pereira");
    expect(body.description).toContain("Arrival: within 1 h");
    expect(body.description).toContain("CRM: https://crm.example/schedule/visits/55");
    expect(body.extendedProperties.private.crm_visit_id).toBe("55");
  });
});

describe("colour suggestions", () => {
  it("maps a colour to the technician it mostly names, and keeps what is already set", () => {
    const pairs = [
      ...Array(5).fill({ colorId: "3", technicianId: 10 }),
      { colorId: "3", technicianId: 11 },
      { colorId: "4", technicianId: 10 },
      { colorId: "4", technicianId: 11 },
      { colorId: "5", technicianId: 12 },
      { colorId: "5", technicianId: 12 },
    ];
    expect(suggestColorMap(pairs, { "7": 11 })).toEqual({ "7": 11, "3": 10 });
  });
});
