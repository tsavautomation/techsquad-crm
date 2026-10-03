"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { savePermissionsAction } from "@/lib/admin/user-actions";
import { RECORD_COLUMNS, type ChecklistSection } from "@/lib/permissions/checklist";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type OtherPerson = { id: string; name: string; isAdmin: boolean; keys: string[] };

type Props = {
  userId: string;
  initialAdmin: boolean;
  initialKeys: string[];
  sections: ChecklistSection[];
  /** Other people, for "Copy from". */
  others: OtherPerson[];
  canEdit: boolean;
  isMe: boolean;
};

const CELL = "flex min-h-11 items-center justify-center";

/** What one person may do (SPEC §9.1 P1): an Administrator switch, then the checklist. Saved together. */
export function PermissionChecklist({ userId, initialAdmin, initialKeys, sections, others, canEdit, isMe }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [isAdmin, setAdmin] = useState(initialAdmin);
  const [on, setOn] = useState(() => new Set(initialKeys));
  const [copyFrom, setCopyFrom] = useState("");
  const initial = useMemo(() => new Set(initialKeys), [initialKeys]);
  const changed = isAdmin !== initialAdmin || on.size !== initial.size || [...on].some((k) => !initial.has(k));
  const disabled = !canEdit || isAdmin;

  const toggle = (keys: string[], value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      for (const k of keys) if (value) next.add(k);
      else next.delete(k);
      return next;
    });

  const copy = (id: string) => {
    setCopyFrom(id);
    const o = others.find((x) => x.id === id);
    if (!o) return;
    setAdmin(o.isAdmin);
    setOn(new Set(o.keys));
  };

  const save = () =>
    start(async () => {
      const r = await savePermissionsAction(userId, { isAdmin, keys: [...on] });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved"));
      router.refresh();
    });

  return (
    <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="text-[15px] font-semibold tracking-tight">{t("What this person may do")}</h2>
      {!canEdit && <p className="mt-1 text-xs text-muted-foreground">{t("Only an administrator can change this.")}</p>}

      <label className={cn("mt-3 flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2", isAdmin && "border-primary bg-primary/5")}>
        <input type="checkbox" className="size-5" checked={isAdmin} disabled={!canEdit || isMe} onChange={(e) => setAdmin(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium">{t("Administrator")}</span>
          <span className="block text-xs text-text-2">{t("Can do everything, including changing what others may do.")}</span>
        </span>
      </label>

      {canEdit && others.length > 0 && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-text-2">{t("Copy from")}</span>
          <select value={copyFrom} onChange={(e) => copy(e.target.value)} className="h-11 min-w-0 flex-1 rounded-[10px] border bg-card px-3 text-base">
            <option value="">{t("another person…")}</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.isAdmin ? ` · ${t("Administrator")}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={cn("mt-3", isAdmin && "pointer-events-none opacity-50")}>
        {sections.map((s) =>
          s.kind === "grid" ? (
            <div key={s.id} className="mt-4">
              <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t(s.title)}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-32 bg-card text-left font-normal text-text-2" />
                      {RECORD_COLUMNS.map(([a, label]) => (
                        <th key={a} className="px-1 pb-1 text-center text-xs font-medium text-text-2">
                          {t(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r) => {
                      const keys = r.items.map((i) => i.key);
                      const all = keys.every((k) => on.has(k));
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="sticky left-0 z-10 max-w-32 truncate border-t bg-card py-0.5 pr-2">
                            <button type="button" disabled={disabled} className="min-h-11 text-left font-medium hover:underline disabled:no-underline" onClick={() => toggle(keys, !all)} title={t("All / none")}>
                              {t(r.title)}
                            </button>
                          </td>
                          {RECORD_COLUMNS.map(([a]) => {
                            const item = r.items.find((i) => i.key.endsWith(`.${a}`));
                            return (
                              <td key={a} className="border-t">
                                {item ? (
                                  <label className={CELL}>
                                    <input type="checkbox" className="size-5" aria-label={`${t(r.title)}: ${t(item.label)}`} checked={on.has(item.key)} disabled={disabled} onChange={(e) => toggle([item.key], e.target.checked)} />
                                  </label>
                                ) : (
                                  <span className={cn(CELL, "text-muted-foreground")}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div key={s.id} className="mt-4">
              <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t(s.title)}</h3>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {s.rows.flatMap((r) =>
                  r.items.map((i) => (
                    <label key={i.key} className="flex min-h-11 items-center gap-3 text-[13px]">
                      <input type="checkbox" className="size-5 shrink-0" checked={on.has(i.key)} disabled={disabled} onChange={(e) => toggle([i.key], e.target.checked)} />
                      {t(i.label)}
                    </label>
                  )),
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {canEdit && changed && (
        <div className="sticky bottom-16 z-20 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-2xl border bg-card p-3 shadow-lg md:bottom-4">
          <button
            type="button"
            className="h-11 rounded-lg border px-4 text-sm hover:bg-muted"
            disabled={pending}
            onClick={() => {
              setAdmin(initialAdmin);
              setOn(new Set(initialKeys));
              setCopyFrom("");
            }}
          >
            {t("Undo")}
          </button>
          <button type="button" className="h-11 rounded-lg border border-foreground bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50" onClick={save} disabled={pending}>
            {t("Save permissions")}
          </button>
        </div>
      )}
    </section>
  );
}
