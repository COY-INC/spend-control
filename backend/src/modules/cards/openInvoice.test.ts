// Self-check das faturas. Rode com: npx tsx src/modules/cards/openInvoice.test.ts
import assert from "node:assert";
import { computeInvoices, cardOwner } from "./openInvoice";

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
// helper: adiciona category (default "") — os checks antigos ignoram
const tx = (amount: number, iso: string, description = "", category = "") => ({
  amount, date: new Date(iso), description, category,
});
const bill = (total: number, closingIso: string, dueIso: string) => ({
  closingDate: new Date(closingIso),
  dueDate: new Date(dueIso),
  totalAmount: total,
});

// 1) Nubank real, "hoje" 12/08 (ciclo corrente = o que abriu em 27/07, ainda não rolou):
//    compras 696,82; −0,42/−0,19 desconto; −12,91 pgto antecipado (DUP); −680,69 que
//    quita a fatura fechada de 680,69 (DUP). Aberta esperada 683,30.
{
  const bills = [bill(680.69, "2026-07-27", "2026-08-03"), bill(875.28, "2026-06-26", "2026-07-03")];
  const txs = [
    tx(696.82, "2026-08-05", "Compras"),
    tx(-680.69, "2026-08-03", "Pagamento recebido"),
    tx(-680.69, "2026-08-03", "Pagamento recebido"),
    tx(-12.91, "2026-08-12", "Pagamento recebido"),
    tx(-12.91, "2026-08-12", "Pagamento recebido"),
    tx(-0.42, "2026-08-21", "Desconto Antecipacao"),
    tx(-0.19, "2026-08-21", "Desconto Antecipacao"),
  ];
  const r = computeInvoices(txs, bills, 1809.71, new Date("2026-08-12T12:00:00.000Z"));
  assert(near(r.open.amount, 683.3), `Nubank aberta esperada 683.30, veio ${r.open.amount}`);
  // Em 12/08 a fatura fechada 27/07 vence 03/08 → já venceu → NÃO fica no container, vai pro histórico.
  assert(r.closed === null, `esperado sem fatura fechada a vencer, veio ${JSON.stringify(r.closed)}`);
  assert(r.history.length === 2, `esperado 2 no histórico, veio ${r.history.length}`);
}

// 2) Rolagem (item #2): "hoje" 30/08, último Bill fechou 27/07. O ciclo 27/07→27/08 já
//    fechou (Pluggy atrasou o Bill). Aberta = só o que veio depois de 27/08; a fechada a
//    vencer = net de 27/07→27/08 com vencimento projetado (offset 7d = 03/09).
{
  const bills = [bill(680.69, "2026-07-27", "2026-08-03")];
  const txs = [
    tx(500, "2026-08-10", "compra ciclo fechado"), // entra na fechada (27/07,27/08]
    tx(120, "2026-08-15", "compra ciclo fechado"),
    tx(90, "2026-08-29", "compra ciclo aberto"), // entra na aberta (27/08,27/09]
  ];
  const r = computeInvoices(txs, bills, 5000, new Date("2026-08-30T12:00:00.000Z"));
  assert(near(r.open.amount, 90), `aberta rolada esperada 90, veio ${r.open.amount}`);
  assert(r.open.since?.toISOString().slice(0, 10) === "2026-08-27", `since esperado 27/08, veio ${r.open.since}`);
  assert(r.closed && near(r.closed.amount, 620), `fechada esperada 620, veio ${r.closed?.amount}`);
  assert(r.closed?.closingDate.toISOString().slice(0, 10) === "2026-08-27", `fechamento esperado 27/08`);
  assert(r.closed?.dueDate.toISOString().slice(0, 10) === "2026-09-03", `vencimento projetado esperado 03/09, veio ${r.closed?.dueDate}`);
}

