"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/cn";

export function ThemeToggle({
  variant = "segmented",
  className,
}: {
  variant?: "segmented" | "compact";
  className?: string;
}) {
  const { theme, setTheme, toggleTheme, mounted } = useTheme();
  const isLight = mounted ? theme === "light" : false;

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isLight ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
        title={isLight ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-th-border bg-th-card text-th-text-2 hover:text-th-text hover:border-th-border-strong transition-colors cursor-pointer shrink-0",
          className,
        )}
      >
        {isLight ? (
          <>
            <Sun className="size-4 text-th-amber shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">Claro</span>
          </>
        ) : (
          <>
            <Moon className="size-4 text-th-accent shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">Oscuro</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Selector de tema"
      className={cn(
        "inline-flex items-center rounded-xl border border-th-border bg-th-recessed p-0.5 shrink-0",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={isLight}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap",
          isLight
            ? "bg-th-card text-th-text shadow-sm"
            : "text-th-muted hover:text-th-text-2",
        )}
      >
        <Sun className={cn("size-3.5", isLight ? "text-th-amber" : "text-current")} aria-hidden="true" />
        <span>Claro</span>
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={!isLight}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap",
          !isLight
            ? "bg-th-card text-th-text shadow-sm"
            : "text-th-muted hover:text-th-text-2",
        )}
      >
        <Moon className={cn("size-3.5", !isLight ? "text-th-accent" : "text-current")} aria-hidden="true" />
        <span>Oscuro</span>
      </button>
    </div>
  );
}

