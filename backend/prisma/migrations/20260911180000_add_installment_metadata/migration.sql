-- Nº/total de parcelas via creditCardMetadata.installmentNumber/totalInstallments (Pluggy).
-- Fonte estruturada, independente do "N/M" no texto da description (que a Pluggy limpa/
-- normaliza pra alguns bancos, ex.: Mercado Pago, escondendo a parcela na descrição).
ALTER TABLE "Transaction" ADD COLUMN "installmentNumber" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "totalInstallments" INTEGER;
