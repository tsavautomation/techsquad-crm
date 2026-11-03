// FIN-o Finance data fixes (Luana via Fred 2026-11-02, Prompt 2): the pure planner. Given the stored rows it
// returns every change (before → after) without touching the database; scripts/finance-dryrun.ts prints it and
// scripts/finance-apply.ts applies it once Fred approves. Rules, in order:
//   A superseded proposals (Chaparral #2077 final, Leventhal #3100 → #3158, and sheet copies of Portal proposals);
//   B the card fee is a line of the portal's Proposal Total: amount = total − fee, the fee goes to the CC Fee of the
//     payment that carried it; a change order whose paid request equals its total − fee carries the fee too;
//   C payments: sheet cells with several values split, one proposal per payment (allocation), the portal's own date,
//     the sheet's dates (column B; first payment before it; same month = the proposal's date);
//   D partner (Indicator/Designer column) and the commission flag;
//   plus lists for Luana: payment schedules to define, credit change orders, items without cost, sheet change
//   orders missing, payments the office must allocate.

export type Tx = {
  id: number;
  project_id: number | null;
  type: string;
  amount: number | null;
  date: string | null;
  description: string | null;
  cc_fee: number | null;
  tip: number | null;
  discount: number | null;
  method: string | null;
  portal_number: string | null;
  portal_proposal_id: number | null;
  portal_change_order_id: number | null;
  portal_request_id: number | null;
  parent_transaction_id: number | null;
  is_change_order: boolean | null;
  sheet_ref: string | null;
  sales_tax: number | null;
  parts_cost: number | null;
  invoice_status: string | null;
  created_at: string;
};
export type SheetRec = { id: number; number: string | null; main_number: number | null; change_order: number | null; title: string | null; customer: string | null; amount: number | null; date: string | null; designer: string | null; commission: boolean | null; payments: { month: string; amount: number }[] | null; cc_fee: number | null; project_id: number | null; transaction_id: number | null };
export type Req = { id: number; amount: number; status: string | null; dueDate?: string | null; description?: string | null; paymentMethod?: string | null };
export type PortalRec = {
  id: number;
  number: number | null;
  name: string | null;
  status: string | null;
  total: number | null;
  financial: { parts?: number; labor?: number; tax?: number; fee?: number } | null;
  payment_requests: Req[] | null;
  change_orders: { id: number; number?: number | null; status?: string | null; total?: { changeOrderTotal?: number } | null }[] | null;
  change_order_details: Record<string, { financialSummary?: { changeOrderTotal?: number; feeTotal?: number }; paymentRequests?: Req[] }> | null;
  schedule: { payments?: { amount?: number; calculation?: string; due?: { milestone?: string } }[]; customerDescription?: string } | null;
  project_id: number | null;
  transaction_id: number | null;
};
export type ProjectRec = { id: number; title: string | null; category: string | null; job_status: string | null; design_firm_id: number | null; builder_developer_id: number | null; general_contractor_id: number | null; referral_contact_id: number | null; referral_organization_id: number | null; commission_contact_id: number | null; commission_organization_id: number | null };
export type Item = { transaction_id: number; cost: number | null; quantity: number | null; item_type: string | null };
export type Split = { number: string | null; title: string | null; customer: string | null; month: string; result: number; parts: number[] };
export type Named = { id: number; title: string | null; type?: string | null };

export type Data = {
  tx: Tx[];
  sheet: SheetRec[];
  portal: PortalRec[];
  projects: ProjectRec[];
  items: Item[];
  splits: Split[];
  organizations: Named[];
  contacts: Named[];
  /** Live numbers for proposals the mirror does not hold with items (Leventhal #3158): parts cost and tax. */
  extra: Record<number, { portal_id: number; parts_cost: number; sales_tax: number }>;
};

