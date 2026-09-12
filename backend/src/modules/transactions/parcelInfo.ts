// Identidade estruturada da parcela: usa creditCardMetadata.installmentNumber/totalInstallments
// (Pluggy) quando presente; cai pro "N/M" no fim da description só como fallback (dados
// sincronizados antes desta migration, ou bancos sem os campos estruturados).
//
// Necessário porque `description` é o texto NORMALIZADO da Pluggy — a limpeza remove o "N/M"
// original pra alguns bancos (ex.: Mercado Pago), escondendo a parcela em todo lugar que só
// olhava pro texto (fatura, timeline, compromissos futuros, antecipar parcela).
const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;

export type ParcelIdent = {
  description: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
};

export function parcelInfo(t: ParcelIdent): { n: number; m: number } | null {
  if (t.installmentNumber != null && t.totalInstallments != null) {
    return { n: t.installmentNumber, m: t.totalInstallments };
  }
  const m = PARCEL_RE.exec(t.description);
  return m ? { n: Number(m[1]), m: Number(m[2]) } : null;
}
