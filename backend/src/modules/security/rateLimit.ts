import rateLimit, { type Options } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

// Resposta 429 no mesmo formato de erro do resto da API; cabeçalhos RateLimit-* (draft-7).
function limiter(limit: number, overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente mais tarde." },
    ...overrides,
  });
}

// Limite geral por IP para toda a API (folgado: o dashboard dispara várias chamadas por tela).
export const globalLimiter = (overrides?: Partial<Options>) => limiter(1000, overrides);

// Login: complementa a trava por usuário do auth.controller barrando flood por IP.
export const loginLimiter = (overrides?: Partial<Options>) => limiter(10, overrides);

// Rotas do Pluggy que chamam a API externa (connect-token, items).
export const pluggyLimiter = (overrides?: Partial<Options>) => limiter(30, overrides);

// Número de proxies reversos à frente da API (ex.: Railway = 1), para o req.ip vir do
// X-Forwarded-For. Padrão 0: API exposta direto, cabeçalho ignorado (não dá para forjar IP).
export function trustProxySetting(value = process.env.TRUST_PROXY): number {
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}
