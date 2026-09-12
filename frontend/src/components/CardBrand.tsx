// Bandeira do cartão em SVG inline (rede: Mastercard, Visa, Elo, Amex, Hipercard).
export function CardBrand({ brand, className = "" }: { brand: string | null; className?: string }) {
  const b = (brand || "").toUpperCase();
  const cls = `inline-block h-5 w-8 shrink-0 rounded-[3px] ${className}`;

  if (b.includes("MASTER"))
    return (
      <svg viewBox="0 0 32 20" className={cls} aria-label="Mastercard">
        <rect width="32" height="20" fill="#F4F4F5" />
        <circle cx="13" cy="10" r="6" fill="#EB001B" />
        <circle cx="19" cy="10" r="6" fill="#F79E1B" />
        <path d="M16 5.2a6 6 0 000 9.6 6 6 0 000-9.6z" fill="#FF5F00" />
      </svg>
    );
  if (b.includes("VISA"))
    return (
      <svg viewBox="0 0 32 20" className={cls} aria-label="Visa">
        <rect width="32" height="20" fill="#1A1F71" />
        <text x="16" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fontStyle="italic" fill="#fff" fontFamily="Arial, sans-serif">VISA</text>
      </svg>
    );
  if (b.includes("ELO"))
    return (
      <svg viewBox="0 0 32 20" className={cls} aria-label="Elo">
        <rect width="32" height="20" fill="#111" />
        <text x="16" y="14" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">elo</text>
      </svg>
    );
  if (b.includes("AMEX") || b.includes("AMERICAN"))
    return (
      <svg viewBox="0 0 32 20" className={cls} aria-label="American Express">
        <rect width="32" height="20" fill="#2E77BC" />
        <text x="16" y="13" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">AMEX</text>
      </svg>
    );
  if (b.includes("HIPER"))
    return (
      <svg viewBox="0 0 32 20" className={cls} aria-label="Hipercard">
        <rect width="32" height="20" fill="#822124" />
        <text x="16" y="13" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">hiper</text>
      </svg>
    );
  // fallback genérico
  return (
    <svg viewBox="0 0 32 20" className={cls} aria-label="Cartão">
      <rect width="32" height="20" fill="#E4E4E7" />
      <rect y="5" width="32" height="3" fill="#A1A1AA" />
    </svg>
  );
}
