// PJ-b Projects and contacts clean-up (Luana via Fred 2026-11-02): the pure rules behind "Possible duplicates",
// the anti-duplication check on save and the name standardisation. No database here; tests/pj-dedupe.test.ts.
//
// Normalisation: a unit is its digits plus an optional letter (1402 = 1402S = "# 1402 S" = "Unit 1402", and the
// letter is ignored when comparing); a place drops punctuation, joins the words and expands the usual street
// words (St Regis = St. Regis = Saint Regis, JadeSignature = Jade Signature, Dr = Drive, Av/Ave = Avenue);
// a person's name is its words sorted ("Abrahao, Marco" = "Marco Abrahao"); e-mails are lower case; phones are
// their last 10 digits.

export type Addr = { street?: string | null; address_2?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null;

export const fold = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const STREET_WORDS: Record<string, string> = { dr: "drive", ave: "avenue", av: "avenue", blvd: "boulevard", rd: "road", ln: "lane", ct: "court", pl: "place", ter: "terrace", hwy: "highway", pkwy: "parkway", cir: "circle", n: "north", s: "south", e: "east", w: "west", ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest" };

/** "St. Regis" → "saintregis"; "2687 Flamingo Dr" → "2687flamingodrive"; "JadeSignature" = "Jade Signature". */
export function normPlace(s: unknown): string {
  const words = fold(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return words.map((w, i) => (w === "st" ? (i === 0 ? "saint" : "street") : (STREET_WORDS[w] ?? w))).join("");
}

/** "#1402S", "# 1402 S", "Unit 1402", "Apt 1402-S" → "1402s"; "1402" → "1402"; nothing → "". */
export function normUnit(s: unknown): string {
  const m = /(\d{1,5})\s*-?\s*([a-z]{0,2})\b/.exec(fold(s).replace(/\b(unit|apt|apartment|ph|penthouse|suite|ste)\b/g, " ").replace(/[#.]/g, " "));
  return m ? `${m[1]}${m[2]}` : "";
}

/** The unit without its letter, for comparing (1402 = 1402S). */
export const unitNumber = (u: string) => u.replace(/[a-z]+$/, "");

/** "Abrahao, Marco" = "Marco Abrahao" → "abrahao marco" (words sorted, one-letter words dropped). */
export function normName(s: unknown): string {
  return fold(s)
    .replace(/[^a-z ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1)
    .sort()
    .join(" ");
}

/** Last 10 digits of a phone, or "". */
export const phoneKey = (s: unknown) => fold(s).replace(/\D/g, "").slice(-10);

/** A project title split as "<person or company> - <place> #<unit>". */
export function splitTitle(title: string | null | undefined): { who: string; place: string; unit: string } {
  const t = title ?? "";
  const [whoRaw, ...rest] = t.split(/\s[-–]\s/);
  const placeRaw = rest.join(" - ");
  const unitSrc = /#/.test(placeRaw) ? placeRaw.slice(placeRaw.indexOf("#")) : /#/.test(whoRaw) ? whoRaw.slice(whoRaw.indexOf("#")) : "";
  return { who: whoRaw.replace(/#.*$/, "").trim(), place: placeRaw.replace(/#.*$/, "").replace(/\(\d+\)/, "").trim(), unit: normUnit(unitSrc) };
}

// ---------------------------------------------------------------- projects

export type ProjectKey = {
  id: number;
  owner: number | null;
  /** Normalised owner name (or the title's person when there is no owner). */
  person: string;
  surname: string;
  /** Every way the place is written: building, street, the title's place. */
  places: string[];
  unit: string;
};

export type ProjectLike = { id: number; title: string | null; job_owner_id: number | null; job_address: Addr; apartment_or_unit: string | null; building_id?: number | null };
export type ContactLike = { id: number; title: string | null; first_name: string | null; last_name: string | null; type?: string | null; email?: string | null; main_phone?: string | null };

export function projectKey(p: ProjectLike, owner: ContactLike | null | undefined, buildingTitle?: string | null): ProjectKey {
  const t = splitTitle(p.title);
  const person = normName(owner ? `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() || owner.title : t.who);
  const surname = fold(owner?.last_name ?? t.who.split(",")[0].split(" ").pop() ?? "").replace(/[^a-z]/g, "");
  const places = [...new Set([buildingTitle, p.job_address?.street, t.place].map(normPlace).filter((x) => x.length > 2))];
  const unit = normUnit(p.apartment_or_unit) || normUnit(p.job_address?.address_2) || t.unit;
  return { id: p.id, owner: p.job_owner_id, person, surname, places, unit };
}

export type ProjectMatch = { strong: boolean; why: string };

/**
 * Strong = the duplicate screen pairs them and the save refuses a new one: same owner at the same place or unit;
 * same building and unit (any owner: it may be a property that changed hands, so the screen says "check");
 * same person and unit. Weak = listed for a look only: same owner elsewhere; same last name at the same place.
 */
export function matchProjects(a: ProjectKey, b: ProjectKey): ProjectMatch | null {
  const unitOk = a.unit && b.unit ? unitNumber(a.unit) === unitNumber(b.unit) : !a.unit && !b.unit;
  const placeOk = a.places.some((x) => b.places.some((y) => x === y || (x.length > 5 && y.length > 5 && (x.includes(y) || y.includes(x)))));
  const personOk = Boolean(a.person && b.person) && a.person === b.person;
  const surnameOk = a.surname.length > 2 && a.surname === b.surname;
  if (a.owner && a.owner === b.owner && (unitOk || placeOk)) return { strong: true, why: "Same owner, same place" };
  if (placeOk && unitOk && a.unit) return { strong: true, why: personOk || surnameOk ? "Same person, same building and unit" : "Same building and unit, different owner (check: the property may have changed hands)" };
  if (personOk && unitOk && a.unit) return { strong: true, why: "Same person, same unit" };
  if (a.owner && a.owner === b.owner) return { strong: false, why: "Same owner, another address" };
  if (surnameOk && placeOk) return { strong: false, why: "Same last name, same place, another unit or owner" };
  return null;
}

/** The pair key (smaller id first) used by project_not_duplicates. */
export const pairKey = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

// ---------------------------------------------------------------- contacts

const SMALL = new Set(["de", "da", "do", "das", "dos", "di", "del", "della", "van", "von", "der", "la", "le", "y", "e"]);

/** "MARCO ABRAHAO" → "Marco Abrahao"; "O'REILLY" → "O'Reilly"; "DE LA CRUZ" → "de la Cruz" (first word kept capitalised). */
export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && SMALL.has(lw)) return lw;
      return lw.replace(/(^|['’-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
    })
    .join(" ");
}

/** Levenshtein distance, for "Gusttavo" / "Gustavo" (1), "Joakin" / "Joakim" (1). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export type ContactMatch = { level: "block" | "warn" | "family"; why: string };

const fullName = (c: ContactLike) => `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (c.title ?? "");

/**
 * block: same e-mail, same phone (last 10 digits) or the same name; warn: a name up to 2 letters away, or the same
 * last name with the same first initial (Luana decides); family: same last name, another first name (a hint only).
 */
export function matchContacts(a: ContactLike, b: ContactLike): ContactMatch | null {
  const ea = fold(a.email).trim();
  const eb = fold(b.email).trim();
  if (ea && ea === eb) return { level: "block", why: "Same e-mail" };
  const pa = phoneKey(a.main_phone);
  const pb = phoneKey(b.main_phone);
  if (pa.length === 10 && pa === pb) return { level: "block", why: "Same phone" };
  const na = normName(fullName(a));
  const nb = normName(fullName(b));
  if (na && na === nb) return { level: "block", why: "Same name" };
  const ca = fold(fullName(a)).replace(/[^a-z]/g, "");
  const cb = fold(fullName(b)).replace(/[^a-z]/g, "");
  if (ca.length > 4 && cb.length > 4 && editDistance(ca, cb) <= 2) return { level: "warn", why: "Almost the same name" };
  const la = fold(a.last_name).replace(/[^a-z]/g, "");
  const lb = fold(b.last_name).replace(/[^a-z]/g, "");
  if (la.length > 2 && la === lb) {
    const fa = fold(a.first_name).trim();
    const fb = fold(b.first_name).trim();
    if (fa && fb && fa[0] === fb[0]) return { level: "warn", why: "Same last name and first initial" };
    return { level: "family", why: "Same last name (same family?)" };
  }
  return null;
}

// ---------------------------------------------------------------- the standard project name

export type NameParts = {
  owner: ContactLike | null;
  /** The organization the contact belongs to, when the project is a company's. */
  organization?: { title: string | null } | null;
  building?: string | null;
  address: Addr;
  unit: string | null;
  title?: string | null;
};

const COMPANY_TYPES = new Set(["Commercial Customer", "Developer Builder", "General Contractor", "Design Firm"]);

/**
 * "Marco Abrahao - St Regis #1402S" for a person, "Company - Place" for a company. Place = the building when
 * there is one, else the street; the unit keeps its own spelling ("1402S"). Returns null when nothing is known.
 */
export function proposedTitle(p: NameParts): string | null {
  const c = p.owner;
  let who = "";
  if (c) {
    const isCompany = COMPANY_TYPES.has(c.type ?? "") || (!c.last_name && Boolean(c.first_name));
    who = isCompany ? titleCase(p.organization?.title || c.title || "") : titleCase(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.title || "");
  }
  if (!who) who = splitTitle(p.title).who;
  const place = (p.building ?? "").trim() || (p.address?.street ?? "").trim() || splitTitle(p.title).place;
  const unit = (p.unit ?? "").trim().replace(/^#\s*/, "").replace(/^(unit|apt)\.?\s*/i, "");
  if (!who && !place) return null;
  return [who, [place, unit ? `#${unit}` : ""].filter(Boolean).join(" ")].filter(Boolean).join(" - ");
}
