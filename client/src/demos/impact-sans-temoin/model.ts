/**
 * Mesurer l'impact d'une campagne locale sans groupe témoin.
 * Simulation à graine fixe (20 magasins, 104 semaines, effet vrai connu), puis quatre estimateurs :
 * avant/après naïf, différence de différences, contrôle synthétique (poids sur le simplexe),
 * régression sur les contrôles avec intervalle de prévision. Inférence par placebos (permutation).
 * Toutes les fonctions sont pures.
 */
import { mulberry32 } from '../sql-lab/data';

/* ───────────── Outils numériques ───────────── */

/** Projection euclidienne d'un vecteur sur le simplexe { w ≥ 0, Σ w = 1 } (Duchi et al., 2008). */
export function projectSimplex(v: readonly number[]): number[] {
  const n = v.length;
  if (n === 0) return [];
  const u = [...v].sort((a, b) => b - a);
  let css = 0;
  let theta = 0;
  for (let k = 0; k < n; k++) {
    css += u[k]!;
    const t = (css - 1) / (k + 1);
    if (u[k]! - t > 0) theta = t;
  }
  return v.map((x) => Math.max(0, x - theta));
}

const mean = (a: readonly number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const rms = (a: readonly number[]) => Math.sqrt(mean(a.map((x) => x * x)));

/** Inverse d'une petite matrice symétrique définie positive (Gauss-Jordan avec pivot partiel). */
export function invert(m: readonly (readonly number[])[]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (Math.abs(a[p]![c]!) < 1e-12) throw new Error('Matrice singulière');
    [a[c], a[p]] = [a[p]!, a[c]!];
    const piv = a[c]![c]!;
    for (let j = 0; j < 2 * n; j++) a[c]![j]! /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f !== 0) for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[c]![j]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/** Quantile empirique (interpolation linéaire, type 7). */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/* ───────────── Contrôle synthétique ───────────── */

export interface SynthFit {
  /** Poids des donneurs (≥ 0, somme 1), dans l'ordre des colonnes reçues. */
  weights: number[];
  /** Série synthétique sur toute la période. */
  synthetic: number[];
  /** Écart observé − synthétique. */
  gap: number[];
  rmspePre: number;
  rmspePost: number;
}

/**
 * Contrôle synthétique : w = argmin ‖y₁,pré − Y₀,pré·w‖² sous w ≥ 0, Σw = 1.
 * Gradient projeté accéléré (FISTA) sur le simplexe, à partir de la matrice de Gram (petite : J × J).
 * @param treated série de l'unité traitée (longueur T)
 * @param donors séries des donneurs (J séries de longueur T)
 * @param t0 première semaine traitée (les semaines 0..t0−1 servent à l'ajustement)
 */
export function syntheticControl(treated: readonly number[], donors: readonly (readonly number[])[], t0: number, maxIter = 4000): SynthFit {
  const J = donors.length;
  const T = treated.length;
  // Gram G = Y₀'Y₀ et b = Y₀'y₁ sur la période avant traitement.
  const G = Array.from({ length: J }, () => new Array<number>(J).fill(0));
  const b = new Array<number>(J).fill(0);
  for (let i = 0; i < J; i++) {
    const di = donors[i]!;
    for (let t = 0; t < t0; t++) b[i]! += di[t]! * treated[t]!;
    for (let j = i; j < J; j++) {
      const dj = donors[j]!;
      let s = 0;
      for (let t = 0; t < t0; t++) s += di[t]! * dj[t]!;
      G[i]![j] = s;
      G[j]![i] = s;
    }
  }
  // Constante de Lipschitz du gradient 2(Gw − b) : 2·λmax(G), par la méthode de la puissance.
  let v = new Array<number>(J).fill(1 / Math.sqrt(J));
  let lam = 0;
  for (let k = 0; k < 60; k++) {
    const gv = G.map((row) => row.reduce((s, x, j) => s + x * v[j]!, 0));
    const norm = Math.sqrt(gv.reduce((s, x) => s + x * x, 0)) || 1;
    lam = norm;
    v = gv.map((x) => x / norm);
  }
  const step = 1 / (2 * lam || 1);
  let w = new Array<number>(J).fill(1 / J);
  let z = [...w];
  let tk = 1;
  for (let it = 0; it < maxIter; it++) {
    const grad = G.map((row, i) => 2 * (row.reduce((s, x, j) => s + x * z[j]!, 0) - b[i]!));
    const next = projectSimplex(z.map((x, i) => x - step * grad[i]!));
    const tNext = (1 + Math.sqrt(1 + 4 * tk * tk)) / 2;
    let delta = 0;
    z = next.map((x, i) => {
      delta = Math.max(delta, Math.abs(x - w[i]!));
      return x + ((tk - 1) / tNext) * (x - w[i]!);
    });
    w = next;
    tk = tNext;
    if (delta < 1e-12) break;
  }
  const synthetic = Array.from({ length: T }, (_, t) => donors.reduce((s, d, j) => s + w[j]! * d[t]!, 0));
  const gap = treated.map((y, t) => y - synthetic[t]!);
  return { weights: w, synthetic, gap, rmspePre: rms(gap.slice(0, t0)), rmspePost: rms(gap.slice(t0)) };
}

/* ───────────── Estimateurs simples ───────────── */

/** Avant/après naïf : moyenne après − moyenne des `window` semaines précédant le lancement. */
export function naiveBeforeAfter(treated: readonly number[], t0: number, window = treated.length - t0): number {
  const pre = treated.slice(Math.max(0, t0 - window), t0);
  return mean(treated.slice(t0)) - mean(pre);
}

/** Différence de différences : (ȳ₁,après − ȳ₁,avant) − (ȳc,après − ȳc,avant), c = moyenne des contrôles. */
export function diffInDiff(treated: readonly number[], controlMean: readonly number[], t0: number): number {
  return mean(treated.slice(t0)) - mean(treated.slice(0, t0)) - (mean(controlMean.slice(t0)) - mean(controlMean.slice(0, t0)));
}

/** p-valeur de permutation : rang de l'unité traitée (1 = statistique la plus forte) sur N + 1 unités. */
export function permutationPValue(treatedStat: number, placeboStats: readonly number[]): { rank: number; p: number } {
  const rank = 1 + placeboStats.filter((s) => s >= treatedStat).length;
  return { rank, p: rank / (placeboStats.length + 1) };
}

/* ───────────── Régression sur les contrôles (prévision contrefactuelle) ───────────── */

export interface RegressionFit {
  /** Indices (dans les donneurs) des contrôles retenus. */
  used: number[];
  coefs: number[];
  counterfactual: number[];
  lower: number[];
  upper: number[];
  sigma: number;
  /** Effet hebdomadaire moyen après lancement et son intervalle à 95 %. */
  effect: number;
  effectLo: number;
  effectHi: number;
}

/**
 * Régression MCO de la série traitée sur les k contrôles les plus corrélés avant lancement,
 * puis prévision du contrefactuel après lancement, intervalle de prévision ŷ ± 1,96·σ·√(1 + x'(X'X)⁻¹x).
 */
export function regressionCounterfactual(treated: readonly number[], donors: readonly (readonly number[])[], t0: number, k = 4): RegressionFit {
  const pre = treated.slice(0, t0);
  const my = mean(pre);
  const corr = donors.map((d) => {
    const x = d.slice(0, t0);
    const mx = mean(x);
    let sxy = 0, sxx = 0, syy = 0;
    for (let t = 0; t < t0; t++) {
      sxy += (x[t]! - mx) * (pre[t]! - my);
      sxx += (x[t]! - mx) ** 2;
      syy += (pre[t]! - my) ** 2;
    }
    return sxy / Math.sqrt(sxx * syy || 1);
  });
  const used = corr.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c).slice(0, Math.min(k, donors.length)).map((o) => o.i).sort((a, b) => a - b);
  const row = (t: number) => [1, ...used.map((j) => donors[j]![t]!)];
  const p = used.length + 1;
  const XtX = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Xty = new Array<number>(p).fill(0);
  for (let t = 0; t < t0; t++) {
    const r = row(t);
    for (let a = 0; a < p; a++) {
      Xty[a]! += r[a]! * treated[t]!;
      for (let c = 0; c < p; c++) XtX[a]![c]! += r[a]! * r[c]!;
    }
  }
  const inv = invert(XtX);
  const coefs = inv.map((r) => r.reduce((s, x, j) => s + x * Xty[j]!, 0));
  const predict = (r: number[]) => r.reduce((s, x, j) => s + x * coefs[j]!, 0);
  const quad = (r: number[]) => r.reduce((s, x, a) => s + x * inv[a]!.reduce((s2, y, c) => s2 + y * r[c]!, 0), 0);
  const T = treated.length;
  const counterfactual = Array.from({ length: T }, (_, t) => predict(row(t)));
  let sse = 0;
  for (let t = 0; t < t0; t++) sse += (treated[t]! - counterfactual[t]!) ** 2;
  const sigma = Math.sqrt(sse / Math.max(1, t0 - p));
  const lower: number[] = [];
  const upper: number[] = [];
  for (let t = 0; t < T; t++) {
    const half = 1.96 * sigma * Math.sqrt(1 + quad(row(t)));
    lower.push(counterfactual[t]! - half);
    upper.push(counterfactual[t]! + half);
  }
  // Effet moyen : moyenne des écarts après lancement ; variance = σ²/n (bruit) + m'(X'X)⁻¹m·σ² (incertitude des coefficients).
  const nPost = T - t0;
  const effect = mean(treated.slice(t0).map((y, i) => y - counterfactual[t0 + i]!));
  const m = new Array<number>(p).fill(0);
  for (let t = t0; t < T; t++) row(t).forEach((x, a) => (m[a]! += x / nPost));
  const se = sigma * Math.sqrt(1 / nPost + quad(m));
  return { used, coefs, counterfactual, lower, upper, sigma, effect, effectLo: effect - 1.96 * se, effectHi: effect + 1.96 * se };
}

