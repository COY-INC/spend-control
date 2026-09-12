-- Categoria do usuário passa a ser lista. Preserva o valor único existente como 1ª (principal).
ALTER TABLE "Transaction" ADD COLUMN "userCategories" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "Transaction" SET "userCategories" = ARRAY["userCategory"] WHERE "userCategory" IS NOT NULL;
ALTER TABLE "Transaction" DROP COLUMN "userCategory";
