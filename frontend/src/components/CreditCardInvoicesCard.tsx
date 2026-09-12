import { useEffect, useState } from "react";
import { api, brl, type CreditCard, type InvoiceLineItem, type FutureInvoice } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardBrand } from "@/components/CardBrand";
import { InvoiceDetailModal } from "@/components/InvoiceDetailModal";

// Datas de fatura (fechamento/vencimento) são "date-only" salvas como UTC-meia-noite;
// formata em UTC para não voltar um dia no fuso local (ex.: "fechou 27" virava "26").
const dm = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
    : "—";

type Selected = { title: string; subtitle: string; total: number; items: InvoiceLineItem[] };

// Cartões de crédito por ciclo de fatura (independente do seletor de mês).
// Fatura atual em aberto (calculada) + histórico das fechadas, por cartão.
export function CreditCardInvoicesCard({ userId, bank }: { userId?: string; bank?: string }) {
  const [all, setAll] = useState<CreditCard[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);

  useEffect(() => {
    api.cards(userId).then(setAll).catch(console.error);
  }, [userId]);

  const cards = bank ? all.filter((c) => c.bank === bank) : all;
  const totalOpen = cards.reduce((s, c) => s + c.openInvoice.amount, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Cartões de crédito (por fatura)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cartão de crédito conectado.</p>
          ) : (
            <>
            {/* Total das faturas abertas somadas até agora (todos os cartões exibidos). */}
            {cards.length > 1 && (
              <div className="flex items-baseline justify-between border-b border-border/50 pb-3">
                <span className="text-sm font-medium text-muted-foreground">Total das faturas abertas</span>
                <span className="ledger text-xl font-semibold text-rose-600 dark:text-rose-500">
                  {brl(totalOpen)}
                </span>
              </div>
            )}
            {cards.map((c) => {
              const cardTitle = c.cardName ? `${c.bank} · ${c.cardName}` : c.bank;
              const monthLabel = (iso: string) =>
                new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");

              // Fatura fechada a vencer (container próprio) e histórico das já vencidas.
              const closed = c.closedInvoice;
              const older = c.history;
              return (
              <div key={c.accountId} className="space-y-3">
                <span className="flex items-center gap-2 font-medium">
                  <CardBrand brand={c.brand} />
                  {c.bank}
                  {c.cardName && (
                    <span className="text-sm font-normal text-muted-foreground">· {c.cardName}</span>
                  )}
                </span>

                {/* Fatura atual, ainda em aberto (número grande). */}
                <div
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded-md -mx-1 px-1 hover:bg-accent/50"
                  onClick={() =>
                    setSelected({
                      title: cardTitle,
                      subtitle: c.openInvoice.since ? `Fatura aberta desde ${dm(c.openInvoice.since)}` : "Fatura aberta",
                      total: c.openInvoice.amount,
                      items: c.openInvoice.items,
                    })
                  }
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") &&
                    (e.preventDefault(),
                    setSelected({
                      title: cardTitle,
                      subtitle: c.openInvoice.since ? `Fatura aberta desde ${dm(c.openInvoice.since)}` : "Fatura aberta",
                      total: c.openInvoice.amount,
                      items: c.openInvoice.items,
                    }))
                  }
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Fatura atual{c.openInvoice.since && ` · aberta desde ${dm(c.openInvoice.since)}`}
                  </span>
                  <div className="ledger text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-500">
                    {brl(c.openInvoice.amount)}
                  </div>
                </div>

                {/* Fatura fechada mais recente — a que precisa ser paga. */}
                {closed && (
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer items-baseline justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 hover:bg-accent/50"
                    onClick={() =>
                      setSelected({
                        title: cardTitle,
                        subtitle: `fechou ${dm(closed.closingDate)} · vence ${dm(closed.dueDate)}`,
                        total: closed.amount,
                        items: closed.items,
                      })
                    }
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      (e.preventDefault(),
                      setSelected({
                        title: cardTitle,
                        subtitle: `fechou ${dm(closed.closingDate)} · vence ${dm(closed.dueDate)}`,
                        total: closed.amount,
                        items: closed.items,
                      }))
                    }
                  >
                    <span className="text-sm">
                      <span className="font-medium">Fatura fechada</span>
                      <span className="text-muted-foreground">
                        {" · "}fechou {dm(closed.closingDate)} · vence {dm(closed.dueDate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {brl(closed.amount)}
                    </span>
                  </div>
                )}

                {/* Próximas faturas (ciclos futuros com parcelas). */}
                {c.future.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Próximas faturas
                    </span>
                    <ul className="space-y-0.5 text-sm">
                      {c.future.map((f: FutureInvoice, i: number) => (
                        <li
                          key={i}
                          role="button"
                          tabIndex={0}
                          className="flex cursor-pointer justify-between rounded-md px-1 py-0.5 hover:bg-accent/50"
                          onClick={() =>
                            setSelected({
                              title: cardTitle,
                              subtitle: `fecha ${dm(f.closingDate)} · vence ${dm(f.dueDate)}`,
                              total: f.amount,
                              items: f.items,
                            })
                          }
                          onKeyDown={(e) =>
                            (e.key === "Enter" || e.key === " ") &&
                            (e.preventDefault(),
                            setSelected({
                              title: cardTitle,
                              subtitle: `fecha ${dm(f.closingDate)} · vence ${dm(f.dueDate)}`,
                              total: f.amount,
                              items: f.items,
                            }))
                          }
                        >
                          <span className="capitalize text-muted-foreground">{monthLabel(f.closingDate)}</span>
                          <span className="tabular-nums">{brl(f.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Faturas anteriores (histórico). */}
                {older.length > 0 && (
                  <ul className="space-y-0.5 text-sm">
                    {older.map((b, i) => (
                      <li
                        key={i}
                        role="button"
                        tabIndex={0}
                        className="flex cursor-pointer justify-between rounded-md px-1 py-0.5 text-muted-foreground hover:bg-accent/50"
                        onClick={() =>
                          setSelected({
                            title: cardTitle,
                            subtitle: `fechou ${dm(b.closingDate)} · venceu ${dm(b.dueDate)}`,
                            total: b.totalAmount,
                            items: b.items,
                          })
                        }
                        onKeyDown={(e) =>
                          (e.key === "Enter" || e.key === " ") &&
                          (e.preventDefault(),
                          setSelected({
                            title: cardTitle,
                            subtitle: `fechou ${dm(b.closingDate)} · venceu ${dm(b.dueDate)}`,
                            total: b.totalAmount,
                            items: b.items,
                          }))
                        }
                      >
                        <span>
                          fechou {dm(b.closingDate)} · venceu {dm(b.dueDate)}
                        </span>
                        <span className="tabular-nums">{brl(b.totalAmount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              );
            })}
            </>
          )}
        </CardContent>
      </Card>

      {selected && (
        <InvoiceDetailModal
          title={selected.title}
          subtitle={selected.subtitle}
          total={selected.total}
          items={selected.items}
          onChanged={() => api.cards(userId).then(setAll).catch(console.error)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
