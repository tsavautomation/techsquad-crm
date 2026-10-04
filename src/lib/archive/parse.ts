// F16 Report archive (SPEC §9.1 F16): the pure part of reading the old reports in OneDrive
// (PROJECTS TS / <designer or GC> / <client folder> / "…Reports" / files). Folder and file names
// follow Fred's convention: "2020-03-20 - Continuum 3707_Service Call_Roberto_Rodolfo.pdf".
// No I/O here; tests/f16-report-archive.test.ts.

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2005 && y <= 2035 ? `${y}-${pad(m)}-${pad(d)}` : null);

/** A date at the start of a name: "2020-03-20", "05-17-2024", "10-07-25", "May 24th, 2018", "3/20/2020". */
export function leadingDate(s: string): { date: string | null; rest: string } {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-._](\d{1,2})[-._](\d{1,2})(.*)$/);
  if (m) return { date: iso(+m[1], +m[2], +m[3]), rest: m[4] };
  m = t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(.*)$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { date: iso(y, +m[1], +m[2]), rest: m[4] };
  }
  m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(.*)$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return { date: mon ? iso(+m[3], mon, +m[2]) : null, rest: m[4] };
  }
  return { date: null, rest: t };
}

/** Any date inside a text ("Date 03/20/2020", "March 2nd, 2018", "2023-05-01"), the first one found. */
export function anyDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return iso(+m[3], +m[1], +m[2]);
  const i = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (i) return iso(+i[1], +i[2], +i[3]);
  const w = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (w) {
    const mon = MONTHS[w[1].slice(0, 3).toLowerCase()];
    if (mon) return iso(+w[3], mon, +w[2]);
  }
  return null;
}

/** The kinds of visit the file names carry; the first word group found wins. */
const VISIT_TYPES = ["service call", "survey report", "survey", "pre wiring", "prewiring", "pre-wiring", "pre wire", "prewire", "rough in", "rough-in", "trim out", "trim-out", "installation", "install", "programming", "delivery", "pick up", "pickup", "meeting", "maintenance", "warranty", "inspection", "final", "walk through", "walkthrough", "training", "troubleshooting", "estimate", "proposal", "job report", "report"];

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export type ParsedName = {
  date: string | null;
  /** The job as written in the name ("Continuum 3707"). */
  job: string | null;
  visitType: string | null;
  /** First names as written, in order, without repeats. */
  technicians: string[];
  /** "(1)", "_a": another file of the same visit. */
  variant: string | null;
  ext: string;
};

/** "2020-03-20 - Continuum 3707_Service Call_Roberto_Rodolfo.pdf" → its parts. */
export function parseFileName(fileName: string): ParsedName {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  let base = fileName.replace(/\.[a-z0-9]+$/i, "").trim();
  let variant: string | null = null;
  const v = base.match(/\s*\((\d+)\)$/);
  if (v) {
    variant = `(${v[1]})`;
    base = base.slice(0, v.index).trim();
  }
  const { date, rest } = leadingDate(base);
  let body = rest.replace(/^\s*[-–—]?\s*/, "").trim();
  const letter = body.match(/_([a-z])$/);
  if (letter) {
    variant = variant ?? `_${letter[1]}`;
    body = body.slice(0, letter.index);
  }
  const segs = body.split("_").map((s) => s.trim()).filter(Boolean);
  const typeAt = segs.findIndex((s) => VISIT_TYPES.includes(s.toLowerCase()));
  let job: string | null;
  let visitType: string | null = null;
  let names: string[];
  if (typeAt >= 0) {
    job = segs.slice(0, typeAt).join(" ") || null;
    visitType = titleCase(segs[typeAt].toLowerCase());
    names = segs.slice(typeAt + 1);
  } else {
    job = segs[0] ?? null;
    names = segs.slice(1);
  }
  const technicians = [...new Set(names.filter((n) => /^[A-Za-zÀ-ÿ]{2,20}$/.test(n)).map((n) => titleCase(n.toLowerCase())))];
  return { date, job, visitType, technicians, variant, ext };
}

export type ParsedFolder = {
  raw: string;
  /** "Melissa Silver" from "SILVER, MELISSA", or the business / house name as written. */
  client: string;
  /** "Continuum # 3707" → the place part after the first dash, if any. */
  place: string | null;
  unit: string | null;
  /** A trailing project number ("- 00195"). */
  number: string | null;
};

/** "SILVER, MELISSA - CONTINUUM # 3707" / "MANTEL, VALERIA - WESTON - 00195" / "2520 SHELTER AVE". */
export function parseClientFolder(name: string): ParsedFolder {
  let raw = name.trim();
  let number: string | null = null;
  const n = raw.match(/\s[-–]\s*(\d{4,6})$/);
  if (n) {
    number = n[1];
    raw = raw.slice(0, n.index).trim();
  }
  const parts = raw.split(/\s[-–]\s/).map((s) => s.trim()).filter(Boolean);
  const first = parts[0] ?? raw;
  const nm = first.match(/^([^,]+),\s*(.+)$/);
  const client = titleCase((nm ? `${nm[2]} ${nm[1]}` : first).toLowerCase());
  const place = parts.length > 1 ? titleCase(parts.slice(1).join(" - ").toLowerCase()) : null;
  const unitSrc = `${place ?? ""} ${first}`;
  const u = unitSrc.match(/#\s*([0-9]{1,5}\s?[A-Za-z]?)\b/) ?? unitSrc.match(/\b(?:apt|unit|ph)\.?\s*#?\s*([0-9]{1,5}[A-Za-z]?)\b/i);
  return { raw: name.trim(), client, place, unit: u ? u[1].replace(/\s+/g, "").toUpperCase() : null, number };
}

// ---------------------------------------------------------------- the two form layouts

export type ParsedReport = {
  /** How the text was read: the two known forms, or free text. */
  layout: "123formbuilder" | "jotform" | "free";
  client: string | null;
  date: string | null;
  checkIn: string | null;
  checkOut: string | null;
  technicians: string[];
  report: string;
  payments: string | null;
  entryId: string | null;
};

const clock = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[:.h](\d{2})\s*(am|pm|AM|PM)?/);
  if (!m) return null;
  let h = +m[1];
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  // Forms without am/pm: nobody checks in or out at 4:00 in the morning.
  if (!ap && h < 6) h += 12;
  return `${pad(h)}:${m[2]}`;
};

