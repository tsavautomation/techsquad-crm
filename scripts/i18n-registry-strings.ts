// Prints every registry / menu text that the Portuguese dictionary (src/i18n/pt-registry.ts) should cover.
// Run: npx tsx scripts/i18n-registry-strings.ts > strings.json
import { REGISTRY } from "../src/registry/index";
import { MODULES } from "../src/config/modules";
import { ADMIN_SCREENS } from "../src/lib/admin/screens";
import { TILE_TEXT } from "../src/components/shell/tile-icons";

const out = new Set<string>();
const add = (s: string | undefined | null) => {
  if (typeof s === "string" && s.trim() !== "") out.add(s);
};

for (const t of REGISTRY) {
  add(t.label);
  add(t.itemLabel);
  add(t.newRecordLabel);
  for (const f of t.fields) {
    add(f.label);
    add(f.heading);
    add(f.placeholder);
    add(f.help);
    for (const o of f.options ?? []) add(o.label);
  }
}
for (const m of MODULES) {
  add(m.title);
  add(m.shortTitle);
  for (const tab of m.tabs) add(tab.title);
}
for (const s of ADMIN_SCREENS) {
  add(s.title);
  add(s.description);
}
for (const v of Object.values(TILE_TEXT)) add(v);

console.log(JSON.stringify([...out].sort(), null, 2));
