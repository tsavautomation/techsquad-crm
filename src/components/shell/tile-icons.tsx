import {
  Award,
  Sparkles,
  Briefcase,
  List,
  Settings,
  BadgeCheck,
  BookOpen,
  Boxes,
  Building,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Cloud,
  Contact,
  Database,
  Factory,
  FileSignature,
  FolderKanban,
  ListChecks,
  Map,
  MapPin,
  Package,
  PackageMinus,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  SquareKanban,
  StickyNote,
  Tag,
  Truck,
  Tv,
  Users,
  UsersRound,
  Wallet,
  Zap,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";

// One icon (and tint) per page, used by the tile menus and sheets (Portal look).
// Keys: module tab slugs, utility table names and admin screen slugs.
export const TILE_ICONS: Record<string, { icon: LucideIcon; tint: string }> = {
  // Schedule
  calendar: { icon: CalendarDays, tint: "#0e76ad" },
  visits: { icon: MapPin, tint: "#0ea5e9" },
  map: { icon: Map, tint: "#16a34a" },
  // Projects
  projects: { icon: FolderKanban, tint: "#0e76ad" },
  contacts: { icon: Contact, tint: "#8b5cf6" },
  organizations: { icon: Building2, tint: "#6366f1" },
  buildings: { icon: Building, tint: "#0891b2" },
  permits: { icon: BadgeCheck, tint: "#16a34a" },
  "punch-list": { icon: ListChecks, tint: "#f59e0b" },
  // Administrative
  employees: { icon: Users, tint: "#0e76ad" },
  payroll: { icon: Wallet, tint: "#16a34a" },
  transactions: { icon: Receipt, tint: "#14b8a6" },
  vehicles: { icon: Truck, tint: "#64748b" },
  rma: { icon: RotateCcw, tint: "#ef4444" },
  tasks: { icon: SquareKanban, tint: "#8b5cf6" },
  "inventory-checkout": { icon: PackageMinus, tint: "#f59e0b" },
  // Inventory
  products: { icon: Package, tint: "#0e76ad" },
  stock: { icon: Boxes, tint: "#6366f1" },
  sales: { icon: ShoppingCart, tint: "#16a34a" },
  // Reports (forms)
  "job-reports": { icon: ClipboardList, tint: "#0e76ad" },
  notes: { icon: StickyNote, tint: "#f59e0b" },
  "staff-performance": { icon: Award, tint: "#8b5cf6" },
  "survey-and-proposals": { icon: FileSignature, tint: "#14b8a6" },
  "tv-installations": { icon: Tv, tint: "#0891b2" },
  // Lists
  brands: { icon: Tag, tint: "#ef4444" },
  suppliers: { icon: Factory, tint: "#64748b" },
  // Admin
  users: { icon: Users, tint: "#0e76ad" },
  groups: { icon: UsersRound, tint: "#6366f1" },
  permissions: { icon: ShieldCheck, tint: "#16a34a" },
  "form-settings": { icon: SlidersHorizontal, tint: "#f59e0b" },
  onedrive: { icon: Cloud, tint: "#0ea5e9" },
  bouncie: { icon: Truck, tint: "#f97316" },
  "google-calendar": { icon: CalendarDays, tint: "#16a34a" },
  ai: { icon: Sparkles, tint: "#8b5cf6" },
  automations: { icon: Zap, tint: "#8b5cf6" },
  catalogue: { icon: BookOpen, tint: "#64748b" },
  "field-day": { icon: Truck, tint: "#0891b2" },
  messages: { icon: MessageSquareText, tint: "#16a34a" },
  // Modules and other pages (sheets)
  schedule: { icon: CalendarDays, tint: "#0e76ad" },
  administrative: { icon: Briefcase, tint: "#6366f1" },
  inventory: { icon: Boxes, tint: "#f59e0b" },
  forms: { icon: ClipboardList, tint: "#0e76ad" }, // the Reports module
  lists: { icon: List, tint: "#64748b" },
  admin: { icon: Settings, tint: "#64748b" },
  // Management
  insights: { icon: ChartColumn, tint: "#0e76ad" },
  data: { icon: Database, tint: "#14b8a6" },
};

const FALLBACK = { icon: FolderKanban, tint: "#64748b" };
export const tileIcon = (key: string) => TILE_ICONS[key] ?? FALLBACK;

/** The rounded, tinted icon square used on tiles. */
export function TileIcon({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const { icon: Icon, tint } = tileIcon(name);
  return (
    <span
      className={size === "sm" ? "grid size-9 shrink-0 place-items-center rounded-[10px]" : "grid size-11 shrink-0 place-items-center rounded-xl"}
      style={{ backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}
      aria-hidden
    >
      <Icon className={size === "sm" ? "size-[18px]" : "size-[22px]"} />
    </span>
  );
}

/** One line under each tile, saying what's inside. */
export const TILE_TEXT: Record<string, string> = {
  calendar: "Week, team and list of visits",
  visits: "Every scheduled visit",
  map: "The day's jobs and the vans, live",
  projects: "Jobs from survey to completion",
  contacts: "Clients, owners and people",
  organizations: "GCs, designers, builders, partners",
  buildings: "Buildings and developments, COI",
  permits: "Permits and their expiry",
  "punch-list": "Open items to finish",
  employees: "Team members and documents",
  payroll: "Payouts and reimbursements",
  transactions: "Proposals, invoices, payments",
  vehicles: "Fleet, tags and insurance",
  rma: "Returns to manufacturers",
  tasks: "To-dos for the team",
  "inventory-checkout": "Materials and tools taken out",
  products: "Catalogue: brands, models, prices",
  stock: "Units with serial numbers",
  sales: "Units sold to projects",
  "job-reports": "End-of-day reports from the field",
  notes: "Quick notes on a job",
  "staff-performance": "Reviews of team members",
  "survey-and-proposals": "Site surveys and proposals",
  "tv-installations": "Installation and condition forms",
  brands: "Equipment brands",
  suppliers: "Where products come from",
};
