// Seed RICO de desenvolvimento local (ambiente mock).
//
// Diferente do `seed.ts` original (2 usuários + transações aleatórias), este popula TODAS
// as seções do dashboard: contas com caixinhas, cartões com faturas fechadas/aberta/futuras,
// compras parceladas (passadas, correntes e futuras), assinaturas recorrentes, investimentos,
// orçamentos, categorias, uma parcela antecipada e um comentário de transação.
//
// É DETERMINÍSTICO (PRNG com semente fixa): rodar de novo produz exatamente o mesmo banco.
// As datas são relativas a "hoje", então o dashboard sempre abre com dados do mês corrente.

import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/modules/auth/pin";
import { annotationKey } from "../src/modules/transactions/notes";
import { anticipationKey } from "../src/modules/transactions/anticipation";

const prisma = new PrismaClient();

// ---------------------------------------------------------------- PRNG determinístico
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260912);
const between = (min: number, max: number) => min + rnd() * (max - min);
const money = (v: number) => Number(v.toFixed(2));
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

// ---------------------------------------------------------------- datas
const DAY = 86_400_000;
const now = new Date();

// Data PURA (meia-noite UTC), como a Pluggy reporta closingDate/dueDate.
const pureDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
};
// Instante da transação: 15h UTC = 12h de Brasília. Longe da fronteira de dia dos dois
// fusos, então o dia calendário local (ver openInvoice.localDayUTC) nunca é ambíguo.
const at = (base: Date, offsetDays: number) =>
  new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offsetDays, 15));

// Dia de fechamento do cartão ancorado N dias atrás. Limitado ao dia 28 porque o cálculo de
// ciclo soma meses preservando o dia (dia > 28 transborda de mês — ver openInvoice.addMonthsUTC).
function anchorClosing(daysAgo: number): Date {
  const d = new Date(now.getTime() - daysAgo * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(d.getUTCDate(), 28)));
}

const CYCLES = 6; // faturas fechadas geradas por cartão

// ---------------------------------------------------------------- tipos locais
type TxIn = {
  amount: number;
  date: Date;
  description: string;
  category: string;
  userCategories?: string[];
  cardNumber?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  billId?: string | null;
  status?: string | null;
  manual?: boolean;
};
type BillIn = { pluggyBillId: string; closingDate: Date; dueDate: Date; totalAmount: number };

// ---------------------------------------------------------------- catálogos
const CARD_MERCHANTS = [
  { desc: "AMAZON BR", category: "Compras", min: 29, max: 620 },
  { desc: "MERCADOLIVRE", category: "Compras", min: 25, max: 540 },
  { desc: "SHOPEE *PEDIDO", category: "Compras", min: 15, max: 260 },
  { desc: "IFOOD *RESTAURANTE", category: "Restaurante", min: 26, max: 210 },
  { desc: "RAPPI *MERCADO", category: "Mercado", min: 40, max: 340 },
  { desc: "PADARIA SAO JORGE", category: "Restaurante", min: 9, max: 120 },
  { desc: "BURGER KING", category: "Restaurante", min: 24, max: 160 },
  { desc: "STARBUCKS", category: "Restaurante", min: 16, max: 95 },
  { desc: "POSTO IPIRANGA", category: "Transporte", min: 70, max: 420 },
  { desc: "UBER *TRIP", category: "Transporte", min: 9, max: 130 },
  { desc: "ESTACIONAMENTO CENTRO", category: "Transporte", min: 8, max: 75 },
  { desc: "DROGASIL", category: "Saúde", min: 14, max: 320 },
  { desc: "CLINICA ODONTO SORRISO", category: "Saúde", min: 120, max: 900 },
  { desc: "CINEMARK", category: "Lazer", min: 28, max: 210 },
  { desc: "STEAM GAMES", category: "Lazer", min: 19, max: 290 },
  { desc: "CENTAURO", category: "Compras", min: 59, max: 700 },
  { desc: "RENNER", category: "Compras", min: 45, max: 580 },
  { desc: "SUPERMERCADO EXTRA", category: "Mercado", min: 45, max: 620 },
  { desc: "LEROY MERLIN", category: "Casa", min: 35, max: 780 },
  { desc: "PETZ", category: "Casa", min: 28, max: 340 },
];