// 3) Fechada AINDA a vencer (item #3): "hoje" 05/08, Bill fechou 03/08 vence 10/08 → fica
//    no container próprio com o total real da Pluggy; aberta = compras após 03/08.
{
  const bills = [bill(1209.43, "2026-08-03", "2026-08-10")];
  const txs = [
    tx(53.19, "2026-08-04", "Shopee"),
    tx(150, "2026-08-04", "Jim.com"),
    tx(-1209.43, "2026-08-09", "Pagamento recebido"), // quita a fechada → fora da aberta
  ];
  const r = computeInvoices(txs, bills, 1462.76, new Date("2026-08-05T12:00:00.000Z"));
  assert(near(r.open.amount, 203.19), `aberta esperada 203.19, veio ${r.open.amount}`);
  assert(r.closed && near(r.closed.amount, 1209.43), `fechada real esperada 1209.43, veio ${r.closed?.amount}`);
  assert(r.history.length === 0, `esperado histórico vazio, veio ${r.history.length}`);
}

// 3b) Mercado Pago: as compras 24,98+11,53 datam 03:00 UTC no dia do fechamento (29/07) —
//     que em horário de Brasília (UTC-3) é 29/07 00:00 local, ou seja, o PRÓPRIO dia do
//     fechamento (não o dia anterior). Regra do cartão: "fecha dia D" ⇒ só compras até o
//     dia D-1 entram nessa fatura; o dia D já pertence ao ciclo SEGUINTE. Por isso esses
//     itens não ficam na fatura real de 29/07 (que vai pro histórico com 0 itens, só o
//     total oficial) — pertencem ao ciclo que abre em 29/07, que a Pluggy ainda não
//     fechou oficialmente (fatura "lagging" projetada). O teto pelo devedor (11,53) evita
//     mostrar mais do que o saldo real enquanto a Pluggy não confirma o fechamento real.
{
  const bills = [bill(36.51, "2026-07-29", "2026-08-04")];
  const txs = [
    tx(24.98, "2026-07-29T03:00:00.000Z", "MERCADOLIVRE"),
    tx(11.53, "2026-07-29T03:00:00.000Z", "MP*3PRODUTOS"),
    tx(-36.51, "2026-08-04", "Pagamento recebido"),
  ];
  const r = computeInvoices(txs, bills, 11.53, new Date("2026-08-30T12:00:00.000Z"));
  assert(near(r.open.amount, 0), `MP aberta esperada 0, veio ${r.open.amount}`);
  assert(r.closed && near(r.closed.amount, 11.53), `MP fechada projetada (teto pelo devedor) esperada 11.53, veio ${JSON.stringify(r.closed)}`);
  assert(r.history.length === 1 && near(r.history[0].totalAmount, 36.51), "histórico com o total real da fatura");
  assert(r.history[0].items.length === 0, "os itens pertencem ao ciclo seguinte (dia do fechamento local), não à fatura de 29/07");
}

// 3c) Bradesco real: compra parcelada (32,97, 1/2) datada 13/08T00:41:36 UTC — que em
//     horário de Brasília (UTC-3) é 12/08 21:41, um dia ANTES do fechamento (13/08). Por
//     instante exato em UTC (bug original), 00:41 UTC > 00:00 UTC do "mesmo dia" passava
//     pro ciclo SEGUINTE (aberto) — gruda na fatura errada, mostrando "parcela 1/2" na
//     fatura de setembro quando na verdade é a parcela de agosto (já fechada/vencida).
//     Corrigido convertendo pra dia calendário em horário de Brasília antes de comparar
//     (ver localDayUTC) — sem isso, uma compra feita à noite no Brasil parece ter
//     acontecido no dia seguinte em UTC. Ver investigação real de prod.
{
  const bills = [bill(500, "2026-08-13", "2026-08-25")];
  const t = {
    amount: 32.97,
    date: new Date("2026-08-13T00:41:36.000Z"),
    description: "MERCADOLIVRE*MERCADOLIVRE",
    category: "Compras",
    installmentNumber: 1,
    totalInstallments: 2,
  };
  const r = computeInvoices([t], bills, 500, new Date("2026-09-11T12:00:00.000Z"));
  assert(r.open.items.length === 0, `a compra do dia do fechamento não deve vazar pra aberta, veio ${JSON.stringify(r.open.items)}`);
  assert(r.history.length === 1 && r.history[0].items.length === 1, "a compra cai na fatura que fechou no mesmo dia (histórico, já vencida)");
  assert(r.history[0].items[0].installmentNumber === 1, "parcela 1/2 preservada no item do histórico");
}

