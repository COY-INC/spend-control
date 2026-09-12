import { useEffect, useMemo, useState } from "react";
import { api, brl, effectiveCategory, expenseValue, type Transaction } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/dashboard/DashboardContext";

// Orçamento por categoria (compartilhado do casal). Progresso do gasto vs limite no mês
// selecionado (transactions são as do mês). Clicar em "Definir orçamentos" abre o editor.
export function BudgetCard({ transactions }: { transactions: Transaction[] }) {
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.budgets().then(setBudgets).catch(console.error);
  }, []);

  // Gasto do mês por categoria efetiva (exclui movimentações internas).
  const spentByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of transactions) {
      const e = expenseValue(t);
      if (e > 0) m[effectiveCategory(t)] = (m[effectiveCategory(t)] ?? 0) + e;
    }
    return m;
  }, [transactions]);

  const rows = useMemo(
    () =>
      Object.entries(budgets)
        .map(([category, limit]) => ({ category, limit, spent: spentByCat[category] ?? 0 }))
        .sort((a, b) => b.spent / b.limit - a.spent / a.limit),
    [budgets, spentByCat],
  );
  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle>Orçamento por categoria</CardTitle>
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Definir orçamentos
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum limite definido. Clique em “Definir orçamentos” para começar.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between border-b border-border/50 pb-3 text-sm">
                <span className="font-medium text-muted-foreground">Total do mês</span>
                <span className="ledger">
                  <span className={totalSpent > totalLimit ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold"}>
                    {brl(totalSpent)}
                  </span>{" "}
                  / {brl(totalLimit)}
                </span>
              </div>
              <ul className="space-y-3">
                {rows.map((r) => (
                  <BudgetRow key={r.category} {...r} />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {editing && (
        <BudgetEditor
          current={budgets}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setBudgets(saved);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

function BudgetRow({ category, limit, spent }: { category: string; limit: number; spent: number }) {
  const pct = spent / limit;
  const over = pct > 1;
  const barColor = over ? "bg-rose-500" : pct >= 0.8 ? "bg-amber-500" : "bg-emerald-500";
  const valueColor = over
    ? "text-rose-600 dark:text-rose-400"
    : pct >= 0.8
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";
  const remaining = limit - spent;

  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{category}</span>
        <span className={`ledger ${valueColor}`}>
          {brl(spent)} <span className="text-muted-foreground">/ {brl(limit)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">
        {over ? (
          <span className="text-rose-600 dark:text-rose-400">{brl(-remaining)} acima do limite</span>
        ) : (
          `restam ${brl(remaining)}`
        )}
      </div>
    </li>
  );
}

function BudgetEditor({
  current,
  onClose,
  onSaved,
}: {
  current: Record<string, number>;
  onClose: () => void;
  onSaved: (saved: Record<string, number>) => void;
}) {
  const { categories } = useDashboard();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const c of categories) d[c] = current[c] ? String(current[c]) : "";
    return d;
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const map: Record<string, number> = {};
    for (const [c, v] of Object.entries(draft)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) map[c] = n;
    }
    try {
      const saved = await api.saveBudgets(map);
      onSaved(saved);
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-card shadow-xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="border-b border-border/50 px-6 py-4 text-lg font-semibold text-foreground">
          Definir orçamentos
        </h2>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {categories.map((c) => (
            <li key={c} className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{c}</span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="—"
                  value={draft[c]}
                  onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
                  className="min-h-10 w-28 rounded-md border border-border/50 bg-card px-2 py-1 text-right text-sm tabular-nums"
                />
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 border-t border-border/50 px-6 py-4">
          <button
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="min-h-11 flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
