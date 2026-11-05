import type { EntryKind, Place } from "@/lib/time-clock/clock";
import type { DayOff } from "@/lib/time-clock/person-sheet";
import type { ShiftFlag } from "@/lib/time-clock/timesheet";

// TS-b Person panel: what the server page hands each day row (plain data, so the row can be a client component).

export type Loc = { place: Place; lat: number | null; lng: number | null; distance: string };

export type ShiftView = {
  inId: number;
  outId: number | null;
  day: string;
  minutes: number;
  flags: ShiftFlag[];
  needsReview: boolean;
  /** Clock-in time, "HH:MM" Eastern. */
  start: string;
  /** Real clock-out time, "HH:MM", or null when there is none (open, never closed, or only suggested). */
  end: string | null;
  endNextDay: boolean;
  /** TS-a: the time the system suggested for a forgotten clock-out. */
  suggestedEnd: string | null;
  startLoc: Loc;
  endLoc: Loc | null;
  startCorrectedFrom: string | null;
  endCorrectedFrom: string | null;
  /** Notes recorded on the two entries (who added or corrected them, and why). */
  notes: string[];
  projectId: number | null;
  projectTitle: string | null;
  managerNote: string | null;
  /** TC-h approved week, or TC-f approved pay period (an administrator may still change it, with a reason). */
  /** "approved" = the timesheet is approved (TS-c, read-only); "period" = in a locked pay period (TC-f, administrators only). */
  lock: "approved" | "period" | null;
  /** Still clocked in right now. */
  openNow: boolean;
};

export type EventView = { id: number; kind: EntryKind; time: string; project: string | null; loc: Loc };

export type DayView = {
  date: string;
  /** "Mon" */
  dow: string;
  /** "11/3" */
  label: string;
  minutes: number;
  shifts: ShiftView[];
  timeOff: DayOff | null;
  events: EventView[];
  /** TS-c: the period is approved → read-only. */
  locked: boolean;
  isToday: boolean;
  isFuture: boolean;
};