// 4) Só compras, sem fatura fechada ainda → soma tudo na aberta.
{
  const r = computeInvoices([tx(100, "2026-08-01"), tx(50, "2026-08-02")], [], 5000, new Date("2026-08-30T12:00:00.000Z"));
  assert(near(r.open.amount, 150), `esperado 150, veio ${r.open.amount}`);
  assert(r.closed === null && r.history.length === 0, "sem fechada/histórico");
}

// 5) Itens da fatura: a aberta lista as transações do ciclo que somam no net,
//    excluindo a quitação de fatura fechada; a fechada real lista os itens do
//    ciclo dela.
{
  const bills = [bill(1209.43, "2026-08-03", "2026-08-10")];
  const txs = [
    tx(53.19, "2026-08-04", "Shopee", "Compras"),
    tx(150, "2026-08-04", "Jim.com", "Serviços"),
    tx(-1209.43, "2026-08-09", "Pagamento recebido", "Pagamento"),
  ];
  const r = computeInvoices(txs, bills, 1462.76, new Date("2026-08-05T12:00:00.000Z"));
  assert(r.open.items.length === 2, `aberta: esperado 2 itens, veio ${r.open.items.length}`);
  assert(r.open.items.every((i) => i.amount > 0), "aberta: a quitação (-1209.43) não deve aparecer");
  assert(r.open.items.some((i) => i.description === "Shopee" && i.category === "Compras"), "item Shopee com categoria");
  assert(r.closed !== null && Array.isArray(r.closed.items), "fechada tem items[]");
  assert(r.history.every((h) => Array.isArray(h.items)), "cada histórico tem items[]");
}

// 6) Faturas futuras: parcelas datadas além do fim do ciclo aberto viram faturas
//    futuras, uma por ciclo, com os itens daquele ciclo. Ciclos sem parcela são pulados.
{
  const bills = [bill(200, "2026-07-27", "2026-08-03")]; // fecha dia 27, vence dia 03 (offset 7d)
  const txs = [
    tx(90, "2026-08-29", "compra ciclo aberto", "Compras"), // ciclo aberto (27/08,27/09]
    tx(300, "2026-10-15", "Geladeira 3/10", "Casa"),        // futura 1: (27/09,27/10] fecha 27/10
    tx(300, "2026-12-15", "Geladeira 5/10", "Casa"),        // futura 2: (27/11,27/12] fecha 27/12 — ciclo nov pulado
  ];
  const r = computeInvoices(txs, bills, 5000, new Date("2026-08-30T12:00:00.000Z"));
  assert(r.future.length === 2, `esperado 2 faturas futuras, veio ${r.future.length}`);
  assert(near(r.future[0].amount, 300), `futura 1 esperada 300, veio ${r.future[0].amount}`);
  assert(r.future[0].closingDate.toISOString().slice(0, 10) === "2026-10-27", `futura 1 fecha 27/10, veio ${r.future[0].closingDate.toISOString().slice(0,10)}`);
  assert(r.future[0].dueDate.toISOString().slice(0, 10) === "2026-11-03", `futura 1 vence 03/11 (offset 7d), veio ${r.future[0].dueDate.toISOString().slice(0,10)}`);
  assert(r.future[0].items.length === 1 && r.future[0].items[0].description === "Geladeira 3/10", "futura 1 tem o item da parcela");
  assert(r.future[1].closingDate.toISOString().slice(0, 10) === "2026-12-27", `futura 2 fecha 27/12, veio ${r.future[1].closingDate.toISOString().slice(0,10)}`);
}

