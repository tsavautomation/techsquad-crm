"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Counts the pages visited in this tab, so the Back link knows whether there is a previous CRM page to
// return to (document.referrer does not change on in-app navigation). Session storage: per tab, survives a reload.

export const NAV_DEPTH_KEY = "crm:nav:depth";
const LAST_KEY = "crm:nav:last";

export function NavHistory() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (sessionStorage.getItem(LAST_KEY) === pathname) return;
      sessionStorage.setItem(LAST_KEY, pathname);
      sessionStorage.setItem(NAV_DEPTH_KEY, String(Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0") + 1));
    } catch {
      // storage unavailable (private mode): the Back link falls back to the list
    }
  }, [pathname]);
  return null;
}

/** True when this tab has shown another CRM page before the current one. */
export function hasPreviousPage(): boolean {
  try {
    return window.history.length > 1 && Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0") > 1;
  } catch {
    return false;
  }
}
