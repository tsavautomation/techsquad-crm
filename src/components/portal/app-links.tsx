"use client";

import { useSyncExternalStore } from "react";
import { Download, Globe } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Device = "ios" | "android" | "other";
const subscribe = () => () => {};

function detect(): Device {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && "ontouchend" in document)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Store buttons: the one for this phone first and filled, the other outlined. */
export function AppLinks({ ios, android, web }: { ios: string | null; android: string | null; web: string | null }) {
  const t = useT();
  const device = useSyncExternalStore(subscribe, detect, () => "other" as Device);
  const btn = (href: string, label: string, primary: boolean, icon: React.ReactNode) => (
    <a key={href} href={href} target="_blank" rel="noopener" className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium", primary ? "bg-primary text-primary-foreground" : "border hover:bg-muted")}>
      {icon} {label}
    </a>
  );
  const items: React.ReactNode[] = [];
  if (ios) items.push(btn(ios, t("App Store (iPhone)"), device !== "android", <Download className="size-4" aria-hidden />));
  if (android) items.push(btn(android, t("Google Play (Android)"), device === "android", <Download className="size-4" aria-hidden />));
  if (device === "android") items.reverse();
  if (web) items.push(btn(web, t("Website"), false, <Globe className="size-4" aria-hidden />));
  if (!items.length) return null;
  return <div className="mt-3 flex flex-col gap-2 sm:flex-row">{items}</div>;
}
