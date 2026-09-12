-- AlterTable: marca quando o último sync trouxe transação nova/alterada (e quantas).
ALTER TABLE "Item" ADD COLUMN "lastChangeAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "lastChangeCount" INTEGER;
