import { useEffect, useState } from "react";
import { api, brl, type DueReminder } from "@/api";
import { Alert } from "@/components/ui/alert";

const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function whenLabel(d: number): string {
  if (d > 1) return `vence em ${d} dias`;
  if (d === 1) return "vence amanhã";
  if (d === 0) return "vence hoje";
  if (d === -1) return "venceu ontem";
  return `venceu há ${-d} dias`;
}

// Lembretes de vencimento no topo do dashboard: faturas fechadas não pagas, a vencer ou
// vencidas recentes. Âmbar quando a vencer, vermelho quando vencida. Some quando não há.
export function DueRemindersBanner() {
  const [items, setItems] = useState<DueReminder[]>([]);

  useEffect(() => {
    api.dueReminders().then(setItems).catch(console.error);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {items.map((r, i) => (
        <Alert key={i} variant={r.daysUntil < 0 ? "destructive" : "warning"}>
          <span className="font-medium">
            Fatura {r.bank}
            {r.cardName ? ` · ${r.cardName}` : ""}
          </span>
          {" — "}
          <span className="ledger">{brl(r.amount)}</span> · {whenLabel(r.daysUntil)} ({dm(r.dueDate)})
        </Alert>
      ))}
    </div>
  );
}
