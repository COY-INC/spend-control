import "dotenv/config";
import { PluggyClient } from "pluggy-sdk";

// Forma normalizada que o resto do app consome (desacopla do SDK).
export type NormalizedTx = {
  pluggyTransactionId: string;
  pluggyAccountId: string;
  amount: number;
  date: Date;
  description: string;
  category: string;
  cardNumber: string | null; // 4 últimos dígitos do cartão (só CREDIT); separa principal/dependente
  installmentNumber: number | null; // nº da parcela (creditCardMetadata); fonte estruturada p/ "N/M"
  totalInstallments: number | null; // total de parcelas (creditCardMetadata)
  billId: string | null; // id da fatura na Pluggy (creditCardMetadata.billId); casa com CreditCardBill.pluggyBillId
  status: string | null; // POSTED | PENDING (Pluggy)
};

export type ReservedBalance = { name: string; amount: number };

export type NormalizedAccount = {
  pluggyAccountId: string;
  type: string;
  balance: number;
  name: string;
  brand: string | null;
  reservedBalances: ReservedBalance[]; // caixinhas/cofrinhos ("saldo reservado")
  additionalCards: string[]; // 4 últimos dígitos dos cartões dependentes (creditData.additionalCards)
};

export type NormalizedBill = {
  pluggyBillId: string;
  pluggyAccountId: string;
  closingDate: Date | null;
  dueDate: Date;
  totalAmount: number;
};

export type NormalizedInvestment = {
  pluggyInvestmentId: string;
  name: string;
  type: string;
  balance: number;
};

const MOCK = process.env.PLUGGY_MOCK === "1";

// Códigos COMPE -> nome do banco (o transferNumber vem como "260/0001/conta").
const COMPE_BANKS: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "077": "Inter",
  "104": "Caixa",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagBank",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "Itaú",
  "380": "PicPay",
  "422": "Safra",
  "637": "Sofisa",
  "756": "Sicoob",
  "748": "Sicredi",
};
const NAME_HINTS: [RegExp, string][] = [
  [/nu pagamentos|nubank/i, "Nubank"],
  [/bradesco/i, "Bradesco"],
  [/\binter\b/i, "Inter"],
  [/ita[uú]/i, "Itaú"],
  [/santander/i, "Santander"],
  [/banco do brasil/i, "Banco do Brasil"],
  [/caixa/i, "Caixa"],
  [/c6/i, "C6 Bank"],
  [/original/i, "Banco Original"],
  [/picpay/i, "PicPay"],
  [/mercado pago/i, "Mercado Pago"],
  [/pagbank|pagseguro/i, "PagBank"],
  [/btg/i, "BTG Pactual"],
];

// Deriva o nome real do banco a partir das contas do Item (MeuPluggy é proxy).
function deriveBankName(accounts: Array<Record<string, unknown>>): string | null {
  for (const a of accounts) {
    const tn = (a.bankData as { transferNumber?: string } | undefined)?.transferNumber;
    const code = tn?.split("/")[0]?.padStart(3, "0");
    if (code && COMPE_BANKS[code]) return COMPE_BANKS[code];
  }
  for (const a of accounts) {
    const text = `${a.name ?? ""} ${a.marketingName ?? ""}`;
    const hit = NAME_HINTS.find(([re]) => re.test(text));
    if (hit) return hit[1];
  }
  return null;
}

let _client: PluggyClient | null = null;
function client(): PluggyClient {
  if (!_client) {
    const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      throw new Error("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET são obrigatórios no .env");
    }
    _client = new PluggyClient({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    });
  }
  return _client;
}

// Token temporário para o widget PluggyConnect.
// Sem itemId → conexão nova. Com itemId → modo update (re-autenticar item existente).
// webhookUrl (WEBHOOK_URL no env) registra o webhook nos itens criados/atualizados por este token.
export async function createConnectToken(itemId?: string): Promise<string> {
  if (MOCK) return "mock-connect-token";
  const webhookUrl = process.env.WEBHOOK_URL || undefined;
  const { accessToken } = await client().createConnectToken(
    itemId,
    webhookUrl ? { webhookUrl } : undefined,
  );
  return accessToken;
}

// Força a Pluggy a re-sincronizar um Item; devolve o status.
// ponytail: proxies (MeuPluggy) rejeitam updateItem ("cant be updated") — nesses
// casos seguimos com o status atual, sem falhar. Sync real é assíncrono → "UPDATING".
export async function triggerItemUpdate(itemId: string): Promise<string> {
  if (MOCK) return "UPDATED";
  try {
    const item = await client().updateItem(itemId);
    return item.status;
  } catch (e) {
    // Proxies (MeuPluggy) rejeitam updateItem: não dá pra forçar coleta por aqui.
    // Logamos o motivo e seguimos com o status atual (o re-fetch pega o cache atual).
    console.warn(`[sync] updateItem falhou para ${itemId} (proxy?): ${(e as Error).message}`);
    const item = await client().fetchItem(itemId);
    return item.status;
  }
}

