import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { DURATIONS } from "@/registry/tables/visits";

// F15 Google Calendar (SPEC §9.1 F15-b): the pure part of the import and sync. Given an event as
// Google sends it and the CRM's catalogue (projects, employees, vehicles, the colour → technician
// map), decide which project the event is about, who went, in which van, and turn it into visit
// values — or turn a visit into the event the CRM writes back. No I/O here; tests/f15-google-calendar.test.ts.

export type GDate = { date?: string; dateTime?: string; timeZone?: string };
export type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: GDate;
  end?: GDate;
  updated?: string;
  etag?: string;
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export type CatProject = { id: number; title: string; street: string | null; city: string | null; zip: string | null; unit: string | null; owner: string | null; createdAt: string | null };
export type CatEmployee = { id: number; name: string };
export type CatVehicle = { id: number; tag: string | null };
export type Catalog = {
  projects: CatProject[];
  employees: CatEmployee[];
  vehicles: CatVehicle[];
  /** Google colourId → employee id, when nobody is named. */
  colorMap: Record<string, number>;
  /** Name as written at the start of the titles (lower case, e.g. "jp", "uli", "roberto") → employee id. */
  nameMap: Record<string, number>;
};

export type Candidate = { id: number; score: number };
export type Match = {
  projectId: number | null;
  confidence: "high" | "medium" | "none";
  candidates: Candidate[];
  technicianId: number | null;
  teamIds: number[];
  vehicleId: number | null;
  /** Plain words on how the decision was made (kept in calendar_events.match_detail). */
  how: string[];
};

/** Google's event colours (colorId 1–11) with their names and hex, for the Admin legend. */
export const GOOGLE_COLORS: { id: string; name: string; hex: string }[] = [
  { id: "1", name: "Lavender", hex: "#7986cb" },
  { id: "2", name: "Sage", hex: "#33b679" },
  { id: "3", name: "Grape", hex: "#8e24aa" },
  { id: "4", name: "Flamingo", hex: "#e67c73" },
  { id: "5", name: "Banana", hex: "#f6bf26" },
  { id: "6", name: "Tangerine", hex: "#f4511e" },
  { id: "7", name: "Peacock", hex: "#039be5" },
  { id: "8", name: "Graphite", hex: "#616161" },
  { id: "9", name: "Blueberry", hex: "#3f51b5" },
  { id: "10", name: "Basil", hex: "#0b8043" },
  { id: "11", name: "Tomato", hex: "#d50000" },
];

// ---------------------------------------------------------------- text helpers

/** Lower-case, no accents, letters and digits only, single spaces. */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words that say nothing about which job it is. */
const STOP = new Set(
  (
    "the and of at in on to for a an with de da do dos das e mr mrs ms dr res residence house home apt apartment unit visit install installation service job project client casa visita " +
    "tv av llc inc st street ave avenue rd road drive blvd ct court ln lane way pl place ter terrace cir circle hwy fl usa"
  ).split(" "),
);

export const tokens = (s: string | null | undefined): string[] => norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));

/** Google descriptions may carry HTML. */
export const stripHtml = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const hasWord = (text: string, word: string) => word.length > 0 && new RegExp(`(^| )${word}( |$)`).test(text);
const hasPhrase = (text: string, phrase: string) => phrase.length > 0 && (` ${text} `).includes(` ${phrase} `);

// ---------------------------------------------------------------- the calendar's convention
// Titles read "Technician - Client - Place" (Fred 2026-10-03): the first segment is who went.

