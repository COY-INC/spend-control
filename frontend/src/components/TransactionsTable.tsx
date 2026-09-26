import { useState } from "react";
import type { Transaction } from "@/api";
import { api, brl, expenseValue, incomeValue } from "@/api";
import { CategoryMultiSelect } from "@/components/CategoryMultiSelect";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TransactionTimelineModal } from "@/components/TransactionTimelineModal";

export function TransactionsTable({
  transactions,
  onCategoryChange,
  userId,
  includeInternal = false,
  onNoteSaved,
  onDeleted,
}: {
  transactions: Transaction[];
  // categories === [] limpa as categorias do usuário (volta a herdar a da Pluggy)
  onCategoryChange: (id: string, categories: string[]) => void;
  userId?: string; // escopo do histórico da timeline (indefinido = casal/todos)
  includeInternal?: boolean;
  onNoteSaved?: () => void;
  onDeleted?: () => void; // recarrega a lista após apagar um lançamento manual
}) {
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (t: Transaction) => {
    if (!window.confirm(`Apagar o lançamento manual "${t.description}"?`)) return;
    setDeleting(t.id);
    try {
      await api.deleteTransaction(t.id);
      onDeleted?.();
    } catch (e) {
      console.error(e);
      alert("Não foi possível apagar a transação.");
    } finally {
      setDeleting(null);
    }
  };

  // Paginação: 20 por página; volta pra 1ª página quando a lista muda (filtros/mês).
  const PAGE = 20;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(transactions.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = transactions.slice(current * PAGE, current * PAGE + PAGE);

  // Valor exibido por linha (mesmo sinal da coluna Valor): saída negativa, entrada positiva,
  // neutros (liquidações de fatura / internas) com o valor cru. O totalizador soma exatamente
  // isso, sobre TODAS as transações filtradas (não só a página visível).
  const rowValue = (t: Transaction) => {
    const exp = expenseValue(t, includeInternal);
    const inc = incomeValue(t, includeInternal);
    return exp > 0 ? -exp : inc > 0 ? inc : Number(t.amount);
  };
  const total = transactions.reduce((s, t) => s + rowValue(t), 0);
  const totalColor =
    total < 0
      ? "text-rose-600 dark:text-rose-500"
      : total > 0
        ? "text-emerald-600 dark:text-emerald-500"
        : "text-muted-foreground";

  return (
    <>
    {detail && (
      <TransactionTimelineModal origin={detail} userId={userId} onClose={() => setDetail(null)} onSaved={onNoteSaved} />
    )}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[78px] md:w-auto">Data</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead className="hidden md:table-cell">Categoria (Pluggy)</TableHead>
          <TableHead className="hidden md:table-cell">Minha categoria</TableHead>
          <TableHead className="hidden md:table-cell">Instituição</TableHead>
          <TableHead className="w-[104px] text-right md:w-auto">Valor</TableHead>
          <TableHead className="w-20">
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((t) => {
          // Cor/sinal cientes do tipo de conta: despesa (inclui compra no cartão) em
          // vermelho e negativa; entrada em verde e positiva; liquidações (pagamento
          // de fatura/cartão) e movimentações internas neutras com o valor cru.
          const exp = expenseValue(t, includeInternal);
          const inc = incomeValue(t, includeInternal);
          const value = rowValue(t);
          const color =
            exp > 0
              ? "text-rose-600 dark:text-rose-500"
              : inc > 0
                ? "text-emerald-600 dark:text-emerald-500"
                : "text-muted-foreground";
          return (
          <TableRow key={t.id}>
            <TableCell className="tabular-nums">{new Date(t.date).toLocaleDateString("pt-BR")}</TableCell>
            <TableCell className="break-words">
              <span className="block">{t.description}</span>
              {t.note ? (
                <span className="mt-0.5 block text-xs italic text-muted-foreground">💬 {t.note}</span>
              ) : (
                expenseValue(t, includeInternal) > 0 && (
                  <span className="mt-0.5 block text-xs text-muted-foreground/60" title="sem comentário">
                    sem comentário
                  </span>
                )
              )}
            </TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">{t.category}</TableCell>
            <TableCell className="hidden md:table-cell">
              <CategoryMultiSelect
                selected={t.userCategories}
                onChange={(next) => onCategoryChange(t.id, next)}
                showPrimary
                placeholder="— (usar Pluggy)"
                ariaLabel="Minha categoria"
              />
            </TableCell>
            <TableCell className="hidden md:table-cell">{t.account.item.institution}</TableCell>
            <TableCell className={`whitespace-nowrap text-right font-medium ledger ${color}`}>
              {brl(value)}
            </TableCell>
            <TableCell className="w-20 text-right">
              <div className="flex items-center justify-end">
                {t.manual && (
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={deleting === t.id}
                    aria-label="Apagar lançamento manual"
                    title="Apagar lançamento manual"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2m-1 0v14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setDetail(t)}
                  aria-label="Ver histórico deste contato"
                  title="Ver histórico deste contato"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </TableCell>
          </TableRow>
          );
        })}
      </TableBody>
    </Table>
    {/* Totalizador: soma dos valores exibidos (todas as transações filtradas, não só a página). */}
    <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3 text-sm">
      <span className="text-muted-foreground">
        Total exibido · {transactions.length} {transactions.length === 1 ? "transação" : "transações"}
      </span>
      <span className={`ledger font-medium tabular-nums ${totalColor}`}>{brl(total)}</span>
    </div>
    {transactions.length > PAGE && (
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {current * PAGE + 1}–{Math.min(current * PAGE + PAGE, transactions.length)} de{" "}
          {transactions.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            className="min-h-10 rounded-md border border-border/50 px-3.5 py-1 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Anterior
          </button>
          <span className="px-2 tabular-nums">
            {current + 1} / {pages}
          </span>
          <button
            onClick={() => setPage(current + 1)}
            disabled={current >= pages - 1}
            className="min-h-10 rounded-md border border-border/50 px-3.5 py-1 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Próximo
          </button>
        </div>
      </div>
    )}
    </>
  );
}