const DEBIT_MERCHANTS = [
  { desc: "SUPERMERCADO PAO DE ACUCAR", category: "Mercado", min: 55, max: 680 },
  { desc: "HORTIFRUTI DA ESQUINA", category: "Mercado", min: 22, max: 240 },
  { desc: "ACOUGUE BOI GORDO", category: "Mercado", min: 60, max: 390 },
  { desc: "RESTAURANTE DONA BENTA", category: "Restaurante", min: 24, max: 260 },
  { desc: "CAFETERIA GRAO NOBRE", category: "Restaurante", min: 11, max: 88 },
  { desc: "PIX FARMACIA POPULAR", category: "Saúde", min: 15, max: 310 },
  { desc: "PIX OFICINA DO CARRO", category: "Transporte", min: 90, max: 1200 },
  { desc: "METRO RECARGA BILHETE", category: "Transporte", min: 20, max: 150 },
  { desc: "PETSHOP AMIGO FIEL", category: "Casa", min: 35, max: 420 },
  { desc: "LIVRARIA CULTURA", category: "Lazer", min: 25, max: 290 },
  { desc: "TEATRO MUNICIPAL", category: "Lazer", min: 60, max: 320 },
  { desc: "PIX ESCOLA INFANTIL", category: "Educação", min: 380, max: 620 },
];

// ---------------------------------------------------------------- cartão de crédito
type InstallmentPlan = {
  base: string; // descrição sem o "N/M"
  category: string;
  parcels: number;
  amount: number;
  startCycle: number; // índice do ciclo (0..CYCLES) em que cai a 1ª parcela
  dayOffset: number;
  manualFuture?: boolean; // parcelas ainda não cobradas entram como manual (projeção do usuário)
  projected?: boolean; // false = banco que NÃO projeta parcela futura (Bradesco/MP via MeuPluggy)
};

type CardCfg = {
  prefix: string;
  closedDaysAgo: number; // há quantos dias fechou a última fatura
  principal: string;
  dependente: string;
  subs: { desc: string; amount: number; day: number; category: string }[];
  plans: InstallmentPlan[];
};

