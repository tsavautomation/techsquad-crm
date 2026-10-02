import type { CurrentUser } from "@/lib/auth/session";
import { toDateTimeLocalET } from "@/lib/dates";
import { formatMinutes } from "@/lib/field-day/day";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { recordsDb } from "@/lib/records/data";
import { clock } from "@/lib/schedule/dates";
import { pastTime, type EntryKind } from "@/lib/time-clock/clock";
import { myClockToday } from "@/lib/time-clock/record";
import { getT } from "@/i18n/server";
import { ClockCard } from "./clock-card";

// P2: the signed-in person's time clock for today (everyone with a login whose Employee record matches).

const KIND_LABEL: Record<EntryKind, string> = { clock_in: "Clocked in", clock_out: "Clocked out", on_way: "On my way", visit_in: "Arrived at the job", visit_out: "Left the job" };
const time = (iso: string) => clock(toDateTimeLocalET(iso).slice(11));

export async function MyClock({ user, now }: { user: CurrentUser; now: number }) {
  const db = await recordsDb();
  const [mine, settings, tr] = await Promise.all([myClockToday(db, user, now), loadFieldDay(db), getT()]);
  if (!mine) return null;
  const { day } = mine;
  const localNow = toDateTimeLocalET(new Date(now).toISOString()).slice(11, 16);
  return (
    <ClockCard
      openSince={day.openSince}
      clockedMin={day.clockedMin}
      onSiteMin={day.onSiteMin}
      openSinceTime={day.openSince ? time(day.openSince) : null}
      clockedText={formatMinutes(day.clockedMin)}
      onSiteText={day.onSiteMin ? formatMinutes(day.onSiteMin) : ""}
      reminderPassed={pastTime(localNow, settings.time_clock.reminder[mine.group])}
      entries={day.entries.map((e) => ({ id: e.id, kind: e.kind, time: time(e.at), label: tr(KIND_LABEL[e.kind]), place: e.place, distance_m: e.distance_m, hasGeo: e.lat !== null }))}
    />
  );
}
