// One-off (Fred 2026-11-04): Gustavo Lima Hollywood is two scopes / two companies. Visits go by technician,
// job reports by the first person of the team: Elec staff → 1070 (Elec), everyone else → 1039 (Lv).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const APPLY = process.argv.includes("--apply");
const LV = 1039, ELEC = 1070;
const q = async (p) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data ?? []; };
const emps = await q(db.from("employee_names").select("id, title").limit(2000));
const names = new Map(emps.map(e=>[e.id, e.title]));
const ELEC_NAMES = ["Marcelo Opazo", "Joao Paulo Amaral", "Fabio Inkratas", "Flavio Pereira", "Jefferson Costa", "Armando de Oliveira dos Santos"];
const elecIds = new Set(emps.filter(e=>ELEC_NAMES.includes(e.title)).map(e=>e.id));
if (elecIds.size !== ELEC_NAMES.length) throw new Error("Elec names not all found: " + [...elecIds].map(i=>names.get(i)));
const target = (empId) => (empId && elecIds.has(empId) ? ELEC : LV);
// Visits
const visits = [];
for (let from = 0; ; from += 1000) { const r = await q(db.from("visits").select("id, project_id, technician_id, starts_at, title").in("project_id", [LV, ELEC]).is("deleted_at", null).order("id").range(from, from + 999)); visits.push(...r); if (r.length < 1000) break; }
const vMoves = visits.filter(v => v.technician_id && target(v.technician_id) !== v.project_id).map(v => ({ id: v.id, from: v.project_id, to: target(v.technician_id), who: names.get(v.technician_id), title: v.title }));
const vs = {}; for (const m of vMoves) { const k = `${m.from}→${m.to} ${m.who}`; vs[k]=(vs[k]||0)+1; }
console.log(`VISITS: ${visits.length} on the two projects, ${vMoves.length} move:`); for (const [k,n] of Object.entries(vs).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log("  stay (no technician):", visits.filter(v=>!v.technician_id).length);
// Job reports: first person of the team (lowest join-row id)
const reports = await q(db.from("job_reports").select("id, project_id, date, title").in("project_id", [LV, ELEC]).is("deleted_at", null).order("id").limit(2000));
const team = await q(db.from("job_reports_team").select("record_id, target_id, created_at").in("record_id", reports.map(r=>r.id)).order("created_at").limit(10000));
// "First of the team" = the first name in the report's title ("… – Hugo Gomes, Daniel Sousa – 4/21/2026"); else the oldest team row.
const first = new Map();
for (const r of reports) {
  const members = team.filter(t=>t.record_id===r.id).map(t=>t.target_id);
  if (!members.length) continue;
  const m = /–s*([^–]+?)s*–s*d/.exec(r.title ?? "");
  const firstName = m ? m[1].split(",")[0].trim() : null;
  const byName = firstName ? members.find(id => names.get(id) === firstName) : undefined;
  first.set(r.id, byName ?? members[0]);
}
const rMoves = reports.filter(r => first.has(r.id) && target(first.get(r.id)) !== r.project_id).map(r => ({ id: r.id, from: r.project_id, to: target(first.get(r.id)), who: names.get(first.get(r.id)), title: r.title }));
const rs = {}; for (const m of rMoves) { const k = `${m.from}→${m.to} ${m.who}`; rs[k]=(rs[k]||0)+1; }
console.log(`JOB REPORTS: ${reports.length}, ${rMoves.length} move:`); for (const [k,n] of Object.entries(rs).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log("  stay (no team):", reports.filter(r=>!first.has(r.id)).length);
const retitle = (t, to) => (t ? t.replace(/\(Elec\)|\(Lv\)/, to === ELEC ? "(Elec)" : "(Lv)") : t);
if (!APPLY) { console.log("dry run; add --apply"); process.exit(0); }
const now = new Date().toISOString();
const note = "Moved between Gustavo Lima - Hollywood (Elec) and (Lv): Elec staff → Elec, everyone else → Lv (Fred 2026-11-04)";
let nv = 0, nr = 0;
for (const m of vMoves) {
  // google_synced_at = updated_at keeps the hourly push from re-sending 1,000 past events to Google.
  const { error } = await db.from("visits").update({ project_id: m.to, title: retitle(m.title, m.to), updated_at: now, google_synced_at: now }).eq("id", m.id).eq("project_id", m.from);
  if (error) throw new Error(`visit ${m.id}: ${error.message}`);
  nv++;
}
await db.from("audit_log").insert(vMoves.map(m => ({ table_name: "visits", record_id: m.id, action: "update", changes: { project_id: [m.from, m.to], _note: note } })));
for (const m of rMoves) {
  const { error } = await db.from("job_reports").update({ project_id: m.to, title: retitle(m.title, m.to), updated_at: now }).eq("id", m.id).eq("project_id", m.from);
  if (error) throw new Error(`report ${m.id}: ${error.message}`);
  nr++;
}
await db.from("audit_log").insert(rMoves.map(m => ({ table_name: "job_reports", record_id: m.id, action: "update", changes: { project_id: [m.from, m.to], _note: note } })));
console.log(`applied: ${nv} visits, ${nr} job reports moved`);