/** The title split on its dashes: ["Carlos", "Auriemo", "Fendi # 1101"]. */
export const splitTitle = (summary: string | null | undefined) =>
  (summary ?? "")
    .split(/\s+[-–—]\s+|\s*[-–—]\s+|\s+[-–—]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

/** The first segment, normalised ("jp", "uli", "roberto"). */
export const leadName = (summary: string | null | undefined) => norm(splitTitle(summary)[0] ?? "");

/** Everything after the technician's name. */
export const restOfTitle = (summary: string | null | undefined) => splitTitle(summary).slice(1).join(" - ");

/** Titles that mean a day at the warehouse, a day off, a payday or a birthday: not a visit. */
const NOT_A_JOB = new Set(["warehouse", "wh", "off", "day off", "folga", "ferias", "vacation", "vacations", "brasil", "brazil", "payday", "pay day", "sick", "doente", "feriado", "holiday", "medico", "doctor", "dentista", "dentist", "escritorio", "office", "home office"]);
const NOT_A_JOB_WORDS = /\b(aniversario|birthday|payday|niver)\b/;

/** Why an entry is not a job visit, or null when it looks like one. */
export function notAJobReason(summary: string | null | undefined): string | null {
  const t = norm(summary);
  if (!t) return "empty title";
  if (NOT_A_JOB_WORDS.test(t)) return "birthday / payday";
  const segs = splitTitle(summary);
  const rest = norm(segs.slice(1).join(" "));
  if (segs.length >= 2 && NOT_A_JOB.has(rest)) return rest;
  if (segs.length === 1 && NOT_A_JOB.has(t)) return t;
  // "Carlos-OFF", "Roberto off", "Raiane off": a name and the word, with or without a dash.
  const words = t.split(" ");
  if (words.length <= 3 && NOT_A_JOB.has(words.slice(1).join(" "))) return words.slice(1).join(" ");
  return null;
}

/** The unit mentioned in a text ("#903", "Apt 2103", "unit 15A") in a comparable form, or null. */
export function unitOf(text: string | null | undefined): string | null {
  const s = (text ?? "").toLowerCase();
  // "#903", "Apt 2103", "unit 15A"; or a trailing number that is not the first word ("Oceana 706N", never "6070 NBR").
  const m = s.match(/(?:#|\bapt\.?|\bapto\.?|\bunit|\bsuite|\bste\.?|\bph)\s*#?\s*([0-9]{1,5}\s?[a-z]?)\b/) ?? s.match(/(?<!^)(?<=\s)([0-9]{3,5}[a-z]?)\s*(?:n|s)?\s*$/);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
}

/** The technician named at the start of the title, via the names map first, then the employees. */
export function leadTechnician(summary: string | null | undefined, employees: CatEmployee[], nameMap: Record<string, number>): number | null {
  const lead = leadName(summary);
  if (!lead) return null;
  if (nameMap[lead]) return nameMap[lead];
  const firstWord = lead.split(" ")[0];
  if (nameMap[firstWord] && lead.split(" ").length === 1) return nameMap[firstWord];
  const hit = findPeople(lead, employees);
  // Only when the whole segment is that person's name (or a unique first name), not a client's.
  return hit.length === 1 ? hit[0].id : null;
}

// ---------------------------------------------------------------- times

export type EventTimes = { startIso: string; endIso: string; minutes: number; allDay: boolean };

/** Start and end as ISO instants. All-day events become 8:00–16:00 Eastern. */
export function eventTimes(e: GEvent): EventTimes | null {
  const s = e.start ?? {};
  const en = e.end ?? {};
  if (s.date) {
    const startIso = fromDateTimeLocalET(`${s.date}T08:00`);
    return { startIso, endIso: fromDateTimeLocalET(`${s.date}T16:00`), minutes: 480, allDay: true };
  }
  if (!s.dateTime) return null;
  const start = Date.parse(s.dateTime);
  if (Number.isNaN(start)) return null;
  const end = en.dateTime ? Date.parse(en.dateTime) : start + 60 * 60_000;
  const minutes = Math.max(15, Math.round(((Number.isNaN(end) ? start + 3_600_000 : end) - start) / 60_000));
  return { startIso: new Date(start).toISOString(), endIso: new Date(start + minutes * 60_000).toISOString(), minutes, allDay: false };
}

/** The closest "Expected duration" option (30 min … 8 h). */
export function snapDuration(minutes: number): string {
  let best = DURATIONS[0].value;
  let diff = Infinity;
  for (const o of DURATIONS) {
    const d = Math.abs(Number(o.value) - minutes);
    if (d < diff) {
      diff = d;
      best = o.value;
    }
  }
  return best;
}

// ---------------------------------------------------------------- people and vans

type PersonHit = { id: number; at: number };

/** Employees named in the text, in the order they appear. Full names first, then first names that only one person has. */
export function findPeople(text: string, employees: CatEmployee[]): PersonHit[] {
  const t = norm(text);
  const hits: PersonHit[] = [];
  const firstNames = new Map<string, number[]>();
  for (const e of employees) {
    const first = norm(e.name).split(" ")[0];
    if (first) firstNames.set(first, [...(firstNames.get(first) ?? []), e.id]);
  }
  for (const e of employees) {
    const full = norm(e.name);
    const parts = full.split(" ").filter(Boolean);
    let at = -1;
    if (parts.length > 1 && hasPhrase(t, full)) at = (` ${t} `).indexOf(` ${full} `);
    else if (parts.length > 1 && hasPhrase(t, `${parts[0]} ${parts[parts.length - 1]}`)) at = (` ${t} `).indexOf(` ${parts[0]} ${parts[parts.length - 1]} `);
    else if (parts[0] && parts[0].length > 2 && (firstNames.get(parts[0])?.length ?? 0) === 1 && hasWord(t, parts[0])) at = (` ${t} `).indexOf(` ${parts[0]} `);
    if (at >= 0) hits.push({ id: e.id, at });
  }
  return hits.sort((a, b) => a.at - b.at);
}

/** The van whose tag number appears in the text (with or without spaces). */
export function findVehicle(text: string, vehicles: CatVehicle[]): number | null {
  const t = norm(text);
  const squeezed = t.replace(/ /g, "");
  for (const v of vehicles) {
    const tag = norm(v.tag).replace(/ /g, "");
    if (tag.length < 4) continue;
    if (hasWord(t, tag) || (tag.length >= 6 && squeezed.includes(tag))) return v.id;
  }
  return null;
}

// ---------------------------------------------------------------- projects

/** How telling a word is: rare across the projects → 1, common → little. */
function weights(projects: CatProject[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const p of projects) for (const w of new Set([...tokens(p.title), ...tokens(p.owner)])) count.set(w, (count.get(w) ?? 0) + 1);
  const out = new Map<string, number>();
  for (const [w, n] of count) out.set(w, n <= 2 ? 1 : n <= 6 ? 0.6 : n <= 15 ? 0.3 : 0.1);
  return out;
}

const streetNumber = (s: string | null | undefined) => norm(s).match(/(^| )(\d{1,6})( |$)/)?.[2] ?? null;

export type ProjectScore = Candidate & { why: string[] };

/**
 * Score every project against the event text; highest first. `exclude` is text that must not count
 * (the technician's name at the start of the title).
 */
export function scoreProjects(e: GEvent, projects: CatProject[], exclude: string[] = []): ProjectScore[] {
  const w = weights(projects);
  const rest = restOfTitle(e.summary) || (exclude.length ? "" : (e.summary ?? ""));
  const summary = norm(rest);
  const skip = new Set(exclude.flatMap((x) => tokens(x)));
  const desc = stripHtml(e.description).slice(0, 300);
  const text = `${summary} ${norm(e.location)} ${norm(desc)}`;
  const eventTokens = new Set(tokens(text).filter((x) => !skip.has(x)));
  const evNumber = streetNumber(e.location) ?? streetNumber(rest);
  const evUnit = unitOf(rest) ?? unitOf(e.location);

  const out: ProjectScore[] = [];
  for (const p of projects) {
    const why: string[] = [];
    let score = 0;
    const title = norm(p.title);
    if (title && title.length >= 4 && hasPhrase(summary, title)) {
      score += 90;
      why.push("title in event");
    } else {
      const pt = [...new Set(tokens(p.title))];
      let total = 0;
      let got = 0;
      let hits = 0;
      for (const x of pt) {
        const ww = w.get(x) ?? 1;
        total += ww;
        if (eventTokens.has(x)) {
          got += ww;
          hits++;
        }
      }
      if (hits && total) {
        const cover = got / total;
        const s = Math.round(70 * cover * (hits === 1 && got < 1 ? 0.5 : 1));
        if (s) {
          score += s;
          why.push(`${hits}/${pt.length} title words`);
        }
      }
      const ot = [...new Set(tokens(p.owner))].filter((x) => !pt.includes(x));
      const ownerHits = ot.filter((x) => eventTokens.has(x) && (w.get(x) ?? 1) >= 0.3);
      if (ownerHits.length) {
        score += Math.min(40, 20 * ownerHits.length);
        why.push("owner's name");
      }
    }
    // Address: the street number is the strongest clue, a street word confirms it.
    const pn = streetNumber(p.street);
    if (evNumber && pn && evNumber === pn) {
      score += 45;
      why.push("street number");
      const streetWords = tokens(p.street).filter((x) => !/^\d+$/.test(x));
      if (streetWords.some((x) => eventTokens.has(x))) {
        score += 20;
        why.push("street name");
      }
    }
    if (p.zip && norm(e.location).includes(norm(p.zip)) && pn && evNumber === pn) score += 5;
    // Units: many projects share a building's address, so the unit decides between them.
    if (score && evUnit) {
      const pu = p.unit ? unitOf(`#${p.unit}`) : unitOf(p.title);
      if (pu && pu === evUnit) {
        score += 30;
        why.push("same unit");
      } else if (pu) {
        score -= 60;
        why.push("other unit");
      } else score -= 10;
    }
    if (score > 0) out.push({ id: p.id, score, why });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The whole decision for one event. */
export function matchEvent(e: GEvent, cat: Catalog): Match {
  const how: string[] = [];
  const text = `${e.summary ?? ""}\n${stripHtml(e.description).slice(0, 300)}`;
  // A title without dashes names nobody ("Ocean Tower lobby speakers"): the colour alone decides.
  const segs = splitTitle(e.summary);
  const lead = segs.length >= 2 ? segs[0] : "";
  let technicianId: number | null = lead ? leadTechnician(e.summary, cat.employees, cat.nameMap) : null;
  // Other names in the title are the client's, never "also going" (two technicians = two entries in this calendar).
  const teamIds: number[] = [];
  if (technicianId) how.push("technician named");
  else if (e.colorId && cat.colorMap[e.colorId]) {
    // The colour decides only when it agrees with the name: "Roberto" in Pizini's colour is Pizini,
    // "Roberto" in Carlos's colour is nobody (Fred 2026-10-04: two Robertos told apart by colour).
    const byColor = cat.colorMap[e.colorId];
    const first = norm(cat.employees.find((x) => x.id === byColor)?.name).split(" ")[0];
    const leadFirst = norm(lead).split(" ")[0];
    if (!leadFirst || (first && leadFirst === first)) {
      technicianId = byColor;
      how.push("technician from colour");
    } else how.push("name and colour disagree");
  }
  const vehicleId = findVehicle(text, cat.vehicles);
  if (vehicleId) how.push("vehicle tag");

  const scores = scoreProjects(e, cat.projects, lead ? [lead] : []);
  const best = scores[0];
  const second = scores[1];
  let projectId: number | null = null;
  let confidence: Match["confidence"] = "none";
  if (best && (best.score >= 85 || (best.score >= 60 && best.score - (second?.score ?? 0) >= 20))) {
    projectId = best.id;
    confidence = "high";
    how.push(`project: ${best.why.join(", ")}`);
  } else if (best && best.score >= 40) {
    confidence = "medium";
    how.push("project uncertain");
  } else how.push("no project found");
  return { projectId, confidence, candidates: scores.slice(0, 5).map(({ id, score }) => ({ id, score })), technicianId, teamIds, vehicleId, how };
}

// ---------------------------------------------------------------- event → visit

export type VisitValues = {
  title: string | null;
  project_id: number | null;
  starts_at: string;
  duration: string;
  arrival_window: string;
  technician_id: number | null;
  vehicle_id: number | null;
  instructions: string | null;
  status: "Scheduled" | "Done" | "Cancelled";
  google_event_id: string;
  google_etag: string | null;
};

/** The visit an event becomes. The title is only filled when there is no project (the CRM builds the rest). */
export function eventToVisit(e: GEvent, m: Match, now: number = Date.now()): VisitValues | null {
  const t = eventTimes(e);
  if (!t) return null;
  const endMs = Date.parse(t.endIso);
  const status: VisitValues["status"] = e.status === "cancelled" ? "Cancelled" : endMs < now ? "Done" : "Scheduled";
  const instructions = stripHtml(e.description).slice(0, 2000) || null;
  return {
    title: m.projectId ? null : (e.summary ?? "").trim().slice(0, 200) || "Calendar event",
    project_id: m.projectId,
    starts_at: t.startIso,
    duration: snapDuration(t.minutes),
    arrival_window: "0",
    technician_id: m.technicianId,
    vehicle_id: m.vehicleId,
    instructions,
    status,
    google_event_id: e.id,
    google_etag: e.etag ?? null,
  };
}

// ---------------------------------------------------------------- visit → event

export type VisitForEvent = {
  id: number;
  projectTitle: string | null;
  address: string | null;
  startsAt: string;
  duration: number;
  arrivalWindow: number;
  technicianName: string | null;
  technicianId: number | null;
  teamNames: string[];
  vehicleTag: string | null;
  serviceType: string | null;
  instructions: string | null;
  accessNotes: string | null;
  status: string | null;
  link: string | null;
};

export type EventBody = {
  summary: string;
  location?: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId?: string;
  extendedProperties: { private: Record<string, string> };
};

const WINDOW: Record<number, string> = { 0: "exact time", 30: "within 30 min", 60: "within 1 h", 120: "within 2 h" };

/** The Google event for a visit, in the calendar's own convention: "Project – Technician". */
export function visitToEvent(v: VisitForEvent, colorMap: Record<string, number>): EventBody {
  const summary = [v.projectTitle ?? "Visit", v.technicianName].filter(Boolean).join(" – ") + (v.status === "Cancelled" ? " (cancelled)" : "");
  const lines: string[] = [];
  if (v.serviceType) lines.push(`Service: ${v.serviceType}`);
  if (v.vehicleTag) lines.push(`Vehicle: ${v.vehicleTag}`);
  if (v.teamNames.length) lines.push(`Also going: ${v.teamNames.join(", ")}`);
  lines.push(`Arrival: ${WINDOW[v.arrivalWindow] ?? "exact time"}`);
  if (v.instructions) lines.push("", v.instructions);
  if (v.accessNotes) lines.push("", `Parking and access: ${v.accessNotes}`);
  if (v.link) lines.push("", `CRM: ${v.link}`);
  const start = toDateTimeLocalET(v.startsAt);
  const endMs = Date.parse(v.startsAt) + Math.max(15, v.duration) * 60_000;
  const end = toDateTimeLocalET(new Date(endMs).toISOString());
  const colorId = v.technicianId ? Object.entries(colorMap).find(([, emp]) => emp === v.technicianId)?.[0] : undefined;
  return {
    summary,
    ...(v.address ? { location: v.address } : {}),
    description: lines.join("\n"),
    start: { dateTime: `${start}:00`, timeZone: "America/New_York" },
    end: { dateTime: `${end}:00`, timeZone: "America/New_York" },
    ...(colorId ? { colorId } : {}),
    extendedProperties: { private: { crm_visit_id: String(v.id) } },
  };
}

// ---------------------------------------------------------------- colours

/** From (colour, technician named) pairs seen in the calendar: the technician each colour stands for, when clear. */
export function suggestColorMap(pairs: { colorId: string; technicianId: number }[], existing: Record<string, number> = {}): Record<string, number> {
  const byColor = new Map<string, Map<number, number>>();
  for (const p of pairs) {
    const m = byColor.get(p.colorId) ?? new Map<number, number>();
    m.set(p.technicianId, (m.get(p.technicianId) ?? 0) + 1);
    byColor.set(p.colorId, m);
  }
  const out = { ...existing };
  for (const [color, m] of byColor) {
    if (out[color]) continue;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [top, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total >= 3 && n / total >= 0.6) out[color] = top;
  }
  return out;
}

export type NameStat = { name: string; count: number };

/** How often each name opens a title ("carlos", "jp", "uli"…), most frequent first. */
export function nameStats(summaries: (string | null | undefined)[], limit = 40): NameStat[] {
  const count = new Map<string, number>();
  for (const s of summaries) {
    const lead = leadName(s);
    if (!lead || lead.length < 2 || /^\d/.test(lead) || splitTitle(s).length < 2) continue;
    count.set(lead, (count.get(lead) ?? 0) + 1);
  }
  return [...count]
    .map(([name, n]) => ({ name, count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Names → employees where the name is clearly one person's (full name, or a first name only one employee has). */
export function suggestNameMap(stats: NameStat[], employees: CatEmployee[], existing: Record<string, number> = {}): Record<string, number> {
  const out = { ...existing };
  for (const s of stats) {
    if (out[s.name]) continue;
    const hit = findPeople(s.name, employees);
    if (hit.length === 1 && norm(employees.find((e) => e.id === hit[0].id)?.name).split(" ").length >= 1) out[s.name] = hit[0].id;
  }
  return out;
}
