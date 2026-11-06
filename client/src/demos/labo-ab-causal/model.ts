/**
 * Modèles du « Labo A/B et inférence causale » : dimensionnement, analyse d'un test (fréquentiste et bayésienne),
 * contrôles (SRM, tests multiples, regards répétés) et différence de différences sur données simulées.
 * Fonctions pures ; tout tourne dans le navigateur.
 */
import {
  betaCdf,
  betaPdf,
  betaQuantile,
  lbeta,
  mulberry32,
  normalSampler,
  normCdf,
  normPdf,
  normQuantile,
  normSf,
  tCdf,
  tQuantile,
} from './stats';

export type Sides = 'two' | 'one';

/* ═════════════ 1. Taille d'échantillon et puissance ═════════════ */

export interface SampleSizeInput {
  /** Taux de conversion du groupe A (contrôle), entre 0 et 1. */
  baseline: number;
  /** Effet minimal détectable : relatif (0,10 = +10 %) ou absolu (0,004 = +0,4 point). */
  mde: number;
  mdeMode: 'relative' | 'absolute';
  alpha: number;
  power: number;
  sides: Sides;
  /** Part du trafic envoyée vers B (w), entre 0 et 1. */
  shareB: number;
  /** Visiteurs qui entrent chaque jour dans le test. */
  dailyTraffic: number;
}

export interface SampleSizeResult {
  pA: number;
  pB: number;
  delta: number;
  pBar: number;
  zAlpha: number;
  zBeta: number;
  /** Effectif total théorique (réel, avant arrondi). */
  nTotalExact: number;
  nA: number;
  nB: number;
  nTotal: number;
  days: number;
}

/** Taux attendu en B selon le mode de l'effet minimal. */
export function targetRate(baseline: number, mde: number, mode: 'relative' | 'absolute'): number {
  return mode === 'relative' ? baseline * (1 + mde) : baseline + mde;
}

/** Quantile critique du test : z_{1−α/2} (bilatéral) ou z_{1−α} (unilatéral). */
export function zCritical(alpha: number, sides: Sides): number {
  return normQuantile(1 - (sides === 'two' ? alpha / 2 : alpha));
}

/**
 * Effectif total N d'un test de deux proportions (approximation normale, variance poolée sous H0), répartition w vers B :
 * N = [z_α √(p̄q̄(1/(1−w) + 1/w)) + z_β √(p_A q_A/(1−w) + p_B q_B/w)]² / (p_B − p_A)², p̄ = (1−w)p_A + w p_B.
 * Pour w = ½, N/2 est l'effectif par groupe de `power.prop.test` (R).
 */
export function totalSampleSize(pA: number, pB: number, alpha: number, power: number, sides: Sides, w: number): number {
  const za = zCritical(alpha, sides);
  const zb = normQuantile(power);
  const pBar = (1 - w) * pA + w * pB;
  const s0 = Math.sqrt(pBar * (1 - pBar) * (1 / (1 - w) + 1 / w));
  const s1 = Math.sqrt((pA * (1 - pA)) / (1 - w) + (pB * (1 - pB)) / w);
  const d = pB - pA;
  return ((za * s0 + zb * s1) / d) ** 2;
}

/** Dimensionnement complet (effectifs arrondis à l'entier supérieur, durée en jours entiers). */
export function sampleSize(input: SampleSizeInput): SampleSizeResult {
  const pA = input.baseline;
  const pB = targetRate(pA, input.mde, input.mdeMode);
  const w = input.shareB;
  const nTotalExact = totalSampleSize(pA, pB, input.alpha, input.power, input.sides, w);
  const nA = Math.ceil(nTotalExact * (1 - w) - 1e-9);
  const nB = Math.ceil(nTotalExact * w - 1e-9);
  const nTotal = nA + nB;
  return {
    pA,
    pB,
    delta: pB - pA,
    pBar: (1 - w) * pA + w * pB,
    zAlpha: zCritical(input.alpha, input.sides),
    zBeta: normQuantile(input.power),
    nTotalExact,
    nA,
    nB,
    nTotal,
    days: Math.ceil(nTotal / input.dailyTraffic - 1e-9),
  };
}

/**
 * Puissance d'un test de deux proportions pour des effectifs donnés (approximation normale).
 * En bilatéral, les deux queues sont comptées (comme `power.prop.test(strict = TRUE)`).
 */
