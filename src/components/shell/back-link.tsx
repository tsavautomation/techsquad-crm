"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/i18n/client";
import { hasPreviousPage } from "./nav-history";

// The back link at the top of record, new and edit pages (Fred 2026-10-05: "I should have a back button to
// take me to the previous page, always"). It goes back in the browser history when this tab has shown another
// CRM page before (a project's timeline, a list, Today); otherwise, e.g. when the page was opened from an
// alert e-mail or a bookmark, it falls back to the list the record belongs to.

export function BackLink({ fallback, label }: { fallback: string; label?: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (!hasPreviousPage()) return;
        e.preventDefault();
        router.back();
      }}
      aria-label={label ? `${t("Back")} (${label})` : t("Back")}
      className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden /> {t("Back")}
    </Link>
  );
}
