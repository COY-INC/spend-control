-- Status da transação na Pluggy (POSTED/PENDING). Necessário pra impedir que uma
-- transação ainda PENDING (sem billId, portanto sujeita ao fallback por janela de data)
-- seja encaixada numa fatura JÁ fechada só por coincidência entre sua `date` e a borda do
-- ciclo — ver caso real: parcela TAP AIR PORT 7/8, PENDING, date=27/08 mas
-- billForecastDate=2026-10 (a própria Pluggy só espera cobrá-la em outubro).
ALTER TABLE "Transaction" ADD COLUMN "status" TEXT;
