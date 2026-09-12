import { useEffect, useMemo, useState } from "react";
import { api, brl, type InvoiceLineItem } from "@/api";
import { parcelInfo } from "@/lib/installment";

type SortMode = "date-desc" | "date-asc" | "name";

const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

type InvoiceDetailModalProps = {
  title: string;
  subtitle: string;
  total: number;
  items: InvoiceLineItem[];
  onClose: () => void;
  onChanged?: () => void; // avisa o card pra recarregar (totais das faturas mudam ao antecipar)
};

// Detalhamento de uma fatura (aberta, fechada, futura ou do histórico): lista os itens
// que compõem o valor. Para faturas fechadas o `total` é o oficial do Bill — se ele diverge
// da soma dos itens (juros/encargos que não viram transação), mostra a linha "encargos/ajuste".
export function InvoiceDetailModal({ title, subtitle, total, items: propItems, onClose, onChanged }: InvoiceDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cópia local pra refletir a marca de antecipada na hora (o card recarrega por baixo).
  const [items, setItems] = useState(propItems);
  useEffect(() => setItems(propItems), [propItems]);

  const [antBusy, setAntBusy] = useState<string | null>(null);
  const now = Date.now();
  const toggleAnticipated = async (it: InvoiceLineItem) => {
    setAntBusy(it.id);
    try {
      await api.setAnticipated(it.id, !it.anticipated);
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, anticipated: !it.anticipated } : x)));
      onChanged?.();
    } catch (e) {
      console.error(e);
    } finally {
      setAntBusy(null);
    }
  };

  const sum = items.reduce((s, i) => s + i.amount, 0);
  const adjustment = total - sum;

  // Rateio por portador do cartão (principal/dependente): só aparece quando há adicional.
  const hasOwners = items.some((i) => i.cardOwner);
  const ownerTotal = (o: "principal" | "dependente") =>
    items.filter((i) => i.cardOwner === o).reduce((s, i) => s + i.amount, 0);

  // Clicar no card de Principal/Dependente filtra a lista; clicar de novo no mesmo limpa o filtro.
  const [ownerFilter, setOwnerFilter] = useState<"principal" | "dependente" | null>(null);
  const toggleOwnerFilter = (o: "principal" | "dependente") =>
    setOwnerFilter((prev) => (prev === o ? null : o));

  const [sort, setSort] = useState<SortMode>("date-desc");
  const sortedItems = useMemo(() => {
    const filtered = ownerFilter ? items.filter((i) => i.cardOwner === ownerFilter) : items;
    const copy = [...filtered];
    if (sort === "name") return copy.sort((a, b) => (a.description || "").localeCompare(b.description || "", "pt-BR"));
    return copy.sort((a, b) =>
      sort === "date-asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
  }, [items, sort, ownerFilter]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <span className="ledger text-lg font-semibold text-rose-600 dark:text-rose-500">{brl(total)}</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>

        {/* Rateio principal × dependente (só cartões com adicional). Clicar filtra a lista abaixo. */}
        {hasOwners && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(["principal", "dependente"] as const).map((o) => {
              const active = ownerFilter === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggleOwnerFilter(o)}
                  aria-pressed={active}
                  className={`rounded-md px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-primary/10 ring-1 ring-inset ring-primary"
                      : "bg-muted/50 hover:bg-accent"
                  }`}
                >
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {o === "principal" ? "Principal" : "Dependente"}
                  </span>
                  <span className="ledger text-sm font-semibold tabular-nums">{brl(ownerTotal(o))}</span>
                </button>
              );
            })}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem itens para exibir nesta fatura.</p>
        ) : sortedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma transação {ownerFilter === "principal" ? "do principal" : "do dependente"} nesta fatura.
          </p>
        ) : (
          <>
          <div className="mb-3 flex justify-end">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
              aria-label="Ordenar itens"
            >
              <option value="date-desc">Data (mais recente)</option>
              <option value="date-asc">Data (mais antiga)</option>
              <option value="name">Nome</option>
            </select>
          </div>
          <ul className="space-y-2">
            {sortedItems.map((it, i) => {
              const parcel = parcelInfo(it);
              return (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  {/* comentário como título (igual ao card de assinaturas); descrição vira 💬 */}
                  <span className="block truncate font-medium text-foreground">{it.description || "—"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {dm(it.date)}
                    {it.category && ` · ${it.category} ${it.note ? `· 💬${it.note}` : ""}`}
                    {/* description pode vir limpa pela Pluggy sem "N/M" (ex.: Mercado Pago) —
                        installmentNumber/totalIsntallments garantem o badge mesmo assim. */}
                    {parcel && (
                      <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                        {parcel.n}/{parcel.m}
                      </span>
                    )}
                    {it.cardOwner && (
                      <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                        {it.cardOwner === "principal" ? "Principal" : "Dependente"}
                      </span>
                    )}
                  </span>
                  {/* {it.note && (
                    <span className="mt-0.5 block truncate text-xs italic text-muted-foreground">💬 {it.note}</span>
                  )} */}
                  {parcel && (it.anticipated || new Date(it.date).getTime() > now) && (
                    <button
                      onClick={() => toggleAnticipated(it)}
                      disabled={antBusy === it.id}
                      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
                        it.anticipated
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "border border-border/60 text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {antBusy === it.id ? "…" : it.anticipated ? "✓ antecipada · desfazer" : "Antecipei esta parcela"}
                    </button>
                  )}
                </span>
                <span className="shrink-0 tabular-nums font-medium text-foreground">{brl(it.amount)}</span>
              </li>
              );
            })}
          </ul>
          </>
        )}

        {/* Diferença entre o total oficial e a soma dos itens (encargos/juros). Tolerância de centavos. */}
        {Math.abs(adjustment) > 0.02 && (
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border/50 pt-3 text-sm">
            <span className="text-muted-foreground">Encargos/ajuste</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{brl(adjustment)}</span>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
