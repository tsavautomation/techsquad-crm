"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usagePingAction } from "@/lib/usage/actions";
import { PING_EVERY_MS } from "@/lib/usage/engine";

// ADM-b: tells the server the person is here. One ping per page opened, then one a minute while the tab is
// visible and the person touched, scrolled or typed in the last five minutes. Nothing while the tab is hidden.

const IDLE_MS = 5 * 60_000;

export function UsageBeacon() {
  const pathname = usePathname();
  const lastActivity = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now();
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity.current > IDLE_MS) return;
      void usagePingAction(false);
    }, PING_EVERY_MS);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    lastActivity.current = Date.now();
    void usagePingAction(true);
  }, [pathname]);

  return null;
}
