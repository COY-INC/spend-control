// Preferência de tema, salva por dispositivo (localStorage). Sem valor salvo,
// resolve pelo tema do sistema. O <html>.dark é aplicado cedo em index.html (anti-flash);
// aqui só lemos/alteramos a preferência.
export type Theme = "light" | "dark";

const KEY = "fin-dash-theme";

const stored = (): Theme | null => {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
};

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const resolveTheme = (): Theme => stored() ?? systemTheme();

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  document.documentElement.classList.toggle("dark", t === "dark");
}
