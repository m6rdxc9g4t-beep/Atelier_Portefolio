/** Outils pour lire des courbes de survie publiées (Kaplan–Meier, Nelson–Aalen). */

/**
 * Valeur d'une fonction en escalier continue à droite (ex. Ŝ(t) de Kaplan–Meier)
 * définie par des points (times[i], values[i]) triés par temps croissant.
 * Avant le premier point, renvoie `initial` (1 pour une survie, 0 pour un hasard cumulé).
 */
export function stepAt(times: number[], values: number[], t: number, initial = 1): number {
  if (times.length !== values.length) throw new Error('times et values doivent avoir la même longueur');
  let v = initial;
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= t) v = values[i];
    else break;
  }
  return v;
}

/** Interpolation linéaire (pour lisser des courbes publiées seulement à quelques horizons). */
export function interpolate(xs: number[], ys: number[], x: number): number {
  if (xs.length === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 1;
  while (xs[i] < x) i++;
  const x0 = xs[i - 1];
  const x1 = xs[i];
  const w = (x - x0) / (x1 - x0);
  return ys[i - 1] * (1 - w) + ys[i] * w;
}

/** Premier temps où la survie passe sous `level` (médiane si level = 0,5) ; null si jamais atteint. */
export function quantileTime(times: number[], surv: number[], level = 0.5): number | null {
  for (let i = 0; i < times.length; i++) if (surv[i] <= level) return times[i];
  return null;
}

/** Hasard cumulé implicite H(t) = −log S(t). */
export function cumulativeHazardFromSurvival(s: number): number {
  return s <= 0 ? Infinity : -Math.log(s);
}

/** Nombre d'individus encore présents sur une cohorte de taille n. */
export function cohortRemaining(survival: number, n = 100): number {
  return Math.round(n * Math.max(0, Math.min(1, survival)));
}
