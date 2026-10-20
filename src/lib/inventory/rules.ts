import type { MovementKey, StockStatus } from "./engine";

// INV-e Stock flow (SPEC §9.1 INV-e): the pure rules of the register screens — which movement a unit
// may take from its current stage, what each movement needs, duplicate serials in a batch, and the
// product search. No database here: tests/inv-e-stock-rules.test.ts.

/** The stages a movement may start from (a unit never seen before has stage null). */
export const ALLOWED_FROM: Record<MovementKey, (StockStatus | null)[]> = {
  receive: [null, "Discarded"],
  pick: ["In Stock", "Separated"],
  install: ["In Stock", "Separated", "On Project"],
  return: ["Separated", "On Project"],
  rma_out: ["In Stock", "Separated", "On Project"],
  rma_back: ["RMA"],
  discard: [null, "In Stock", "Separated", "On Project", "RMA"],
};

export const canMove = (key: MovementKey, prev: StockStatus | null) => ALLOWED_FROM[key].includes(prev);

export type MovementNeeds = { projectId: number | null; staffId: number | null; location: string | null; note: string; /** The project the unit is on now (On Project), to refuse installing it there twice. */ fromProjectId?: number | null };

/** Why a movement cannot be saved, or null when it can (Fred 2026-10-13: Picked recommends a project but does not require it). */
export function validateMovement(key: MovementKey, prev: StockStatus | null, n: MovementNeeds): string | null {
  if (!canMove(key, prev)) {
    if (prev === "Discarded" && key !== "receive") return "A discarded unit can only be received into stock again.";
    if (key === "rma_back") return "Only a unit sent for repair (RMA) can come back from repair.";
    if (key === "return") return "Only a unit that is Separated or On Project can be returned to stock.";
    if (key === "receive") return "This unit is already in the system: use Returned to stock or Back from repair.";
    if (key === "pick" || key === "install" || key === "rma_out") return "This movement is not possible from the unit's current stage.";
    return "This movement is not possible from the unit's current stage.";
  }
  if (key === "install" && !n.projectId) return "Installed needs the project.";
  // Jessica 2026-10-20: a second "Installed" on the same project was saved twice; moving to another project stays allowed.
  if (key === "install" && prev === "On Project" && n.fromProjectId != null && n.fromProjectId === n.projectId) return "This unit is already installed on this project.";
  if (key === "pick" && !n.staffId) return "Picked at the warehouse needs the responsible person.";
  if ((key === "return" || key === "rma_back" || key === "receive") && !(n.location ?? "").trim()) return "Choose the location the unit goes to.";
  if (key === "rma_out" && !n.note.trim()) return "Sent for repair needs a note with the reason.";
  return null;
}

export type SerialCheck = { serial: string; problem: "exists" | "repeated" | null };

/** A batch of serials, in order: the ones the CRM already has, and the ones typed twice. */
export function checkSerials(serials: string[], existing: Set<string>): SerialCheck[] {
  const seen = new Set<string>();
  return serials
    .map((s) => s.trim())
    .filter(Boolean)
    .map((serial) => {
      const key = serial.toLowerCase();
      const problem: SerialCheck["problem"] = existing.has(key) ? "exists" : seen.has(key) ? "repeated" : null;
      seen.add(key);
      return { serial, problem };
    });
}

export type ProductChoice = { id: number; title: string; model: string | null; brand: string | null; sku: string | null; description: string | null };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Every word typed must appear somewhere in name, brand, model, SKU / UPC or description. */
export function productMatches(p: ProductChoice, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [p.title, p.model, p.brand, p.sku, p.description].map(norm).join(" ");
  return words.every((w) => hay.includes(w));
}
