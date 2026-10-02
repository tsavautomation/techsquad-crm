// P2 Employee performance (SPEC §9.1 P2-c): the score engine, pure and tested.
//
// Every aspect starts at a neutral 70. Each report moves it by ±5 × weight (Minor 1, Normal 2,
// Major 3), and a report fades with age (half as much after 180 days). Scores stay within 0–100;
// the overall score is the average of the aspects that have at least one report.

export const ASPECTS = ["Speed", "Quality of work", "Punctuality", "Communication", "Safety", "Teamwork", "Customer care", "Initiative"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const WEIGHTS: Record<string, number> = { Minor: 1, Normal: 2, Major: 3 };
export const BASELINE = 70;
export const STEP = 5;
export const HALF_LIFE_DAYS = 180;

export type Report = { date: string | null; type: string | null; aspect: string | null; weight: string | null };
export type AspectScore = { aspect: string; score: number; positive: number; negative: number };
export type Band = "excellent" | "good" | "watch" | "attention";

const DAY = 86_400_000;

/** How much a report still counts: 1 today, ½ after the half-life, ¼ after two… */
export function fade(dateIso: string | null, now: number): number {
  if (!dateIso) return 1;
  const age = Math.max(0, (now - Date.parse(dateIso)) / DAY);
  return Math.pow(0.5, age / HALF_LIFE_DAYS);
}

export function band(score: number): Band {
  return score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 55 ? "watch" : "attention";
}

/** One score per aspect (all aspects listed, 70 when nothing was reported) and counts of reports. */
export function aspectScores(reports: Report[], now: number = Date.now()): AspectScore[] {
  const by = new Map<string, AspectScore>(ASPECTS.map((a) => [a, { aspect: a, score: BASELINE, positive: 0, negative: 0 }]));
  for (const r of reports) {
    if (!r.type) continue;
    const key = r.aspect && by.has(r.aspect) ? r.aspect : "General";
    const s = by.get(key) ?? { aspect: key, score: BASELINE, positive: 0, negative: 0 };
    const sign = r.type === "Positive" ? 1 : r.type === "Negative" ? -1 : 0;
    if (!sign) continue;
    s.score += sign * STEP * (WEIGHTS[r.weight ?? "Normal"] ?? 2) * fade(r.date, now);
    if (sign > 0) s.positive++;
    else s.negative++;
    by.set(key, s);
  }
  return [...by.values()].map((s) => ({ ...s, score: Math.round(Math.min(100, Math.max(0, s.score))) }));
}

/** Average of the aspects with reports; 70 when there are none yet. */
export function overall(scores: AspectScore[]): number {
  const rated = scores.filter((s) => s.positive + s.negative > 0);
  return rated.length ? Math.round(rated.reduce((n, s) => n + s.score, 0) / rated.length) : BASELINE;
}

/** Positive / negative counts per month (YYYY-MM), oldest first, for the trend chart. */
export function byMonth(reports: Report[], months = 6, now: number = Date.now()): { month: string; positive: number; negative: number }[] {
  const out: { month: string; positive: number; negative: number }[] = [];
  const d = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push({ month: m.toISOString().slice(0, 7), positive: 0, negative: 0 });
  }
  for (const r of reports) {
    const row = r.date && out.find((x) => x.month === r.date!.slice(0, 7));
    if (!row) continue;
    if (r.type === "Positive") row.positive++;
    else if (r.type === "Negative") row.negative++;
  }
  return out;
}

// ---------------------------------------------------------------- field signals (from the time clock, visits and job reports)

export type SignalInput = {
  /** Clock-ins: minutes late against the start time (0 = on time). */
  clockIns: number[];
  /** Visit check-ins: minutes after the end of the arrival window (0 = inside it). */
  checkIns: number[];
  /** Visits with both figures: planned and real minutes. */
  visits: { planned: number; real: number }[];
  /** Job report results. */
  results: string[];
  /** Return cards (visits not finished) caused by this person's reports. */
  returns: number;
};

export type Signal = { key: "punctuality" | "speed" | "quality"; score: number | null; detail: string };

/** 0–100 per signal, or null when there is nothing to measure yet. */
export function signals(i: SignalInput): Signal[] {
  const onTime = (xs: number[], grace: number) => (xs.length ? Math.round((xs.filter((m) => m <= grace).length / xs.length) * 100) : null);
  const clock = onTime(i.clockIns, 5);
  const site = onTime(i.checkIns, 0);
  const punctual = clock === null && site === null ? null : Math.round(((clock ?? site!) + (site ?? clock!)) / 2);
  const ratio = i.visits.length ? i.visits.reduce((n, v) => n + v.real / Math.max(1, v.planned), 0) / i.visits.length : null;
  // 1.0 = on plan → 85; every 10 % slower costs 5 points, every 10 % faster earns 2, capped.
  const speed = ratio === null ? null : Math.round(Math.min(100, Math.max(0, ratio <= 1 ? 85 + Math.min(15, (1 - ratio) * 20) : 85 - (ratio - 1) * 50)));
  const done = i.results.filter((r) => r === "Completed").length;
  const quality = i.results.length ? Math.round(Math.max(0, (done / i.results.length) * 100 - i.returns * 2)) : null;
  return [
    { key: "punctuality", score: punctual, detail: `${i.clockIns.length} clock-ins, ${i.checkIns.length} check-ins` },
    { key: "speed", score: speed, detail: ratio === null ? "no timed visits" : `${Math.round(ratio * 100)}% of planned time` },
    { key: "quality", score: quality, detail: `${done} of ${i.results.length} completed, ${i.returns} returns` },
  ];
}

export const SKILLS = ["Network", "Cabling", "AV design", "Programming", "Electrical", "Lighting control", "Shades", "Cameras / security", "Troubleshooting", "Leadership", "Customer communication", "Sales"] as const;
export const LEVELS = ["Learning", "Can do", "Expert"] as const;

// ---------------------------------------------------------------- skills grade (P2-f)

export type SkillStep = { skill: string; from: string | null; to: string };
export type SkillsGrade = { points: number; max: number; score: number; letter: "A" | "B" | "C" | "D"; steps: SkillStep[] };

/**
 * One grade for the skills grid: Learning 1, Can do 2, Expert 3 points per skill, as a share of the
 * maximum (3 × every skill), with a letter (A 85+, B 70+, C 55+, D). `steps` is how to improve, in
 * order: skills not started first, then the ones one level away from Expert.
 */
export function skillsGrade(skills: Record<string, string | null | undefined>, all: readonly string[] = SKILLS): SkillsGrade {
  const level = (s: string) => {
    const i = LEVELS.indexOf((skills[s] ?? "") as (typeof LEVELS)[number]);
    return i < 0 ? 0 : i + 1;
  };
  const points = all.reduce((n, s) => n + level(s), 0);
  const max = all.length * LEVELS.length;
  const score = max ? Math.round((points / max) * 100) : 0;
  const steps: SkillStep[] = all
    .filter((s) => level(s) < LEVELS.length)
    .sort((a, b) => level(a) - level(b))
    .map((s) => ({ skill: s, from: level(s) ? LEVELS[level(s) - 1] : null, to: LEVELS[level(s)] }));
  return { points, max, score, letter: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D", steps };
}
