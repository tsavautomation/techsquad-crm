// Browser side of OneDrive uploads (resumable upload session). The file goes straight from the phone
// to OneDrive in 5 MB pieces. If the connection drops, a call comes in or Safari goes to the background,
// it waits, asks OneDrive which bytes it already has, and carries on from there.
// Unfinished sessions are remembered per file (name + size + date), so picking the same file again resumes.

const CHUNK = 320 * 1024 * 16; // 5 MiB; OneDrive wants multiples of 320 KiB
const KEY = "od-sessions";

export type Progress = { sent: number; total: number; state: "sending" | "paused" | "done" };
type Session = { path: string; uploadUrl: string; savedAt: number };

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

function sessions(): Record<string, Session> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Session>;
  } catch {
    return {};
  }
}
function store(all: Record<string, Session>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: resuming after a reload just won't be possible */
  }
}
export function rememberSession(file: File, s: { path: string; uploadUrl: string }) {
  store({ ...sessions(), [fileKey(file)]: { ...s, savedAt: Date.now() } });
}
export function forgetSession(file: File) {
  const all = sessions();
  delete all[fileKey(file)];
  store(all);
}
/** An unfinished upload of this same file from earlier (sessions last a few days; we keep 2). */
export function savedSession(file: File): { path: string; uploadUrl: string } | null {
  const s = sessions()[fileKey(file)];
  return s && Date.now() - s.savedAt < 2 * 86_400_000 ? s : null;
}

/** Resolves when the page is visible and online again. */
function backAgain(): Promise<void> {
  if (typeof document === "undefined" || (document.visibilityState === "visible" && navigator.onLine)) return new Promise((r) => setTimeout(r, 2000));
  return new Promise((resolve) => {
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        document.removeEventListener("visibilitychange", check);
        window.removeEventListener("online", check);
        setTimeout(resolve, 800);
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
  });
}

/** Where OneDrive wants the next byte (null = the session is gone, start a new one). */
async function nextOffset(uploadUrl: string): Promise<number | null> {
  const res = await fetch(uploadUrl);
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => ({}))) as { nextExpectedRanges?: string[] };
  const first = body.nextExpectedRanges?.[0];
  return first ? Number(first.split("-")[0]) : 0;
}

export class SessionExpired extends Error {}

/**
 * Send `file` to an upload session. Resolves with the OneDrive item id when the whole file is there.
 * Network errors and interruptions pause and resume; only an expired session throws.
 */
export async function sendToOneDrive(file: File, uploadUrl: string, onProgress: (p: Progress) => void, resume = false, wait: () => Promise<void> = backAgain): Promise<string> {
  let offset = resume ? ((await nextOffset(uploadUrl).catch(() => 0)) ?? -1) : 0;
  if (offset < 0) throw new SessionExpired();
  let failures = 0;
  while (true) {
    const end = Math.min(file.size, offset + CHUNK);
    onProgress({ sent: offset, total: file.size, state: "sending" });
    try {
      const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` }, body: file.slice(offset, end) });
      if (res.status === 200 || res.status === 201) {
        const item = (await res.json()) as { id: string };
        onProgress({ sent: file.size, total: file.size, state: "done" });
        return item.id;
      }
      if (res.status === 202) {
        const body = (await res.json().catch(() => ({}))) as { nextExpectedRanges?: string[] };
        offset = body.nextExpectedRanges?.[0] ? Number(body.nextExpectedRanges[0].split("-")[0]) : end;
        failures = 0;
        continue;
      }
      if (res.status === 404) throw new SessionExpired();
      throw new Error(`OneDrive answered ${res.status}`);
    } catch (e) {
      if (e instanceof SessionExpired) throw e;
      // Interrupted (call, lock screen, no signal): wait until we're back, then ask where to continue.
      failures++;
      onProgress({ sent: offset, total: file.size, state: "paused" });
      await wait();
      if (failures > 3) await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * failures)));
      const next = await nextOffset(uploadUrl).catch(() => offset);
      if (next === null) throw new SessionExpired();
      offset = next;
    }
  }
}

// ---------------------------------------------------------------- uploads in progress (for the Save button)

let active = 0;
const listeners = new Set<() => void>();
let wake: { release: () => Promise<void> } | null = null;

async function keepAwake(on: boolean) {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (on && !wake && nav.wakeLock) wake = await nav.wakeLock.request("screen");
    if (!on && wake) {
      await wake.release();
      wake = null;
    }
  } catch {
    /* not supported or not allowed: uploads still resume after the screen locks */
  }
}

export function uploadStarted() {
  active++;
  listeners.forEach((l) => l());
  void keepAwake(true); // a sleeping screen pauses uploads on iPhone
}
export function uploadEnded() {
  active = Math.max(0, active - 1);
  listeners.forEach((l) => l());
  if (!active) void keepAwake(false);
}
export const uploadsInProgress = () => active;
export function onUploadsChange(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