/* ───────────── Simulation ───────────── */

export const N_WEEKS = 104;
export const WEEK0 = Date.UTC(2024, 0, 1); // lundi 1er janvier 2024
export const RAMP_WEEKS = 6;
export const SHOCK_DELAY = 5;
export const SHOCK_LENGTH = 3;
export const SHOCK_SIZE = 0.2;

export const TREATED_CITY = 'Lyon';
export const CONTROL_CITIES = [
  'Marseille', 'Toulouse', 'Nice', 'Nantes', 'Montpellier', 'Strasbourg', 'Bordeaux', 'Lille', 'Rennes', 'Reims',
  'Toulon', 'Saint-Étienne', 'Le Havre', 'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Clermont-Ferrand', 'Tours',
] as const;

export type NoiseLevel = 'faible' | 'moyen' | 'fort';
export const NOISE_SD: Record<NoiseLevel, number> = { faible: 0.015, moyen: 0.035, fort: 0.07 };

export interface ScenarioParams {
  /** Hausse vraie des ventes de la ville traitée une fois la campagne installée (0,12 = +12 %). */
  effect: number;
  noise: NoiseLevel;
  /** Semaine de lancement (index 0..103). */
  t0: number;
}
export const DEFAULT_PARAMS: ScenarioParams = { effect: 0.12, noise: 'moyen', t0: 80 };

