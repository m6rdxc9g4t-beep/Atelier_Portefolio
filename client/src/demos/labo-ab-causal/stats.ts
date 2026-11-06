/**
 * Lois de probabilité implémentées à la main (aucune dépendance) : normale, Student, Beta, Gamma.
 * Fonctions pures, testées contre des valeurs de référence de R (shared/tests/demo-labo-ab-causal.test.ts).
 */

const SQRT2PI = Math.sqrt(2 * Math.PI);

/** Densité de la loi normale centrée réduite. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

/**
 * Fonction de répartition de la loi normale centrée réduite, Φ(x).
 * Algorithme de Hart (1968) en double précision, tel que publié par G. West (2005) :
 * erreur absolue < 1e-14 ; la queue inférieure est calculée directement (pas de 1 − Φ qui perdrait la précision).
 */
export function normCdf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  let c: number;
  if (ax > 37) {
    c = 0;
  } else {
    const e = Math.exp((-ax * ax) / 2);
    if (ax < 7.07106781186547) {
      let b = 3.52624965998911e-2 * ax + 0.700383064443688;
      b = b * ax + 6.37396220353165;
      b = b * ax + 33.912866078383;
      b = b * ax + 112.079291497871;
      b = b * ax + 221.213596169931;
      b = b * ax + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * ax + 1.75566716318264;
      b = b * ax + 16.064177579207;
      b = b * ax + 86.7807322029461;
      b = b * ax + 296.564248779674;
      b = b * ax + 637.333633378831;
      b = b * ax + 793.826512519948;
      b = b * ax + 440.413735824752;
      c /= b;
    } else {
      let b = ax + 0.65;
      b = ax + 4 / b;
      b = ax + 3 / b;
      b = ax + 2 / b;
      b = ax + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

/** Fonction de survie de la loi normale, 1 − Φ(x), précise dans la queue droite. */
export function normSf(x: number): number {
  return normCdf(-x);
}

/**
 * Quantile de la loi normale centrée réduite, Φ⁻¹(p).
 * Algorithme AS 241 de Wichura (1988), PPND16 : erreur relative ≈ 1e-16 (celui de `qnorm` dans R).
 */
export function normQuantile(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const q = p - 0.5;
  let r: number;
  let val: number;
  if (Math.abs(q) <= 0.425) {
    r = 0.180625 - q * q;
    val =
      (q *
        (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r +
          45921.953931549871457) *
          r +
          13731.693765509461125) *
          r +
          1971.5909503065514427) *
          r +
          133.14166789178437745) *
          r +
          3.387132872796366608)) /
      (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r +
        21213.794301586595867) *
        r +
        5394.1960214247511077) *
        r +
        687.1870074920579083) *
        r +
        42.313330701600911252) *
        r +
        1);
    return val;
  }
  r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  if (r <= 5) {
    r -= 1.6;
    val =
      (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r +
        1.27045825245236838258) *
        r +
        3.64784832476320460504) *
        r +
        5.7694972214606914055) *
        r +
        4.6303378461565452959) *
        r +
        1.42343711074968357734) /
      (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r +
        0.14810397642748007459) *
        r +
        0.68976733498510000455) *
        r +
        1.6763848301838038494) *
        r +
        2.05319162663775882187) *
        r +
        1);
  } else {
    r -= 5;
    val =
      (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r +
        0.026532189526576123093) *
        r +
        0.29656057182850489123) *
        r +
        1.7848265399172913358) *
        r +
        5.4637849111641143699) *
        r +
        6.6579046435011037772) /
      (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
        7.868691311456132591e-4) *
        r +
        0.0148753612908506148525) *
        r +
        0.13692988092273580531) *
        r +
        0.59983220655588793769) *
        r +
        1);
  }
  return q < 0 ? -val : val;
}

/* ───────────── Gamma, Beta ───────────── */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Logarithme de la fonction Gamma (approximation de Lanczos, g = 7, n = 9 ; réflexion sous 0,5). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Logarithme de la fonction Beta, ln B(a, b). */
export function lbeta(a: number, b: number): number {
  return lgamma(a) + lgamma(b) - lgamma(a + b);
}

/** Fraction continue de la fonction Beta incomplète (méthode de Lentz modifiée). */
function betacf(x: number, a: number, b: number): number {
  const MAXIT = 20000;
  const EPS = 1e-15;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Fonction Beta incomplète régularisée I_x(a, b) = fonction de répartition de la loi Beta(a, b) en x. */
export function betaCdf(x: number, a: number, b: number): number {
  if (!(a > 0) || !(b > 0) || Number.isNaN(x)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront = a * Math.log(x) + b * Math.log1p(-x) - lbeta(a, b);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lnFront) * betacf(x, a, b)) / a;
  return 1 - (Math.exp(lnFront) * betacf(1 - x, b, a)) / b;
}

/** Densité de la loi Beta(a, b). */
export function betaPdf(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return a < 1 ? Infinity : a === 1 ? Math.exp(-lbeta(a, b)) : 0;
  if (x === 1) return b < 1 ? Infinity : b === 1 ? Math.exp(-lbeta(a, b)) : 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - lbeta(a, b));
}

/** Quantile de la loi Beta(a, b), par dichotomie sur la fonction de répartition (précision ≈ 1e-12). */
export function betaQuantile(p: number, a: number, b: number): number {
  if (!(p >= 0 && p <= 1)) return NaN;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-13) break;
  }
  return (lo + hi) / 2;
}

/* ───────────── Student ───────────── */

/** Fonction de répartition de la loi de Student à ν degrés de liberté (ν réel > 0, utile pour Welch). */
export function tCdf(t: number, df: number): number {
  if (!(df > 0) || Number.isNaN(t)) return NaN;
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  if (df > 1e7) return normCdf(t);
  const x = df / (df + t * t);
  const tail = 0.5 * betaCdf(x, df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Quantile de la loi de Student (dichotomie après encadrement ; précision ≈ 1e-10). */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
  if (p === 0.5) return 0;
  let lo = -1;
  let hi = 1;
  while (tCdf(lo, df) > p) lo *= 2;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-11 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

/* ───────────── Tirages reproductibles ───────────── */

/** Générateur pseudo-aléatoire Mulberry32 : même graine, même suite (simulations reproductibles). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tirages N(0, 1) par Box–Muller à partir d'un générateur uniforme. */
export function normalSampler(uniform: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = uniform();
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}