export function powerTwoProportions(pA: number, pB: number, nA: number, nB: number, alpha: number, sides: Sides): number {
  if (!(nA > 0 && nB > 0)) return sides === 'two' ? alpha : alpha;
  const pBar = (nA * pA + nB * pB) / (nA + nB);
  const se0 = Math.sqrt(pBar * (1 - pBar) * (1 / nA + 1 / nB));
  const se1 = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const d = pB - pA;
  const z = zCritical(alpha, sides);
  if (sides === 'one') return normCdf((d - z * se0) / se1);
  return normCdf((Math.abs(d) - z * se0) / se1) + normCdf((-Math.abs(d) - z * se0) / se1);
}

/** Courbe de puissance en fonction de l'effectif total (répartition w conservée). */
export function powerCurve(
  pA: number,
  pB: number,
  alpha: number,
  sides: Sides,
  w: number,
  nMax: number,
  points = 160,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const n = (nMax * i) / points;
    out.push([n, i === 0 ? (sides === 'two' ? alpha : alpha) : powerTwoProportions(pA, pB, n * (1 - w), n * w, alpha, sides)]);
  }
  return out;
}

/**
 * Effet minimal détectable (en points, p_B − p_A > 0) pour un effectif total donné, par dichotomie sur la puissance.
 * Renvoie null si même un passage à 100 % ne suffit pas.
 */
export function minimalDetectableEffect(
  pA: number,
  nTotal: number,
  alpha: number,
  power: number,
  sides: Sides,
  w: number,
): number | null {
  const nA = nTotal * (1 - w);
  const nB = nTotal * w;
  let lo = 0;
  let hi = 1 - pA - 1e-9;
  if (hi <= 0 || powerTwoProportions(pA, pA + hi, nA, nB, alpha, sides) < power) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (powerTwoProportions(pA, pA + mid, nA, nB, alpha, sides) < power) lo = mid;
    else hi = mid;
  }
  return hi;
}

/* ═════════════ 2. Analyse d'un test ═════════════ */

export interface ProportionTest {
  pA: number;
  pB: number;
  diff: number;
  /** Erreur type non poolée (intervalle de confiance). */
  se: number;
  ciLow: number;
  ciHigh: number;
  /** Statistique z (variance poolée sous H0). */
  z: number;
  pValue: number;
  /** Écart relatif (p_B − p_A)/p_A ; null si p_A = 0. */
  lift: number | null;
  liftLow: number | null;
  liftHigh: number | null;
  /** Effectifs attendus minimaux sous H0 (contrôle de l'approximation normale). */
  minExpected: number;
}

/**
 * Test z bilatéral de deux proportions (sans correction de continuité : z² = X² de `prop.test(correct = FALSE)`),
 * intervalle de Wald sur la différence, intervalle du lift par la méthode delta sur ln(p_B/p_A).
 * Renvoie null si le test n'est pas défini (aucune conversion ou que des conversions).
 */
export function twoProportionTest(nA: number, xA: number, nB: number, xB: number, alpha: number): ProportionTest | null {
  const pA = xA / nA;
  const pB = xB / nB;
  const pBar = (xA + xB) / (nA + nB);
  const se0 = Math.sqrt(pBar * (1 - pBar) * (1 / nA + 1 / nB));
  if (!(se0 > 0)) return null;
  const diff = pB - pA;
  const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const zc = normQuantile(1 - alpha / 2);
  const z = diff / se0;
  const pValue = Math.min(1, 2 * normSf(Math.abs(z)));
  let lift: number | null = null;
  let liftLow: number | null = null;
  let liftHigh: number | null = null;
  if (xA > 0) lift = diff / pA;
  if (xA > 0 && xB > 0) {
    const seLog = Math.sqrt((1 - pA) / xA + (1 - pB) / xB);
    const logRatio = Math.log(pB / pA);
    liftLow = Math.exp(logRatio - zc * seLog) - 1;
    liftHigh = Math.exp(logRatio + zc * seLog) - 1;
  }
  const minExpected = Math.min(nA * pBar, nA * (1 - pBar), nB * pBar, nB * (1 - pBar));
  return { pA, pB, diff, se, ciLow: diff - zc * se, ciHigh: diff + zc * se, z, pValue, lift, liftLow, liftHigh, minExpected };
}

export interface WelchTest {
  diff: number;
  se: number;
  df: number;
  t: number;
  pValue: number;
  ciLow: number;
  ciHigh: number;
  lift: number | null;
}

