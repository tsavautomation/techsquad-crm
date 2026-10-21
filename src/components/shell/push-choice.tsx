"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useT } from "@/i18n/client";
import { pushStatusAction, removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction, type PushStatus } from "@/lib/push/actions";
import { cn } from "@/lib/utils";

// F27: "Notifications on this device" in the account menu, for logins an administrator gave events
// to. Registers the service worker, asks the browser once, keeps the subscription on the server.
// iPhone: only works when the CRM is installed on the home screen (Share › Add to Home Screen).

const b64ToBytes = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type State = "unsupported" | "needs-install" | "denied" | "off" | "on";
const EVENT_LABEL: Record<string, string> = { visit_check_in: "technician check-ins", visit_check_out: "technician check-outs" };

/** What this browser can do right now (runs after the server answered, never during render). */
async function detect(): Promise<State> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export function PushChoice() {
  const t = useT();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [state, setState] = useState<State>("off");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    pushStatusAction()
      .then(async (st) => {
        const s = st.events.length && st.configured ? await detect() : "off";
        if (!alive) return;
        setStatus(st);
        setState(s);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!status || !status.events.length || !status.configured) return null;

  const turnOn = () =>
    start(async () => {
      setNote(null);
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setState("denied"); return; }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "") });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: json.keys }, navigator.userAgent);
        if (!r.ok) { setNote(r.message); return; }
        setState("on");
        setStatus((s) => (s ? { ...s, devices: s.devices + 1 } : s));
      } catch (e) {
        setNote((e as Error).message);
      }
    });

  const turnOff = () =>
    start(async () => {
      setNote(null);
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setStatus((s) => (s ? { ...s, devices: Math.max(0, s.devices - 1) } : s));
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPushAction();
      setNote(r.ok ? t("Test sent.") : r.message);
    });

  const Icon = state === "on" ? BellRing : state === "denied" ? BellOff : Bell;
  const events = status.events.map((e) => t(EVENT_LABEL[e] ?? e)).join(", ");
  return (
    <div className="mx-2 my-2 rounded-[10px] border bg-muted px-3 py-2 text-[13px]">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 font-medium">{t("Notifications on this device")}</span>
        {(state === "on" || state === "off") && (
          <button
            type="button"
            role="switch"
            aria-checked={state === "on"}
            disabled={pending}
            onClick={state === "on" ? turnOff : turnOn}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", state === "on" ? "bg-primary" : "bg-border")}
          >
            <span className={cn("absolute top-0.5 size-5 rounded-full bg-card shadow transition-transform", state === "on" ? "left-0.5 translate-x-5" : "left-0.5")} />
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {state === "needs-install" && t("On the iPhone, add the CRM to the Home Screen first (Share › Add to Home Screen), then turn this on from the installed app.")}
        {state === "unsupported" && t("This browser does not support notifications.")}
        {state === "denied" && t("Notifications are blocked for this site in the browser settings.")}
        {state === "off" && t("You will get: {events}.", { events })}
        {state === "on" && (
          <>
            {t("{n} device(s) on.", { n: status.devices })}{" "}
            <button type="button" onClick={test} disabled={pending} className="underline underline-offset-4">
              {t("Send a test")}
            </button>
          </>
        )}
      </p>
      {note && <p className="mt-1 text-xs text-foreground">{note}</p>}
    </div>
  );
}
