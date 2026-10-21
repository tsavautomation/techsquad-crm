"use client";

import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { PUSH_EVENTS } from "@/lib/push/engine";
import { setPushEventsAction } from "@/lib/push/actions";

/** F27: which push notifications this login receives (administrators, Admin › Users). */
export function PushEventsForm({ userId, initial, canEdit }: { userId: string; initial: string[]; canEdit: boolean }) {
  const t = useT();
  const [events, setEvents] = useState<string[]>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (kind: string) => {
    const next = events.includes(kind) ? events.filter((k) => k !== kind) : [...events, kind];
    setEvents(next);
    start(async () => {
      const r = await setPushEventsAction(userId, next);
      setMsg(r.ok ? t("Saved.") : r.message);
    });
  };
  return (
    <div>
      {PUSH_EVENTS.map((e) => (
        <label key={e.kind} className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={events.includes(e.kind)} disabled={!canEdit || pending} onChange={() => toggle(e.kind)} />
          {t(e.label)}
        </label>
      ))}
      <p className="mt-1 text-xs text-muted-foreground">{t("The person then turns notifications on under their profile icon, on each phone or computer.")}</p>
      {msg && <p className="mt-1 text-xs">{msg}</p>}
    </div>
  );
}
