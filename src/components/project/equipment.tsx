import Link from "next/link";
import { Boxes } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// INV-g: the equipment on a job (SPEC §9.1 INV-g, Fred 2026-10-19: "a new field … that will list all equipment
// assigned to that job"). Computed from Stock, never stored: units whose destination is this project, split into
// Installed (On Project) and Staged at the warehouse (Separated), with serial, who took it and when.

type Unit = { id: number; serial: string | null; model: string | null; status: string; received_on: string | null; updated_at: string; products: { title: string | null } | null; employees: { title: string | null } | null };

export async function ProjectEquipment({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const t = getTable("stock_items");
  if (!canOpen(user.permissions, t, getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db
    .from("stock_items")
    .select("id, serial, model, status, received_on, updated_at, products:product_id(title), employees:staff_id(title)")
    .eq("destination_project_id", projectId)
    .in("status", ["On Project", "Separated"])
    .is("deleted_at", null)
    .order("status")
    .order("model");
  const units = (data ?? []) as unknown as Unit[];
  if (!units.length) return null;
  // When each unit last moved (installed / picked): the newest ledger row per serial.
  const serials = [...new Set(units.map((u) => u.serial).filter((x): x is string => Boolean(x)))];
  const { data: moves } = serials.length ? await db.from("stock_movements").select("serial, moved_at").in("serial", serials).order("moved_at", { ascending: false }).limit(5000) : { data: [] };
  const lastMove = new Map<string, string>();
  for (const m of (moves ?? []) as { serial: string; moved_at: string }[]) if (!lastMove.has(m.serial)) lastMove.set(m.serial, m.moved_at);
  const groups = [
    { key: "On Project", title: tr("Installed on this job"), items: units.filter((u) => u.status === "On Project") },
    { key: "Separated", title: tr("Staged at the warehouse for this job"), items: units.filter((u) => u.status === "Separated") },
  ].filter((g) => g.items.length);
  return (
    <section className="order-2 mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card xl:order-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
          <Boxes className="size-4 text-primary" aria-hidden /> {tr("Equipment")}
        </h2>
        <span className="text-xs text-muted-foreground">{tr("{n} units", { n: units.length })}</span>
      </div>
      {groups.map((g) => (
        <div key={g.key} className="mb-3 last:mb-0">
          <h3 className="mb-1 text-[13px] font-semibold text-text-2">
            {g.title} · {g.items.length}
          </h3>
          <ul className="divide-y rounded-lg border text-sm">
            {g.items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5">
                <Link href={recordHref(t, u.id)} className="min-w-0 font-medium underline-offset-4 hover:underline">
                  {u.products?.title ?? u.model ?? `#${u.id}`}
                </Link>
                {u.serial && <span className="font-mono text-xs text-muted-foreground">{u.serial}</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {[u.employees?.title, formatDate((u.serial && lastMove.get(u.serial)) || u.updated_at)].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
