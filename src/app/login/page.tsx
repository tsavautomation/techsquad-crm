import { Logo } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error } = await props.searchParams;
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm rounded-2xl shadow-card">
        <CardHeader>
          <Logo className="mb-2 size-11 rounded-[13px] text-sm" />
          <CardTitle className="text-xl">TechSquad CRM</CardTitle>
          <CardDescription>Sign in with your work email.</CardDescription>
        </CardHeader>
        <CardContent>
          {error === "link" && (
            <p className="mb-4 text-sm text-destructive">That link has expired or was already used. Try again.</p>
          )}
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </CardContent>
      </Card>
    </main>
  );
}