/** Test t de Welch (variances inégales) à partir des moyennes, écarts-types et effectifs ; null si non défini. */
export function welchTest(
  mA: number,
  sA: number,
  nA: number,
  mB: number,
  sB: number,
  nB: number,
  alpha: number,
): WelchTest | null {
  const vA = (sA * sA) / nA;
  const vB = (sB * sB) / nB;
  const se = Math.sqrt(vA + vB);
  if (!(se > 0) || nA < 2 || nB < 2) return null;
  const df = (vA + vB) ** 2 / ((vA * vA) / (nA - 1) + (vB * vB) / (nB - 1));
  const diff = mB - mA;
  const t = diff / se;
  const pValue = Math.min(1, 2 * (1 - tCdf(Math.abs(t), df)));
  const tc = tQuantile(1 - alpha / 2, df);
  return { diff, se, df, t, pValue, ciLow: diff - tc * se, ciHigh: diff + tc * se, lift: mA !== 0 ? diff / Math.abs(mA) : null };
}

/* ── Contrôles ── */

export interface SrmCheck {
  expectedA: number;
  expectedB: number;
  chi2: number;
  pValue: number;
  /** Seuil usuel de l'industrie : p < 0,001. */
  flagged: boolean;
}

/** Test du χ² d'adéquation (1 ddl) de la répartition observée à la répartition prévue (Sample Ratio Mismatch). */
export function srmCheck(nA: number, nB: number, shareB: number, threshold = 0.001): SrmCheck {
  const total = nA + nB;
  const expectedA = total * (1 - shareB);
  const expectedB = total * shareB;
  const chi2 = (nA - expectedA) ** 2 / expectedA + (nB - expectedB) ** 2 / expectedB;
  // Pour 1 ddl, P(χ² > c) = 2(1 − Φ(√c)).
  const pValue = Math.min(1, 2 * normSf(Math.sqrt(chi2)));
  return { expectedA, expectedB, chi2, pValue, flagged: pValue < threshold };
}

/** p-valeurs ajustées de Bonferroni (comme `p.adjust(p, "bonferroni")`). */
export function bonferroni(p: number[]): number[] {
  return p.map((v) => Math.min(1, v * p.length));
}

/** p-valeurs ajustées de Holm (comme `p.adjust(p, "holm")`), dans l'ordre d'entrée. */
export function holm(p: number[]): number[] {
  const m = p.length;
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(m);
  let running = 0;
  order.forEach(([v, i], k) => {
    running = Math.max(running, Math.min(1, (m - k) * v));
    out[i] = running;
  });
  return out;
}

/**
 * Taux réel de faux positifs quand on regarde K fois les résultats (à intervalles d'information égaux)
 * et qu'on s'arrête au premier |z| > z_{1−α/2}, sous H0 (Armitage, McPherson et Rowe, 1969).
 * Calcul déterministe : propagation de la densité de la somme partielle sur une grille (méthode des trapèzes).
 */
export function peekingFalsePositiveRate(looks: number, alpha: number, step = 0.02): number {
  const K = Math.max(1, Math.floor(looks));
  const c = normQuantile(1 - alpha / 2);
  let rejected = 2 * normSf(c);
  if (K === 1) return rejected;
  // Densité (non normalisée à 1 : masse restante) de S_1 sur [−c, c].
  let bound = c;
  let n = Math.ceil((2 * bound) / step);
  let h = (2 * bound) / n;
  let xs = Array.from({ length: n + 1 }, (_, i) => -bound + i * h);
  let f = xs.map((x) => normPdf(x));
  for (let j = 2; j <= K; j++) {
    const nb = c * Math.sqrt(j);
    const wts = xs.map((_, i) => (i === 0 || i === xs.length - 1 ? h / 2 : h));
    // Probabilité d'arrêt à ce regard.
    let pj = 0;
    for (let i = 0; i < xs.length; i++) pj += wts[i] * f[i] * (normCdf(-nb - xs[i]) + normSf(nb - xs[i]));
    rejected += pj;
    if (j === K) break;
    // Nouvelle densité sur [−nb, nb].
    const m = Math.ceil((2 * nb) / step);
    const hy = (2 * nb) / m;
    const ys = Array.from({ length: m + 1 }, (_, i) => -nb + i * hy);
    const g = ys.map((y) => {
      let s = 0;
      for (let i = 0; i < xs.length; i++) s += wts[i] * f[i] * normPdf(y - xs[i]);
      return s;
    });
    bound = nb;
    n = m;
    h = hy;
    xs = ys;
    f = g;
  }
  return rejected;
}

/* ── Lecture bayésienne ── */

