import { EMPTY_FILTER, type TxFilter } from "@/api";
import { CategoryMultiSelect } from "@/components/CategoryMultiSelect";

const TIPOS = [
  { v: "", label: "Todos os tipos" },
  { v: "entradas", label: "Entradas" },
  { v: "saidas", label: "Saídas" },
  { v: "pix", label: "Pix/Transferência" },
  { v: "credito", label: "Cartão de crédito" },
];

export function TransactionFilters({
  filter,
  onChange,
  banks,
}: {
  filter: TxFilter;
  onChange: (f: TxFilter) => void;
  banks: string[];
}) {
  const set = (patch: Partial<TxFilter>) => onChange({ ...filter, ...patch });
  const sel = "min-h-10 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm";
  const active = filter.tipo || filter.banco || filter.categorias.length || filter.incluirInternos;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <select className={sel} value={filter.tipo} onChange={(e) => set({ tipo: e.target.value })}>
        {TIPOS.map((t) => (
          <option key={t.v} value={t.v}>
            {t.label}
          </option>
        ))}
      </select>
      <select className={sel} value={filter.banco} onChange={(e) => set({ banco: e.target.value })}>
        <option value="">Todos os bancos</option>
        {banks.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <CategoryMultiSelect
        selected={filter.categorias}
        onChange={(categorias) => set({ categorias })}
        ariaLabel="Filtrar por categoria"
      />
      <label
        className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
        title="Conta reservas, transferências entre contas próprias e Pix com a esposa como entrada/saída"
      >
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-border/50"
          checked={filter.incluirInternos}
          onChange={(e) => set({ incluirInternos: e.target.checked })}
        />
        Incluir transferências internas
      </label>
      {active && (
        <button
          onClick={() => onChange(EMPTY_FILTER)}
          className="text-sm text-muted-foreground hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