// Puxa nome do banco, contas (com saldo/tipo/bandeira), transações E faturas de um Item.
export async function fetchItemData(itemId: string): Promise<{
  institution: string;
  accounts: NormalizedAccount[];
  transactions: NormalizedTx[];
  bills: NormalizedBill[];
  investments: NormalizedInvestment[];
}> {
  if (MOCK) {
    return {
      institution: "Banco Mock",
      accounts: [
        { pluggyAccountId: `pluggy-acc-mock-${itemId}`, type: "CHECKING", balance: 5000, name: "Conta Mock", brand: null, reservedBalances: [{ name: "Caixinha Férias", amount: 300 }], additionalCards: [] },
      ],
      transactions: mockTransactions(itemId),
      bills: [],
      investments: [],
    };
  }

  const pluggy = client();
  const item = await pluggy.fetchItem(itemId);
  const { results: accounts } = await pluggy.fetchAccounts(itemId);

  // MeuPluggy é proxy: prefere o banco real derivado das contas; senão o nome do conector.
  const institution = deriveBankName(accounts as Array<Record<string, unknown>>) || item.connector.name;

  const normAccounts: NormalizedAccount[] = accounts.map((a) => ({
    pluggyAccountId: a.id,
    type: a.type,
    balance: a.balance,
    name: a.marketingName || a.name || a.type,
    brand: a.creditData?.brand ?? null,
    // "Saldo reservado": só BANK expõe; cada reserva soma suas faixas de remuneração.
    reservedBalances: (a.bankData?.reservedBalances ?? []).map((r) => ({
      name: r.name || "Reservado",
      amount: r.availableAmounts.reduce((s, x) => s + x.amount, 0),
    })),
    // Cartões dependentes: a Pluggy lista os adicionais em creditData.additionalCards.
    additionalCards: ((a.creditData as { additionalCards?: { number?: string }[] } | undefined)
      ?.additionalCards ?? [])
      .map((c) => c.number)
      .filter((n): n is string => !!n),
  }));

  const transactions: NormalizedTx[] = [];
  const bills: NormalizedBill[] = [];
  for (const account of accounts) {
    // fetchAllTransactions usa o cursor v2 (o fetchTransactions v1 foi depreciado pela Pluggy).
    const accountTxs = await pluggy.fetchAllTransactions(account.id);
    for (const t of accountTxs) {
      const meta = (
        t as {
          creditCardMetadata?: {
            cardNumber?: string;
            installmentNumber?: number;
            totalInstallments?: number;
            billId?: string;
          };
        }
      ).creditCardMetadata;
      transactions.push({
        pluggyTransactionId: t.id,
        pluggyAccountId: account.id,
        amount: t.amount,
        date: new Date(t.date),
        description: t.description,
        category: t.category ?? "Sem categoria",
        cardNumber: meta?.cardNumber ?? null,
        installmentNumber: meta?.installmentNumber ?? null,
        totalInstallments: meta?.totalInstallments ?? null,
        billId: meta?.billId ?? null,
        status: (t as { status?: string }).status ?? null,
      });
    }

    // Faturas fechadas (só cartão de crédito).
    if (account.type === "CREDIT") {
      const { results: cardBills } = await pluggy.fetchCreditCardBills(account.id);
      for (const b of cardBills) {
        bills.push({
          pluggyBillId: b.id,
          pluggyAccountId: account.id,
          closingDate: b.billClosingDate ? new Date(b.billClosingDate) : null,
          dueDate: new Date(b.dueDate),
          totalAmount: b.totalAmount,
        });
      }
    }
  }

  // Investimentos do Item (broker/banco com produto INVESTMENTS). MeuPluggy pode não
  // expor — nesse caso segue sem investimentos (não derruba o sync).
  let investments: NormalizedInvestment[] = [];
  try {
    const { results } = await pluggy.fetchInvestments(itemId);
    // Só posições com saldo: descarta CDB/aplicação já resgatada (status TOTAL_WITHDRAWAL,
    // balance 0) — senão a tela lista várias linhas "R$ 0,00" de aplicações encerradas.
    investments = results
      .filter((i) => Number.isFinite(i.balance) && i.balance > 0)
      .map((i) => ({
        pluggyInvestmentId: i.id,
        name: i.name || i.type,
        type: i.type,
        balance: i.balance,
      }));
  } catch (e) {
    console.warn(`[sync] investimentos indisponíveis para ${itemId}: ${(e as Error).message}`);
  }

  return { institution, accounts: normAccounts, transactions, bills, investments };
}

// ponytail: stub local para testar webhook -> upsert sem credenciais/rede.
// IDs estáveis provam que reprocessar o webhook não duplica (upsert).
function mockTransactions(itemId: string): NormalizedTx[] {
  const acc = `pluggy-acc-mock-${itemId}`;
  return [
    { pluggyTransactionId: `mock-tx-1-${itemId}`, pluggyAccountId: acc, amount: -49.9, date: new Date(), description: "Mercado (mock)", category: "Mercado", cardNumber: null, installmentNumber: null, totalInstallments: null, billId: null, status: "POSTED" },
    { pluggyTransactionId: `mock-tx-2-${itemId}`, pluggyAccountId: acc, amount: -120, date: new Date(), description: "Restaurante (mock)", category: "Restaurante", cardNumber: null, installmentNumber: null, totalInstallments: null, billId: null, status: "POSTED" },
    { pluggyTransactionId: `mock-tx-3-${itemId}`, pluggyAccountId: acc, amount: 5000, date: new Date(), description: "Salário (mock)", category: "Salário", cardNumber: null, installmentNumber: null, totalInstallments: null, billId: null, status: "POSTED" },
  ];
}
