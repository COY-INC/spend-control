import { bankAccent } from "@/lib/banks";

// Bolinha na cor da marca do banco + (opcional) nome e valor. É a peça de assinatura:
// mostra o recorte multi-banco de relance. `dotOnly` para usar só o ponto colorido.
export function BankChip({
  institution,
  value,
  dotOnly = false,
  className = "",
}: {
  institution: string;
  value?: string;
  dotOnly?: boolean;
  className?: string;
}) {
  const color = bankAccent(institution);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/5 dark:ring-white/10"
        style={{ backgroundColor: color }}
      />
      {!dotOnly && (
        <>
          <span className="truncate text-muted-foreground">{institution}</span>
          {value && <span className="ledger text-foreground">{value}</span>}
        </>
      )}
    </span>
  );
}
