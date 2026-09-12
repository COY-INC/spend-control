import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// Hash de PIN com scrypt (node:crypto, sem dependência externa). Formato:
//   s1$<salt hex>$<hash hex>
// O prefixo "s1$" distingue hash de PIN legado em texto puro (migração preguiçosa).
const PREFIX = "s1$";
const KEYLEN = 32;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEYLEN);
  return `${PREFIX}${salt.toString("hex")}$${hash.toString("hex")}`;
}

export const isHashed = (stored: string): boolean => stored.startsWith(PREFIX);

export function verifyPin(pin: string, stored: string): boolean {
  if (!isHashed(stored)) return stored === pin; // legado em texto puro
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
