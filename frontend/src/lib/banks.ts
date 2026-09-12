// Assinatura visual do app: cada instituição tem sua cor de marca. O match é por
// substring no nome da instituição (mesma ideia do CardBrand com bandeiras), então
// "Nu Pagamentos", "Nubank" e "NuBank" caem todos no roxo. Cores escolhidas pra
// serem legíveis como bolinha/realce nos dois temas; marcas quase-pretas (C6, Safra)
// usam um cinza pra aparecer no dark. Fallback = slate neutro.

const BANK_COLORS: [RegExp, string][] = [
  [/\bnu(bank)?\b|nu pagamentos/i, "#820ad1"],
  [/ita[uú]/i, "#ec7000"],
  [/inter\b/i, "#ff7a00"],
  [/bradesco/i, "#cc092f"],
  [/santander/i, "#ec0000"],
  [/caixa/i, "#0070b8"],
  [/banco do brasil|bb\b/i, "#0033a0"],
  [/mercado ?pago|mercadopago/i, "#00a6e6"],
  [/picpay/i, "#21c25e"],
  [/c6\b/i, "#6b7280"],
  [/btg/i, "#1e3a5f"],
  [/sicredi/i, "#3fa535"],
  [/sicoob/i, "#00995d"],
  [/safra/i, "#64748b"],
  [/original/i, "#f97316"],
  [/neon/i, "#00e5d1"],
  [/will/i, "#f5b800"],
  [/pan\b/i, "#00a3e0"],
  [/pagbank|pagseguro/i, "#0a8a3a"],
  [/xp\b|xp investimentos/i, "#0f172a"],
  [/sofisa/i, "#db0f6f"],
];

const FALLBACK = "#64748b"; // slate-500

// Cor de marca da instituição (hex). Sempre retorna algo (fallback slate).
export function bankAccent(institution: string | null | undefined): string {
  if (!institution) return FALLBACK;
  for (const [re, color] of BANK_COLORS) if (re.test(institution)) return color;
  return FALLBACK;
}