export interface BayesResult {
  /** Paramètres des lois a posteriori Beta(α, β). */
  aA: number;
  bA: number;
  aB: number;
  bB: number;
  probBBeatsA: number;
  ciA: [number, number];
  ciB: [number, number];
}

/**
 * P(p_B > p_A) pour deux lois Beta indépendantes, formule exacte (somme finie, E. Miller 2015) :
 * Σ_{i=0}^{α_B−1} B(α_A+i, β_A+β_B) / [(β_B+i) B(1+i, β_B) B(α_A, β_A)], valable pour α_B entier.
 * On somme sur le plus petit des deux α (symétrie P(B > A) = 1 − P(A > B)).
 */
export function probBetaGreater(aA: number, bA: number, aB: number, bB: number): number {
  const sum = (a1: number, b1: number, a2: number, b2: number) => {
    let s = 0;
    const k = lbeta(a1, b1);
    for (let i = 0; i < a2; i++) s += Math.exp(lbeta(a1 + i, b1 + b2) - Math.log(b2 + i) - lbeta(1 + i, b2) - k);
    return s;
  };
  if (aB <= aA) return Math.min(1, Math.max(0, sum(aA, bA, aB, bB)));
  return Math.min(1, Math.max(0, 1 - sum(aB, bB, aA, bA)));
}

/** Même probabilité par intégration numérique (Simpson) de f_B(x)·F_A(x) : sert de contrôle croisé. */
export function probBetaGreaterIntegral(aA: number, bA: number, aB: number, bB: number, steps = 4000): number {
  const lo = Math.max(0, Math.min(betaQuantile(1e-10, aA, bA), betaQuantile(1e-10, aB, bB)));
  const hi = Math.min(1, Math.max(betaQuantile(1 - 1e-10, aA, bA), betaQuantile(1 - 1e-10, aB, bB)));
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (hi - lo) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const x = lo + i * h;
    const v = betaPdf(x, aB, bB) * betaCdf(x, aA, bA);
    const wgt = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    s += wgt * (Number.isFinite(v) ? v : 0);
  }
  return Math.min(1, Math.max(0, (s * h) / 3));
}

/** Lecture bayésienne Beta–Binomiale avec a priori uniforme Beta(1, 1). */
export function bayesBetaBinomial(nA: number, xA: number, nB: number, xB: number, level = 0.95): BayesResult {
  const aA = 1 + xA;
  const bA = 1 + nA - xA;
  const aB = 1 + xB;
  const bB = 1 + nB - xB;
  const t = (1 - level) / 2;
  return {
    aA,
    bA,
    aB,
    bB,
    probBBeatsA: probBetaGreater(aA, bA, aB, bB),
    ciA: [betaQuantile(t, aA, bA), betaQuantile(1 - t, aA, bA)],
    ciB: [betaQuantile(t, aB, bB), betaQuantile(1 - t, aB, bB)],
  };
}

/* ═════════════ 3. Différence de différences (données simulées) ═════════════ */

export interface DidParams {
  seed: number;
  /** Tendance commune, par semaine. */
  trend: number;
  /** Effet réel de la mesure sur le groupe traité (après). */
  effect: number;
  /** Écart-type du bruit hebdomadaire de chaque unité. */
  noise: number;
  /** Écart de niveau permanent du groupe traité. */
  gap: number;
  /** Tendance propre au groupe traité (0 = tendances parallèles). */
  violation: number;
  units?: number;
  pre?: number;
  post?: number;
  base?: number;
}

export interface DidResult {
  weeks: number[];
  pre: number;
  post: number;
  units: number;
  control: number[];
  treated: number[];
  /** Contrefactuel du groupe traité sous tendances parallèles (défini à partir de la dernière semaine avant). */
  counterfactual: (number | null)[];
  means: { cPre: number; cPost: number; tPre: number; tPost: number };
  did: number;
  didSe: number;
  didDf: number;
  didLow: number;
  didHigh: number;
  naiveBeforeAfter: number;
  naivePostGap: number;
  /** Biais théorique de la DiD dû à la tendance propre : δ × (t̄_après − t̄_avant). */
  didBias: number;
  preTrend: { slope: number; se: number; pValue: number };
}

/**
 * Simule un panel : unités × semaines, y_it = base + gap·T_i + u_i + trend·t + δ·T_i·(t − pre) + τ·T_i·[t ≥ pre] + ε_it.
 * Estime la DiD 2×2, son intervalle (Welch sur les variations par unité, ce qui tient compte de la corrélation intra-unité),
 * les deux estimateurs naïfs et un test de pré-tendances (pente de l'écart traité − contrôle avant la mesure).
 */
