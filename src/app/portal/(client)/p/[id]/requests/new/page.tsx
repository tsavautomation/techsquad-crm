import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { PortalCard } from "@/components/portal/shell";
import { RequestForm } from "@/components/portal/request-form";
import { getT } from "@/i18n/server";

export default async function NewRequestPage({ params }: PageProps<"/portal/p/[id]/requests/new">) {
  await requireClient();
  const { id } = await params;
  const t = await getT();
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/portal/p/${id}/requests`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {t("Requests")}
      </Link>
      <PortalCard title={t("New request")}>
        <RequestForm projectId={Number(id)} />
      </PortalCard>
    </div>
  );
}
