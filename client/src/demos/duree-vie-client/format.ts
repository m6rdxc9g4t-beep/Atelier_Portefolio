const intFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const int = (n: number) => intFmt.format(n);
export const eur = (n: number) => eurFmt.format(n).replace('-', '−');
export const num = (x: number, digits = 2) =>
  x.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');
/** Proportion en pourcentage (0,341 → « 34,1 % »). */
export const pct = (x: number, digits = 1) =>
  `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
/** Durée en mois avec une décimale. */
export const mois = (m: number | null) => (m === null ? 'non atteinte' : `${num(m, 1)} mois`);
/** p-valeur lisible : « < 0,001 » sous le millième. */
export const pval = (p: number) => (p < 0.001 ? '< 0,001' : num(p, 3));
/** « p = 0,012 » ou « p < 0,001 ». */
export const pEq = (p: number) => (p < 0.001 ? 'p < 0,001' : `p = ${num(p, 3)}`);