export function simulateDid(p: DidParams): DidResult {
  const units = p.units ?? 30;
  const pre = p.pre ?? 10;
  const post = p.post ?? 10;
  const base = p.base ?? 50;
  const T = pre + post;
  const gauss = normalSampler(mulberry32(p.seed));
  const sums = { c: new Array<number>(T).fill(0), t: new Array<number>(T).fill(0) };
  const changes: { c: number[]; t: number[] } = { c: [], t: [] };
  for (const group of ['c', 't'] as const) {
    const isT = group === 't' ? 1 : 0;
    for (let i = 0; i < units; i++) {
      const u = 2 * gauss();
      let sPre = 0;
      let sPost = 0;
      for (let t = 0; t < T; t++) {
        const after = t >= pre ? 1 : 0;
        const y =
          base + p.gap * isT + u + p.trend * t + p.violation * isT * (t - pre) + p.effect * isT * after + p.noise * gauss();
        sums[group][t] += y;
        if (after) sPost += y;
        else sPre += y;
      }
      changes[group].push(sPost / post - sPre / pre);
    }
  }
  const control = sums.c.map((s) => s / units);
  const treated = sums.t.map((s) => s / units);
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const cPre = avg(control.slice(0, pre));
  const cPost = avg(control.slice(pre));
  const tPre = avg(treated.slice(0, pre));
  const tPost = avg(treated.slice(pre));
  const did = tPost - tPre - (cPost - cPre);

  const sd = (a: number[]) => {
    const m = avg(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
  };
  const w = welchTest(avg(changes.c), sd(changes.c), units, avg(changes.t), sd(changes.t), units, 0.05);
  const gapPre = control.slice(0, pre).map((c, t) => treated[t] - c);
  const counterfactual = control.map((c, t) => (t >= pre - 1 ? c + (tPre - cPre) : null));

  // Pente de l'écart avant la mesure (MCO), test de Student à pre − 2 ddl.
  const ts = gapPre.map((_, t) => t);
  const tm = avg(ts);
  const gm = avg(gapPre);
  const sxx = ts.reduce((s, t) => s + (t - tm) ** 2, 0);
  const slope = ts.reduce((s, t, i) => s + (t - tm) * (gapPre[i] - gm), 0) / sxx;
  const resid = ts.map((t, i) => gapPre[i] - gm - slope * (t - tm));
  const s2 = resid.reduce((s, r) => s + r * r, 0) / (pre - 2);
  const seSlope = Math.sqrt(s2 / sxx);
  const tStat = slope / seSlope;
  const preP = seSlope > 0 ? 2 * (1 - tCdf(Math.abs(tStat), pre - 2)) : 1;

  const meanTPost = pre + (post - 1) / 2;
  const meanTPre = (pre - 1) / 2;
  return {
    weeks: Array.from({ length: T }, (_, t) => t + 1),
    pre,
    post,
    units,
    control,
    treated,
    counterfactual,
    means: { cPre, cPost, tPre, tPost },
    did,
    didSe: w ? w.se : NaN,
    didDf: w ? w.df : NaN,
    didLow: w ? w.ciLow : NaN,
    didHigh: w ? w.ciHigh : NaN,
    naiveBeforeAfter: tPost - tPre,
    naivePostGap: tPost - cPost,
    didBias: p.violation * (meanTPost - meanTPre),
    preTrend: { slope, se: seSlope, pValue: preP },
  };
}

/* ═════════════ Saisie ═════════════ */

/**
 * Lit un nombre saisi à la française ou à l'anglaise (« 4,5 », « 4.5 », « 5 000 », « 12 % ») ; null si illisible.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, '').replace(/%$/, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Lit une liste de p-valeurs séparées par des retours, points-virgules ou espaces ; erreurs explicites. */
export function parsePValues(raw: string): { values: number[]; error: string | null } {
  const parts = raw
    .split(/\n|;|,\s+|\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const values: number[] = [];
  for (const part of parts) {
    const v = parseNumber(part);
    if (v === null || v < 0 || v > 1) return { values: [], error: `« ${part} » n'est pas une p-valeur (nombre entre 0 et 1).` };
    values.push(v);
  }
  if (values.length > 50) return { values: [], error: 'Cinquante p-valeurs au plus.' };
  return { values, error: null };
}
