/**
 * Moindres carrés ordinaires écrits à la main : décomposition QR de Householder, erreurs-types classiques et
 * robustes (White HC0 / HC1), tests et diagnostics. Fonctions pures, testées dans shared/tests/demo-labo-regression.test.ts.
 */
import { chi2Sf, fisherSf, normalQuantile, studentQuantile, studentTwoSidedP } from './stats';

/* ─────────────────────────── Données et spécification ─────────────────────────── */

export type Column =
  | { name: string; kind: 'num'; values: (number | null)[] }
  | { name: string; kind: 'cat'; values: (string | null)[]; levels: string[] };

export interface Dataset {
  columns: Column[];
  n: number;
}

/** Un régresseur choisi : transformation de la variable, terme au carré en plus. */
export interface XChoice {
  col: string;
  fn: 'lin' | 'log';
  sq: boolean;
}

export interface Spec {
  y: string;
  logY: boolean;
  xs: XChoice[];
  /** Interactions entre deux variables numériques (produit des valeurs brutes). */
  inter: [string, string][];
}

export interface Design {
  names: string[];
  /** Lignes de la matrice X (constante en première colonne). */
  X: number[][];
  y: number[];
  yName: string;
  /** Indices des lignes du jeu de données conservées. */
  rows: number[];
  droppedRows: number;
  notes: string[];
}

export const sq = (name: string) => `${name}²`;
export const termLabel = (x: XChoice) => (x.fn === 'log' ? `log(${x.col})` : x.col);

