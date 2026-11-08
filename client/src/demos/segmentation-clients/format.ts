/** Mise en forme française (fonctions pures). */
const tidy = (s: string) => s.replace(/[   ]/g, ' ').replace('-', '−');
const nf = (d: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const int = (v: number) => tidy(nf(0).format(v));
export const dec1 = (v: number) => tidy(nf(1).format(v));
export const dec2 = (v: number) => tidy(nf(2).format(v));
export const euros = (v: number) => `${int(v)} €`;
export const pct = (v: number, digits = 0) => `${tidy(nf(digits).format(v * 100))} %`;
/** Médiane qui peut tomber entre deux entiers : « 2 » ou « 2,5 ». */
export const med = (v: number) => (Number.isInteger(v) ? int(v) : dec1(v));
export const days = (v: number) => `${med(v)} j`;
