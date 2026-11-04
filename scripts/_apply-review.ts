/**
 * PU-c one-off (Fred's review of 2026-11-04): apply the 107 decisions on Portal.io proposals (2024–2026) that no
 * Transaction numbered. For each proposal → project:
 *   - the Sales Projections sheet rows with that number are linked to the project (they hold its money; the
 *     Approved Proposal they create carries the number, so the sync attaches the lines, PU-b);
 *   - a project whose Approved Proposal already has the same amount under another number gets the lines only
 *     (--materials, after migration 20261103190000);
 *   - otherwise the proposal is linked in full and its money synced from Portal.io (nothing else holds it).
 * New projects (and contacts) come first.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/_apply-review.ts <answers> [--apply] [--materials]
 */
import fs from "node:fs";
import { adminDb } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/portalio/client";
import { syncLinkedProposal } from "@/lib/portalio/transactions";
import { acceptedItems, itemRows, type PortalArea } from "@/lib/portalio/plan";
import { linkSheetRowsByNumber } from "@/lib/finance/sheet-link";

type Addr = { street: string; address_2?: string | null; city: string; state: string; zip: string };
type NewContact = { key: string; first_name: string; last_name: string; email?: string | null; main_phone?: string | null; address?: Addr | null };
type NewProject = { key: string; title: string; owner: number | string; address: Addr | null; unit?: string | null; proposals: number[] };