/** Construit la matrice de régression ; écarte les lignes incomplètes ou incompatibles avec un logarithme. */
export function buildDesign(data: Dataset, spec: Spec): Design {
  const byName = new Map(data.columns.map((c) => [c.name, c]));
  const yCol = byName.get(spec.y);
  if (!yCol || yCol.kind !== 'num') throw new Error(`La variable expliquée « ${spec.y} » doit être numérique.`);
  const notes: string[] = [];

  type Getter = (i: number) => number | null;
  const terms: { name: string; get: Getter }[] = [];
  const numGetter = (name: string, fn: 'lin' | 'log'): Getter => {
    const c = byName.get(name);
    if (!c || c.kind !== 'num') return () => null;
    return fn === 'log' ? (i) => { const v = c.values[i]; return v !== null && v !== undefined && v > 0 ? Math.log(v) : null; } : (i) => c.values[i] ?? null;
  };

  for (const x of spec.xs) {
    if (x.col === spec.y) continue;
    const c = byName.get(x.col);
    if (!c) continue;
    if (c.kind === 'cat') {
      // Indicatrices, modalité de référence = la plus fréquente (première de levels).
      for (const lev of c.levels.slice(1)) {
        terms.push({ name: `${c.name}[${lev}]`, get: (i) => (c.values[i] === null || c.values[i] === undefined ? null : c.values[i] === lev ? 1 : 0) });
      }
      continue;
    }
    const g = numGetter(x.col, x.fn);
    const label = termLabel(x);
    terms.push({ name: label, get: g });
    if (x.sq) terms.push({ name: sq(label), get: (i) => { const v = g(i); return v === null ? null : v * v; } });
  }
  for (const [a, b] of spec.inter) {
    const ga = numGetter(a, 'lin');
    const gb = numGetter(b, 'lin');
    terms.push({ name: `${a} × ${b}`, get: (i) => { const u = ga(i); const v = gb(i); return u === null || v === null ? null : u * v; } });
  }

  const gy = numGetter(spec.y, spec.logY ? 'log' : 'lin');
  const X: number[][] = [];
  const y: number[] = [];
  const rows: number[] = [];
  let logDrop = 0;
  for (let i = 0; i < data.n; i++) {
    const yv = gy(i);
    if (yv === null || !Number.isFinite(yv)) {
      if (spec.logY && yCol.values[i] !== null && yCol.values[i]! <= 0) logDrop++;
      continue;
    }
    const row = [1];
    let ok = true;
    for (const t of terms) {
      const v = t.get(i);
      if (v === null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      row.push(v);
    }
    if (!ok) continue;
    X.push(row);
    y.push(yv);
    rows.push(i);
  }
  const dropped = data.n - rows.length;
  if (dropped > 0) notes.push(`${dropped} ligne${dropped > 1 ? 's' : ''} écartée${dropped > 1 ? 's' : ''} (valeur manquante${logDrop || spec.xs.some((x) => x.fn === 'log') ? ' ou non positive sous un logarithme' : ''}).`);
  return { names: ['Constante', ...terms.map((t) => t.name)], X, y, yName: spec.logY ? `log(${spec.y})` : spec.y, rows, droppedRows: dropped, notes };
}

/* ─────────────────────────── MCO par QR (Householder) ─────────────────────────── */

export interface Fit {
  names: string[];
  n: number;
  k: number;
  df: number;
  beta: number[];
  /** (X'X)⁻¹ */
  xtxInv: number[][];
  seClassic: number[];
  seRobust: number[];
  /** Erreurs-types HC0 (sans correction n/(n−k)). */
  seHC0: number[];
  fitted: number[];
  resid: number[];
  leverage: number[];
  ssr: number;
  sst: number;
  r2: number;
  adjR2: number;
  sigma: number;
  F: number;
  Fp: number;
  logLik: number;
  aic: number;
  bic: number;
  /** Termes retirés parce que colinéaires aux autres. */
  aliased: string[];
}

interface QR {
  beta: number[];
  rInv: number[][];
  rank: number;
  bad: number;
}

/** Householder sur une copie de X ; renvoie β, R⁻¹, ou l'indice de la première colonne dépendante des précédentes. */
function qrSolve(X: number[][], y: number[]): QR {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  const A = X.map((r) => r.slice());
  const b = y.slice();
  const colNorm = new Array<number>(k).fill(0);
  for (const r of X) for (let j = 0; j < k; j++) colNorm[j]! += r[j]! * r[j]!;
  for (let j = 0; j < k; j++) colNorm[j] = Math.sqrt(colNorm[j]!);
  const rDiag: number[] = [];
  for (let j = 0; j < k; j++) {
    let norm = 0;
    for (let i = j; i < n; i++) norm += A[i]![j]! * A[i]![j]!;
    norm = Math.sqrt(norm);
    if (norm <= 1e-9 * Math.max(colNorm[j]!, 1e-300)) return { beta: [], rInv: [], rank: j, bad: j };
    const alpha = A[j]![j]! > 0 ? -norm : norm;
    const v: number[] = new Array<number>(n - j);
    for (let i = j; i < n; i++) v[i - j] = A[i]![j]!;
    v[0]! -= alpha;
    let vv = 0;
    for (const x of v) vv += x * x;
    if (vv > 0) {
      for (let c = j; c < k; c++) {
        let s = 0;
        for (let i = j; i < n; i++) s += v[i - j]! * A[i]![c]!;
        const f = (2 * s) / vv;
        for (let i = j; i < n; i++) A[i]![c]! -= f * v[i - j]!;
      }
      let s = 0;
      for (let i = j; i < n; i++) s += v[i - j]! * b[i]!;
      const f = (2 * s) / vv;
      for (let i = j; i < n; i++) b[i]! -= f * v[i - j]!;
    }
    rDiag.push(A[j]![j]!);
  }
  // R β = (Q'y)[0..k)
  const beta = new Array<number>(k).fill(0);
  for (let j = k - 1; j >= 0; j--) {
    let s = b[j]!;
    for (let c = j + 1; c < k; c++) s -= A[j]![c]! * beta[c]!;
    beta[j] = s / A[j]![j]!;
  }
  // R⁻¹ (triangulaire supérieure)
  const rInv: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let j = 0; j < k; j++) {
    rInv[j]![j] = 1 / A[j]![j]!;
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let c = i + 1; c <= j; c++) s += A[i]![c]! * rInv[c]![j]!;
      rInv[i]![j] = -s / A[i]![i]!;
    }
  }
  return { beta, rInv, rank: k, bad: -1 };
}

