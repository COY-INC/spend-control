import { brl, expenseValue, isCard, type Transaction } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Despesas do período separadas por meio: cartão (CREDIT) vs conta/pix/transferência (BANK).
// expenseValue já exclui pagamento de fatura, evitando duplo-count.
export function PaymentMethodSplitCard({
  transactions,
  includeInternal = false,
}: {
  transactions: Transaction[];
  includeInternal?: boolean;
}) {
  let cartao = 0;
  let conta = 0;
  for (const t of transactions) {
    const spent = expenseValue(t, includeInternal);
    if (spent <= 0) continue;
    if (isCard(t)) cartao += spent;
    else conta += spent;
  }
  const total = cartao + conta;
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Despesas por meio de pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Sem despesas neste mês.</p>
        ) : (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <div className="bg-sky-500" style={{ width: `${pct(cartao)}%` }} />
              <div className="bg-violet-500" style={{ width: `${pct(conta)}%` }} />
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> Cartão
                </div>
                <div className="ledger font-medium">
                  {brl(cartao)} <span className="text-xs text-muted-foreground">({pct(cartao)}%)</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-muted-foreground">
                  Pix/Transferência <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
                </div>
                <div className="ledger font-medium">
                  {brl(conta)} <span className="text-xs text-muted-foreground">({pct(conta)}%)</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
