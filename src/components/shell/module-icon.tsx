import { Boxes, Briefcase, CalendarDays, ClipboardList, FolderKanban, LayoutDashboard, LifeBuoy } from "lucide-react";
import type { ModuleDef } from "@/config/modules";

const ICONS = {
  calendar: CalendarDays,
  "folder-kanban": FolderKanban,
  briefcase: Briefcase,
  boxes: Boxes,
  "life-buoy": LifeBuoy,
  "clipboard-list": ClipboardList,
  dashboard: LayoutDashboard,
} as const;

export function ModuleIcon({
  name,
  className,
}: {
  name: ModuleDef["icon"] | "dashboard";
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
