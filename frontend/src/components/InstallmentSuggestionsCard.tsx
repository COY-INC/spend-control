import { useEffect, useMemo, useState } from "react";
import { api, brl, type Suggestion } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const monthInput = (iso: string) => iso.slice(0, 7); // "YYYY-MM"
const dayOf = (iso: string) => new Date(iso).getUTCDate();
// Rótulo curto de parcela: "out/26" (parcelas caem uma por mês).
const parcelLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");

// Reprojeta as parcelas ao adaptar: n a partir de `startN`, valor fixo, um mês por parcela
// a partir de `firstMonth` (YYYY-MM), preservando o dia da 1ª parcela sugerida.
function reproject(firstMonth: string, count: number, amount: number, startN: number, day: number) {
  const [y, m] = firstMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
    return { n: startN + i, date: d.toISOString(), amount };
  });
}

// Sugestões de parcelas futuras (Bradesco/Mercado Pago não projetam): aceitar cria as linhas,
// recusar some com ela, adaptar deixa ajustar valor/qtd/mês antes de aceitar. Respeita o banco.
export function InstallmentSuggestionsCard({
  userId,
  bank,
  onChange,
}: {
  userId?: string;
  bank?: string;
  onChange?: () => void;
}) {
  const [all, setAll] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [detail, setDetail] = useState<Suggestion | null>(null);
  const [owner, setOwner] = useState<"all" | "principal" | "dependente">("all");
  // rascunho da adaptação por sugestão (key -> {mes, qtd, valor})
  const [draft, setDraft] = useState<Record<string, { firstMonth: string; count: number; amount: number }>>({});

  useEffect(() => {
    api.commitmentSuggestions(userId).then(setAll).catch(console.error);
  }, [userId]);

  // Agrupa por banco (ordenado por valor comprometido) — a lista fica escaneável em vez de
  // uma coluna solta de compras de bancos misturados.
  // Só faz sentido oferecer o filtro de portador se algum cartão tem dependente.
  const hasOwners = useMemo(() => all.some((s) => s.cardOwner !== null), [all]);

  const groups = useMemo(() => {
    let filtered = bank ? all.filter((s) => s.bank === bank) : all;
    if (owner !== "all") filtered = filtered.filter((s) => s.cardOwner === owner);
    const byBank = new Map<string, Suggestion[]>();
    for (const s of filtered) (byBank.get(s.bank) ?? byBank.set(s.bank, []).get(s.bank)!).push(s);
    const totalOf = (s: Suggestion) => s.installmentAmount * s.installments.length;
    return [...byBank.entries()]
      .map(([bankName, items]) => ({
        bank: bankName,
        items: items.slice().sort((a, b) => totalOf(b) - totalOf(a)),
        total: items.reduce((sum, s) => sum + totalOf(s), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [all, bank, owner]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  // Quantas existem no banco selecionado, IGNORANDO o filtro de portador — decide se o card
  // aparece (não some só porque o filtro atual esvaziou a lista).
  const baseCount = useMemo(() => (bank ? all.filter((s) => s.bank === bank) : all).length, [all, bank]);

  const remove = (key: string) => setAll((prev) => prev.filter((s) => s.key !== key));

  async function accept(s: Suggestion) {
    const d = draft[s.key];
    const installments = d
      ? reproject(d.firstMonth, d.count, d.amount, s.nextInstallmentNumber, dayOf(s.installments[0].date))
      : s.installments;
    setBusy(s.key);
    try {
      await api.acceptManualInstallments({
        accountId: s.accountId,
        label: s.label,
        totalInstallments: s.totalInstallments,
        cardNumber: s.cardNumber,
        installments,
      });
      remove(s.key);
      onChange?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
      setEditing(null);
    }
  }

  async function reject(s: Suggestion) {
    setBusy(s.key);
    try {
      await api.dismissSuggestion(s.key);
      remove(s.key);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  function startEdit(s: Suggestion) {
    setEditing(s.key);
    setDraft((prev) => ({
      ...prev,
      [s.key]: {
        firstMonth: monthInput(s.installments[0].date),
        count: s.installments.length,
        amount: s.installmentAmount,
      },
    }));
  }

  if (baseCount === 0) return null;

  const OWNER_TABS: { id: typeof owner; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "principal", label: "Principal" },
    { id: "dependente", label: "Dependente" },
  ];

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Sugestões de parcelas</CardTitle>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {count}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Parcelas futuras que o banco não envia, estimadas a partir das que já entraram. Aceite,
          recuse ou adapte antes de confirmar.
        </p>
        {/* Filtro por portador: só aparece quando algum cartão tem dependente. */}
        {hasOwners && (
          <div className="mt-1 inline-flex rounded-lg border border-border p-0.5">
            {OWNER_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setOwner(t.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  owner === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {count === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma sugestão para este portador.</p>
        )}
        {groups.map((g) => (
          <section key={g.bank} className="space-y-2.5">
            {/* Cabeçalho do banco: só quando há mais de um grupo (sem filtro de banco). */}
            {!bank && (
              <div className="flex items-baseline justify-between border-b border-border pb-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.bank}</h3>
                <span className="text-xs text-muted-foreground">
                  {g.items.length} · <span className="tabular-nums">{brl(g.total)}</span>
                </span>
              </div>
            )}
            <ul className="space-y-2.5">
              {g.items.map((s) => {
                const d = draft[s.key];
                const isEditing = editing === s.key;
                const cnt = isEditing && d ? d.count : s.installments.length;
                const amt = isEditing && d ? d.amount : s.installmentAmount;
                const projected = cnt * amt;
                return (
                  <li
                    key={s.key}
                    className="space-y-3 rounded-xl border border-border bg-card p-3.5 transition hover:border-primary/40"
                  >
                    {/* Área de info clicável (não os botões): abre o detalhamento do que já
                        existe no banco vs. o que será inserido. */}
                    <button
                      type="button"
                      onClick={() => setDetail(s)}
                      className="flex w-full items-start justify-between gap-3 rounded-md text-left hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{s.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          faltam {s.installments.length} de {s.totalInstallments} · a partir da{" "}
                          {s.nextInstallmentNumber}ª parcela · ver detalhes
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular-nums text-sm font-semibold text-foreground">{brl(projected)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {cnt}× {brl(amt)}
                        </div>
                      </div>
                    </button>

                    {isEditing && d && (
                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2.5">
                        <label className="text-xs text-muted-foreground">
                          Mês inicial
                          <input
                            type="month"
                            value={d.firstMonth}
                            onChange={(e) => setDraft((p) => ({ ...p, [s.key]: { ...d, firstMonth: e.target.value } }))}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                          />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Parcelas
                          <input
                            type="number"
                            min={1}
                            value={d.count}
                            onChange={(e) => setDraft((p) => ({ ...p, [s.key]: { ...d, count: Math.max(1, Number(e.target.value)) } }))}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                          />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Valor (R$)
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={d.amount}
                            onChange={(e) => setDraft((p) => ({ ...p, [s.key]: { ...d, amount: Number(e.target.value) } }))}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                          />
                        </label>
                      </div>
                    )}

                    {/* Recusar à esquerda (mr-auto); Adaptar/Aceitar à direita, largura natural —
                        sem flex-1 pra Aceitar não esticar numa faixa gigante em telas largas. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={busy === s.key}
                        onClick={() => reject(s)}
                        className="mr-auto min-h-9 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        Recusar
                      </button>
                      <button
                        disabled={busy === s.key}
                        onClick={() => (isEditing ? setEditing(null) : startEdit(s))}
                        className="min-h-9 rounded-md border border-border px-4 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50"
                      >
                        {isEditing ? "Cancelar" : "Adaptar"}
                      </button>
                      <button
                        disabled={busy === s.key}
                        onClick={() => accept(s)}
                        className="min-h-9 rounded-md bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        Aceitar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>

    {detail && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        onClick={() => setDetail(null)}
      >
        <div
          className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 truncate text-lg font-semibold text-foreground">{detail.label}</h2>
            <span className="shrink-0 text-xs text-muted-foreground">{detail.bank}</span>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Parcelamento de {detail.totalInstallments}× — estimativa a partir do que o banco já enviou.
          </p>

          {/* Já no banco: parcelas reais, não serão reinseridas. */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Já no banco</h3>
              <span className="text-[11px] text-muted-foreground">não será inserido</span>
            </div>
            <ul className="space-y-1">
              {detail.existing.map((p) => (
                <li key={p.n} className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span className="tabular-nums">
                    {p.n}/{detail.totalInstallments} · {parcelLabel(p.date)}
                  </span>
                  <span className="tabular-nums line-through">{brl(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Será inserido: as parcelas projetadas (manuais). */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">Será inserido</h3>
              <span className="text-[11px] text-muted-foreground">{detail.installments.length} parcela{detail.installments.length > 1 ? "s" : ""}</span>
            </div>
            <ul className="space-y-1">
              {detail.installments.map((p) => (
                <li key={p.n} className="flex items-center justify-between gap-3 text-sm text-foreground">
                  <span className="tabular-nums">
                    {p.n}/{detail.totalInstallments} · {parcelLabel(p.date)}
                  </span>
                  <span className="tabular-nums font-medium">{brl(p.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2 text-sm">
              <span className="font-medium text-foreground">Total a inserir</span>
              <span className="tabular-nums font-semibold text-foreground">
                {brl(detail.installments.reduce((sum, p) => sum + p.amount, 0))}
              </span>
            </div>
          </div>

          <button
            onClick={() => setDetail(null)}
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
