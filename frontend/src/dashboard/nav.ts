export type SectionId =
  | "resumo"
  | "patrimonio"
  | "investimentos"
  | "cartoes"
  | "gastos"
  | "transacoes";

export type Section = {
  id: SectionId;
  path: string;
  label: string;
  icon: string; // emoji na Fase 1; SVG na Fase 2
  mobilePrimary: boolean; // true = bottom bar; false = menu "Mais"
};

export const SECTIONS: Section[] = [
  { id: "resumo", path: "/resumo", label: "Resumo", icon: "🏠", mobilePrimary: true },
  { id: "patrimonio", path: "/patrimonio", label: "Patrimônio", icon: "💰", mobilePrimary: false },
  { id: "investimentos", path: "/investimentos", label: "Investimentos", icon: "📈", mobilePrimary: false },
  { id: "cartoes", path: "/cartoes", label: "Cartões", icon: "💳", mobilePrimary: true },
  { id: "gastos", path: "/gastos", label: "Gastos", icon: "📊", mobilePrimary: true },
  { id: "transacoes", path: "/transacoes", label: "Transações", icon: "🧾", mobilePrimary: true },
];
