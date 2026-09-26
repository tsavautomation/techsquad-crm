"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/** Adds the `dark` class to <html> (see globals.css) from the device setting or the user's choice. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
