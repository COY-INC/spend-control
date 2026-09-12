import { NavLink } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SECTIONS } from "@/dashboard/nav";

export function SidebarContent({
  onLogout,
  onNavigate,
}: {
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <nav className="space-y-1">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.id}
            to={s.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors ${
                isActive
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`
            }
          >
            <span aria-hidden>{s.icon}</span>
            {s.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={onLogout}
        className="mt-6 flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        Sair
      </button>
      <div className="mt-6 flex items-center justify-between px-3 md:mt-8">
        <span className="text-sm text-muted-foreground">Tema escuro</span>
        <ThemeToggle />
      </div>
    </>
  );
}
