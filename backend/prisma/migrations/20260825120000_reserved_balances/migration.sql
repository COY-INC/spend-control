-- Saldo reservado (caixinhas/cofrinhos) por conta: [{ name, amount }]

ALTER TABLE "Account" ADD COLUMN "reservedBalances" JSONB;
