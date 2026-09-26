const BASE = import.meta.env?.VITE_API_URL || "http://localhost:3333";

export type User = { id: string; name: string };
export type Account = {
  id: string;
  type: string;
  name?: string | null;
  balance: string;
  item: { institution: string };
};

// CREDIT/LOAN são passivos (dívida) → contam negativo no patrimônio.
export const isLiability = (type: string) => type === "CREDIT" || type === "LOAN";
export const signedBalance = (a: { type: string; balance: string | number }) =>
  (isLiability(a.type) ? -1 : 1) * Number(a.balance);
export type Transaction = {
  id: string;
  amount: string;
  date: string;
  description: string;
  category: string; // automática da Pluggy (read-only)
  userCategories: string[]; // definidas pelo usuário; ordem importa ([0]=principal); [] herda a Pluggy
  note?: string | null; // comentário livre do usuário (compartilhado pela identidade da compra)
  anticipated?: boolean; // parcela marcada como antecipada (data efetiva movida p/ o ciclo aberto)
  installmentNumber?: number | null; // nº da parcela (creditCardMetadata); fonte estruturada p/ "N/M"
  totalInstallments?: number | null; // total de parcelas (creditCardMetadata)
  manual: boolean; // criada manualmente pelo usuário (lançamento avulso ou parcela projetada)
  account: { id: string; type: string; name?: string | null; item: { institution: string; userId: string } };
};

// Categoria efetiva PRINCIPAL: 1ª do usuário quando houver, senão a da Pluggy.
// Mantém as agregações (donut/orçamento/resumo) contando 1x por transação.
export const effectiveCategory = (t: Transaction) => t.userCategories[0] || t.category;
// Todas as categorias efetivas (exibição e filtro): as do usuário, ou [Pluggy] quando vazio.
export const effectiveCategories = (t: Transaction): string[] =>
  t.userCategories.length ? t.userCategories : [t.category];

// Sinal do valor depende do tipo de conta:
//  - cartão (CREDIT): compra = amount POSITIVO; pagamento/estorno = negativo.
//  - conta (BANK/outros): saída = amount NEGATIVO; entrada = positivo.
export const isCard = (t: Transaction) => t.account.type === "CREDIT";
// Pagamento de fatura: saída da conta que quita o cartão — transferência interna, não é
// despesa nova (a compra no cartão já contou). Detecta por categoria Pluggy "Credit card
// payment" (Itaú débito automático) OU descrição ("Pagamento de fatura" Nubank, "Pagamento
// Cartão de crédito" MP, que vem só como categoria "Transfers"). Sem isso, o pagamento
// contava de novo → total de saídas dobrado.
const isFaturaPayment = (t: Transaction) =>
  t.category === "Credit card payment" ||
  /fatura|pagamento\s+cart[ãa]o\s+de\s+cr[ée]dito/i.test(t.description);

// Movimentações internas do casal — dinheiro que não altera o patrimônio, só troca de conta.
// Não contam nem como entrada nem como saída (a menos que "ver tudo", ponto 4).
// Contraparte interna (ex.: cônjuge/mesma pessoa): o padrão vem de VITE_INTERNAL_PARTY_PATTERN
// pra não cravar nome pessoal no repo. Vazio → "(?!)" não casa ninguém por descrição.
const INTERNAL_PARTY_RE = new RegExp(import.meta.env?.VITE_INTERNAL_PARTY_PATTERN || "(?!)", "i");
// Reserva na própria conta (caixinha/cofrinho), nos dois sentidos: a Pluggy rotula como
// "Transfer - Internal", MAS também vem com outras categorias (Salary, Transfers, Music
// streaming...), então casamos também pela descrição "Dinheiro reservado/retirado ...".
const RESERVE_RE = /^\s*dinheiro (reservado|retirado)\b/i;
export const isReserveTransfer = (t: Transaction) =>
  t.category === "Transfer - Internal" || RESERVE_RE.test(t.description);
// Mesmo titular ou Pix/transferência com a contraparte interna configurada.
export const isSamePersonMovement = (t: Transaction) =>
  t.category === "Same person transfer" || INTERNAL_PARTY_RE.test(t.description);
