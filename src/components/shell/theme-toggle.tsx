"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/** Day / night switch. Starts from the device setting; a tap remembers the choice on this device. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Switch between day and night colours"
      title="Day / night"
      className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
    >
      {/* Both icons render; CSS shows the right one, so there is no flash before the theme is known. */}
      <Moon className="size-5 dark:hidden" aria-hidden />
      <Sun className="hidden size-5 dark:block" aria-hidden />
    </button>
  );
}
