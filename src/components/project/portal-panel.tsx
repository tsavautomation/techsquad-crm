"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, Plus, Search, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PortalPanelData, PortalPick } from "@/lib/portal/staff-data";
import { grantPortalAccessAction, resendPortalInviteAction, revokePortalAccessAction, searchPortalContactsAction, togglePortalItemAction } from "@/lib/portal/staff-actions";
import { formatDate } from "@/lib/dates";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Candidate = { id: number; title: string; email: string | null };

/** "Customer portal" card on a Project (F6): who sees it, the invitation, and which documents / apps it shows. */
export function PortalPanel({ projectId, data }: { projectId: number; data: PortalPanelData }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Candidate[]>([]);
  const [link, setLink] = useState<string | null>(null);

  const searching = picking && q.trim().length >= 2;
  useEffect(() => {
    if (!searching) return;
    const h = setTimeout(() => void searchPortalContactsAction(q).then(setFound), 250);
    return () => clearTimeout(h);
  }, [q, searching]);
  const shown = searching ? found : [];

  const run = (p: Promise<{ ok: boolean; message?: string; link?: string; emailed?: boolean }>, done?: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) {
        // Access was given but the email failed: the link is still there to text.
        if (r.link) setLink(r.link);
        toast.error(t(r.message ?? "Something went wrong."));
        if (r.link) router.refresh();
        return;
      }
      if (r.link && !r.emailed) {
        setLink(r.link);
        toast.warning(t("The email could not be sent. Copy the link and text it to the customer."));
      } else if (done) toast.success(t(done));
      setPicking(false);
      setQ("");
      router.refresh();
    });

  const grant = (c: Candidate) => {
    if (!c.email) {
      toast.error(t("This contact has no email. Add one on the Contact first."));
      return;
    }
    run(grantPortalAccessAction({ projectId, contactId: c.id }), "Invitation sent.");
  };

  const copy = async (s: string) => {
    await navigator.clipboard.writeText(s);
    toast.success(t("Link copied."));
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Who sees this project */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("Who can see this project")}</p>
        {data.access.length === 0 && !picking && <p className="text-muted-foreground">{t("Nobody yet. Give the customer access and they receive an invitation to create their login.")}</p>}
        <ul className="divide-y">
          {data.access.map((a) => (
            <li key={a.contactId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.email ?? t("no email")} ·{" "}
                  {a.login === "active" ? t("Signed in {date}", { date: formatDate(a.lastSignIn) }) : a.login === "invited" ? t("Invited, no password yet") : t("No login yet")}
                </p>
              </div>
              {data.canEdit && a.login !== "active" && a.login !== "none" && (
                <Button type="button" variant="outline" size="sm" className="h-9" disabled={pending} onClick={() => run(resendPortalInviteAction({ projectId, contactId: a.contactId }), "A new link was sent.")} title={t("Send a new link")}>
                  <Mail className="size-4" aria-hidden />
                </Button>
              )}
              {data.canEdit && (
                <Button type="button" variant="ghost" size="sm" className="h-9 text-bad-fg" disabled={pending} onClick={() => run(revokePortalAccessAction({ projectId, contactId: a.contactId }), "Access removed.")} title={t("Remove access")}>
                  <UserMinus className="size-4" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {link && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border bg-muted/50 p-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{link}</span>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void copy(link)}>
              <Copy className="size-3.5" aria-hidden /> {t("Copy")}
            </Button>
          </div>
        )}
        {data.canEdit && !picking && (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.suggested && (
              <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={() => grant(data.suggested!)}>
                <Plus className="size-4" aria-hidden /> {t("Give access to {name}", { name: data.suggested.title })}
              </Button>
            )}
            <Button type="button" variant={data.suggested ? "ghost" : "outline"} className="h-10" disabled={pending} onClick={() => setPicking(true)}>
              <Search className="size-4" aria-hidden /> {t("Another contact…")}
            </Button>
          </div>
        )}
        {picking && (
          <div className="mt-2 rounded-xl border p-2">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Contact name or email")} className="h-10 text-base" />
            <ul className="mt-1 max-h-56 divide-y overflow-y-auto">
              {shown.map((c) => (
                <li key={c.id}>
                  <button type="button" disabled={pending} onClick={() => grant(c)} className="flex w-full items-center gap-2 px-1 py-2 text-left hover:bg-muted">
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.email ?? t("no email")}</span>
                  </button>
                </li>
              ))}
              {searching && shown.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">{t("No contact matches.")}</li>}
            </ul>
            <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setPicking(false)}>
              {t("Cancel")}
            </Button>
          </div>
        )}
        {pending && <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" aria-hidden />}
      </div>

      <PickList title={t("Documents shown")} items={data.documents} canEdit={data.canEdit} onToggle={(id, on) => run(togglePortalItemAction("document", { projectId, id, on }))} empty={t("No library documents yet.")} manageHref="/administrative/portal-documents" manageLabel={t("Manage the library")}>
        {data.projectDocuments.length > 0 && (
          <ul className="mb-2 text-xs text-muted-foreground">
            {data.projectDocuments.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5 py-0.5">
                <Check className="size-3.5 text-ok-fg" aria-hidden /> {d.title} <span>· {t("this project only")}</span>
              </li>
            ))}
          </ul>
        )}
        {data.canEdit && (
          <Link href={data.newDocumentHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs hover:bg-muted">
            <Plus className="size-3.5" aria-hidden /> {t("Add a document for this customer only")}
          </Link>
        )}
      </PickList>

      <PickList title={t("Apps shown")} items={data.apps} canEdit={data.canEdit} onToggle={(id, on) => run(togglePortalItemAction("app", { projectId, id, on }))} empty={t("No apps in the list yet.")} manageHref="/administrative/portal-apps" manageLabel={t("Manage the apps list")} />
    </div>
  );
}

function PickList({ title, items, canEdit, onToggle, empty, manageHref, manageLabel, children }: { title: string; items: PortalPick[]; canEdit: boolean; onToggle: (id: number, on: boolean) => void; empty: string; manageHref: string; manageLabel: string; children?: React.ReactNode }) {
  const t = useT();
  const on = items.filter((i) => i.checked).length;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {title} <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] normal-case">{on}</span>
        </p>
        <Link href={manageHref} className="text-xs text-primary">{manageLabel}</Link>
      </div>
      {children}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.id}>
              <label className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5", i.checked && "border-primary/50 bg-primary/5", !canEdit && "cursor-default")}>
                <input type="checkbox" className="size-4 accent-primary" checked={i.checked} disabled={!canEdit} onChange={(e) => onToggle(i.id, e.target.checked)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{i.title}</span>
                  {i.hint && <span className="block truncate text-xs text-muted-foreground">{t(i.hint)}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
