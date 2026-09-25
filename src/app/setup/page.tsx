import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Setup needed" };

/** Shown only until .env.local has the Supabase keys. */
export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/login");
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-3 text-xl font-semibold">Almost there: connect Supabase</h1>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Copy <code>.env.example</code> to <code>.env.local</code> in the project folder.</li>
        <li>
          In Supabase open <strong>Project Settings → API</strong> and paste the Project URL and the
          publishable key into <code>.env.local</code>.
        </li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
    </main>
  );
}