export type Change = { project_id: number | null; table: "transactions" | "projects"; id: number | null; set: Record<string, unknown>; before: Record<string, unknown>; why: string; rule: string };
export type Note = { project_id: number | null; rule: string; text: string };
/** Fred 2026-11-03: how the sheet's Indicator/Designer names map to CRM organizations (sheet name → CRM title). */
export const PARTNER_ALIASES: Record<string, string> = {
  "Navicon Construction": "INDIGO CONSTRUCTION SERVICES, LLC",
  "Design Solutions Miami": "Design Solutions, Inc",
  "JC Interiors": "Jessica Cordeiro Interiors, Inc.",
  "Squadra Design": "Squadra Concierge and Interiors",
  "MC Décor": "MC Studio",
  "Giga Russo": "Benetti Services, Inc",
  "Anderson Mendes": "M2 Connexion Corp",
};
/** Fred 2026-11-03: partners to create (sheet name → new organization or contact). */
export const PARTNER_CREATES: Record<string, { table: "organizations" | "contacts"; row: Record<string, unknown> }> = {
  "Urban Coast": { table: "organizations", row: { title: "Urban Coast" } },
  Newman: { table: "organizations", row: { title: "Newman Construction Group", type: "General Contractor", address: { street: "1590 NE 162nd St Suite 300", address_2: "", city: "North Miami Beach", state: "FL", zip: "33162" }, main_phone: "(305) 933-2583", main_email: "Office@newmanbc.com" } },
  "Jackson Cardoso": { table: "contacts", row: { title: "JACKSON CARDOSO", first_name: "Jackson", last_name: "Cardoso" } },
  "Alejandra Martinez": { table: "contacts", row: { title: "ALEJANDRA MARTINEZ", first_name: "Alejandra", last_name: "Martinez" } },
  Livia: { table: "contacts", row: { title: "LIVIA", first_name: "Livia" } },
};

export type Plan = {
  changes: Change[];
  creates: { project_id: number; row: Record<string, unknown>; why: string; rule: string }[];
  /** Partners to create before the project changes; a project change then carries `new:<sheet name>` in place of the id. */
  partnerCreates: { key: string; table: "organizations" | "contacts"; row: Record<string, unknown>; projects: number[] }[];
  notes: Note[];
  /** Per project: approved / paid / discount / balance before and after. */
  totals: Map<number, { before: Totals; after: Totals }>;
  /** Payment numbers per proposal after the allocation (payment id → "1st of #3115"). */
  numbering: Map<number, string>;
};
export type Totals = { approved: number; paid: number; discount: number; balance: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) < 0.011;
export const normNumber = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
const fold = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
const sheetRowOf = (ref: string | null) => (ref ? Number(ref.split(":")[0]) : null);

/** The explicit substitutions Luana decided (project, the number that stays, the numbers it replaces). */
export const SUPERSEDE: { project: number; keep: string; replaces: string[]; why: string }[] = [
  { project: 1135, keep: "2077", replaces: ["1971", "2491", "2364", "2838"], why: "845 Chaparral: #2077 is the final internal version that compiles the four; all payments on it (sheet row of #2077 only)" },
  { project: 1283, keep: "3158", replaces: ["3100"], why: "Leventhal: V2 Revised (#3158, Draft in the portal) replaces V1 (#3100, Accepted); Parts and tax from #3158" },
];
/** Portal payment requests that must be ignored (Chaparral: no payment was ever registered in the portal). */
export const IGNORE_REQUESTS_OF_PROJECT = new Set([1135]);