export interface Scenario {
  params: ScenarioParams;
  weeks: number[];
  /** Ventes hebdomadaires observées de la ville traitée (k€). */
  treated: number[];
  /** Ventes qu'elle aurait faites sans campagne (vérité, k€). */
  counterfactual: number[];
  /** Effet vrai, semaine par semaine (k€). */
  trueEffect: number[];
  /** Ventes des 19 villes de contrôle (k€). */
  controls: number[][];
  /** Poids des donneurs ayant servi à fabriquer la ville traitée (vérité de la simulation). */
  trueWeights: number[];
  /** Semaines du choc commun (grève), toutes après le lancement. */
  shockWeeks: number[];
}

const DAY = 86_400_000;
export const weekDate = (w: number) => new Date(WEEK0 + w * 7 * DAY);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const weekLabel = (w: number) => {
  const d = weekDate(w);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const monthLabel = (w: number) => {
  const d = weekDate(w);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
};

/** Tirages aléatoires indépendants des réglages : les curseurs ne changent jamais les données de fond. */
interface Draws {
  level: number[];
  growth: number[];
  seasonAmp: number[];
  f3Load: number[];
  f3: number[];
  z: number[][]; // bruit standard des 19 contrôles
  zTreated: number[];
  /** Donneurs vrais de la ville traitée et leurs poids. */
  donors: { idx: number[]; w: number[] };
}
let drawsCache: Draws | null = null;
function draws(): Draws {
  if (drawsCache) return drawsCache;
  const rnd = mulberry32(20251109);
  const gauss = () => {
    const u = Math.max(rnd(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const J = CONTROL_CITIES.length;
  const level = Array.from({ length: J }, () => 60 + rnd() * 110);
  const growth = Array.from({ length: J }, () => rnd() * 0.36);
  const seasonAmp = Array.from({ length: J }, () => 0.6 + rnd() * 0.8);
  const f3Load = Array.from({ length: J }, () => 0.4 + rnd() * 1.2);
  const f3: number[] = [];
  let a = 0;
  for (let t = 0; t < N_WEEKS; t++) {
    a = 0.85 * a + 0.025 * gauss();
    f3.push(a);
  }
  const z = Array.from({ length: J }, () => Array.from({ length: N_WEEKS }, gauss));
  const zTreated = Array.from({ length: N_WEEKS }, gauss);
  const dr: Draws = { level, growth, seasonAmp, f3Load, f3, z, zTreated, donors: { idx: [], w: [] } };
  dr.donors = shapeDonors(dr);
  drawsCache = dr;
  return drawsCache;
}

/** Saisonnalité commune (log) : creux d'été, montée de fin d'année. */
function season(t: number): number {
  const woy = t % 52;
  return 0.32 * Math.exp(-(((woy - 49) / 3.2) ** 2)) - 0.12 * Math.exp(-(((woy - 32) / 3.5) ** 2)) + 0.05 * Math.sin((2 * Math.PI * woy) / 52);
}

/**
 * Les quatre donneurs dont la ville traitée est vraiment faite : les quatre plus grosses villes du vivier.
 * Leur dynamique (croissance, saisonnalité, facteur commun) est ramenée près de la moyenne du vivier :
 * la ville traitée est grosse mais « typique ». Sa grande taille suffit à biaiser la différence de différences
 * (calculée en niveaux), sans rendre le contrôle synthétique fragile.
 */
const TRUE_W = [0.4, 0.3, 0.2, 0.1];
const DYN_OFFSET = [-0.6, 0.4, -0.2, 0.5];
function shapeDonors(d: Draws): { idx: number[]; w: number[] } {
  const idx = d.level.map((l, i) => ({ l, i })).sort((x, y) => y.l - x.l).slice(0, 4).map((o) => o.i);
  const m = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const g = m(d.growth), sa = m(d.seasonAmp), fl = m(d.f3Load);
  idx.forEach((j, k) => {
    d.growth[j] = g + 0.08 * DYN_OFFSET[k]!;
    d.seasonAmp[j] = sa + 0.15 * DYN_OFFSET[k]!;
    d.f3Load[j] = fl + 0.3 * DYN_OFFSET[k]!;
  });
  return { idx, w: TRUE_W };
}

export function simulate(params: ScenarioParams = DEFAULT_PARAMS): Scenario {
  const d = draws();
  const sd = NOISE_SD[params.noise];
  const t0 = Math.max(26, Math.min(N_WEEKS - 8, Math.round(params.t0)));
  const shockWeeks = Array.from({ length: SHOCK_LENGTH }, (_, k) => t0 + SHOCK_DELAY + k).filter((w) => w < N_WEEKS);
  const shock = (t: number) => (shockWeeks.includes(t) ? -SHOCK_SIZE : 0);
  const J = CONTROL_CITIES.length;
  // Composante sans bruit propre (log), commune au contrôle et à ce qui sert à fabriquer la ville traitée.
  const base = (j: number, t: number) =>
    Math.log(d.level[j]!) + d.growth[j]! * (t / (N_WEEKS - 1)) + d.seasonAmp[j]! * season(t) + d.f3Load[j]! * d.f3[t]! + shock(t);
  const controls = Array.from({ length: J }, (_, j) => Array.from({ length: N_WEEKS }, (_, t) => Math.exp(base(j, t) + sd * d.z[j]![t]!)));
  const { idx, w } = d.donors;
  const trueWeights = new Array<number>(J).fill(0);
  idx.forEach((j, k) => (trueWeights[j] = w[k]!));
  const counterfactual = Array.from({ length: N_WEEKS }, (_, t) => idx.reduce((s, j, k) => s + w[k]! * Math.exp(base(j, t)), 0) * Math.exp(sd * d.zTreated[t]!));
  const ramp = (t: number) => (t < t0 ? 0 : Math.min(1, (t - t0 + 1) / RAMP_WEEKS));
  const trueEffect = counterfactual.map((y, t) => y * params.effect * ramp(t));
  const treated = counterfactual.map((y, t) => y + trueEffect[t]!);
  return { params: { ...params, t0 }, weeks: Array.from({ length: N_WEEKS }, (_, t) => t), treated, counterfactual, trueEffect, controls, trueWeights, shockWeeks };
}

/* ───────────── Analyse complète ───────────── */

export interface MethodResult {
  id: 'naif' | 'did' | 'synth' | 'reg';
  label: string;
  /** Effet hebdomadaire moyen estimé après lancement (k€). */
  effect: number;
  lo?: number;
  hi?: number;
}

export interface PlaceboRun {
  city: string;
  gapPct: number[];
  rmspePrePct: number;
  ratio: number;
  /** Exclu du graphique et de la bande : ajustement avant lancement 5 fois moins bon que celui de la ville traitée. */
  poorFit: boolean;
}

export interface Analysis {
  t0: number;
  nPost: number;
  synth: SynthFit;
  reg: RegressionFit;
  controlMean: number[];
  methods: MethodResult[];
  trueAvgEffect: number;
  trueCumEffect: number;
  synthCum: number[];
  trueCum: number[];
  /** Niveau moyen du contrefactuel synthétique après lancement (pour exprimer les effets en %). */
  baseline: number;
  rmspePrePct: number;
  placebos: PlaceboRun[];
  treatedRatio: number;
  rank: number;
  pValue: number;
  /** Bande 5 %–95 % des écarts placebo (convertis à l'échelle de la ville traitée), semaine par semaine. */
  bandLo: number[];
  bandHi: number[];
}

export function analyse(s: Scenario): Analysis {
  const t0 = s.params.t0;
  const T = s.treated.length;
  const nPost = T - t0;
  const synth = syntheticControl(s.treated, s.controls, t0);
  const reg = regressionCounterfactual(s.treated, s.controls, t0);
  const controlMean = Array.from({ length: T }, (_, t) => mean(s.controls.map((c) => c[t]!)));
  const synthEffect = mean(synth.gap.slice(t0));
  const methods: MethodResult[] = [
    { id: 'naif', label: 'Avant / après', effect: naiveBeforeAfter(s.treated, t0) },
    { id: 'did', label: 'Différence de différences', effect: diffInDiff(s.treated, controlMean, t0) },
    { id: 'synth', label: 'Contrôle synthétique', effect: synthEffect },
    { id: 'reg', label: 'Régression sur les contrôles', effect: reg.effect, lo: reg.effectLo, hi: reg.effectHi },
  ];
  const trueAvgEffect = mean(s.trueEffect.slice(t0));
  const trueCumEffect = s.trueEffect.slice(t0).reduce((a, b) => a + b, 0);
  const synthCum: number[] = [];
  const trueCum: number[] = [];
  let c1 = 0, c2 = 0;
  for (let t = t0; t < T; t++) {
    c1 += synth.gap[t]!;
    c2 += s.trueEffect[t]!;
    synthCum.push(c1);
    trueCum.push(c2);
  }
  const baseline = mean(synth.synthetic.slice(t0));
  const rmspePrePct = synth.rmspePre / mean(synth.synthetic.slice(0, t0));

  // Placebos : chaque contrôle joue la ville traitée, les 18 autres servent de donneurs.
  const placebos: PlaceboRun[] = s.controls.map((y, j) => {
    const donors = s.controls.filter((_, k) => k !== j);
    const fit = syntheticControl(y, donors, t0, 1500);
    const gapPct = fit.gap.map((g, t) => g / fit.synthetic[t]!);
    const pre = mean(fit.synthetic.slice(0, t0));
    return { city: CONTROL_CITIES[j]!, gapPct, rmspePrePct: fit.rmspePre / pre, ratio: fit.rmspePost / fit.rmspePre, poorFit: false };
  });
  for (const p of placebos) p.poorFit = p.rmspePrePct > 5 * rmspePrePct;
  const treatedRatio = synth.rmspePost / synth.rmspePre;
  const { rank, p } = permutationPValue(treatedRatio, placebos.map((pl) => pl.ratio));
  const kept = placebos.filter((pl) => !pl.poorFit);
  const bandLo: number[] = [];
  const bandHi: number[] = [];
  for (let t = 0; t < T; t++) {
    const v = kept.map((pl) => pl.gapPct[t]!).sort((a, b) => a - b);
    bandLo.push(quantile(v, 0.05) * synth.synthetic[t]!);
    bandHi.push(quantile(v, 0.95) * synth.synthetic[t]!);
  }
  return { t0, nPost, synth, reg, controlMean, methods, trueAvgEffect, trueCumEffect, synthCum, trueCum, baseline, rmspePrePct, placebos, treatedRatio, rank, pValue: p, bandLo, bandHi };
}
