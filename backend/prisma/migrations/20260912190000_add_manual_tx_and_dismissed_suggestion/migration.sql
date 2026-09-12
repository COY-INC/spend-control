-- Linha de Transaction criada MANUALMENTE pelo usuário (parcela futura projetada de banco
-- que não projeta, ex.: Bradesco/Mercado Pago). pluggyTransactionId fica null → o sync
-- nunca casa nem apaga essas linhas. Default false pra não quebrar linhas existentes.
ALTER TABLE "Transaction" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;

-- Sugestão de parcela futura RECUSADA, ancorada na identidade da compra (mesmo padrão de
-- AnticipatedInstallment) pra não reaparecer a cada scan.
-- CreateTable
CREATE TABLE "DismissedSuggestion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DismissedSuggestion_key_key" ON "DismissedSuggestion"("key");