// Aplicação/resgate em fundo ou investimento. O dinheiro só muda pra dentro/fora do
// investimento — segue do titular, então não é saída nem entrada (idem quitação de cartão,
// que a Pluggy também marca como "Investments"). A Pluggy rotula como "Investments"/"Mutual
// funds"; alguns bancos (ex.: Sofisa Direto) mandam "Sem categoria" e só a descrição
// denuncia a operação de renda fixa ("DEB./CRED. OP.RDA FIXA").
const INVESTMENT_OP_RE = /op\.?\s*r(?:en)?da\s*fixa/i;
export const isInvestmentTransfer = (t: Transaction) =>
  t.category === "Investments" || t.category === "Mutual funds" || INVESTMENT_OP_RE.test(t.description);
export const isInternalMovement = (t: Transaction) =>
  isReserveTransfer(t) || isSamePersonMovement(t) || isInvestmentTransfer(t);

// Valor de DESPESA (sempre >= 0). 0 se a transação não for despesa.
// includeInternal=true ignora as exclusões internas (filtro "ver tudo", ponto 4).
export function expenseValue(t: Transaction, includeInternal = false): number {
  if (!includeInternal && isInternalMovement(t)) return 0; // interna: não é saída
  const a = Number(t.amount);
  if (isCard(t)) return a > 0 ? a : 0; // compra no cartão
  if (isFaturaPayment(t)) return 0; // evita duplo-count com as compras do cartão
  return a < 0 ? -a : 0; // saída da conta (pix/débito/transferência)
}

// Valor de ENTRADA (sempre >= 0). Só conta dinheiro que entra na conta.
export function incomeValue(t: Transaction, includeInternal = false): number {
  if (!includeInternal && isInternalMovement(t)) return 0; // interna: não é entrada
  if (isCard(t)) return 0; // cartão não gera entrada
  const a = Number(t.amount);
  return a > 0 ? a : 0;
}

