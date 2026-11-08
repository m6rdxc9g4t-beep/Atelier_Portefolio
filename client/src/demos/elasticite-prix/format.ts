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

export const fmtNum = (v: number, digits = 2) => nf(digits, digits).format(v);
export const fmtEur = (v: number, digits = 2) => `${fmtNum(v, digits)} €`;
/** Nombre signé avec le vrai signe moins typographique. */
export const fmtSigned = (v: number, digits = 2) => (v < 0 ? `−${fmtNum(-v, digits)}` : `+${fmtNum(v, digits)}`);
export const fmtElast = (v: number, digits = 2) => (v < 0 ? `−${fmtNum(-v, digits)}` : fmtNum(v, digits));
export const fmtPct = (v: number, digits = 1) => `${fmtSigned(v * 100, digits)} %`;
