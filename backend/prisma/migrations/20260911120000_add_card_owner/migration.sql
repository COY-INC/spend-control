-- Atribui cada transação de cartão ao seu portador (principal/dependente).
-- cardNumber = 4 últimos dígitos da transação (creditCardMetadata.cardNumber).
-- additionalCards = números dos cartões DEPENDENTES da conta (creditData.additionalCards).
ALTER TABLE "Transaction" ADD COLUMN "cardNumber" TEXT;
ALTER TABLE "Account" ADD COLUMN "additionalCards" TEXT[] NOT NULL DEFAULT '{}';
