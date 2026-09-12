import express from "express";
import cors from "cors";
import "dotenv/config";
import { prisma } from "./modules/transactions/transaction.repository";
import { pluggyRouter } from "./modules/pluggy/pluggy.controller";
import { authRouter } from "./modules/auth/auth.controller";
import { requireAuth } from "./modules/auth/requireAuth";
import { accountsRouter } from "./modules/accounts/accounts.controller";
import { cardsRouter } from "./modules/cards/cards.controller";
import { commitmentsRouter } from "./modules/commitments/commitments.controller";
import { transactionsRouter } from "./modules/transactions/transaction.controller";
import { itemsRouter } from "./modules/sync/sync.controller";
import { dueRemindersRouter } from "./modules/cards/dueReminders.controller";
import { budgetsRouter } from "./modules/budgets/budgets.controller";
import { categoriesRouter } from "./modules/categories/categories.controller";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.controller";
import { investmentsRouter } from "./modules/investments/investments.controller";
import { startSyncScheduler } from "./modules/sync/sync.service";

const app = express();
// Origens do frontend liberadas via CORS_ORIGIN (lista separada por vírgula; fallback: Vite local).
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.use("/auth", authRouter); // público (login)
app.use("/pluggy", pluggyRouter); // webhook é público; o resto se protege no próprio router
app.use(requireAuth); // ↓ todas as rotas abaixo exigem "Authorization: Bearer <jwt>"
app.use(dueRemindersRouter); // /due-reminders

// Rotas protegidas, por domínio (cada router usa caminhos completos).
app.use(accountsRouter); // /users, /accounts, /balance/consolidated, /reserved
app.use(cardsRouter); // /cards
app.use(commitmentsRouter); // /commitments
app.use(budgetsRouter); // /budgets
app.use(categoriesRouter); // /categories
app.use(subscriptionsRouter); // /subscriptions
app.use(investmentsRouter); // /investments
app.use(transactionsRouter); // /transactions
app.use(itemsRouter); // /items/status, /items/:id/sync

const PORT = Number(process.env.PORT) || 3333;
app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
  startSyncScheduler(); // sync automático periódico (mantém bills/transações frescas)
});

export { app, prisma };
