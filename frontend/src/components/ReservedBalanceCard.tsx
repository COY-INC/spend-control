import { useEffect, useState } from "react";
import { api, brl, type ReservedEntry } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Totalizador de saldo reservado (caixinhas/cofrinhos). Só aparece quando há
// alguma reserva; clicar abre o detalhamento por caixinha. Respeita o filtro de banco.
export function ReservedBalanceCard({ userId, bank }: { userId?: string; bank?: string }) {
  const [all, setAll] = useState<ReservedEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.reserved(userId).then(setAll).catch(console.error);
  }, [userId]);

  const items = (bank ? all.filter((r) => r.bank === bank) : all)
    .slice()
    .sort((a, b) => b.amount - a.amount); // maior valor no topo
  const total = items.reduce((s, r) => s + r.amount, 0);

  if (items.length === 0) return null; // nenhum saldo reservado → não mostra o card

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        className="cursor-pointer transition hover:ring-2 hover:ring-emerald-400/50"
      >
        <CardHeader>
          <CardTitle>Reservado (caixinhas/cofrinhos)</CardTitle>
        </CardHeader>
        <CardContent className="ledger text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
          {brl(total)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">ver detalhes</span>
        </CardContent>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-foreground">Saldo reservado</h2>
              <span className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {brl(total)}
              </span>
            </div>
            <ul className="space-y-2">
              {items.map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm text-foreground">
                  <span>
                    {r.name}
                    {!bank && <span className="ml-2 text-xs text-muted-foreground">· {r.bank}</span>}
                  </span>
                  <span className="tabular-nums">{brl(r.amount)}</span>
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
