import { Eye } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { recordsDb, userNames } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { getT } from "@/i18n/server";

// F30: "Who looked" — the last people who revealed or copied this record's secrets (Fred 2026-10-22: "é bom").

export async function RevealLog({ table, id, user }: { table: string; id: number; user: CurrentUser }) {
  const t = getTable(table);
  if (!canDo(user.permissions, t, "modify", getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db.from("sensitive_reveals").select("id, field, action, user_id, at").eq("table_name", table).eq("record_id", id).order("at", { ascending: false }).limit(20);
  const rows = (data ?? []) as { id: number; field: string; action: string; user_id: string; at: string }[];
  const names = await userNames(rows.map((r) => ({ user_id: r.user_id })), ["user_id"]);
  const label = (f: string) => t.fields.find((x) => x.name === f)?.label ?? f;
  return (
    <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Eye className="size-4" aria-hidden /> {tr("Who looked")}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("Nobody has shown or copied a secret of this login yet.")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
              <span>
                {names.get(r.user_id) ?? tr("Someone")} · {r.action === "copy" ? tr("copied {field}", { field: tr(label(r.field)) }) : tr("showed {field}", { field: tr(label(r.field)) })}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
