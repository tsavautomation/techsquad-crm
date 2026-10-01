import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeT, translate } from "@/i18n/core";
import { PT } from "@/i18n/pt";
import { PT_REGISTRY } from "@/i18n/pt-registry";
import { localizeTable } from "@/i18n/registry";
import { getTable, REGISTRY } from "@/registry";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !p.includes("i18n") ? [p] : [];
  });
}

/** Every literal passed to t("…") / tr("…"), including both sides of t(cond ? "A" : "B"). */
function usedKeys(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files("src")) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/\b(?:t|tr)\(\s*("(?:[^"\\]|\\.)*")/g)) out.set(JSON.parse(m[1]), f);
    for (const m of s.matchAll(/\b(?:t|tr)\(([^()]*?\?[^()]*?)\)/g))
      for (const l of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) if (/[A-Za-z]{2}/.test(l[1])) out.set(JSON.parse(`"${l[1]}"`), f);
  }
  return out;
}

describe("screen language (Portuguese)", () => {
  it("has Portuguese for every text the screens translate", () => {
    const missing = [...usedKeys()].filter(([k]) => !(k in PT) && !(k in PT_REGISTRY)).map(([k, f]) => `${k}   (${f})`);
    expect(missing).toEqual([]);
  });

  it("has Portuguese for every registry label, heading and option", () => {
    const missing = new Set<string>();
    for (const t of REGISTRY)
      for (const s of [t.label, t.itemLabel, t.newRecordLabel, ...t.fields.flatMap((f) => [f.label, f.heading, f.help, f.placeholder, ...(f.options ?? []).map((o) => o.label)])])
        if (s && !(s in PT_REGISTRY) && !(s in PT)) missing.add(s);
    expect([...missing]).toEqual([]);
  });

  it("keeps the same Portuguese when a text is in both dictionaries", () => {
    const clash = Object.keys(PT).filter((k) => k in PT_REGISTRY && PT[k] !== PT_REGISTRY[k]).map((k) => `${k}: ${PT[k]} / ${PT_REGISTRY[k]}`);
    expect(clash).toEqual([]);
  });

  it("keeps every {placeholder} in the translation", () => {
    const bad = Object.entries({ ...PT_REGISTRY, ...PT }).filter(([k, v]) => [...k.matchAll(/\{(\w+)\}/g)].some((m) => !v.includes(`{${m[1]}}`)));
    expect(bad).toEqual([]);
  });

  it("translates, fills placeholders and falls back to English", () => {
    const t = makeT("pt");
    expect(t("Save")).toBe("Salvar");
    expect(t("Page {page} of {pages}", { page: 2, pages: 5 })).toBe("Página 2 de 5");
    expect(t("A label typed in Form settings")).toBe("A label typed in Form settings");
    expect(translate("en", "Hello {name}", { name: "Ana" })).toBe("Hello Ana");
  });

  it("translates a table's labels without touching names, values or rules", () => {
    const en = getTable("visits");
    const pt = localizeTable(en, "pt");
    expect(pt.fields.map((f) => f.name)).toEqual(en.fields.map((f) => f.name));
    expect(pt.fields.find((f) => f.name === "status")!.options!.map((o) => o.value)).toEqual(en.fields.find((f) => f.name === "status")!.options!.map((o) => o.value));
    expect(pt.label).not.toBe(en.label);
    expect(pt.rules).toBe(en.rules);
    expect(localizeTable(en, "en")).toBe(en);
  });
});
