const intFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2Fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const int = (n: number) => intFmt.format(n);
export const eur = (n: number) => eurFmt.format(n).replace('-', '−');
export const eur2 = (n: number) => eur2Fmt.format(n).replace('-', '−');
/** Pourcentage d'une proportion (0,183 → « 18,3 % »). */
export const pct = (x: number, digits = 1) =>
  `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
export const num = (x: number, digits = 2) => x.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');
