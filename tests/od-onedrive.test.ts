// OneDrive uploads (Fred 2026-09-30): resumable pieces survive interruptions; names are OneDrive-safe.
import { afterEach, describe, expect, it, vi } from "vitest";
import { isOneDrivePath, isPendingOneDrive, OD_UPLOAD, oneDriveId, pathOf, safeName, uploadIdOf } from "@/lib/files/paths";
import { sendToOneDrive, SessionExpired } from "@/lib/files/resumable";

const MB = 1024 * 1024;
const file = (size: number) => new File([new Uint8Array(size)], "video.mov", { type: "video/quicktime" });

/** A fake OneDrive upload session: accepts pieces, can drop the connection, reports nextExpectedRanges. */
function fakeSession(total: number, { dropAt }: { dropAt?: number } = {}) {
  let received = 0;
  let dropped = false;
  const puts: string[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method !== "PUT") return new Response(JSON.stringify({ nextExpectedRanges: [`${received}-`] }), { status: 200 });
    const range = (init.headers as Record<string, string>)["Content-Range"];
    puts.push(range);
    const [, from, to] = range.match(/bytes (\d+)-(\d+)\//)!.map(Number);
    if (dropAt !== undefined && !dropped && from >= dropAt) {
      dropped = true;
      throw new TypeError("Load failed"); // what Safari reports when a call interrupts
    }
    if (from !== received) return new Response("{}", { status: 416 });
    received = to + 1;
    if (received >= total) return new Response(JSON.stringify({ id: "ITEM123" }), { status: 201 });
    return new Response(JSON.stringify({ nextExpectedRanges: [`${received}-`] }), { status: 202 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { puts, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("resumable OneDrive upload", () => {
  it("sends a 12 MB video in 5 MB pieces (multiples of 320 KB) and returns the OneDrive item", async () => {
    const { puts } = fakeSession(12 * MB);
    const states: string[] = [];
    const id = await sendToOneDrive(file(12 * MB), "https://upload.example/session", (p) => states.push(p.state));
    expect(id).toBe("ITEM123");
    expect(puts).toEqual([`bytes 0-${5 * MB - 1}/${12 * MB}`, `bytes ${5 * MB}-${10 * MB - 1}/${12 * MB}`, `bytes ${10 * MB}-${12 * MB - 1}/${12 * MB}`]);
    expect((5 * MB) % (320 * 1024)).toBe(0);
    expect(states.at(-1)).toBe("done");
  });

  it("pauses when the connection drops (phone call) and continues from the byte OneDrive has, not from zero", async () => {
    const { puts } = fakeSession(12 * MB, { dropAt: 5 * MB });
    const states: string[] = [];
    const id = await sendToOneDrive(file(12 * MB), "https://upload.example/session", (p) => states.push(p.state), false, async () => {});
    expect(id).toBe("ITEM123");
    expect(states).toContain("paused");
    // First piece once, the interrupted second piece retried from 5 MB, then the rest: never byte 0 again.
    expect(puts.filter((r) => r.startsWith("bytes 0-"))).toHaveLength(1);
    expect(puts.filter((r) => r.startsWith(`bytes ${5 * MB}-`))).toHaveLength(2);
  });

  it("resumes an earlier session (same file picked again) from OneDrive's next expected byte", async () => {
    fakeSession(12 * MB);
    // Pretend 10 MB already arrived before the page was closed.
    const { puts, fetchMock } = (() => {
      let received = 10 * MB;
      const puts: string[] = [];
      const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
        if (!init || init.method !== "PUT") return new Response(JSON.stringify({ nextExpectedRanges: [`${received}-`] }), { status: 200 });
        const range = (init.headers as Record<string, string>)["Content-Range"];
        puts.push(range);
        received = 12 * MB;
        return new Response(JSON.stringify({ id: "ITEM123" }), { status: 201 });
      });
      vi.stubGlobal("fetch", fetchMock);
      return { puts, fetchMock };
    })();
    expect(await sendToOneDrive(file(12 * MB), "https://upload.example/session", () => {}, true)).toBe("ITEM123");
    expect(fetchMock).toHaveBeenCalled();
    expect(puts).toEqual([`bytes ${10 * MB}-${12 * MB - 1}/${12 * MB}`]);
  });

  it("an expired session asks for a new one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(sendToOneDrive(file(MB), "https://upload.example/old", () => {})).rejects.toBeInstanceOf(SessionExpired);
  });
});

describe("file names and paths", () => {
  it("makes names OneDrive accepts", () => {
    expect(safeName('Gonzalez: "Residence" AV #1?')).toBe("Gonzalez- -Residence- AV -1-");
    expect(safeName("  Lobby TV.  ")).toBe("Lobby TV");
    expect(safeName("")).toBe("Untitled");
  });

  it("tells CRM-storage, OneDrive and in-progress files apart", () => {
    expect(pathOf({ provider: "onedrive", provider_path: "ABC!123" })).toBe("onedrive:ABC!123");
    expect(pathOf({ provider: "supabase", provider_path: "job_reports/1/files/u/x.jpg" })).toBe("job_reports/1/files/u/x.jpg");
    expect(isOneDrivePath("onedrive:ABC")).toBe(true);
    expect(oneDriveId("onedrive:ABC")).toBe("ABC");
    expect(isPendingOneDrive(`${OD_UPLOAD}u-1`)).toBe(true);
    expect(uploadIdOf(`${OD_UPLOAD}u-1`)).toBe("u-1");
  });
});
