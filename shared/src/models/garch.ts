import { mulberry32, normalSampler } from './random.js';

/**
 * Processus AR(1)–GARCH(1,1) :
 *   x_t = a0 + a1·x_{t−1} + η_t,   η_t = √h_t · ε_t,   ε_t ~ N(0,1)
 *   h_t = ω + α·η²_{t−1} + β·h_{t−1}
 * (β = 0 donne un ARCH(1).)
 */
export interface GarchParams {
  a0?: number;
  a1?: number;
  omega: number;
  alpha: number;
  beta: number;
}

export interface GarchPath {
  returns: number[];
  /** Volatilité conditionnelle √h_t. */
  sigma: number[];
}

export const persistence = (p: GarchParams): number => p.alpha + p.beta;

/** Variance non conditionnelle de η_t : ω / (1 − α − β) ; Infinity si α + β ≥ 1. */
export function unconditionalVariance(p: GarchParams): number {
  const s = persistence(p);
  return s < 1 ? p.omega / (1 - s) : Infinity;
}

/** Variance non conditionnelle de x_t pour l'AR(1) : Var(η) / (1 − a1²). */
export function unconditionalVarianceAR(p: GarchParams): number {
  const a1 = p.a1 ?? 0;
  return unconditionalVariance(p) / (1 - a1 * a1);
}

/** Demi-vie d'un choc de volatilité (en périodes) : ln(0,5) / ln(α + β). */
export function halfLife(p: GarchParams): number {
  const s = persistence(p);
  return s > 0 && s < 1 ? Math.log(0.5) / Math.log(s) : Infinity;
}

/**
 * Condition d'existence du moment d'ordre 2r d'un ARCH(1) gaussien :
 * α1^r · ∏_{j=1..r}(2j − 1) < 1   (r = 1 : α1 < 1 ; r = 2 : 3α1² < 1 ; …).
 */
export function arch1MomentCondition(alpha1: number, r: number): number {
  let prod = 1;
  for (let j = 1; j <= r; j++) prod *= 2 * j - 1;
  return prod * Math.pow(alpha1, r);
}

/** Simulation reproductible (graine) avec période de chauffe. */
export function simulateGarch(p: GarchParams, n: number, seed = 42, burn = 250): GarchPath {
  if (p.omega <= 0 || p.alpha < 0 || p.beta < 0) throw new Error('Paramètres GARCH invalides');
  const z = normalSampler(mulberry32(seed));
  const a0 = p.a0 ?? 0;
  const a1 = p.a1 ?? 0;
  const s = persistence(p);
  // Variance initiale : variance de long terme si elle existe, sinon ω × 10.
  let h = s < 1 ? p.omega / (1 - s) : p.omega * 10;
  let eta = 0;
  let x = a0 / (1 - a1 || 1);
  const returns: number[] = [];
  const sigma: number[] = [];
  for (let t = 0; t < n + burn; t++) {
    h = p.omega + p.alpha * eta * eta + p.beta * h;
    // Garde-fou numérique si l'utilisateur pousse α + β au-delà de 1.
    if (!Number.isFinite(h) || h > 1e6) h = 1e6;
    eta = Math.sqrt(h) * z();
    x = a0 + a1 * x + eta;
    if (t >= burn) {
      returns.push(x);
      sigma.push(Math.sqrt(h));
    }
  }
  return { returns, sigma };
}

/** Autocorrélations empiriques jusqu'au retard maxLag. */
export function acf(series: number[], maxLag: number): number[] {
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const d = series.map((v) => v - mean);
  const denom = d.reduce((a, b) => a + b * b, 0);
  const out: number[] = [];
  for (let k = 1; k <= maxLag; k++) {
    let num = 0;
    for (let t = k; t < n; t++) num += d[t] * d[t - k];
    out.push(num / denom);
  }
  return out;
}

/** Kurtosis empirique (non centrée sur 3) : 3 pour une loi normale. */
export function kurtosis(series: number[]): number {
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m4 = 0;
  for (const v of series) {
    const d = v - mean;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m4 /= n;
  return m4 / (m2 * m2);
}
