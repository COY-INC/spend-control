import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Exige header "Authorization: Bearer <jwt>" válido; 401 caso contrário.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token ausente." });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: "JWT_SECRET não configurado." });
  try {
    const payload = jwt.verify(token, secret) as { sub?: string };
    res.locals.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido." });
  }
}
