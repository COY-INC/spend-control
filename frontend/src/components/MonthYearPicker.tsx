// Seletor de Mês/Ano — usa <input type="month"> nativo (mês+ano num só controle).
// Valor no formato "YYYY-MM".

export const currentMonth = () => new Date().toISOString().slice(0, 7); // "2026-08"

export const toPeriod = (ym: string) => {
  const [year, month] = ym.split("-").map(Number);
  return { year, month }; // month: 1-12
};

export function MonthYearPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (ym: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Período:
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm text-foreground [color-scheme:light] dark:[color-scheme:dark]"
      />
    </label>
  );
}
