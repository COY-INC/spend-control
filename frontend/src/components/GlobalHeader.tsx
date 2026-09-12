import { useState } from "react";
import { useDashboard } from "@/dashboard/DashboardContext";
import { MonthYearPicker } from "@/components/MonthYearPicker";
import { CategoryManagerModal } from "@/components/CategoryManagerModal";
import { api } from "@/api";
import { exportWorkbook } from "@/lib/export";

export function GlobalHeader() {
  const {
    scope,
    setScope,
    users,
    userId,
    setUserId,
    ym,
    setYm,
    filter,
    setFilter,
    banks,
    accounts,
    investments,
    transactions,
  } = useDashboard();
  const sel = "min-h-10 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm";
  const [exporting, setExporting] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      const u = scope === "my" ? userId : undefined;
      const [cards, commitments, reserved, budgets, subscriptions] = await Promise.all([
        api.cards(u),
        api.commitments(u),
        api.reserved(u),
        api.budgets(),
        api.subscriptions(),
      ]);
      await exportWorkbook({
        scope,
        ym,
        filter,
        users,
        userId,
        accounts,
        investments,
        transactions,
        cards,
        commitments,
        reserved,
        budgets,
        subscriptions,
      });
    } catch (e) {
      console.error(e);
      alert("Falha ao exportar os dados.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Escopo Casal / Minhas */}
      <div className="inline-flex rounded-md border border-border/50 p-0.5">
        {(["couple", "my"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            aria-pressed={scope === s}
            className={`min-h-9 rounded px-3 text-sm transition-colors ${
              scope === s ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {s === "couple" ? "Casal" : "Minhas"}
          </button>
        ))}
      </div>

      {scope === "my" && (
        <select
          className={sel}
          aria-label="Usuário"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      <MonthYearPicker value={ym} onChange={setYm} />

      <select
        className={sel}
        aria-label="Banco"
        value={filter.banco}
        onChange={(e) => setFilter({ ...filter, banco: e.target.value })}
      >
        <option value="">Todos os bancos</option>
        {banks.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <button
        onClick={() => setManagingCategories(true)}
        className="min-h-10 rounded-md border border-border/50 px-3 text-sm text-muted-foreground hover:bg-accent sm:ml-auto"
      >
        Minhas categorias
      </button>

      <button
        onClick={onExport}
        disabled={exporting}
        className="min-h-10 rounded-md border border-border/50 px-3 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
      >
        {exporting ? "Exportando…" : "Exportar"}
      </button>

      {managingCategories && <CategoryManagerModal onClose={() => setManagingCategories(false)} />}
    </div>
  );
}
