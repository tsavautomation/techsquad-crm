import { PT } from "./pt";
import { PT_REGISTRY } from "./pt-registry";

// Screen language, chosen per person in the account menu (SPEC §9.1 I-a). English is the source:
// code writes English text and t() swaps in the Portuguese from the dictionaries, keeping
// English when a text has no translation yet (e.g. a label typed in Form settings).
// Emails and PDFs stay in English; data people type is never translated.

export const LANGS = [
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const isLang = (v: unknown): v is Lang => v === "en" || v === "pt";
export const LANG_COOKIE = "lang";

export type Vars = Record<string, string | number | null | undefined>;
export type T = (text: string, vars?: Vars) => string;

const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m)) : text);

/** Translate one English text. `{name}` placeholders are filled from `vars` after translating. */
export function translate(lang: Lang, text: string, vars?: Vars): string {
  if (lang === "en" || !text) return fill(text, vars);
  return fill(PT[text] ?? PT_REGISTRY[text] ?? text, vars);
}

export const makeT =
  (lang: Lang): T =>
  (text, vars) =>
    translate(lang, text, vars);

/** "1 task" / "3 tasks", in the person's language. Both forms are English keys in the dictionary. */
export const plural = (t: T, n: number, one: string, many: string) => t(n === 1 ? one : many, { n });
