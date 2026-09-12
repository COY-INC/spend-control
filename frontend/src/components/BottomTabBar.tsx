import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { SECTIONS } from "@/dashboard/nav";
import { ThemeToggle } from "@/components/ThemeToggle";

export function BottomTabBar({ onLogout }: { onLogout: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const primary = SECTIONS.filter((s) => s.mobilePrimary);
  const secondary = SECTIONS.filter((s) => !s.mobilePrimary);
  const moreActive = secondary.some((s) => s.path === pathname);

  const tab =
    "flex min-h-[3.25rem] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 py-1.5 text-[11px]";

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border/50 bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((s) => (
          <NavLink
            key={s.id}
            to={s.path}
            className={({ isActive }) =>
              `${tab} ${isActive ? "text-brand" : "text-muted-foreground"}`
            }
          >
            <span aria-hidden className="text-lg">
              {s.icon}
            </span>
            {s.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`${tab} ${moreActive ? "text-brand" : "text-muted-foreground"}`}
        >
          <span aria-hidden className="text-lg">
            ⋯
          </span>
          Mais
        </button>
      </nav>

      {moreOpen &&
        createPortal(
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mais">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 overscroll-contain rounded-t-2xl border-t border-border/50 bg-card p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl">
              <div className="space-y-1">
                {secondary.map((s) => (
                  <NavLink
                    key={s.id}
                    to={s.path}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-2 rounded-md px-3 text-sm ${
                        isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                      }`
                    }
                  >
                    <span aria-hidden>{s.icon}</span>
                    {s.label}
                  </NavLink>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/50 px-3 pt-3">
                <span className="text-sm text-muted-foreground">Tema escuro</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onLogout();
                }}
                className="mt-2 flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                Sair
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