function buildCard(cfg: CardCfg) {
  const anchor = anchorClosing(cfg.closedDaysAgo);
  const cl = (k: number) => addMonths(anchor, k - CYCLES); // cl(CYCLES) = último fechamento
  const openStart = cl(CYCLES);
  const openEnd = cl(CYCLES + 1);
  // Último offset do ciclo aberto cujo INSTANTE (15h UTC) ainda está no passado. Comparar só
  // o dia não basta: `at(openStart, diasCorridos)` cai às 15h de HOJE, que ainda é futuro de
  // manhã — e transação de cartão datada no futuro vira "compromisso futuro" na UI.
  let openMaxOffset = 0;
  while (at(openStart, openMaxOffset + 1) < now) openMaxOffset++;

  const txs: TxIn[] = [];

  // Ciclos FECHADOS: assinaturas + compras variadas.
  for (let k = 1; k <= CYCLES; k++) {
    const start = cl(k - 1);
    for (const s of cfg.subs) {
      txs.push({
        amount: s.amount,
        date: at(start, s.day),
        description: s.desc,
        category: s.category,
        cardNumber: cfg.principal,
      });
    }
    const n = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const m = pick(CARD_MERCHANTS);
      txs.push({
        amount: money(between(m.min, m.max)),
        date: at(start, 1 + Math.floor(rnd() * 26)),
        description: m.desc,
        category: m.category,
        cardNumber: rnd() < 0.25 ? cfg.dependente : cfg.principal,
      });
    }
  }

  // Ciclo ABERTO: só o que já aconteceu (assinaturas do mês que já passaram + compras).
  for (const s of cfg.subs) {
    if (s.day <= openMaxOffset) {
      txs.push({
        amount: s.amount,
        date: at(openStart, s.day),
        description: s.desc,
        category: s.category,
        cardNumber: cfg.principal,
      });
    }
  }
  const openCount = Math.max(2, Math.min(openMaxOffset, 7));
  for (let i = 0; i < openCount; i++) {
    const m = pick(CARD_MERCHANTS);
    txs.push({
      amount: money(between(m.min, m.max)),
      date: at(openStart, 1 + Math.floor(rnd() * Math.max(1, openMaxOffset))),
      description: m.desc,
      category: m.category,
      cardNumber: rnd() < 0.25 ? cfg.dependente : cfg.principal,
      // As duas últimas ficam PENDING: compra ainda não efetivada pelo banco.
      status: i >= openCount - 2 ? "PENDING" : "POSTED",
    });
  }
  // Estorno: negativo que NÃO é quitação de fatura — continua contando na fatura aberta.
  txs.push({
    amount: -32.9,
    date: at(openStart, Math.max(1, openMaxOffset - 1)),
    description: "ESTORNO COMPRA CANCELADA",
    category: "Compras",
    cardNumber: cfg.principal,
  });

  // Compras parceladas: passadas (com billId), a do ciclo aberto e as futuras.
  const planTxs: { plan: InstallmentPlan; tx: TxIn }[] = [];
  for (const p of cfg.plans) {
    for (let j = 1; j <= p.parcels; j++) {
      const date = at(cl(p.startCycle + j - 1), p.dayOffset);
      // Banco que não projeta: só existe a parcela que JÁ entrou em fatura. As que faltam
      // aparecem como SUGESTÃO no app, derivadas do metadata N/M (ver commitments/suggestions.ts).
      if (p.projected === false && date > now) continue;
      const tx: TxIn = {
        amount: p.amount,
        date,
        description: `${p.base} ${j}/${p.parcels}`,
        category: p.category,
        cardNumber: cfg.principal,
        installmentNumber: j,
        totalInstallments: p.parcels,
        // Só a parte FUTURA do plano é projeção manual — o que o banco já cobrou veio da Pluggy.
        manual: p.manualFuture === true && date > now,
      };
      txs.push(tx);
      planTxs.push({ plan: p, tx });
    }
  }

  // Atribui cada transação à fatura (Bill) do ciclo que a contém; aberta/futura ficam sem billId.
  const bills: BillIn[] = [];
  for (let k = 1; k <= CYCLES; k++) {
    const start = cl(k - 1);
    const end = cl(k);
    const id = `${cfg.prefix}-bill-${k}`;
    let total = 0;
    for (const t of txs) {
      if (t.date >= start && t.date < end) {
        t.billId = id;
        t.status = t.status ?? "POSTED";
        total += t.amount;
      }
    }
    bills.push({ pluggyBillId: id, closingDate: end, dueDate: new Date(end.getTime() + 10 * DAY), totalAmount: money(total) });
  }
  for (const t of txs) t.status = t.status ?? "POSTED";

  // Quitação da última fatura fechada: negativo de valor IGUAL ao total dela — o cálculo da
  // fatura aberta reconhece e exclui (ver openInvoice.dedupAndBuild/isSettlement).
  const lastBill = bills[bills.length - 1];
  txs.push({
    amount: -lastBill.totalAmount,
    date: at(openStart, Math.max(1, Math.min(openMaxOffset, 10))),
    description: "Pagamento de fatura",
    category: "Transfer - Internal",
    cardNumber: cfg.principal,
  });

  return { anchor, openStart, openEnd, bills, txs, planTxs, lastBill };
}

