import { useMemo } from "react";
import { brl, signedBalance, accountMatchesFilter, overviewFilter } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReservedBalanceCard } from "@/components/ReservedBalanceCard";
import { ConnectionsStatus } from "@/components/ConnectionsStatus";
import { BankChip } from "@/components/BankChip";
import { useDashboard } from "@/dashboard/DashboardContext";

const TYPE_LABEL: Record<string, string> = {
  CREDIT: "Cartão de crédito",
  BANK: "Conta",
  LOAN: "Empréstimo",
  INVESTMENT: "Investimento",
};

export function Patrimonio() {
  const { accounts, investments, filter, scope, userId, users, reload } = useDashboard();

  const filteredAccounts = useMemo(() => {
    const gf = overviewFilter(filter);
    return accounts.filter((a) => accountMatchesFilter(a.institution, a.type, gf));
  }, [accounts, filter]);
  const filteredInvestments = useMemo(() => {
    const gf = overviewFilter(filter);
    return investments.filter((i) => accountMatchesFilter(i.institution, "INVESTMENT", gf));
  }, [investments, filter]);
  const total =
    filteredAccounts.reduce((s, a) => s + signedBalance(a), 0) +
    filteredInvestments.reduce((s, i) => s + i.balance, 0);
  const byUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of filteredAccounts) m.set(a.userName, (m.get(a.userName) ?? 0) + signedBalance(a));
    for (const i of filteredInvestments) m.set(i.userName, (m.get(i.userName) ?? 0) + i.balance);
    return [...m.entries()];
  }, [filteredAccounts, filteredInvestments]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{scope === "couple" ? "Saldo consolidado do casal" : "Saldo total"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="ledger text-2xl font-semibold tracking-tight tabular-nums">{brl(total)}</div>
          </CardContent>
        </Card>
        {scope === "couple" &&
          byUser.map(([name, balance]) => (
            <Card key={name}>
              <CardHeader>
                <CardTitle>{name}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="ledger text-2xl font-semibold tracking-tight tabular-nums">{brl(balance)}</div>
              </CardContent>
            </Card>
          ))}
        <ReservedBalanceCard userId={scope === "my" ? userId : undefined} bank={filter.banco} />
      </div>

      {/* Saldos por conta — cada um com a cor da marca do banco. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAccounts.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BankChip institution={a.institution} dotOnly />
                <CardTitle className="truncate">
                  {a.institution}
                  {a.name ? ` · ${a.name}` : ""}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="ledger text-xl font-semibold tabular-nums">{brl(signedBalance(a))}</div>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {TYPE_LABEL[a.type] ?? a.type}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConnectionsStatus onSynced={reload} users={users} userId={userId} />
    </div>
  );
}