// 6b) Duas transações REAIS idênticas no mesmo dia (mesmo valor/descrição), horários
//     diferentes → contam as DUAS (dedup pelo instante, não pelo dia). Churn (mesmo
//     timestamp) continua colapsando em uma. Ver PIX Maria Fernanda 07/09.
{
  const txs = [
    tx(50, "2026-08-07T16:54:12.000Z", "Pix Maria Fernanda"), // real #1
    tx(50, "2026-08-07T19:20:00.000Z", "Pix Maria Fernanda"), // real #2 (outro horário)
    tx(50, "2026-08-07T16:54:12.000Z", "Pix Maria Fernanda"), // churn de #1 (mesmo instante)
  ];
  const r = computeInvoices(txs, [], 5000, new Date("2026-08-30T12:00:00.000Z"));
  assert(near(r.open.amount, 100), `esperado 100 (2 reais, churn deduplicado), veio ${r.open.amount}`);
  assert(r.open.items.length === 2, `esperado 2 itens, veio ${r.open.items.length}`);
}

// 7) Portador (Bradesco real): dependente=1918; principal=1919 e os números antigos
//    (8749/1910). Sem adicional → null (nada a separar).
{
  const deps = ["1918"];
  assert(cardOwner("1918", deps) === "dependente", "1918 é dependente");
  assert(cardOwner("1919", deps) === "principal", "1919 é principal");
  assert(cardOwner("8749", deps) === "principal", "8749 (antigo) cai no principal");
  assert(cardOwner(null, deps) === "principal", "sem número, mas há adicional → principal");
  assert(cardOwner("1919", []) === null, "cartão sem adicional → null (nada a separar)");
}

// 8) Mercado Pago: a description vem LIMPA pela Pluggy, sem o "N/M" (ex.: "MERCADOLIVRE" em
//    vez de "MERCADOLIVRE 3/6") — o item ainda sai com installmentNumber/totalInstallments
//    (creditCardMetadata), fonte estruturada que sobrevive à limpeza do texto.
{
  const t = { amount: 50, date: new Date("2026-08-05"), description: "MERCADOLIVRE", category: "Compras", installmentNumber: 3, totalInstallments: 6 };
  const r = computeInvoices([t], [], 5000, new Date("2026-08-30T12:00:00.000Z"));
  assert(r.open.items.length === 1, "1 item na aberta");
  assert(r.open.items[0].installmentNumber === 3, `installmentNumber esperado 3, veio ${r.open.items[0].installmentNumber}`);
  assert(r.open.items[0].totalInstallments === 6, `totalInstallments esperado 6, veio ${r.open.items[0].totalInstallments}`);
}

// 9) billId (creditCardMetadata.billId, Pluggy) é AUTORITATIVO: vence a heurística de data
//    quando divergem. Confirmado real: 100% das transações POSTED em Bradesco, Itaú,
//    Mercado Pago e Nubank trazem billId. Aqui a compra está datada DENTRO da janela
//    "teórica" da fatura aberta (depois do fechamento 13/08), mas o billId diz que ela
//    pertence à fatura que já fechou — e é isso que prevalece.
{
  const bills = [{ pluggyBillId: "bill-ago", closingDate: new Date("2026-08-13"), dueDate: new Date("2026-08-25"), totalAmount: 50 }];
  const t = { amount: 50, date: new Date("2026-08-20"), description: "COMPRA QUALQUER", billId: "bill-ago" };
  const r = computeInvoices([t], bills, 50, new Date("2026-09-11T12:00:00.000Z"));
  assert(r.open.items.length === 0, "billId prevalece: item não vai pra aberta mesmo com data dentro da janela teórica dela");
  assert(r.history.length === 1 && r.history[0].items.length === 1, `item deveria casar por billId no histórico, veio ${JSON.stringify(r.history)}`);
}