// ---------------------------------------------------------------- conta corrente / poupança
function buildChecking(cfg: {
  salary: number;
  employer: string;
  rent: number | null;
  internet: number;
  partnerLabel: string; // aparece na descrição da transferência interna do casal
  months: number;
}) {
  const txs: TxIn[] = [];
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (cfg.months - 1), 1));

  for (let m = 0; m < cfg.months; m++) {
    const base = addMonths(firstMonth, m);
    const push = (offset: number, tx: Omit<TxIn, "date">) => {
      const date = at(base, offset);
      if (date <= now) txs.push({ ...tx, date });
    };

    push(4, { amount: cfg.salary, description: `SALARIO ${cfg.employer}`, category: "Salário" });
    if (cfg.rent) push(9, { amount: -cfg.rent, description: "ALUGUEL APTO 302", category: "Moradia" });
    push(14, { amount: -money(between(148, 315)), description: "ENEL DISTRIBUICAO", category: "Contas" });
    push(17, { amount: -cfg.internet, description: "VIVO FIBRA INTERNET", category: "Contas" });
    push(19, { amount: -money(between(72, 98)), description: "SABESP AGUA", category: "Contas" });
    push(21, {
      amount: -money(between(300, 700)),
      description: `TRANSFERENCIA PARA ${cfg.partnerLabel}`,
      category: "Transfer - Internal",
    });
    push(24, { amount: -money(between(200, 600)), description: "APLICACAO POUPANCA", category: "Transfer - Internal" });

    const n = 9 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const mer = pick(DEBIT_MERCHANTS);
      push(1 + Math.floor(rnd() * 27), {
        amount: -money(between(mer.min, mer.max)),
        description: mer.desc,
        category: mer.category,
        // Parte das transações já vem com "Minha categoria" preenchida.
        userCategories: rnd() < 0.2 ? [mer.category] : [],
      });
    }
  }
  return txs;
}

