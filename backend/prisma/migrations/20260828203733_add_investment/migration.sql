-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "pluggyInvestmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Investment_pluggyInvestmentId_key" ON "Investment"("pluggyInvestmentId");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
