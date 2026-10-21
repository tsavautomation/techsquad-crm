import { Inbox } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { isOfficeUser } from "@/lib/auth/office";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { AssignMailRow, type MailToAssign } from "./assign-mail-row";

// F26-2 Today › Emails to assign: what reached the CRM mailbox and matched no project (office only).
// Nothing waiting → no card.

export async function AssignMail({ user }: { user: CurrentUser }) {
  if (!isOfficeUser(user)) return null;
  const db = await recordsDb();
  const { data, count } = await db
    .from("mail_messages")
    .select("id, received_at, from_name, from_email, subject, snippet, attachments", { count: "exact" })
    .eq("status", "unassigned")
    .order("received_at", { ascending: false })
    .limit(15);
  const rows = ((data ?? []) as (Omit<MailToAssign, "files"> & { attachments: { name: string }[] | null })[]).map((r) => ({ ...r, files: (r.attachments ?? []).map((a) => a.name) }));
  if (!rows.length) return null;
  const tr = await getT();

  return (
    <section id="assign-mail" className="scroll-mt-20 rounded-2xl border border-warn-fg/30 bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-warn-fg">
        <Inbox className="size-4" aria-hidden /> {tr("Emails to assign")}
        <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs">{count ?? rows.length}</span>
      </h2>
      <p className="mb-3 text-[13px] text-text-2">{tr("These reached the CRM mailbox but match no project. Pick the project (or ignore), and the email goes on its timeline with the files in OneDrive.")}</p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <AssignMailRow key={r.id} mail={r} />
        ))}
      </ul>
    </section>
  );
}