// Chave da contraparte/estabelecimento: normaliza a descrição (remove ruído de Pix/
// transferência e acentos) para agrupar movimentações do mesmo contato na timeline.
// ponytail: casa por igualdade da chave — grafias diferentes de um mesmo nome (ex.:
// "...Silva Sousa" vs "...Sousa Oliveira") ficam separadas; suficiente pro detalhamento.
export function counterpartyKey(description: string): string {
  return description
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(PIX|TRANSFERENCIA|RECEBID[OA]|ENVIAD[OA]|PAGAMENTO|COMPRA|REEMBOLSO|DE|DA|DO)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Filtros do dashboard aplicados sobre as transações do período.
// incluirInternos: quando true, mostra/conta as movimentações internas do casal
// (reservas, mesmo titular, esposa) que por padrão não entram como entrada/saída (ponto 4).
export type TxFilter = { tipo: string; banco: string; categorias: string[]; incluirInternos: boolean };
export const EMPTY_FILTER: TxFilter = { tipo: "", banco: "", categorias: [], incluirInternos: false };

// Filtro aplicável a contas (cards de saldo): banco casa institution; tipo mapeia
// para o tipo de conta (crédito=CREDIT, pix=demais). Entradas/saídas/categoria
// são conceitos de movimento e não restringem contas.
export function accountMatchesFilter(institution: string, type: string, f: TxFilter): boolean {
  if (f.banco && institution !== f.banco) return false;
  if (f.tipo === "credito" && type !== "CREDIT") return false;
  if (f.tipo === "pix" && type === "CREDIT") return false;
  return true;
}

export function applyTxFilters(txs: Transaction[], f: TxFilter): Transaction[] {
  return txs.filter((t) => {
    if (f.banco && t.account.item.institution !== f.banco) return false;
    // categorias = E: mantém só se a tx tiver TODAS as selecionadas (pode ter outras além).
    // `?? []` tolera filtro persistido do shape antigo.
    if ((f.categorias ?? []).length && !f.categorias.every((c) => effectiveCategories(t).includes(c)))
      return false;
    const inc = f.incluirInternos;
    // "pix"/"credito" são filtros de MÉTODO (entra e sai), como o toggle de meio em Gastos —
    // não só saída. Movimento real = entrada OU saída > 0 (exclui internas, salvo "ver tudo").
    const moves = incomeValue(t, inc) > 0 || expenseValue(t, inc) > 0;
    if (f.tipo === "entradas" && incomeValue(t, inc) <= 0) return false;
    if (f.tipo === "saidas" && expenseValue(t, inc) <= 0) return false;
    if (f.tipo === "pix" && !(!isCard(t) && moves)) return false;
    if (f.tipo === "credito" && !(isCard(t) && moves)) return false;
    return true;
  });
}

// tipo e categoria são filtros LOCAIS da lista de Transações. As telas de visão geral
// (Gastos/Cartões/Resumo) só herdam o escopo global (banco/internos) — senão um filtro
// de categoria/tipo posto em Transações distorceria os totais dessas telas.
export const overviewFilter = (f: TxFilter): TxFilter => ({ ...f, tipo: "", categorias: [] });

export type Consolidated = {
  total: number;
  byUser: { userId: string; name: string; balance: number }[];
};
export type ItemStatus = {
  id: string;
  pluggyItemId: string;
  institution: string;
  status: string;
  updatedAt: string; // hora do último sync (ISO)
  lastChangeAt?: string | null; // último sync que trouxe transação nova/alterada (ISO)
  lastChangeCount?: number | null; // quantas novas/alteradas nesse sync
  owner: string;
  accounts: number;
};
export type AccountFull = {
  id: string;
  type: string;
  name?: string | null;
  balance: string;
  institution: string;
  userId: string;
  userName: string;
};
// Uma reserva ("caixinha"/"cofrinho") de saldo reservado, já achatada por conta.
export type ReservedEntry = { bank: string; name: string; amount: number };
// Uma posição de investimento importada da Pluggy.
export type Investment = {
  institution: string;
  name: string;
  type: string; // EQUITY, FIXED_INCOME, MUTUAL_FUND, ETF, COE, SECURITY, OTHER
  balance: number;
  userName: string;
};
// Uma linha do detalhamento de fatura (transação que compõe o valor).
export type InvoiceLineItem = {
  id: string; // transação representativa — usada pra antecipar a parcela
  date: string;
  description: string;
  amount: number;
  category: string;
  note: string | null; // comentário da compra (vale pro grupo de parcelas/recorrências)
  anticipated: boolean; // parcela marcada como antecipada
  cardOwner: "principal" | "dependente" | null; // portador; null = cartão sem adicional
  installmentNumber: number | null; // nº da parcela (creditCardMetadata); fonte estruturada p/ "N/M"
  totalInstallments: number | null; // total de parcelas (creditCardMetadata)
};

// Fatura de um ciclo futuro (parcelas agendadas que caem nele).
export type FutureInvoice = {
  closingDate: string;
  dueDate: string;
  amount: number;
  items: InvoiceLineItem[];
};

export type CreditCard = {
  accountId: string;
  bank: string;
  brand: string | null;
  cardName: string | null; // só vem preenchido se houver mais de um cartão no mesmo banco
  openInvoice: { amount: number; since: string | null; items: InvoiceLineItem[] };
  // Fatura fechada ainda a vencer (some quando vence → vai pro histórico). null = nenhuma.
  closedInvoice: { amount: number; closingDate: string; dueDate: string; items: InvoiceLineItem[] } | null;
  // Faturas de ciclos futuros (parcelas), da mais próxima à mais distante.
  future: FutureInvoice[];
  // Faturas já vencidas (histórico), mais recente primeiro.
  history: { closingDate: string | null; dueDate: string; totalAmount: number; items: InvoiceLineItem[] }[];
};

// Um parcelamento em aberto: parcelas de cartão que ainda vão vencer, agrupadas por compra.
export type CommitmentPlan = {
  label: string; // descrição-base (ex.: "MERCADOLIVRE*FOZPANOS")
  bank: string;
  remaining: number; // parcelas futuras restantes
  remainingAmount: number; // soma das parcelas futuras
  total: number | null; // total de parcelas (o M de "N/M"), quando detectado
  months: Record<string, number>; // "YYYY-MM" -> valor que cai no mês
  nextDate: string;
  lastDate: string;
  manual: boolean; // parcelamento inserido/aceito manualmente (banco não projeta futuras)
};

// Sugestão de parcelas futuras (bancos que não projetam, ex.: Bradesco/Mercado Pago):
// derivada do metadata N/M das parcelas reais. Aceitar cria as linhas; recusar/adaptar antes.
export type Suggestion = {
  key: string; // identidade da compra (usada pra recusar)
  accountId: string;
  bank: string;
  cardNumber: string | null;
  label: string;
  cardOwner: "principal" | "dependente" | null; // portador do cartão; null = cartão sem dependente
  installmentAmount: number;
  totalInstallments: number;
  nextInstallmentNumber: number;
  existing: { n: number; date: string; amount: number }[]; // parcelas já no banco (não serão inseridas)
  installments: { n: number; date: string; amount: number }[]; // parcelas que serão inseridas
};

// Lembrete de vencimento: fatura fechada não paga, a vencer ou vencida recente.
export type DueReminder = {
  bank: string;
  cardName: string | null;
  amount: number;
  dueDate: string;
  daysUntil: number; // negativo = já venceu
};

// Assinatura / recorrência detectada nos últimos 6 meses.
export type Subscription = {
  label: string;
  monthlyAmount: number;
  monthlyTotals: Record<string, number>; // "YYYY-MM" -> total gasto naquele mês
  occurrences: number; // meses distintos com cobrança
  lastDate: string;
  months: string[];
  bank: string; // instituição da cobrança mais recente do grupo
  note?: string | null; // comentário do grupo (da cobrança mais recente), se houver
};

// Resumo das transações ainda sem comentário (montado no cliente a partir de /transactions/pending).
export type PendingSummary = { total: number; banks: { institution: string; count: number }[] };

const TOKEN_KEY = "fin-dash-token";
export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Id do usuário logado, lido do `sub` do JWT (sem lib: decodifica o payload base64url).
// Usado para o escopo "Minhas" abrir no perfil que fez login, não no primeiro da lista.
export function currentUserId(): string {
  const t = token.get();
  if (!t) return "";
  try {
    return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub ?? "";
  } catch {
    return "";
  }
}

// Wrapper de fetch: injeta o Bearer token; em 401 limpa a sessão e volta ao login.
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });
  if (res.status === 401) {
    token.clear();
    if (window.location.pathname !== "/login") window.location.href = "/login";
    throw new Error("Não autorizado");
  }
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const get = <T>(path: string) => apiFetch<T>(path);
const post = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const patchReq = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const putReq = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T>(path: string) => apiFetch<T>(path, { method: "DELETE" });

