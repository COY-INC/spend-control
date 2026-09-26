import { useState } from "react";
import { api } from "@/api";
import { useDashboard } from "@/dashboard/DashboardContext";
import { CategoryMultiSelect } from "@/components/CategoryMultiSelect";
import { signedAmount } from "@/lib/manualTransaction";

const todayISO = () => new Date().toISOString().slice(0, 10);

// Lançamento avulso: dinheiro em espécie, Pix fora da conta sincronizada, gasto que a Pluggy
// não capturou. Não é parcelamento (isso é o fluxo de "aceitar" em Compromissos futuros).
export function NewTransactionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { accounts } = useDashboard();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [kind, setKind] = useState<"despesa" | "receita">("despesa");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO);
  const [description, setDescription] = useState("");
  const [userCategories, setUserCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const amount = Number(value.replace(",", "."));
  const valid = !!accountId && Number.isFinite(amount) && amount > 0 && !!date && description.trim().length > 0;

  const save = async () => {
    if (!valid || !account) return;
    setSaving(true);
    setError(null);
    try {
      await api.createTransaction({
        accountId,
        amount: signedAmount(account.type, kind, amount),
        date,
        description: description.trim(),
        userCategories,
      });
      onCreated();
      onClose();
    } catch (e) {
      console.error(e);
      setError("Não foi possível salvar a transação.");
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
          Nova transação
        </h2>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="inline-flex rounded-md border border-border/50 p-0.5">
            {(["despesa", "receita"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`min-h-9 rounded px-3 text-sm capitalize transition-colors ${
                  kind === k ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Conta</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="min-h-10 w-full rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution} · {a.name ?? a.type} ({a.userName})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Valor</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
              className="min-h-10 w-full rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Data</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-10 w-full rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Descrição</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Dinheiro em espécie"
              className="min-h-10 w-full rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Categoria (opcional)</span>
            <CategoryMultiSelect
              selected={userCategories}
              onChange={setUserCategories}
              showPrimary
              placeholder="Sem categoria"
              ariaLabel="Categoria"
            />
          </label>

          {error && <p className="text-sm text-rose-600 dark:text-rose-500">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-border/50 px-6 py-4">
          <button
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!valid || saving}
            className="min-h-11 flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