export function buildPlan(d: Data): Plan {
  const plan: Plan = { changes: [], creates: [], partnerCreates: [], notes: [], totals: new Map(), numbering: new Map() };
  const live = new Map(d.tx.map((t) => [t.id, { ...t }]));
  const gone = new Set<number>(); // soft-deleted by the plan
  const superseded = new Map<number, number>(); // proposal → by
  const change = (t: Tx, set: Record<string, unknown>, why: string, rule: string) => {
    const before: Record<string, unknown> = {};
    const cur = live.get(t.id)!;
    const real: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(set)) {
      const was = (cur as unknown as Record<string, unknown>)[k];
      if (typeof v === "number" && typeof was === "number" ? same(v, was) : v === was) continue;
      before[k] = was;
      real[k] = v;
      (cur as unknown as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(real).length) plan.changes.push({ project_id: t.project_id, table: "transactions", id: t.id, set: real, before, why, rule });
  };
  const note = (project_id: number | null, rule: string, text: string) => plan.notes.push({ project_id, rule, text });
  const byProject = Map.groupBy(d.tx, (t) => t.project_id ?? 0);
  const portalById = new Map(d.portal.map((p) => [p.id, p]));
  const portalByNumber = new Map(d.portal.filter((p) => p.number).map((p) => [String(p.number), p]));
  const sheetById = new Map(d.sheet.map((s) => [s.id, s]));
  const proposalsOf = (pid: number) => (byProject.get(pid) ?? []).filter((t) => t.type === "Proposal" && !gone.has(t.id));
  const paymentsOf = (pid: number) => (byProject.get(pid) ?? []).filter((t) => t.type === "Payment" && !gone.has(t.id));

  // ---------------------------------------------------------------- totals before
  const totalsOf = (pid: number): Totals => {
    const ps = (byProject.get(pid) ?? []).filter((t) => !gone.has(t.id));
    const approved = r2(ps.filter((t) => t.type === "Proposal" && !superseded.has(t.id)).reduce((n, t) => n + Number(live.get(t.id)!.amount ?? 0), 0));
    const paid = r2(ps.filter((t) => t.type === "Payment").reduce((n, t) => n + Number(live.get(t.id)!.amount ?? 0), 0) + plan.creates.filter((c) => c.project_id === pid).reduce((n, c) => n + Number(c.row.amount ?? 0), 0));
    const discount = r2(ps.filter((t) => t.type === "Payment").reduce((n, t) => n + Number(live.get(t.id)!.discount ?? 0), 0));
    return { approved, paid, discount, balance: r2(approved - paid - discount) };
  };
  const before = new Map<number, Totals>();
  for (const p of d.projects) before.set(p.id, totalsOf(p.id));

  // ---------------------------------------------------------------- A. superseded proposals
  for (const s of SUPERSEDE) {
    const props = proposalsOf(s.project);
    const keeper = props.find((t) => normNumber(t.portal_number) === s.keep && t.portal_proposal_id) ?? props.find((t) => normNumber(t.portal_number) === s.keep);
    if (!keeper) {
      note(s.project, "A", `Keeper #${s.keep} not found; nothing done`);
      continue;
    }
    for (const t of props) {
      if (t.id === keeper.id) continue;
      const n = normNumber(t.portal_number);
      const copyOfKeeper = !n && same(t.amount, keeper.amount) && (t.description ?? "").includes(s.keep);
      if (s.replaces.includes(n)) {
        superseded.set(t.id, keeper.id);
        change(t, { superseded_by_id: keeper.id }, s.why, "A");
      } else if (copyOfKeeper) {
        // The sheet's own copy of the keeper (same amount, "2077-…"): the sheet row moves to the portal row.
        gone.add(t.id);
        change(t, { deleted_at: "now" }, `Duplicate of #${s.keep} (sheet copy); its sheet row now points at the portal proposal`, "A");
        if (t.sheet_ref) change(keeper, { sheet_ref: t.sheet_ref }, "Sheet row of the kept proposal", "A");
      }
    }
    if (s.project === 1135) {
      // Payments of the replaced rows duplicate the ones on the #2077 row: keep the #2077 row's, drop the others.
      const keepRow = sheetRowOf(live.get(keeper.id)!.sheet_ref) ?? sheetRowOf(props.find((t) => (t.description ?? "").startsWith("2077"))?.sheet_ref ?? null);
      const keepPays = paymentsOf(s.project).filter((t) => sheetRowOf(t.sheet_ref) === keepRow);
      for (const t of paymentsOf(s.project)) {
        if (sheetRowOf(t.sheet_ref) === keepRow) continue;
        // Same amount on the #2077 row = the same payment (the row's "2023" lump column holds the Feb 2024 one).
        const twin = keepPays.find((k) => same(k.amount, t.amount) && (k.date ?? "").slice(0, 7) === (t.date ?? "").slice(0, 7)) ?? keepPays.find((k) => same(k.amount, t.amount));
        if (twin) {
          gone.add(t.id);
          change(t, { deleted_at: "now" }, `Same payment as #${twin.id} on the #2077 row (the sheet lists Chaparral payments on two lines)`, "A");
        } else note(s.project, "A", `Payment #${t.id} ${t.amount} ${t.date} is not on the #2077 row: left as is (check)`);
      }
      for (const t of (byProject.get(s.project) ?? []).filter((t) => t.type === "Invoice")) {
        gone.add(t.id);
        change(t, { deleted_at: "now" }, "Chaparral: portal payment requests are ignored (no payment was registered in the portal)", "A");
      }
    }
    if (s.project === 1283) {
      const x = d.extra[keeper.id];
      const p = [...d.portal.values()].find((q) => String(q.number) === s.keep);
      if (p) change(keeper, { portal_proposal_id: p.id, parts_cost: x?.parts_cost ?? live.get(keeper.id)!.parts_cost, sales_tax: x?.sales_tax ?? live.get(keeper.id)!.sales_tax }, "Linked to the portal's #3158 (Draft) with its own Parts and tax", "A");
    }
  }
  // Sheet copies of portal proposals elsewhere: same project, same number, one linked to the portal.
  for (const p of d.projects) {
    const groups = Map.groupBy(proposalsOf(p.id).filter((t) => normNumber(t.portal_number)), (t) => normNumber(t.portal_number));
    for (const [n, g] of groups) {
      if (g.length < 2) continue;
      const keeper = g.find((t) => t.portal_proposal_id) ?? g[0];
      for (const t of g) {
        if (t.id === keeper.id || gone.has(t.id)) continue;
        gone.add(t.id);
        change(t, { deleted_at: "now" }, `Duplicate of proposal #${n} (#${keeper.id} ${keeper.portal_proposal_id ? "from the portal" : "older"}); sheet row moved`, "A");
        if (t.sheet_ref && !live.get(keeper.id)!.sheet_ref) change(keeper, { sheet_ref: t.sheet_ref }, "Sheet row of the kept proposal", "A");
        for (const pay of paymentsOf(p.id)) if (sheetRowOf(pay.sheet_ref) === sheetRowOf(t.sheet_ref) && same(pay.amount, t.amount) && paymentsOf(p.id).some((k) => k.id !== pay.id && same(k.amount, pay.amount) && (k.date ?? "").slice(0, 7) === (pay.date ?? "").slice(0, 7))) {
          gone.add(pay.id);
          change(pay, { deleted_at: "now" }, `Payment listed twice (sheet copy of proposal #${n})`, "A");
        }
      }
    }
  }

  // ---------------------------------------------------------------- B. the card fee
  const feeOf = (p: PortalRec) => {
    const f = p.financial ?? {};
    if (Number(f.fee ?? 0) > 0.009) return r2(Number(f.fee));
    const gap = r2(Number(p.total ?? 0) - Number(f.parts ?? 0) - Number(f.labor ?? 0) - Number(f.tax ?? 0));
    return gap > 0.009 && gap < Number(p.total ?? 0) * 0.1 ? gap : 0;
  };
  const requestsOf = (p: PortalRec) => [...(p.payment_requests ?? []), ...Object.values(p.change_order_details ?? {}).flatMap((c) => c.paymentRequests ?? [])];
  /** The proposal (or change order) transaction a payment belongs to. */
  const allocation = new Map<number, number>();
  for (const p of d.projects) {
    const pays = paymentsOf(p.id);
    for (const t of proposalsOf(p.id)) {
      if (superseded.has(t.id) || !t.portal_proposal_id || t.is_change_order) continue;
      const pr = portalById.get(t.portal_proposal_id);
      if (!pr) continue;
      const fee = feeOf(pr);
      if (!fee) continue;
      const cur = live.get(t.id)!;
      if (!same(cur.amount, pr.total)) {
        note(p.id, "B", `#${pr.number}: fee ${fee} found but the CRM amount ${cur.amount} differs from the portal total ${pr.total}: left as is`);
        continue;
      }
      change(t, { amount: r2(Number(pr.total) - fee) }, `#${pr.number}: Proposal Total ${pr.total} includes a card fee of ${fee} (portal: parts ${pr.financial?.parts} + labor ${pr.financial?.labor} + tax ${pr.financial?.tax})`, "B");
      // Where the fee goes: a change order whose paid request is its total − fee carried it; else the card payment of this proposal.
      let carried = false;
      for (const co of proposalsOf(p.id).filter((c) => c.parent_transaction_id === t.id || (c.is_change_order && c.portal_proposal_id === t.portal_proposal_id))) {
        const det = co.portal_change_order_id ? pr.change_order_details?.[String(co.portal_change_order_id)] : null;
        const coTotal = det?.financialSummary?.changeOrderTotal ?? co.amount;
        const req = (det?.paymentRequests ?? []).find((q) => q.status === "Paid" && same(q.amount, r2(Number(coTotal) - fee)));
        if (!req) continue;
        change(co, { amount: req.amount }, `Change order ${co.portal_number}: the portal total ${coTotal} includes the fee ${fee}; the paid request is ${req.amount} (CHECK with Luana: the API shows the CO at ${coTotal})`, "B");
        const pay = pays.find((x) => sheetRowOf(x.sheet_ref) === sheetRowOf(co.sheet_ref) && same(x.amount, coTotal)) ?? pays.find((x) => x.portal_request_id === req.id);
        if (pay) {
          change(pay, { amount: req.amount, cc_fee: fee }, `Payment of ${co.portal_number}: ${coTotal} = ${req.amount} + card fee ${fee}`, "B");
          carried = true;
        }
      }
      if (!carried) {
        const reqIds = new Set(requestsOf(pr).map((q) => q.id));
        const pay = pays.find((x) => x.portal_request_id && reqIds.has(x.portal_request_id) && /card/i.test(x.method ?? "")) ?? pays.find((x) => x.portal_request_id && reqIds.has(x.portal_request_id)) ?? pays.filter((x) => sheetRowOf(x.sheet_ref) === sheetRowOf(cur.sheet_ref)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
        if (pay) change(pay, { cc_fee: fee }, `Card fee of #${pr.number} on the payment that carried it`, "B");
        else note(p.id, "B", `#${pr.number}: fee ${fee} but no payment yet to put it on (goes on the first one)`);
      }
    }
  }

  // ---------------------------------------------------------------- C1. sheet cells with several values
  for (const sp of d.splits) {
    const row = d.sheet.find((s) => normNumber(s.number) === normNumber(sp.number) && fold(s.title) === fold(sp.title));
    if (!row) {
      note(null, "C", `Sheet line ${sp.number ?? ""} "${sp.title}" (${sp.customer}) with ${sp.parts.join(" + ")} in ${sp.month}: row not found in the import`);
      continue;
    }
    if (!row.project_id) {
      note(null, "C", `Sheet line ${sp.number ?? ""} "${sp.title}": ${sp.parts.join(" + ")} in ${sp.month}, row not linked to a project yet (split when it is)`);
      continue;
    }
    const pay = paymentsOf(row.project_id).find((t) => t.sheet_ref === `${row.id}:${sp.month}`);
    if (!pay || !same(pay.amount, sp.result)) {
      note(row.project_id, "C", `${sp.number ?? ""} ${sp.month}: payment ${sp.result} (= ${sp.parts.join(" + ")}) not found as one payment: left as is`);
      continue;
    }
    change(pay, { amount: sp.parts[0] }, `Sheet cell ${sp.month} = ${sp.parts.join(" + ")}: one payment per value`, "C");
    sp.parts.slice(1).forEach((amt, i) => plan.creates.push({ project_id: row.project_id!, row: { type: "Payment", payment_type: "Apply to Project", project_id: row.project_id, amount: amt, date: pay.date, description: pay.description, sheet_ref: `${row.id}:${sp.month}#${i + 2}`, portal_number: pay.portal_number, allocate_like: pay.id }, why: `Sheet cell ${sp.month} = ${sp.parts.join(" + ")}`, rule: "C" }));
  }

  // ---------------------------------------------------------------- C2. allocation: every payment belongs to one proposal
  for (const p of d.projects) {
    const props = proposalsOf(p.id).filter((t) => !superseded.has(t.id));
    const keeperOf = (id: number) => superseded.get(id) ?? id;
    for (const pay of paymentsOf(p.id)) {
      let target: Tx | undefined;
      const row = sheetRowOf(pay.sheet_ref);
      if (row != null) target = proposalsOf(p.id).find((t) => sheetRowOf(live.get(t.id)!.sheet_ref) === row) ?? proposalsOf(p.id).find((t) => sheetRowOf(t.sheet_ref) === row);
      if (!target && pay.portal_request_id) {
        for (const t of props) {
          const pr = t.portal_proposal_id ? portalById.get(t.portal_proposal_id) : null;
          if (!pr) continue;
          if (t.is_change_order && t.portal_change_order_id) {
            if ((pr.change_order_details?.[String(t.portal_change_order_id)]?.paymentRequests ?? []).some((q) => q.id === pay.portal_request_id)) target = t;
          } else if ((pr.payment_requests ?? []).some((q) => q.id === pay.portal_request_id)) target = t;
          if (target) break;
        }
      }
      if (!target && pay.portal_number) target = props.find((t) => normNumber(t.portal_number) === normNumber(pay.portal_number));
      if (!target && props.length === 1) target = props[0];
      if (target) {
        const id = keeperOf(target.id);
        allocation.set(pay.id, id);
        change(pay, { proposal_transaction_id: id }, `Payment of proposal ${live.get(id)!.portal_number ?? `#${id}`}`, "C");
      } else note(p.id, "C", `Payment #${pay.id} ${pay.amount} ${pay.date}: cannot tell which proposal it pays (${props.length} proposals): for Luana`);
    }
  }

  // ---------------------------------------------------------------- C3. dates
  for (const p of d.projects) {
    for (const pay of paymentsOf(p.id)) {
      if (!pay.portal_request_id) continue;
      const req = d.portal.flatMap(requestsOf).find((q) => q.id === pay.portal_request_id);
      if (!req?.dueDate || req.status !== "Paid") continue;
      const day = req.dueDate.slice(0, 10);
      if (pay.date && pay.date <= day && pay.sheet_ref) continue; // the sheet already dated it earlier
      if (pay.date !== day) change(pay, { date: day, date_estimated: true }, `Portal request ${req.id}: due/processed ${day} (the CRM had the sync day)`, "C");
    }
    // The sheet's dates: proposal = column B; an earlier first payment moves it; a same-month payment takes the proposal's date.
    for (const t of proposalsOf(p.id)) {
      const row = sheetRowOf(live.get(t.id)!.sheet_ref);
      const s = row != null ? sheetById.get(row) : null;
      if (!s?.date) continue;
      const pays = paymentsOf(p.id).filter((x) => sheetRowOf(x.sheet_ref) === row).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      let proposalDate = s.date;
      const first = pays[0];
      if (first?.date && first.date.slice(0, 7) < s.date.slice(0, 7) && !/^\d{4}-12-31$/.test(first.date)) {
        proposalDate = first.date;
        change(t, { date: proposalDate }, `Sheet: first payment (${first.date}) came before the acceptance date ${s.date}`, "C");
      } else if (live.get(t.id)!.date !== s.date) change(t, { date: s.date }, "Sheet column B (acceptance date)", "C");
      for (const pay of pays) if (pay.date && pay.date.slice(0, 7) === proposalDate.slice(0, 7) && pay.date !== proposalDate && !live.get(pay.id)!.portal_request_id) change(pay, { date: proposalDate }, "Paid in the month of the proposal: takes the proposal's date, not the 1st", "C");
    }
  }

  // ---------------------------------------------------------------- numbering per proposal (for the report)
  {
    const groups = new Map<number, Tx[]>();
    for (const [payId, propId] of allocation) {
      const pay = live.get(payId)!;
      if (gone.has(payId)) continue;
      groups.set(propId, [...(groups.get(propId) ?? []), pay]);
    }
    for (const [propId, pays] of groups) {
      pays.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id - b.id);
      pays.forEach((pay, i) => plan.numbering.set(pay.id, `${ordinal(i + 1)} of ${live.get(propId)!.portal_number ?? `#${propId}`}`));
    }
  }

  // ---------------------------------------------------------------- D. partner from the sheet
  const orgByName = new Map(d.organizations.map((o) => [fold(o.title), o]));
  const contactByName = new Map(d.contacts.map((c) => [fold(c.title), c]));
  const sheetByProject = Map.groupBy(d.sheet.filter((s) => s.project_id), (s) => s.project_id!);
  for (const p of d.projects) {
    const rows = sheetByProject.get(p.id) ?? [];
    const designers = [...new Set(rows.map((s) => (s.designer ?? "").trim()).filter(Boolean))];
    if (!designers.length) continue;
    const hasPartner = p.design_firm_id || p.builder_developer_id || p.general_contractor_id || p.referral_contact_id || p.referral_organization_id;
    const wantsCommission = rows.some((s) => s.commission);
    if (designers.length > 1) {
      note(p.id, "D", `Sheet names several partners: ${designers.join(" / ")}: decide by hand`);
      continue;
    }
    const name = designers[0];
    const lookFor = PARTNER_ALIASES[name] ?? name;
    let org = orgByName.get(fold(lookFor)) ?? [...orgByName.values()].find((o) => fold(o.title).startsWith(fold(lookFor)) || fold(lookFor).startsWith(fold(o.title))) ?? null;
    let contact = org ? null : (contactByName.get(fold(lookFor)) ?? null);
    const create = !org && !contact ? PARTNER_CREATES[name] : undefined;
    if (create) {
      // Created by the apply step; the project change carries "new:<name>" until the row exists.
      let pc = plan.partnerCreates.find((c) => c.key === name);
      if (!pc) plan.partnerCreates.push((pc = { key: name, table: create.table, row: create.row, projects: [] }));
      pc.projects.push(p.id);
      const placeholder = { id: `new:${name}` as unknown as number, title: String(create.row.title), type: (create.row.type as string | null) ?? null };
      if (create.table === "organizations") org = placeholder;
      else contact = placeholder;
    }
    if (!org && !contact) {
      note(p.id, "D", `Partner "${name}" is neither an organization nor a contact: create it, then link`);
      continue;
    }
    const set: Record<string, unknown> = {};
    const beforeP: Record<string, unknown> = {};
    if (!hasPartner) {
      if (org) set[org.type === "Design Firm" ? "design_firm_id" : org.type === "General Contractor" ? "general_contractor_id" : org.type === "Developer Builder" ? "builder_developer_id" : "referral_organization_id"] = org.id;
      else set.referral_contact_id = contact!.id;
    }
    if (wantsCommission && !p.commission_contact_id && !p.commission_organization_id) {
      if (org) set.commission_organization_id = org.id;
      else set.commission_contact_id = contact!.id;
    }
    for (const k of Object.keys(set)) beforeP[k] = (p as unknown as Record<string, unknown>)[k];
    const target = org ? `organization ${org.title}` : `contact ${contact!.title}`;
    if (Object.keys(set).length) plan.changes.push({ project_id: p.id, table: "projects", id: p.id, set, before: beforeP, why: `Sheet Indicator/Designer "${name}"${wantsCommission ? " with commission (Y)" : ""} → ${create ? `NEW ${target}` : target}`, rule: "D" });
  }

  // ---------------------------------------------------------------- lists for Luana
  for (const s of d.sheet) if (s.change_order && !s.transaction_id) note(s.project_id, "L-co", `Sheet change order ${s.number} "${s.title}" ${s.amount} (${s.customer}) is not in the CRM${s.project_id ? "" : " and its row has no project yet"}`);
  for (const pr of d.portal) {
    if (!pr.project_id || !pr.transaction_id) continue;
    const t = live.get(pr.transaction_id);
    if (!t || gone.has(t.id) || superseded.has(t.id)) continue;
    const structured = (pr.schedule?.payments ?? []).length;
    const reqs = (pr.payment_requests ?? []).filter((q) => !["Draft", "Cancelled", "Refunded"].includes(q.status ?? ""));
    const tot = totalsOf(pr.project_id);
    if (!structured && !reqs.length && tot.balance > 1) note(pr.project_id, "L-schedule", `#${pr.number} "${pr.name}": no payment schedule and no payment request (balance ${tot.balance}): Define the schedule`);
    else if (structured) note(pr.project_id, "L-schedule-ok", `#${pr.number}: structured schedule ${(pr.schedule!.payments ?? []).map((x) => `${x.calculation ?? ""} ${x.amount ?? ""} (${x.due?.milestone ?? ""})`).join("; ")}`);
    for (const co of pr.change_orders ?? []) {
      const total = pr.change_order_details?.[String(co.id)]?.financialSummary?.changeOrderTotal ?? co.total?.changeOrderTotal ?? null;
      if (["Accepted", "Completed"].includes(co.status ?? "") && total != null && total < 0) note(pr.project_id, "L-credit", `#${pr.number} change order #${co.number} accepted with a negative total ${total}: Credit to decide`);
    }
    const its = d.items.filter((i) => i.transaction_id === t.id);
    const noCost = its.filter((i) => (i.item_type === "Part" || i.item_type === "CustomItem") && (!i.cost || Number(i.cost) <= 0.1));
    if (noCost.length) note(pr.project_id, "L-cost", `#${pr.number}: ${noCost.length} of ${its.length} items without cost (Parts ${t.parts_cost})`);
  }
  for (const p of d.projects) {
    const sheetOnly = proposalsOf(p.id).filter((t) => !t.portal_proposal_id && !superseded.has(t.id));
    if (sheetOnly.length) note(p.id, "L-nocost", `${sheetOnly.length} proposals from the sheet only (no Parts: show "no cost", not 100% profit)`);
  }

  // ---------------------------------------------------------------- totals after
  for (const p of d.projects) plan.totals.set(p.id, { before: before.get(p.id)!, after: totalsOf(p.id) });
  return plan;
}
