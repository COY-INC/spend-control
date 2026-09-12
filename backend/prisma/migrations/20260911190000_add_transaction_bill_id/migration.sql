-- Vínculo direto transação → fatura via creditCardMetadata.billId (Pluggy). Casa com
-- CreditCardBill.pluggyBillId sem depender de janela de data — 100% confiável em
-- transações POSTED (confirmado em Bradesco, Itaú, Mercado Pago e Nubank).
ALTER TABLE "Transaction" ADD COLUMN "billId" TEXT;
