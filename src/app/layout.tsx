import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/i18n/client";
import { getLang } from "@/i18n/server";
import { cookies } from "next/headers";
import { PALETTE_COOKIE, paletteOr } from "@/lib/palettes";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Managing System", template: "%s · Managing System" },
  description: "Tech Squad projects, staff, inventory and field reports.",
  applicationName: "Managing System",
  appleWebApp: { capable: true, title: "Tech Squad", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use the iPhone safe-area insets
  // No pinch or double-tap zoom when installed on the home screen (Fred 2026-10-11, "um app não deixaria").
  // Safari in browser mode ignores this on purpose; the standalone app honours it.
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  const palette = paletteOr((await cookies()).get(PALETTE_COOKIE)?.value); // UI-m
  return (
    <html lang={lang === "pt" ? "pt-BR" : "en"} data-palette={palette} suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <I18nProvider lang={lang}>
            {children}
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
