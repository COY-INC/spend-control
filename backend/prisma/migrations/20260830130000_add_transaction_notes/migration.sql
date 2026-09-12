-- CreateTable
CREATE TABLE "TransactionNote" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionNote_key_key" ON "TransactionNote"("key");

-- CreateTable
CREATE TABLE "AppState" (
    "id" TEXT NOT NULL,
    "pendingDismissedAt" TIMESTAMP(3),

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
