import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, brl, counterpartyKey, isCard, type Transaction } from "@/api";
import { installmentGroup } from "@/lib/installment";

// Direção real do movimento (independe da contabilidade interna do casal): dinheiro
// que entrou vs saiu daquela conta. Compra no cartão conta como saída.
function direction(t: Transaction): "in" | "out" {
  const a = Number(t.amount);
  if (isCard(t)) return a >= 0 ? "out" : "in";
  return a >= 0 ? "in" : "out";
}

const monthLabel = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const dayLabel = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

// Título legível a partir da chave normalizada (uppercase) → Capitalizada.
const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || "Movimentação";

// Timeline de todas as movimentações com o mesmo contato/estabelecimento da transação
// clicada — busca o histórico completo (sem recorte de mês) e agrupa por mês.
export function TransactionTimelineModal({
  origin,
  userId,
  onClose,
  onSaved,
}: {
  origin: Transaction;
  userId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [all, setAll] = useState<Transaction[] | null>(null);
  const [shown, setShown] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const key = useMemo(() => counterpartyKey(origin.description), [origin.description]);

  // Só no mount: busca o histórico uma vez e registra o ESC (via ref, sem re-rodar).
  useEffect(() => {
    setShown(true);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onEsc);
    api.transactions(userId).then(setAll).catch(() => setAll([]));
    return () => window.removeEventListener("keydown", onEsc);
  }, [userId]);

  const items = useMemo(
    () =>
      (all ?? [])
        .filter((t) => counterpartyKey(t.description) === key)
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [all, key],
  );

  const totals = useMemo(() => {
    let entrou = 0,
      saiu = 0;
    for (const t of items) {
      const v = Math.abs(Number(t.amount));
      direction(t) === "in" ? (entrou += v) : (saiu += v);
    }
    return { entrou, saiu, net: entrou - saiu };
  }, [items]);

  // Se a transação clicada é uma parcela de cartão, reúne as parcelas equivalentes da MESMA
  // compra e calcula total / pago / falta (ver lib/installment).
  const parcela = useMemo(() => installmentGroup(origin, all ?? []), [origin, all]);

  const [note, setNote] = useState(origin.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const saveNote = async () => {
    setSavingNote(true);
    try {
      await api.setTransactionNote(origin.id, note.trim());
      onSaved?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNote(false);
    }
  };

  const [antBusy, setAntBusy] = useState<string | null>(null);
  const toggleAnticipated = async (t: Transaction) => {
    setAntBusy(t.id);
    try {
      await api.setAnticipated(t.id, !t.anticipated);
      const fresh = await api.transactions(userId);
      setAll(fresh);
      onSaved?.(); // atualiza a tabela/telas por baixo
    } catch (e) {
      console.error(e);
    } finally {
      setAntBusy(null);
    }
  };

  // Parcelamento → só as parcelas da compra (asc, 1→M); senão o histórico do estabelecimento.
  const timeline = parcela ? parcela.siblings : items;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Movimentações com ${titleCase(key)}`}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl ring-1 ring-border transition duration-200 motion-reduce:transition-none sm:rounded-2xl ${
          shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {/* Cabeçalho: contato + resumo do fluxo com ele */}
        <header className="border-b border-border px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {parcela ? "Compra parcelada" : "Movimentações com"}
              </p>
              <h2 className="truncate text-lg font-semibold text-foreground">
                {titleCase(parcela ? parcela.base : key)}
              </h2>
              {parcela && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Parcela {parcela.N} de {parcela.M} · {parcela.paidCount} paga{parcela.paidCount === 1 ? "" : "s"}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            {parcela ? (
              <>
                <Stat label="Total" value={brl(parcela.total)} className="text-foreground" />
                <Stat label="Pago" value={brl(parcela.pago)} className="text-emerald-600 dark:text-emerald-400" />
                <Stat label="Falta" value={brl(parcela.falta)} className="text-rose-600 dark:text-rose-400" />
              </>
            ) : (
              <>
                <Stat label="Entrou" value={brl(totals.entrou)} className="text-emerald-600 dark:text-emerald-400" />
                <Stat label="Saiu" value={brl(totals.saiu)} className="text-rose-600 dark:text-rose-400" />
                <Stat
                  label="Saldo"
                  value={brl(totals.net)}
                  className={totals.net < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}
                />
              </>
            )}
          </div>
        </header>

        {/* Comentário desta compra (vale para todas as parcelas/recorrências do grupo). */}
        <div className="border-b border-border px-5 py-3">
          <label htmlFor="tx-note" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Comentário desta compra
          </label>
          <div className="flex gap-2">
            <input
              id="tx-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Ex.: Carregador e cabo"
              className="min-h-10 flex-1 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm"
            />
            <button
              onClick={saveNote}
              disabled={savingNote}
              className="min-h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingNote ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>

        {/* Corpo: rail vertical com nós por direção, dividido por mês */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {all === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando histórico…</p>
          ) : timeline.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma movimentação encontrada.</p>
          ) : (
            <ol className="relative">
              {timeline.map((t, i) => {
                const dir = direction(t);
                const newMonth = i === 0 || monthLabel(t.date) !== monthLabel(timeline[i - 1].date);
                const v = Math.abs(Number(t.amount));
                return (
                  <li key={t.id}>
                    {newMonth && (
                      <div className="flex items-center gap-3 pb-2 pt-4 first:pt-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {monthLabel(t.date)}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className="relative flex gap-3 pb-3 pl-1">
                      {/* rail + nó */}
                      <div className="relative flex flex-col items-center">
                        <span className="absolute top-4 h-full w-px bg-border" aria-hidden />
                        <span
                          className={`z-10 mt-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-card ${
                            dir === "in" ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                            <path
                              d={dir === "in" ? "M12 5v14M5 12l7 7 7-7" : "M12 19V5M5 12l7-7 7 7"}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </div>
                      {/* conteúdo */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm text-foreground">{t.description}</span>
                          <span
                            className={`shrink-0 text-sm font-semibold tabular-nums ${
                              dir === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {dir === "in" ? "+" : "−"}
                            {brl(v)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {dayLabel(t.date)} · {t.account.item.institution} · {t.category}
                        </div>
                        {parcela && (t.anticipated || new Date(t.date) > new Date()) && (
                          <button
                            onClick={() => toggleAnticipated(t)}
                            disabled={antBusy === t.id}
                            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
                              t.anticipated
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : "border border-border/60 text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            {antBusy === t.id
                              ? "…"
                              : t.anticipated
                                ? "✓ antecipada · desfazer"
                                : "Antecipei esta parcela"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