// 10) Fallback: transação SEM billId (dado sincronizado antes da migration, ou conector
//     sem o campo) ainda casa pela janela de data — coexiste com itens que JÁ têm billId
//     na MESMA fatura, sem duplicar nem perder nenhum.
{
  const bills = [{ pluggyBillId: "bill-jul", closingDate: new Date("2026-07-29"), dueDate: new Date("2026-08-04"), totalAmount: 36.51 }];
  const txs = [
    { amount: 24.98, date: new Date("2026-07-29T03:00:00.000Z"), description: "MERCADOLIVRE", billId: "bill-jul" },
    { amount: 11.53, date: new Date("2026-07-15T00:00:00.000Z"), description: "MP*3PRODUTOS" }, // sem billId → cai pela janela de data
  ];
  const r = computeInvoices(txs, bills, 36.51, new Date("2026-08-30T12:00:00.000Z"));
  assert(r.history.length === 1 && r.history[0].items.length === 2, `os 2 itens (com e sem billId) deveriam cair juntos no histórico, veio ${JSON.stringify(r.history)}`);
}

// 11) Bradesco real (caso original investigado): a mesma compra do teste 3c, agora casada
//     por billId — funciona mesmo que a Pluggy relate a fatura com o EXATO horário que
//     antes vazava pro ciclo errado. Prova que o fix por billId é robusto além do fix por
//     dia calendário (item 3c/3b), que continua servindo de fallback pra dados sem billId.
{
  const bills = [{ pluggyBillId: "bill-bradesco-ago", closingDate: new Date("2026-08-13"), dueDate: new Date("2026-08-25"), totalAmount: 500 }];
  const t = {
    amount: 32.97,
    date: new Date("2026-08-13T00:41:36.000Z"),
    description: "MERCADOLIVRE*MERCADOLIVRE",
    installmentNumber: 1,
    totalInstallments: 2,
    billId: "bill-bradesco-ago",
  };
  const r = computeInvoices([t], bills, 500, new Date("2026-09-11T12:00:00.000Z"));
  assert(r.open.items.length === 0, "não vaza pra aberta");
  assert(r.history.length === 1 && r.history[0].items.length === 1 && r.history[0].items[0].installmentNumber === 1, "parcela 1/2 casada por billId no histórico");
}

// 12) Nubank real: parcela TAP AIR PORT 7/8, status PENDING (ainda sem billId — só ganha
//     isso quando é oficialmente lançada), datada 27/08T03:00 UTC = 27/08 00:00 em
//     Brasília — o PRÓPRIO dia em que uma fatura ANTIGA (já vencida/paga) fechou. Pela
//     regra do cartão (fecha dia D ⇒ só até D-1 entra), o dia do fechamento já pertence
//     ao ciclo SEGUINTE — com dia local + fronteira corrigidos, essa transação cai
//     corretamente na fatura ABERTA (ainda não fechada), não na antiga. A checagem de
//     `status` em itemsForBill (não PENDING no fallback) fica como cinto-e-suspensório:
//     mesmo que a data enganasse por algum outro motivo, uma fatura já fechada nunca
//     pode ter item PENDING.
{
  const bills = [{ pluggyBillId: "bill-nubank-ago", closingDate: new Date("2026-08-27"), dueDate: new Date("2026-09-03"), totalAmount: 683.3 }];
  const t = {
    amount: 37.94,
    date: new Date("2026-08-27T03:00:00.000Z"),
    description: "Tap Air Port0018067078 7/8",
    installmentNumber: 7,
    totalInstallments: 8,
    status: "PENDING",
    // billId ausente de propósito: ainda não foi lançada oficialmente.
  };
  const r = computeInvoices([t], bills, 1000, new Date("2026-09-12T12:00:00.000Z"));
  assert(r.history[0].items.length === 0, "não pode estar na fatura antiga já fechada");
  assert(r.closed === null, "fatura antiga já venceu (03/09 < hoje 12/09) → sem fechada a vencer");
  assert(r.open.items.length === 1 && r.open.items[0].amount === 37.94, "cai certo na fatura aberta, não desaparece");
}

console.log("openInvoice: todos os checks passaram ✓");
