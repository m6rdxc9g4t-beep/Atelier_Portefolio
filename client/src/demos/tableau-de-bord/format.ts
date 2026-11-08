/** Mise en forme française des montants et des taux (fonctions pures). */

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Espace fine insécable comme séparateur de milliers, vrai signe moins. */
const tidy = (s: string) => s.replace(/[   ]/g, ' ').replace('-', '−');

export const int = (v: number) => tidy(nf0.format(v));
export const euros = (v: number) => `${tidy(nf0.format(v))} €`;
export const euros2 = (v: number) => `${tidy(nf2.format(v))} €`;
/** « 104,3 k€ ». */
export const keuros = (v: number) => `${tidy(nf1.format(v / 1000))} k€`;
/** Axe : « 20 k€ », « 0 ». */
export const axisEuros = (v: number) => (v === 0 ? '0' : v >= 1000 ? `${tidy(nf0.format(v / 1000))} k€` : `${tidy(nf0.format(v))} €`);
export const pct = (v: number, digits = 1) =>
  `${tidy(new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v * 100))} %`;
export const signedPct = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${pct(Math.abs(v), digits)}`;
/** Écart en points de pourcentage : « +1,2 pt ». */
export const signedPts = (v: number) => `${v >= 0 ? '+' : '−'}${tidy(nf1.format(Math.abs(v * 100)))} pt`;
