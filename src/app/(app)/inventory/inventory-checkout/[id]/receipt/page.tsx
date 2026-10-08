import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";
import { PrintButton } from "@/components/inventory/print-button";

// INV-d: the printable hand-over receipt of an Inventory Checkout ("Comprovante de saída de
// equipamentos"): number, date, technician, client, one line per unit, signature lines.

export async function generateMetadata(props: PageProps<"/inventory/inventory-checkout/[id]/receipt">) {
  const { id } = await props.params;
  return { title: `${(await getT())("Hand-over receipt")} ${String(id).padStart(4, "0")}` };
}

export default async function ReceiptPage(props: PageProps<"/inventory/inventory-checkout/[id]/receipt">) {
  const user = await requireUser();
  const t = getTable("inventory_checkouts");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const { id } = await props.params;
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db.from(t.name).select("id, type, date, equipment, project_id, technician_id").eq("id", Number(id)).is("deleted_at", null).maybeSingle();
  const c = data as { id: number; type: string | null; date: string | null; equipment: string | null; project_id: number | null; technician_id: number | null } | null;
  if (!c) notFound();
  const [{ data: p }, { data: e }] = await Promise.all([
    c.project_id ? db.from("projects").select("title").eq("id", c.project_id).maybeSingle() : Promise.resolve({ data: null }),
    c.technician_id ? db.from("employee_names").select("title").eq("id", c.technician_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const project = (p as { title: string | null } | null)?.title ?? null;
  const technician = (e as { title: string | null } | null)?.title ?? null;
  const lines = (c.equipment ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const units = lines.filter((l) => /^\d{2} - /.test(l));
  const notes = lines.filter((l) => !/^\d{2} - /.test(l));
  const n = String(c.id).padStart(4, "0");

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <PrintButton />
        <Link href={recordHref(t, c.id)} className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm">
          {tr("Open the Inventory Checkout")}
        </Link>
        <Link href="/inventory/stock?tab=handover" className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm">
          {tr("Back to Stock")}
        </Link>
      </div>
      <article className="rounded-2xl border bg-white px-6 py-6 text-[#16202b] shadow-card print:rounded-none print:border-0 print:shadow-none">
        <header className="mb-4 border-b-[3px] border-[#16324f] pb-3 text-center">
          <p className="text-lg font-extrabold text-[#16324f]">{tr("EQUIPMENT HAND-OVER RECEIPT")}</p>
          <p className="text-[11px] text-[#5a6a7a]">{tr("Tech Squad · Warehouse operations · this document goes with the technician to the site")}</p>
        </header>
        <dl className="mb-4 grid grid-cols-1 gap-x-5 gap-y-1 text-[13px] sm:grid-cols-2">
          {[
            [tr("Receipt no."), n],
            [tr("Date"), c.date ? formatDate(c.date) : "—"],
            [tr("Technician"), technician ?? "—"],
            [tr("Client / site"), project ?? "—"],
            [tr("Type"), c.type ? tr(c.type) : "—"],
            [tr("Units"), String(units.length)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-[#e5e9ee] py-1.5">
              <dt className="text-[#5a6a7a]">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#16324f] text-left text-white">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">{tr("Serial")}</th>
              <th className="px-2 py-1.5">{tr("Description")}</th>
            </tr>
          </thead>
          <tbody>
            {units.map((l, i) => {
              const m = l.match(/^\d{2} - (.*?)(?: – S\/N (.*?))?(?: – MAC (.*?))?$/);
              return (
                <tr key={i} className="odd:bg-white even:bg-[#f4f7fb]">
                  <td className="border-b border-[#e5e9ee] px-2 py-1.5">{i + 1}</td>
                  <td className="border-b border-[#e5e9ee] px-2 py-1.5 font-mono">{m?.[2] ?? "—"}</td>
                  <td className="border-b border-[#e5e9ee] px-2 py-1.5">
                    {m?.[1] ?? l}
                    {m?.[3] ? ` · MAC ${m[3]}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-right font-bold text-[#16324f]">{tr("Total units: {n}", { n: units.length })}</p>
        {notes.length > 0 && (
          <div className="mt-4 text-[12.5px]">
            <p className="mb-1 font-semibold text-[#5a6a7a]">{tr("Notes")}</p>
            <div className="min-h-[34px] rounded-lg border border-[#e5e9ee] px-3 py-2 whitespace-pre-line">{notes.join("\n")}</div>
          </div>
        )}
        <div className="mt-10">
          <div className="border-t border-[#16202b] pt-1.5 text-[11.5px] text-[#5a6a7a]">{tr("Signature of the technician who took the equipment")}</div>
          <div className="mt-8 grid grid-cols-2 gap-8">
            <div className="border-t border-[#16202b] pt-1.5 text-[11.5px] text-[#5a6a7a]">{tr("Name")}</div>
            <div className="border-t border-[#16202b] pt-1.5 text-[11.5px] text-[#5a6a7a]">{tr("Date")}</div>
          </div>
        </div>
      </article>
    </div>
  );
}