/** Estimation par les MCO ; les colonnes parfaitement colinéaires sont retirées (comme le « NA » de R) et signalées. */
export function ols(X0: number[][], y: number[], names0: string[]): Fit {
  let X = X0;
  let names = names0;
  const aliased: string[] = [];
  let qr = qrSolve(X, y);
  while (qr.bad >= 0) {
    const j = qr.bad;
    if (j === 0) throw new Error('La constante est colinéaire : aucune observation exploitable.');
    aliased.push(names[j]!);
    X = X.map((r) => r.filter((_, c) => c !== j));
    names = names.filter((_, c) => c !== j);
    qr = qrSolve(X, y);
  }
  const n = X.length;
  const k = names.length;
  const df = n - k;
  if (df <= 0) throw new Error(`Pas assez d’observations : ${n} lignes pour ${k} coefficients.`);
  const beta = qr.beta;
  const xtxInv: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      let s = 0;
      for (let c = Math.max(i, j); c < k; c++) s += qr.rInv[i]![c]! * qr.rInv[j]![c]!;
      return s;
    }),
  );

  const fitted = X.map((r) => r.reduce((s, v, j) => s + v * beta[j]!, 0));
  const resid = y.map((v, i) => v - fitted[i]!);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const ssr = resid.reduce((s, e) => s + e * e, 0);
  const sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const sigma2 = ssr / df;

  // Levier h_ii = x_i' (X'X)⁻¹ x_i et « viande » du sandwich de White Σ e_i² x_i x_i'.
  const leverage: number[] = [];
  const meat: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < n; i++) {
    const x = X[i]!;
    let h = 0;
    for (let a = 0; a < k; a++) {
      let s = 0;
      for (let b = 0; b < k; b++) s += xtxInv[a]![b]! * x[b]!;
      h += x[a]! * s;
    }
    leverage.push(h);
    const e2 = resid[i]! * resid[i]!;
    for (let a = 0; a < k; a++) for (let b = a; b < k; b++) meat[a]![b]! += e2 * x[a]! * x[b]!;
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) meat[a]![b] = meat[b]![a]!;
  const hc0Diag = Array.from({ length: k }, (_, j) => {
    // [(X'X)⁻¹ M (X'X)⁻¹]_jj
    let s = 0;
    for (let a = 0; a < k; a++) {
      let t = 0;
      for (let b = 0; b < k; b++) t += meat[a]![b]! * xtxInv[b]![j]!;
      s += xtxInv[j]![a]! * t;
    }
    return Math.max(0, s);
  });
  const seHC0 = hc0Diag.map(Math.sqrt);
  const seRobust = hc0Diag.map((v) => Math.sqrt((v * n) / df));
  const seClassic = xtxInv.map((r, j) => Math.sqrt(Math.max(0, sigma2 * r[j]!)));

  const r2 = sst > 0 ? 1 - ssr / sst : 0;
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / df;
  const F = k > 1 && ssr > 0 ? ((sst - ssr) / (k - 1)) / sigma2 : NaN;
  const Fp = Number.isFinite(F) ? fisherSf(F, k - 1, df) : NaN;
  const logLik = -0.5 * n * (Math.log(2 * Math.PI) + Math.log(ssr / n) + 1);
  return {
    names,
    n,
    k,
    df,
    beta,
    xtxInv,
    seClassic,
    seRobust,
    seHC0,
    fitted,
    resid,
    leverage,
    ssr,
    sst,
    r2,
    adjR2,
    sigma: Math.sqrt(sigma2),
    F,
    Fp,
    logLik,
    aic: -2 * logLik + 2 * k,
    bic: -2 * logLik + k * Math.log(n),
    aliased,
  };
}

/** Retire de X les colonnes signalées comme colinéaires, pour que les diagnostics travaillent sur la même matrice que le modèle. */
export function alignDesign(design: Design, fit: Fit): number[][] {
  const keep = design.names.map((nm) => !fit.aliased.includes(nm));
  return design.X.map((r) => r.filter((_, j) => keep[j]));
}

export type SeKind = 'classic' | 'robust';

export interface CoefRow {
  name: string;
  beta: number;
  se: number;
  t: number;
  p: number;
  lo: number;
  hi: number;
}

/** Tableau des coefficients pour un type d'erreur-type ; IC au niveau 1 − alpha. */
export function coefTable(fit: Fit, kind: SeKind, alpha = 0.05): CoefRow[] {
  const q = studentQuantile(1 - alpha / 2, fit.df);
  return fit.names.map((name, j) => {
    const se = kind === 'robust' ? fit.seRobust[j]! : fit.seClassic[j]!;
    const b = fit.beta[j]!;
    const t = se > 0 ? b / se : NaN;
    return { name, beta: b, se, t, p: studentTwoSidedP(t, fit.df), lo: b - q * se, hi: b + q * se };
  });
}

/* ─────────────────────────── Diagnostics ─────────────────────────── */

export interface Test {
  stat: number;
  df: number;
  p: number;
}

/** Breusch-Pagan, version studentisée de Koenker : n · R² de la régression de e² sur les régresseurs ; χ²(k − 1). */
export function breuschPagan(X: number[][], resid: number[]): Test {
  const k = X[0]?.length ?? 0;
  if (k < 2) return { stat: NaN, df: 0, p: NaN };
  const e2 = resid.map((e) => e * e);
  const aux = ols(X, e2, X[0]!.map((_, j) => `x${j}`));
  const stat = X.length * aux.r2;
  const df = aux.k - 1;
  return { stat, df, p: chi2Sf(stat, df) };
}

