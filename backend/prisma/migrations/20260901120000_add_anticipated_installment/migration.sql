-- CreateTable
CREATE TABLE "AnticipatedInstallment" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnticipatedInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnticipatedInstallment_key_key" ON "AnticipatedInstallment"("key");
