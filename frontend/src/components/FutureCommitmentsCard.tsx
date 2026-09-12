import { useEffect, useMemo, useState } from "react";
import { api, brl, type CommitmentPlan } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Chave "YYYY-MM" (UTC) e rótulo curto "set/26" a partir dela.
const now = new Date();
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const mon = new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return `${mon}/${String(y).slice(2)}`; // "ago/26"
};
const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

// Compromissos futuros (parcelas de cartão a vencer). Total comprometido + projeção dos
// próximos 6 meses; clicar abre os parcelamentos ativos. Respeita o filtro de banco.
export function FutureCommitmentsCard({ userId, bank }: { userId?: string; bank?: string }) {
  const [all, setAll] = useState<CommitmentPlan[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.commitments(userId).then(setAll).catch(console.error);
  }, [userId]);

  const plans = useMemo(
    () => (bank ? all.filter((p) => p.bank === bank) : all).slice().sort((a, b) => b.remainingAmount - a.remainingAmount),
    [all, bank],
  );
  const total = plans.reduce((s, p) => s + p.remainingAmount, 0);

  // Projeção: os próximos 6 meses a partir do mês corrente (UTC), somando as parcelas.
  const projection = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const key = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
      const amount = plans.reduce((s, p) => s + (p.months[key] ?? 0), 0);
      return { key, amount };
    });
  }, [plans]);
  const maxMonth = Math.max(1, ...projection.map((m) => m.amount));

  if (plans.length === 0) return null; // sem parcelas futuras → não mostra o card

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        className="cursor-pointer transition hover:ring-2 hover:ring-primary/20"
      >
        <CardHeader>
          <CardTitle>Compromissos futuros (parcelas)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="ledger text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-500">
              {brl(total)}
            </div>
            <span className="text-xs text-muted-foreground">
              {plans.length} parcelamento{plans.length > 1 ? "s" : ""} · toque para detalhar
            </span>
          </div>

          {/* Projeção dos próximos 6 meses. */}
          <ul className="space-y-1.5">
            {projection.map((m) => (
              <li key={m.key} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 text-muted-foreground">{monthLabel(m.key)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-rose-500/70"
                    style={{ width: `${(m.amount / maxMonth) * 100}%` }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                  {m.amount > 0 ? brl(m.amount) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-foreground">Parcelamentos ativos</h2>
              <span className="ledger text-lg font-semibold text-rose-600 dark:text-rose-500">{brl(total)}</span>
            </div>
            <ul className="space-y-3">
              {plans.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">{p.label}</span>
                      {p.manual && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          manual
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.total ? `faltam ${p.remaining} de ${p.total}` : `${p.remaining} parcela${p.remaining > 1 ? "s" : ""}`}
                      {!bank && ` · ${p.bank}`} · até {dm(p.lastDate)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-foreground">{brl(p.remainingAmount)}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setOpen(false)}
              className="mt-6 min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