/** Text between one label and the next, over a list of labels, in the order the text has them. */
function sections(text: string, labels: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const found = labels
    .map((l) => ({ l, m: text.match(new RegExp(`(^|\\n)\\s*${escape(l)}\\s*:?\\s*`, "i")) }))
    .filter((x): x is { l: string; m: RegExpMatchArray } => Boolean(x.m))
    .map((x) => ({ l: x.l, start: x.m.index! + x.m[0].length, head: x.m.index! }))
    .sort((a, b) => a.head - b.head || b.start - a.start);
  // Two labels at the same place ("Service performed" inside "Service performed / annotations"): the longer one wins.
  const hits = found.filter((h, i) => i === 0 || h.head !== found[i - 1].head);
  for (let i = 0; i < hits.length; i++) {
    const value = text.slice(hits[i].start, i + 1 < hits.length ? hits[i + 1].head : undefined).trim();
    for (const h of found) if (h.head === hits[i].head) out.set(h.l.toLowerCase(), value);
  }
  return out;
}

/** The 123FormBuilder e-mail table: "Client Name … Date … Check-in … Team-Roberto yes … Service performed / annotations …". */
export function parse123Form(text: string): ParsedReport | null {
  if (!/client name/i.test(text) || !/service performed/i.test(text)) return null;
  const labels = ["Client Name", "Address", "Date", "Check-in", "Check-out", "Service performed / annotations", "Service performed", "Pictures", "The message has been sent", "Entry ID"];
  const teamLabels = [...text.matchAll(/Team-([A-Za-zÀ-ÿ]+)\s*:?\s*(yes|no|x)?/gi)];
  const s = sections(text.replace(/Team-[A-Za-zÀ-ÿ]+\s*:?\s*(yes|no|x)?\s*/gi, ""), labels);
  const technicians = teamLabels.filter((m) => !m[2] || /yes|x/i.test(m[2])).map((m) => titleCase(m[1].toLowerCase()));
  return {
    layout: "123formbuilder",
    client: s.get("client name") || null,
    date: anyDate(s.get("date") ?? ""),
    checkIn: clock(s.get("check-in")),
    checkOut: clock(s.get("check-out")),
    technicians: [...new Set(technicians)],
    report: (s.get("service performed / annotations") ?? s.get("service performed") ?? "").trim(),
    payments: null,
    entryId: s.get("entry id")?.match(/\d+/)?.[0] ?? null,
  };
}

/** The JotForm "SERVICE CALL / JOB REPORT" PDF. */
export function parseJotform(text: string): ParsedReport | null {
  if (!/job performed/i.test(text) || !/client\s*\/\s*job name/i.test(text)) return null;
  const labels = ["CLIENT / JOB NAME", "HOUSE NUMBER / UNIT / BUILDING", "DATE", "CHECK-IN", "CHECK-OUT", "TEAM", "JOB PERFORMED", "DID YOU RECEIVE ANY PAYMENTS ?", "DID YOU RECEIVE ANY PAYMENTS", "PICTURES AND VIDEOS", "PICTURES"];
  const s = sections(text, labels);
  const team = (s.get("team") ?? "").split(/[\s,]+/).filter((w) => /^[A-Za-zÀ-ÿ]{2,20}$/.test(w)).map((w) => titleCase(w.toLowerCase()));
  const report = (s.get("job performed") ?? "").replace(/\n\s*\d+\s*$/g, "").trim();
  return {
    layout: "jotform",
    client: [s.get("client / job name"), s.get("house number / unit / building")].filter(Boolean).join(" ") || null,
    date: anyDate(s.get("date") ?? ""),
    checkIn: clock(s.get("check-in")),
    checkOut: clock(s.get("check-out")),
    technicians: [...new Set(team)],
    report,
    payments: (s.get("did you receive any payments ?") ?? s.get("did you receive any payments") ?? "").split("\n")[0].trim() || null,
    entryId: null,
  };
}

// ---------------------------------------------------------------- credentials

const SECRET_LINE = /\b(senha|password|passw|pwd|pass|login|user ?name|usuario|usuário|wi-?fi|rede|ssid|network|pin|code|código|codigo|ip|gateway|admin)\b|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i;

/** Lines that look like credentials go to the sensitive field; the rest stays in the report. */
export function splitCredentials(text: string): { report: string; credentials: string | null } {
  const keep: string[] = [];
  const secret: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t && SECRET_LINE.test(t) && t.length <= 120) secret.push(t);
    else keep.push(line);
  }
  return { report: keep.join("\n").replace(/\n{3,}/g, "\n\n").trim(), credentials: secret.length ? secret.join("\n") : null };
}

/** Minutes between two "HH:MM" clocks, or null. */
export function minutesBetween(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const [a, b] = [checkIn, checkOut].map((c) => +c.slice(0, 2) * 60 + +c.slice(3, 5));
  const d = b - a;
  return d >= 15 && d <= 16 * 60 ? d : null;
}
