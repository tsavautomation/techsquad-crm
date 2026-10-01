import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Setup needed") };
}

/** Shown only until .env.local has the Supabase keys. */
export default async function SetupPage() {
  const t = await getT();
  if (isSupabaseConfigured()) redirect("/login");
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-3 text-xl font-semibold">{t("Almost there: connect Supabase")}</h1>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>{t("Copy")} <code>.env.example</code> to <code>.env.local</code> {t("in the project folder.")}</li>
        <li>
          {t("In Supabase open")} <strong>{t("Project Settings → API")}</strong> and paste the Project URL and the
          publishable key into <code>.env.local</code>.
        </li>
        <li>{t("Restart")} <code>npm run dev</code>.</li>
      </ol>
    </main>
  );
}
