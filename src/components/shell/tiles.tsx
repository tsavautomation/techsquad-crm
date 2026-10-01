import Link from "next/link";
import { TileIcon } from "./tile-icons";

// Tile menus (Portal look): big tappable cards with an icon, a title and a short line under it.
// Two across on phones, three or four on computers.

export type Tile = { href: string; title: string; subtitle?: string; icon: string; badge?: string };

export function Tiles({ items, columns = 3 }: { items: Tile[]; columns?: 3 | 4 }) {
  return (
    <ul className={columns === 4 ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "grid grid-cols-2 gap-3 lg:grid-cols-3"}>
      {items.map((t) => (
        <li key={t.href}>
          <Link
            href={t.href}
            className="group flex h-full min-h-[118px] flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:border-info-border hover:shadow-[0_8px_20px_rgb(16_24_40/0.12)] active:translate-y-0"
          >
            <span className="flex items-start justify-between gap-2">
              <TileIcon name={t.icon} />
              {t.badge && <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-text-2 tabular-nums">{t.badge}</span>}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] leading-tight font-semibold">{t.title}</span>
              {t.subtitle && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-text-2">{t.subtitle}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
