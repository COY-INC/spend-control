import { useState } from "react";
import { resolveTheme, setTheme, type Theme } from "@/lib/theme";

// Switch claro/escuro. Reflete o tema atual (resolvido do sistema quando não há escolha
// salva) e, ao alternar, grava a escolha explícita — que persiste entre acessos.
export function ThemeToggle() {
  const [theme, set] = useState<Theme>(resolveTheme);
  const isDark = theme === "dark";

  const toggle = () => {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
    set(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      onClick={toggle}
      className="relative inline-flex h-7 w-12 items-center rounded-full border border-border bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/40"
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm transition-transform motion-reduce:transition-none ${
          isDark ? "translate-x-6" : "translate-x-1"
        }`}
      >
        {isDark ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </button>
  );
}
