// Validação/normalização do POST /transactions (lançamento avulso: dinheiro em espécie, Pix
// fora da conta sincronizada, gasto que a Pluggy não capturou). Ao contrário de
// POST /commitments/manual, não depende de installments[] nem exige conta CREDIT — uma linha só.

export type ManualTransactionInput = {
  accountId: string;
  amount: number;
  date: Date;
  description: string;
  category: string;
  userCategories: string[];
};

export function parseManualTransaction(body: unknown): { data: ManualTransactionInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const accountId = typeof b.accountId === "string" ? b.accountId.trim() : "";
  const amount = Number(b.amount);
  const date = typeof b.date === "string" || typeof b.date === "number" ? new Date(b.date) : null;
  const description = typeof b.description === "string" ? b.description.trim() : "";

  if (!accountId || !Number.isFinite(amount) || !date || Number.isNaN(date.getTime()) || !description) {
    return { error: "accountId, amount, date e description são obrigatórios." };
  }

  const category = typeof b.category === "string" ? b.category : "";
  // trim, descarta vazios e dedupe preservando a ordem (1ª = principal) — mesma regra do
  // PATCH /transactions/:id.
  const userCategories = Array.isArray(b.userCategories)
    ? [...new Set(b.userCategories.map((c) => String(c).trim()).filter(Boolean))]
    : [];

  return { data: { accountId, amount, date, description, category, userCategories } };
}
