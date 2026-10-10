import Link from "next/link";
import { Logo } from "@/components/shell/nav";
import { getT } from "@/i18n/server";

/** How to keep the portal on the phone's home screen (linked from the invitation email and the sign-in page). */
export default async function InstallPage() {
  const t = await getT();
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.tsav.net").replace(/\/$/, "");
  const url = `${site}/portal`;
  const steps = (items: string[]) => (
    <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 py-8">
      <div className="flex items-center gap-3">
        <Logo className="size-10" />
        <div>
          <h1 className="text-[21px] font-semibold">{t("Tech Squad on your phone")}</h1>
          <p className="text-sm text-muted-foreground">{t("Two minutes, once. Then the portal opens like an app.")}</p>
        </div>
      </div>
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="text-[15px] font-semibold">{t("Your address")}</h2>
        <p className="mt-1 text-sm break-all">
          <a href={url} className="font-medium text-primary">{url}</a>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("Sign in with your email and the password you created from our invitation.")}</p>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="text-[15px] font-semibold">{t("iPhone (Safari)")}</h2>
        {steps([
          t("Open the address above in Safari and sign in."),
          t("Tap the Share button (the square with the arrow, at the bottom)."),
          t("Scroll and tap “Add to Home Screen”, then “Add”."),
          t("The Tech Squad icon appears on your home screen. Open the portal from it."),
        ])}
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="text-[15px] font-semibold">{t("Android (Chrome)")}</h2>
        {steps([
          t("Open the address above in Chrome and sign in."),
          t("Tap the three dots (top right)."),
          t("Tap “Add to Home screen” (or “Install app”), then “Add”."),
          t("The Tech Squad icon appears on your home screen."),
        ])}
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="text-[15px] font-semibold">{t("Trouble signing in?")}</h2>
        <p className="mt-1 text-sm">{t("Use “Forgot your password?” on the sign-in page, or call our office and we will send a new link.")}</p>
      </section>
      <Link href="/portal/login" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
        {t("Go to the portal")}
      </Link>
    </main>
  );
}