// ---------------------------------------------------------------- montagem
async function seedUser(opts: {
  name: string;
  pin: string;
  institution: string;
  itemId: string;
  cardName: string;
  brand: string;
  card: CardCfg;
  checking: Parameters<typeof buildChecking>[0];
  reserved: { name: string; amount: number }[];
  investments: { name: string; type: string; balance: number }[];
}) {
  const user = await prisma.user.create({ data: { name: opts.name, pin: hashPin(opts.pin) } });
  const item = await prisma.item.create({
    data: {
      userId: user.id,
      pluggyItemId: opts.itemId,
      institution: opts.institution,
      status: "UPDATED",
      lastChangeAt: new Date(now.getTime() - 2 * 3600_000),
      lastChangeCount: 3 + Math.floor(rnd() * 5),
    },
  });

  // --- conta corrente + poupança
  const checkingTxs = buildChecking(opts.checking);
  const checking = await prisma.account.create({
    data: {
      itemId: item.id,
      type: "CHECKING",
      name: `${opts.institution} Conta Corrente`,
      balance: money(between(4200, 11800)),
      reservedBalances: opts.reserved,
    },
  });
  const savings = await prisma.account.create({
    data: { itemId: item.id, type: "SAVINGS", name: `${opts.institution} Poupança`, balance: money(between(9000, 26000)) },
  });

  await prisma.transaction.createMany({
    data: checkingTxs.map((t, i) => ({
      accountId: checking.id,
      amount: t.amount,
      date: t.date,
      description: t.description,
      category: t.category,
      userCategories: t.userCategories ?? [],
      status: "POSTED",
      pluggyTransactionId: `${opts.itemId}-chk-${i}`,
    })),
  });
  await prisma.transaction.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      accountId: savings.id,
      amount: money(between(180, 620)),
      date: at(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1)), 24),
      description: "RENDIMENTO POUPANCA",
      category: "Rendimento",
      status: "POSTED",
      pluggyTransactionId: `${opts.itemId}-sav-${i}`,
    })),
  });

  // --- cartão de crédito
  const card = buildCard(opts.card);
  const creditAccount = await prisma.account.create({
    data: {
      itemId: item.id,
      type: "CREDIT",
      name: opts.cardName,
      brand: opts.brand,
      additionalCards: [opts.card.dependente],
      balance: 0, // ajustado abaixo, depois de conhecer fatura aberta + fechada
      pluggyAccountId: `${opts.itemId}-credit`,
    },
  });

  await prisma.creditCardBill.createMany({
    data: card.bills.map((b) => ({
      accountId: creditAccount.id,
      pluggyBillId: b.pluggyBillId,
      closingDate: b.closingDate,
      dueDate: b.dueDate,
      totalAmount: b.totalAmount,
    })),
  });
  await prisma.transaction.createMany({
    data: card.txs.map((t, i) => ({
      accountId: creditAccount.id,
      amount: t.amount,
      date: t.date,
      description: t.description,
      category: t.category,
      userCategories: [],
      cardNumber: t.cardNumber ?? null,
      installmentNumber: t.installmentNumber ?? null,
      totalInstallments: t.totalInstallments ?? null,
      billId: t.billId ?? null,
      status: t.status ?? "POSTED",
      manual: t.manual ?? false,
      // Parcela manual é projeção do usuário: nunca veio da Pluggy, logo não tem id de origem.
      pluggyTransactionId: t.manual ? null : `${opts.itemId}-crd-${i}`,
    })),
  });

  // --- parcela ANTECIPADA: a 1ª parcela futura do plano principal cai no ciclo aberto.
  const futurePlan = card.planTxs.filter((p) => p.tx.date > now && !p.tx.manual);
  const anticipated = futurePlan.length ? futurePlan[0] : null;
  if (anticipated) {
    const key = anticipationKey({
      accountId: creditAccount.id,
      description: anticipated.tx.description,
      amount: anticipated.tx.amount,
      installmentNumber: anticipated.tx.installmentNumber,
      totalInstallments: anticipated.tx.totalInstallments,
    });
    if (key) await prisma.anticipatedInstallment.create({ data: { key, at: new Date(now.getTime() - 3600_000) } });
  }

  // --- saldo devedor do cartão = fatura aberta (com a antecipada) + fatura fechada exibida.
  // Sem isso o teto de sanidade de computeInvoices corta os valores (open+closed <= balance).
  const settlementTotals = card.bills.map((b) => b.totalAmount);
  const isSettlement = (v: number) => v < 0 && settlementTotals.some((bt) => Math.abs(bt - Math.abs(v)) <= 0.02);
  const openSum = card.txs
    .filter((t) => !t.billId)
    .filter((t) => {
      const d = t === anticipated?.tx ? new Date(now.getTime() - 3600_000) : t.date;
      return d >= card.openStart && d < card.openEnd;
    })
    .filter((t) => !isSettlement(t.amount))
    .reduce((s, t) => s + t.amount, 0);
  // A última fatura fechada só aparece como "a vencer" enquanto não venceu; depois vira histórico.
  const closedShown = card.lastBill.dueDate >= now ? card.lastBill.totalAmount : 0;
  await prisma.account.update({
    where: { id: creditAccount.id },
    data: { balance: money(Math.max(0, openSum) + closedShown) },
  });

  // --- comentário ancorado na identidade da compra parcelada
  const noteTarget = card.planTxs[0];
  if (noteTarget) {
    await prisma.transactionNote.create({
      data: {
        key: annotationKey({
          accountId: creditAccount.id,
          description: noteTarget.tx.description,
          amount: noteTarget.tx.amount,
        }),
        note: `Parcelado em ${noteTarget.plan.parcels}x sem juros — conferir se vale quitar antes.`,
      },
    });
  }

  // --- investimentos
  await prisma.investment.createMany({
    data: opts.investments.map((inv, i) => ({
      itemId: item.id,
      pluggyInvestmentId: `${opts.itemId}-inv-${i}`,
      name: inv.name,
      type: inv.type,
      balance: inv.balance,
    })),
  });

  return { user, creditAccount, card };
}