export const api = {
  users: () => get<User[]>("/users"),
  accounts: (userId: string) => get<Account[]>(`/users/${userId}/accounts`),
  consolidated: () => get<Consolidated>("/balance/consolidated"),
  transactions: (userId?: string, period?: { month: number; year: number }) => {
    const q = new URLSearchParams();
    if (userId) q.set("userId", userId);
    if (period) {
      q.set("month", String(period.month));
      q.set("year", String(period.year));
    }
    const qs = q.toString();
    return get<Transaction[]>("/transactions" + (qs ? `?${qs}` : ""));
  },
  updateTransaction: (id: string, patch: { userCategories?: string[]; description?: string }) =>
    patchReq<Transaction>(`/transactions/${id}`, patch),
  // Lançamento avulso (dinheiro, Pix fora da conta sincronizada, etc.) — não depende de
  // parcelamento (ver acceptManualInstallments, que é só p/ POST /commitments/manual).
  createTransaction: (body: {
    accountId: string;
    amount: number;
    date: string;
    description: string;
    category?: string;
    userCategories?: string[];
  }) => post<Transaction>("/transactions", body),
  // Só apaga se manual: true (mesmo cuidado do deleteManualInstallment).
  deleteTransaction: (id: string) => del<{ deleted: number }>(`/transactions/${id}`),
  allAccounts: (userId?: string) =>
    get<AccountFull[]>("/accounts" + (userId ? `?userId=${userId}` : "")),
  cards: (userId?: string) =>
    get<CreditCard[]>("/cards" + (userId ? `?userId=${userId}` : "")),
  reserved: (userId?: string) =>
    get<ReservedEntry[]>("/reserved" + (userId ? `?userId=${userId}` : "")),
  commitments: (userId?: string) =>
    get<CommitmentPlan[]>("/commitments" + (userId ? `?userId=${userId}` : "")),
  commitmentSuggestions: (userId?: string) =>
    get<Suggestion[]>("/commitments/suggestions" + (userId ? `?userId=${userId}` : "")),
  acceptManualInstallments: (body: {
    accountId: string;
    label: string;
    totalInstallments: number | null;
    cardNumber?: string | null;
    installments: { n: number; date: string; amount: number }[];
  }) => post<{ created: number }>("/commitments/manual", body),
  dismissSuggestion: (key: string) =>
    post<{ key: string; dismissed: boolean }>("/commitments/suggestions/dismiss", { key }),
  deleteManualInstallment: (id: string) => del<{ deleted: number }>(`/commitments/manual/${id}`),
  dueReminders: (userId?: string) =>
    get<DueReminder[]>("/due-reminders" + (userId ? `?userId=${userId}` : "")),
  budgets: () => get<Record<string, number>>("/budgets"),
  saveBudgets: (map: Record<string, number>) => putReq<Record<string, number>>("/budgets", map),
  categories: () => get<string[]>("/categories"),
  saveCategories: (names: string[]) => putReq<string[]>("/categories", names),
  subscriptions: () => get<Subscription[]>("/subscriptions"),
  investments: () => get<Investment[]>("/investments"),
  itemsStatus: () => get<ItemStatus[]>("/items/status"),
  syncItem: (id: string) => post<{ id: string; status: string }>(`/items/${id}/sync`, {}),
  connectToken: (itemId?: string) =>
    get<{ accessToken: string }>("/pluggy/connect-token" + (itemId ? `?itemId=${itemId}` : "")),
  saveItem: (pluggyItemId: string, userId: string) =>
    post<{ id: string }>("/pluggy/items", { pluggyItemId, userId }),
  setTransactionNote: (id: string, note: string) =>
    putReq<{ key: string; note: string }>(`/transactions/${id}/note`, { note }),
  setAnticipated: (id: string, anticipated: boolean) =>
    post<{ key: string; anticipated: boolean }>(`/transactions/${id}/anticipate`, { anticipated }),
  pending: async (period?: { month: number; year: number }): Promise<PendingSummary> => {
    const q = new URLSearchParams();
    if (period) {
      q.set("month", String(period.month));
      q.set("year", String(period.year));
    }
    const qs = q.toString();
    const txs = await get<Transaction[]>("/transactions/pending" + (qs ? `?${qs}` : ""));
    const relevant = txs.filter((t) => expenseValue(t) > 0 && !isInternalMovement(t) && !t.note);
    const map = new Map<string, number>();
    for (const t of relevant) {
      const inst = t.account.item.institution;
      map.set(inst, (map.get(inst) ?? 0) + 1);
    }
    return {
      total: relevant.length,
      banks: [...map.entries()]
        .map(([institution, count]) => ({ institution, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
  dismissPending: () => post<{ pendingDismissedAt: string }>("/transactions/pending/dismiss", {}),
};

// Rotas públicas (pré-login) — fetch cru, sem o wrapper que redireciona em 401.
export const auth = {
  users: async (): Promise<User[]> => {
    const res = await fetch(BASE + "/auth/users");
    if (!res.ok) throw new Error(`${res.status} /auth/users`);
    return res.json();
  },
  login: async (userId: string, pin: string): Promise<{ token: string }> => {
    const res = await fetch(BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, pin }),
    });
    if (res.status === 401) throw new Error("PIN incorreto.");
    if (!res.ok) throw new Error(`${res.status} /auth/login`);
    return res.json();
  },
};

export const brl = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
