// A server file may render a component from a "use client" file, but it can never CALL a plain function exported
// from one: the page dies while rendering ("Attempted to call x() from the server but x is on the client"). That took
// down every Employee page for people who see the Pay rate card (hoursText, found 2026-11-18). Neither the type check
// nor the build catches it, so this test does: no server file imports a lower-case value from a client file.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const files: string[] = [];
(function walk(dir: string) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f.name)) files.push(p);
  }
})("src");

const client = new Map<string, boolean>();
const isClient = (p: string) => {
  if (!client.has(p)) client.set(p, /^\s*["']use client["']/.test(fs.readFileSync(p, "utf8").slice(0, 300)));
  return client.get(p)!;
};
const resolve = (from: string, spec: string) => {
  const base = spec.startsWith("@/") ? path.join("src", spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")].find((c) => fs.existsSync(c)) ?? null;
};

describe("server files and client modules", () => {
  it("no server file imports a plain function or value from a \"use client\" file", () => {
    const found: string[] = [];
    for (const f of files) {
      if (isClient(f)) continue;
      for (const m of fs.readFileSync(f, "utf8").matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)) {
        if (m[1]) continue;
        const target = resolve(f, m[3]);
        if (!target || !isClient(target)) continue;
        const names = m[2].split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("type ")).map((s) => s.split(/\s+as\s+/)[0]);
        for (const n of names) if (/^[a-z]/.test(n)) found.push(`${f} imports ${n} from ${m[3]}`);
      }
    }
    expect(found).toEqual([]);
  });
});