async function main() {
  // Limpa na ordem das dependências.
  await prisma.transactionNote.deleteMany();
  await prisma.anticipatedInstallment.deleteMany();
  await prisma.dismissedSuggestion.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.creditCardBill.deleteMany();
  await prisma.account.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.item.deleteMany();
  await prisma.user.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.category.deleteMany();
  await prisma.appState.deleteMany();

  await seedUser({
    name: "Marido",
    pin: "1234",
    institution: "Nubank",
    itemId: "mock-item-marido",
    cardName: "Nubank Ultravioleta",
    brand: "MASTERCARD",
    reserved: [
      { name: "Reserva de emergência", amount: 18500 },
      { name: "Viagem Chile", amount: 4200 },
      { name: "IPVA 2027", amount: 2600 },
    ],
    investments: [
      { name: "Tesouro Selic 2029", type: "FIXED_INCOME", balance: 24500 },
      { name: "CDB Nubank 110% CDI", type: "FIXED_INCOME", balance: 18300 },
      { name: "Nu Reserva Imediata", type: "MUTUAL_FUND", balance: 7200 },
    ],
    checking: { salary: 9800, employer: "TECNOLOGIA LTDA", rent: 3200, internet: 129.9, partnerLabel: "ESPOSA", months: 6 },
    card: {
      // Fechou há 7 dias e vence em 3 → mostra fatura ABERTA + FECHADA a vencer.
      prefix: "nu",
      closedDaysAgo: 7,
      principal: "1234",
      dependente: "4321",
      subs: [
        { desc: "NETFLIX.COM", amount: 55.9, day: 3, category: "Assinaturas" },
        { desc: "SPOTIFY", amount: 34.9, day: 8, category: "Assinaturas" },
        { desc: "SMARTFIT ACADEMIA", amount: 129.9, day: 12, category: "Saúde" },
      ],
      plans: [
        { base: "MAGALU*NOTEBOOK GAMER", category: "Compras", parcels: 10, amount: 389.9, startCycle: 3, dayOffset: 2 },
        { base: "CVC*PASSAGEM AEREA", category: "Lazer", parcels: 6, amount: 268.4, startCycle: 4, dayOffset: 16 },
        // projected:false — as parcelas a vencer NÃO existem como linha; viram sugestão na UI.
        { base: "FASTSHOP*GELADEIRA", category: "Casa", parcels: 12, amount: 245.0, startCycle: 2, dayOffset: 11, projected: false },
      ],
    },
  });

  await seedUser({
    name: "Esposa",
    pin: "5678",
    institution: "Itaú",
    itemId: "mock-item-esposa",
    cardName: "Itaú Click Visa",
    brand: "VISA",
    reserved: [{ name: "Reserva de emergência", amount: 11200 }],
    investments: [
      { name: "PETR4", type: "EQUITY", balance: 9800 },
      { name: "IVVB11", type: "ETF", balance: 15600 },
    ],
    checking: { salary: 8200, employer: "CLINICA SAUDE SA", rent: null, internet: 99.9, partnerLabel: "MARIDO", months: 6 },
    card: {
      // Fechou há 15 dias e já venceu → mostra fatura ABERTA + histórico, sem "a vencer".
      prefix: "itau",
      closedDaysAgo: 15,
      principal: "9876",
      dependente: "6789",
      subs: [
        { desc: "AMAZON PRIME", amount: 19.9, day: 5, category: "Assinaturas" },
        { desc: "GOOGLE ONE", amount: 9.9, day: 11, category: "Assinaturas" },
      ],
      plans: [
        { base: "MOVEIS*SOFA RETRATIL", category: "Casa", parcels: 8, amount: 312.0, startCycle: 3, dayOffset: 6 },
        // manualFuture: as parcelas a vencer foram inseridas à mão (banco que não projeta parcela).
        { base: "MP*ALIEXPRESS FONE", category: "Compras", parcels: 6, amount: 74.5, startCycle: 4, dayOffset: 20, manualFuture: true },
      ],
    },
  });

  // --- orçamentos + lista de categorias (compartilhados do casal)
  const budgets: Record<string, number> = {
    Mercado: 1800,
    Restaurante: 900,
    Transporte: 700,
    Lazer: 600,
    Moradia: 3500,
    Saúde: 500,
    Compras: 1200,
    Assinaturas: 300,
    Contas: 600,
  };
  await prisma.budget.createMany({ data: Object.entries(budgets).map(([category, limit]) => ({ category, limit })) });
  await prisma.category.createMany({
    data: [...Object.keys(budgets), "Casa", "Salário", "Rendimento", "Educação", "Presentes"].map((name) => ({ name })),
  });

  const counts = {
    usuarios: await prisma.user.count(),
    contas: await prisma.account.count(),
    transacoes: await prisma.transaction.count(),
    faturas: await prisma.creditCardBill.count(),
    investimentos: await prisma.investment.count(),
    orcamentos: await prisma.budget.count(),
    categorias: await prisma.category.count(),
  };
  console.log("Seed mock concluído:", counts);
  console.log("Login: Marido / PIN 1234  •  Esposa / PIN 5678");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
