import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Transaction } from "@/api";
import { brl, expenseValue, effectiveCategory } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Paleta categórica coesa (ancorada no índigo de marca), em vez do arco-íris de defaults.
const COLORS = ["#4f46e5", "#0891b2", "#0d9488", "#d97706", "#e11d48", "#9333ea", "#64748b"];

// Agrupa o total de DESPESAS (amount < 0) por categoria.
export function ExpensesDonut({
  transactions,
  includeInternal = false,
}: {
  transactions: Transaction[];
  includeInternal?: boolean;
}) {
  const data = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const t of transactions) {
      const spent = expenseValue(t, includeInternal);
      if (spent > 0) {
        const cat = effectiveCategory(t);
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + spent);
      }
    }
    return [...byCategory.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, includeInternal]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Despesas por categoria</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem despesas.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => brl(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
