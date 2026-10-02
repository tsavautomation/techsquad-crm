import Link from "next/link";
import { notFound } from "next/navigation";
import { MessagesEditor } from "@/components/admin/messages-editor";
import { requireUser } from "@/lib/auth/session";
import { parseMessages } from "@/lib/messages/templates";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Messages") };
}

/** F4 message templates (SPEC §9.1 F4-d): texts in English / Português / Español. */
export default async function MessagesPage() {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("projects.module.design_design")) notFound();
  const db = await recordsDb();
  const { data } = await db.from("app_settings").select("value").eq("key", "messages").maybeSingle();

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin" className="underline underline-offset-4">
          {tr("Admin")}
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold">{tr("Messages")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{tr("Texts the office sends clients from a project or contact (Contact the client). They open in the phone's own Messages or Mail app, in the client's Preferred Language.")}</p>
      <MessagesEditor initial={parseMessages((data as { value: unknown } | null)?.value)} />
    </div>
  );
}