// E-mails and phones came from the Portal.io mirror / Fred's answers at run time (2026-11-04); they are not kept here.
const CONTACTS: NewContact[] = [
  { key: "rafael", first_name: "RAFAEL", last_name: "COSTA", address: { street: "2400 NW 93rd Ave", city: "Doral", state: "FL", zip: "33172" } },
  { key: "cristina", first_name: "CRISTINA", last_name: "SOUZA" },
  { key: "celli", first_name: "JAMES", last_name: "CELLI", address: { street: "3367 NE 168th St", city: "North Miami Beach", state: "FL", zip: "33160" } },
  { key: "fichman", first_name: "RODRIGO", last_name: "FREDI FICHMAN" },
];
const PROJECTS: NewProject[] = [
  { key: "rafael", title: "Costa, Rafael - Doral", owner: "rafael", address: { street: "2400 NW 93rd Ave", city: "Doral", state: "FL", zip: "33172" }, proposals: [2825, 2816] },
  { key: "bellamare2107", title: "Joffe, Jay - Bellamare #2107", owner: 1099, address: { street: "6000 Island Blvd", city: "Aventura", state: "FL", zip: "33160" }, unit: "2107", proposals: [2787] },
  { key: "bellamare2708", title: "Joffe, Jay - Bellamare #2708", owner: 1099, address: { street: "6000 Island Blvd", city: "Aventura", state: "FL", zip: "33160" }, unit: "2708", proposals: [2402] },
  { key: "nextthouse", title: "Fichman, Rodrigo (Nextthouse)", owner: "fichman", address: null, proposals: [2839] },
  { key: "allysson", title: "Martins, Allysson - Boca Raton", owner: 1112, address: { street: "10675 Eureka St", city: "Boca Raton", state: "FL", zip: "33428" }, proposals: [2517] },
  { key: "nardi", title: "Nardi, Luciano - Lighthouse Point", owner: 1234, address: { street: "2901 NE 46th St", city: "Lighthouse Point", state: "FL", zip: "33064" }, proposals: [2354, 1963, 2335, 2332] },
  { key: "cristina", title: "Souza, Cristina - 533 NE 52nd Terrace", owner: "cristina", address: { street: "533 NE 52nd Terrace", city: "Miami", state: "FL", zip: "33137" }, proposals: [2229] },
  { key: "mrc1705", title: "Mr. C #1705 - 2640 S Bayshore", owner: 1393, address: { street: "2640 S Bayshore Dr", city: "Miami", state: "FL", zip: "33133" }, unit: "1705", proposals: [2194] },
  { key: "bimini", title: "Alexander Residence - Bimini", owner: 1068, address: null, proposals: [2163] },
  { key: "celli", title: "Celli, James - SIMS Residence", owner: "celli", address: { street: "3367 NE 168th St", city: "North Miami Beach", state: "FL", zip: "33160" }, proposals: [510] },
  { key: "mcstudio", title: "MC Studio - Continuum #3303", owner: "cristina", address: { street: "100 S Pointe Dr", city: "Miami Beach", state: "FL", zip: "33139" }, unit: "3303", proposals: [1910, 1938] },
];
const NOTE = "Fred's review of 2026-11-04 (Portal.io proposals the sheet import left without a project)";

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  const materials = process.argv.includes("--materials");
  const db = adminDb();
  const answers = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { const i = l.indexOf("="); return { number: Number(l.slice(0, i)), value: l.slice(i + 1) }; });
  const created = new Set(PROJECTS.flatMap((p) => p.proposals));
  const direct = answers.filter((a) => /^\d+$/.test(a.value)).map((a) => ({ number: a.number, project: Number(a.value) }));
  const ignored = answers.filter((a) => a.value === "ignore").map((a) => a.number);
  for (const a of answers) if (a.value.startsWith("create:") && !created.has(a.number)) throw new Error(`create without a project: #${a.number}`);
  console.log(`${answers.length} decisions: ${direct.length} to existing projects, ${created.size} to ${PROJECTS.length} new projects, ${ignored.length} ignored`);

  // ---- state of the mirror
  const nums = [...direct.map((d) => d.number), ...created, ...ignored];
  const { data: pd } = await db.from("portal_proposals").select("id, number, total, archived, link_status, project_id, detail").in("number", nums);
  const mirror = new Map((pd ?? []).map((p) => [p.number as number, p as { id: number; number: number; total: number | null; archived: boolean; link_status: string; project_id: number | null; detail: { areas?: PortalArea[] | null } | null }]));
  for (const n of nums) if (!mirror.has(n)) throw new Error(`#${n} not in the mirror`);

  // ---- 1. contacts and projects
  const contactIds = new Map<string, number>();
  const projectIds = new Map<string, number>();
  for (const c of CONTACTS) {
    const { data: ex } = await db.from("contacts").select("id").ilike("first_name", c.first_name).ilike("last_name", c.last_name).is("deleted_at", null).limit(1).maybeSingle();
    if (ex) { contactIds.set(c.key, (ex as { id: number }).id); console.log(`contact ${c.first_name} ${c.last_name}: exists #${(ex as { id: number }).id}`); continue; }
    console.log(`contact ${c.first_name} ${c.last_name}: create`);
    if (!apply) continue;
    const row = { type: "End Customer", first_name: c.first_name, last_name: c.last_name, title: `${c.first_name} ${c.last_name}`, email: c.email ?? null, main_phone: c.main_phone ?? null, address: c.address ?? null };
    const { data, error } = await db.from("contacts").insert(row).select("id").single();
    if (error) throw new Error(`contact ${c.key}: ${error.message}`);
    contactIds.set(c.key, (data as { id: number }).id);
    await db.from("audit_log").insert({ table_name: "contacts", record_id: (data as { id: number }).id, action: "create", actor: null, changes: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, [null, v]])) });
  }
  for (const p of PROJECTS) {
    const { data: ex } = await db.from("projects").select("id").eq("title", p.title).is("deleted_at", null).maybeSingle();
    if (ex) { projectIds.set(p.key, (ex as { id: number }).id); console.log(`project "${p.title}": exists #${(ex as { id: number }).id}`); continue; }
    const owner = typeof p.owner === "number" ? p.owner : contactIds.get(p.owner);
    console.log(`project "${p.title}": create (owner ${owner ?? "?"}) for #${p.proposals.join(", #")}`);
    if (!apply) continue;
    if (!owner) throw new Error(`no owner for ${p.key}`);
    const row = { title: p.title, type: "Residential", category: "Low Voltage", job_status: "Complete", job_owner_id: owner, job_address: p.address, apartment_or_unit: p.unit ?? null, referral_type: "None" };
    const { data, error } = await db.from("projects").insert(row).select("id").single();
    if (error) throw new Error(`project ${p.key}: ${error.message}`);
    const id = (data as { id: number }).id;
    projectIds.set(p.key, id);
    await db.from("audit_log").insert({ table_name: "projects", record_id: id, action: "create", actor: null, changes: { ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, [null, v]])), note: [null, NOTE] } });
  }

  // ---- 2. each proposal
  const targets = [...direct, ...PROJECTS.flatMap((p) => p.proposals.map((number) => ({ number, project: projectIds.get(p.key) ?? -1 })))];
  const s = apply ? await loadSettings() : null;
  const tally = { sheet: 0, full: 0, materials: 0, pending: 0, skipped: 0 };
  for (const t of targets) {
    const p = mirror.get(t.number)!;
    if (p.link_status !== "new") { console.log(`#${t.number}: already ${p.link_status} → project ${p.project_id}, skipped`); tally.skipped++; continue; }
    if (t.project < 0) { console.log(`#${t.number}: project not created (dry run)`); continue; }
    const { data: sheet } = await db.from("sheet_proposals").select("id, number, amount").eq("main_number", t.number).eq("link_status", "new");
    const { data: tx } = await db.from("transactions").select("id, amount, portal_number").eq("project_id", t.project).eq("type", "Proposal").eq("payment_type", "Apply to Project").is("deleted_at", null).limit(500);
    const exact = (tx ?? []).find((x) => x.amount !== null && p.total !== null && Math.abs(Number(x.amount) - Number(p.total)) < 1);
    if (sheet?.length) {
      console.log(`#${t.number} → ${t.project}: link ${sheet.length} sheet row(s) (${sheet.map((r) => `${r.number} ${r.amount}`).join("; ")}); lines follow at the next sync`);
      tally.sheet++;
      if (apply) {
        const n = await linkSheetRowsByNumber(db, t.number, t.project, null);
        if (n !== sheet.length) console.log(`   !! only ${n} of ${sheet.length} rows linked`);
      }
    } else if (exact) {
      console.log(`#${t.number} → ${t.project}: lines only, onto transaction ${exact.id} (${exact.amount}, #${exact.portal_number})${materials ? "" : " [waits for --materials]"}`);
      if (materials && apply) {
        const rows = itemRows(acceptedItems(p.detail?.areas ?? null));
        const { error } = await db.from("portal_proposals").update({ project_id: t.project, transaction_id: exact.id, link_status: "materials", linked_at: new Date().toISOString(), auto_linked: false, tx_synced_at: new Date().toISOString() }).eq("id", p.id).eq("link_status", "new");
        if (error) { console.log(`   !! ${error.message}`); tally.pending++; continue; }
        await db.from("proposal_items").delete().eq("transaction_id", exact.id);
        if (rows.length) await db.from("proposal_items").insert(rows.map((r) => ({ ...r, transaction_id: exact.id })));
        await db.from("audit_log").insert({ table_name: "projects", record_id: t.project, action: "update", actor: null, changes: { portal_proposal: [null, `Portal.io proposal #${t.number}: ${rows.length} lines attached to the Approved Proposal of the same amount (materials only; ${NOTE})`] } });
        tally.materials++;
      } else tally.pending++;
    } else {
      console.log(`#${t.number} → ${t.project}: FULL link, money synced from Portal.io (${p.total}; project has ${(tx ?? []).length} proposals, none of this amount)`);
      tally.full++;
      if (apply) {
        const { error } = await db.from("portal_proposals").update({ project_id: t.project, link_status: "linked", linked_at: new Date().toISOString(), auto_linked: false }).eq("id", p.id).eq("link_status", "new");
        if (error) { console.log(`   !! ${error.message}`); continue; }
        const r = await syncLinkedProposal(db, p.id, { settings: s, actor: null });
        console.log(`   created main ${r.created.main}, co ${r.created.co}, invoices ${r.created.invoice}, payments ${r.created.payment}; updated ${r.updated}${r.errors.length ? "; errors: " + r.errors.join(" | ") : ""}`);
        await db.from("audit_log").insert({ table_name: "projects", record_id: t.project, action: "update", actor: null, changes: { portal_proposal: [null, `Portal.io proposal #${t.number} linked (${NOTE})`] } });
      }
    }
  }
  if (apply) {
    const { error } = await db.from("portal_proposals").update({ link_status: "ignored", linked_at: new Date().toISOString() }).in("number", ignored).eq("link_status", "new");
    console.log(`ignored ${ignored.length}${error ? ": " + error.message : ""}`);
  }
  console.log(tally, apply ? "" : "(dry run)");
}
void main();
