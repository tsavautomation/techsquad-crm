"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveFieldDayAction } from "@/lib/field-day/actions";
import type { FieldDaySettings } from "@/lib/field-day/day";
import { useT } from "@/i18n/client";

// Admin › Field day (F2): one screen, one Save.

type Option = { value: string; label: string };
const BOX = "w-full rounded-lg border bg-card px-3 text-base";
const lines = (s: string) => s.split(/\r?\n/);

export function FieldDayEditor({ initial, people, reasons, services }: { initial: FieldDaySettings; people: { id: number; name: string }[]; reasons: Option[]; services: Option[] }) {
  const t = useT();
  const [s, setS] = useState<FieldDaySettings>(initial);
  const [text, setText] = useState(() => Object.fromEntries(services.map((o) => [o.value, { checklist: (initial.service_lists[o.value]?.checklist ?? []).join("\n"), tools: (initial.service_lists[o.value]?.tools ?? []).join("\n") }])));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () =>
    start(async () => {
      const service_lists = { ...s.service_lists };
      for (const [k, v] of Object.entries(text)) service_lists[k] = { checklist: lines(v.checklist), tools: lines(v.tools) };
      const r = await saveFieldDayAction({ ...s, service_lists });
      setMsg(r.ok ? { ok: true, text: t("Saved.") } : { ok: false, text: t(r.message) });
    });

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-1 font-semibold">{t("Return cards")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("When a Job Report says Partial or Not done, a task goes to this person with the missing items as its checklist.")}</p>
        <label className="block text-sm font-medium">
          {t("Who schedules returns")}
          <select className={`${BOX} mt-1 h-11`} value={s.scheduler_employee_id ?? ""} onChange={(e) => setS({ ...s, scheduler_employee_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t("Nobody (the card is only on the Tasks board)")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {s.scheduler_employee_id && !people.some((p) => p.id === s.scheduler_employee_id) && <option value={s.scheduler_employee_id}>{t("Employee #{id} (not imported yet)", { id: s.scheduler_employee_id })}</option>}
          </select>
        </label>
        <h3 className="mt-4 mb-2 text-sm font-medium">{t("Days until the card is due, by reason")}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {reasons.map((r) => (
            <label key={r.value} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-sm">
              {r.label}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={90}
                className="h-10 w-20 rounded-md border bg-card px-2 text-right text-base"
                value={s.return_days[r.value] ?? 3}
                onChange={(e) => setS({ ...s, return_days: { ...s.return_days, [r.value]: Math.max(0, Math.min(90, Number(e.target.value) || 0)) } })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-1 font-semibold">{t("Per service type")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("The checklist is added to a visit when the tech checks in; the tools show on the visit as “Bring”. One per line.")}</p>
        {services.length === 0 ? (
          <p className="text-sm">
            {t("There are no service types yet.")}{" "}
            <Link href="/admin/forms/visits" className="underline underline-offset-4">
              {t("Add them in Form settings › Visits › Service type.")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {services.map((o) => (
              <fieldset key={o.value} className="rounded-xl border p-3">
                <legend className="px-1 text-sm font-semibold">{o.label}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["checklist", "tools"] as const).map((k) => (
                    <label key={k} className="block text-sm">
                      {k === "checklist" ? t("Checklist") : t("Tools to bring")}
                      <textarea
                        rows={5}
                        className={`${BOX} mt-1 py-2`}
                        value={text[o.value]?.[k] ?? ""}
                        onChange={(e) => setText({ ...text, [o.value]: { ...{ checklist: "", tools: "" }, ...text[o.value], [k]: e.target.value } })}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:border-0 md:p-0">
        <Button type="button" className="h-11 flex-1 md:flex-none md:px-8" onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Save")}
        </Button>
        {msg && (
          <p role="status" className={msg.ok ? "text-sm text-ok-fg" : "text-sm text-destructive"}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