/** Jarque-Bera sur les résidus : n/6 · (S² + (K − 3)²/4) ; χ²(2). */
export function jarqueBera(resid: number[]): Test & { skew: number; kurt: number } {
  const n = resid.length;
  const m = resid.reduce((s, v) => s + v, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const e of resid) {
    const d = e - m;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const skew = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const kurt = m2 > 0 ? m4 / (m2 * m2) : 3;
  const stat = (n / 6) * (skew * skew + ((kurt - 3) ** 2) / 4);
  return { stat, df: 2, p: chi2Sf(stat, 2), skew, kurt };
}

/** Facteur d'inflation de la variance de chaque régresseur (hors constante) : 1 / (1 − R²_j). */
export function vif(X: number[][], names: string[]): { name: string; vif: number; r2: number }[] {
  const k = names.length;
  const out: { name: string; vif: number; r2: number }[] = [];
  for (let j = 1; j < k; j++) {
    if (k <= 2) {
      out.push({ name: names[j]!, vif: 1, r2: 0 });
      continue;
    }
    const others = X.map((r) => r.filter((_, c) => c !== j));
    const target = X.map((r) => r[j]!);
    let r2: number;
    try {
      r2 = ols(others, target, names.filter((_, c) => c !== j)).r2;
    } catch {
      r2 = 1;
    }
    out.push({ name: names[j]!, vif: r2 >= 1 ? Infinity : 1 / (1 - r2), r2 });
  }
  return out;
}

/** Distance de Cook : e_i² / (k s²) · h_ii / (1 − h_ii)². */
export function cooksDistance(fit: Fit): number[] {
  const s2 = fit.sigma * fit.sigma;
  return fit.resid.map((e, i) => {
    const h = fit.leverage[i]!;
    return h >= 1 ? Infinity : ((e * e) / (fit.k * s2)) * (h / ((1 - h) * (1 - h)));
  });
}

/** Points du QQ-plot : quantiles théoriques (Blom) contre résidus standardisés triés. */
export function qqPoints(resid: number[], sigma: number): { theo: number; obs: number }[] {
  const n = resid.length;
  const sorted = resid.map((e) => e / sigma).sort((a, b) => a - b);
  return sorted.map((obs, i) => ({ theo: normalQuantile((i + 1 - 0.375) / (n + 0.25)), obs }));
}

export interface Diagnostics {
  bp: Test;
  jb: Test & { skew: number; kurt: number };
  vif: { name: string; vif: number; r2: number }[];
  cooks: number[];
  cooksThreshold: number;
  influential: number[];
  qq: { theo: number; obs: number }[];
  /** Écart relatif maximal entre erreurs-types robustes et classiques. */
  seGap: { name: string; ratio: number } | null;
}

export function diagnose(X: number[][], fit: Fit): Diagnostics {
  const cooks = cooksDistance(fit);
  const thr = 4 / fit.n;
  const influential = cooks.map((d, i) => [d, i] as const).filter(([d]) => d > thr).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  let seGap: Diagnostics['seGap'] = null;
  for (let j = 1; j < fit.k; j++) {
    const c = fit.seClassic[j]!;
    if (!(c > 0)) continue;
    const ratio = fit.seRobust[j]! / c;
    if (!seGap || Math.abs(Math.log(ratio)) > Math.abs(Math.log(seGap.ratio))) seGap = { name: fit.names[j]!, ratio };
  }
  return {
    bp: breuschPagan(X, fit.resid),
    jb: jarqueBera(fit.resid),
    vif: vif(X, fit.names),
    cooks,
    cooksThreshold: thr,
    influential,
    qq: qqPoints(fit.resid, fit.sigma),
    seGap,
  };
}

/* ─────────────────────────── Mise en forme ─────────────────────────── */

const nf = (d: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Nombre à 4 chiffres significatifs (notation scientifique au-delà de 1e6 ou en deçà de 1e-4). */
export function fmtCoef(v: number): string {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6 || a < 1e-4) return v.toExponential(2).replace('.', ',').replace('e', ' e');
  const d = Math.max(0, Math.min(6, 3 - Math.floor(Math.log10(a))));
  return nf(d).format(v);
}

export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '–';
  if (p < 0.001) return '< 0,001';
  return nf(3).format(p);
}

export const stars = (p: number) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : p < 0.1 ? '·' : '');

export const fmtNum = (v: number, d = 2) => (Number.isFinite(v) ? nf(d).format(v) : '–');
