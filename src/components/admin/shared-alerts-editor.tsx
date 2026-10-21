"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveSharedAlertsAction } from "@/lib/requests/actions";
import { useT } from "@/i18n/client";

// F26-c: tick who gets the project request alerts (app_settings 'shared_alerts').

export function SharedAlertsEditor({ people, initial }: { people: { email: string; name: string }[]; initial: string[] }) {
  const t = useT();
  const [picked, setPicked] = useState(new Set(initial.map((e) => e.toLowerCase())));
  const [pending, start] = useTransition();
  const toggle = (email: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  const save = () =>
    start(async () => {
      const r = await saveSharedAlertsAction([...picked]);
      if (r.ok) toast.success(t("Saved"));
      else toast.error(t(r.message));
    });

  return (
    <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Who gets the project request alerts")}</h2>
      <ul className="divide-y">
        {people.map((p) => (
          <li key={p.email}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 text-sm">
              <input type="checkbox" checked={picked.has(p.email)} onChange={() => toggle(p.email)} className="size-5 accent-primary" />
              <span className="flex-1">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.email}</span>
            </label>
          </li>
        ))}
      </ul>
      {picked.size === 0 && <p className="mt-2 text-xs text-warn-fg">{t("Nobody is ticked: request alerts would ring for no one.")}</p>}
      <div className="mt-3 flex justify-end">
        <Button type="button" onClick={save} disabled={pending} className="h-11 px-5">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Save")}
        </Button>
      </div>
    </section>
  );
}
