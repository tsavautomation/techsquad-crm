"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveGroupPermissionsAction } from "@/lib/admin/permission-actions";

export type Perm = { key: string; module: string; area: string; kind: string; label: string; description: string; used: boolean };

const MODULE_TITLES: Record<string, string> = {
  projects: "Projects",
  administrative: "Administrative",
  inventory: "Inventory",
  "help-desk": "Help Desk",
  forms: "Forms",
  files: "Files",
  site: "Site / Admin",
};

type Props = {
  groupId: number;
  groupName: string;
  perms: Perm[];
  granted: string[];
  /** Keys the Everyone group already grants (everybody has them regardless). */
  viaEveryone: string[];
};

/** One group's permissions as checkboxes, by module and area. Changes are saved together. */
export function PermissionMatrix({ groupId, groupName, perms, granted, viaEveryone }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = useMemo(() => new Set(granted), [granted]);
  const everyone = useMemo(() => new Set(viaEveryone), [viaEveryone]);
  const [on, setOn] = useState(() => new Set(granted));
  const [search, setSearch] = useState("");
  const [showUnused, setShowUnused] = useState(false);

  const add = [...on].filter((k) => !initial.has(k));
  const remove = [...initial].filter((k) => !on.has(k));

  const term = search.trim().toLowerCase();
  const visible = perms.filter((p) => (showUnused || p.used || initial.has(p.key)) && (!term || `${p.label} ${p.area} ${p.key}`.toLowerCase().includes(term)));
  const byModule = Map.groupBy(visible, (p) => p.module);

  const toggle = (keys: string[], value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (value) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const save = () =>
    start(async () => {
      const r = await saveGroupPermissionsAction(groupId, add, remove);
      if (!r.ok) return void toast.error(r.message);
      toast.success(`Saved: ${r.added} added, ${r.removed} removed`);
      router.refresh();
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search permissions" className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base" />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
          Show WebAuthor-only permissions
        </label>
      </div>
      {!showUnused && (
        <p className="mb-4 text-sm text-muted-foreground">
          Hidden: WebAuthor permissions for features this app doesn&apos;t have (they change nothing here). Ones this group already holds stay visible, greyed.
        </p>
      )}

      {[...byModule.entries()].map(([module, list]) => (
        <section key={module} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">{MODULE_TITLES[module] ?? module}</h2>
          {[...Map.groupBy(list, (p) => p.area).entries()].map(([area, items]) => {
            const keys = items.map((p) => p.key);
            const all = keys.every((k) => on.has(k));
            return (
              <details key={area} className="mb-2 rounded-lg border" open={Boolean(term)}>
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-base">
                  <span>
                    {area} <span className="text-sm text-muted-foreground">({keys.filter((k) => on.has(k)).length}/{keys.length})</span>
                  </span>
                  <button
                    type="button"
                    className="h-9 rounded-md border px-2 text-xs hover:bg-muted"
                    onClick={(e) => {
                      e.preventDefault();
                      toggle(keys, !all);
                    }}
                  >
                    {all ? "None" : "All"}
                  </button>
                </summary>
                <ul className="border-t">
                  {items.map((p) => {
                    const changed = on.has(p.key) !== initial.has(p.key);
                    return (
                      <li key={p.key} className={p.used ? "" : "opacity-60"}>
                        <label className={`flex min-h-11 items-start gap-3 px-3 py-2 hover:bg-muted/50 ${changed ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}>
                          <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={on.has(p.key)} onChange={(e) => toggle([p.key], e.target.checked)} />
                          <span className="min-w-0">
                            <span className="block text-sm">
                              {p.label}
                              {!p.used && <span className="ml-1 text-xs text-muted-foreground">(WebAuthor only)</span>}
                              {everyone.has(p.key) && <span className="ml-1 text-xs text-muted-foreground">· everyone has this</span>}
                            </span>
                            {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>
      ))}
      {!visible.length && <p className="text-sm text-muted-foreground">No permissions match.</p>}

      {(add.length > 0 || remove.length > 0) && (
        <div className="sticky bottom-16 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3 shadow-lg md:bottom-4">
          <span className="text-sm">
            {groupName}: <strong>{add.length}</strong> to add, <strong>{remove.length}</strong> to remove
          </span>
          <span className="flex gap-2">
            <button type="button" className="h-11 rounded-lg border px-4 text-sm hover:bg-muted" onClick={() => setOn(new Set(initial))} disabled={pending}>
              Undo
            </button>
            <button type="button" className="h-11 rounded-lg border border-foreground bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50" onClick={save} disabled={pending}>
              Save changes
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
