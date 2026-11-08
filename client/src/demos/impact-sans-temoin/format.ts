const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const k = `${min}-${max}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(k, f);
  }
  return f;
}

export const fmtNum = (v: number, digits = 1) => nf(digits, digits).format(v);
/** Nombre signé avec le vrai signe moins typographique. */
export const fmtSigned = (v: number, digits = 1) => (v < 0 ? `−${fmtNum(-v, digits)}` : `+${fmtNum(v, digits)}`);
/** Montant en milliers d'euros (les ventes sont exprimées en k€). */
export const fmtK = (v: number, digits = 1) => `${fmtNum(v, digits)} k€`;
export const fmtKSigned = (v: number, digits = 1) => `${fmtSigned(v, digits)} k€`;
export const fmtPct = (v: number, digits = 1) => `${fmtSigned(v * 100, digits)} %`;
export const fmtPctAbs = (v: number, digits = 1) => `${fmtNum(v * 100, digits)} %`;
