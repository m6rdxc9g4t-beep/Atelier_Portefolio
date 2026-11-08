const pct1 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const int = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const eurFmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Part (0..1) → « 37,0 % ». */
export const pct = (x: number) => `${pct1.format(100 * x)} %`;
/** Points de pourcentage signés → « +12,4 pts ». */
export const pts = (x: number) =>
  `${x > 0 ? "+" : x < 0 ? "−" : ""}${pct1.format(Math.abs(x))} pt${Math.abs(x) >= 2 ? "s" : ""}`;
export const n0 = (x: number) => int.format(x);
export const eur = (x: number) => eurFmt.format(x);
export const eurSigned = (x: number) =>
  `${x > 0 ? "+" : x < 0 ? "−" : ""}${eurFmt.format(Math.abs(x))}`;
export const ratio = (x: number) => dec2.format(x);
/** Points de pourcentage sans signe, en toutes lettres → « 12,4 points ». */
export const ptsAbs = (x: number) =>
  `${pct1.format(Math.abs(x))} point${Math.abs(x) >= 2 ? "s" : ""}`;
