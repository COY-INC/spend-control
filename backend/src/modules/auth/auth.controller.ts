import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../transactions/transaction.repository";
import { hashPin, verifyPin, isHashed } from "./pin";

export const authRouter = Router();

// Lista pública de usuários (id + nome) para o seletor da tela de login.
authRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  res.json(users);
});

// Rate-limit em memória por usuário: trava o login após MAX falhas por LOCK_MS.
// Suficiente para um app pessoal de instância única (protege o PIN de 4 dígitos de
// força bruta). Reinicia no deploy — aceitável no contexto.
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; until: number }>();

// POST /auth/login { userId, pin } -> { token } (JWT válido por 30 dias)
authRouter.post("/login", async (req, res) => {
  const { userId, pin } = req.body ?? {};
  if (!userId || pin === undefined) {
    return res.status(400).json({ error: "userId e pin são obrigatórios." });
  }

  const now = Date.now();
  const rec = attempts.get(userId);
  if (rec?.until && rec.until > now) {
    return res.status(429).json({ error: "Muitas tentativas. Tente novamente mais tarde." });
  }
  if (rec?.until && rec.until <= now) attempts.delete(userId); // trava expirou

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // Usuário inexistente: 401 sem registrar (nada a proteger; evita o Map crescer com ids
  // aleatórios). O rate-limit só rastreia usuários reais.
  if (!user) return res.status(401).json({ error: "Credenciais inválidas." });
  if (!verifyPin(String(pin), user.pin)) {
    const count = (attempts.get(userId)?.count ?? 0) + 1;
    attempts.set(userId, { count, until: count >= MAX_ATTEMPTS ? now + LOCK_MS : 0 });
    return res.status(401).json({ error: "Credenciais inválidas." });
  }
  attempts.delete(userId); // sucesso limpa o contador

  // Migração preguiçosa: PIN legado em texto puro vira hash no primeiro login válido.
  if (!isHashed(user.pin)) {
    await prisma.user.update({ where: { id: user.id }, data: { pin: hashPin(String(pin)) } });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: "JWT_SECRET não configurado." });
  const token = jwt.sign({ sub: user.id }, secret, { expiresIn: "30d" });
  res.json({ token });
});
