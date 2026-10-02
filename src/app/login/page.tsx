import { Logo } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Sign in") };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const t = await getT();
  const { next, error } = await props.searchParams;
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm rounded-2xl shadow-card">
        <CardHeader>
          <Logo className="mb-2 size-12" />
          <CardTitle className="text-xl">Managing System</CardTitle>
          <CardDescription>{t("Sign in with your work email.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {error === "link" && (
            <p className="mb-4 text-sm text-destructive">{t("That link has expired or was already used. Try again.")}</p>
          )}
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </CardContent>
      </Card>
    </main>
  );
}
