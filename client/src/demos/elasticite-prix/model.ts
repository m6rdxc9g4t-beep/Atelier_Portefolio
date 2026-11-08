/**
 * Élasticité-prix : simulation, régression log-log par moindres carrés, prix optimal.
 * Fonctions pures, sans dépendance au DOM : tout est calculé dans le navigateur (et testé dans shared/tests).
 */
import { CATALOGUE, mulberry32, type Categorie } from '../sql-lab/data';

/* ───────────────────────── Algèbre linéaire ───────────────────────── */

/** Inverse d'une matrice carrée par élimination de Gauss-Jordan avec pivot partiel ; null si singulière. */
export function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    const pivot = a[p]![c]!;
    if (Math.abs(pivot) < 1e-12) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const row = a[c]!;
    for (let k = 0; k < 2 * n; k++) row[k]! /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f === 0) continue;
      const rr = a[r]!;
      for (let k = 0; k < 2 * n; k++) rr[k] = rr[k]! - f * row[k]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/** Quantile de la loi de Student (développement de Cornish-Fisher autour de la loi normale), df ≥ 3. */
export function tQuantile975(df: number): number {
  const z = 1.959963984540054;
  const z3 = z ** 3, z5 = z ** 5, z7 = z ** 7;
  return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3);
}

export interface OlsFit {
  beta: number[];
  se: number[];
  fitted: number[];
  resid: number[];
  r2: number;
  sigma2: number;
  df: number;
  names: string[];
}

/** Moindres carrés ordinaires : β = (X′X)⁻¹X′y, erreurs-types classiques σ̂²(X′X)⁻¹. */
export function ols(X: number[][], y: number[], names: string[]): OlsFit | null {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n <= k || k === 0) return null;
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i]!;
    for (let a = 0; a < k; a++) {
      xty[a] = xty[a]! + xi[a]! * y[i]!;
      for (let b = a; b < k; b++) xtx[a]![b] = xtx[a]![b]! + xi[a]! * xi[b]!;
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) xtx[a]![b] = xtx[b]![a]!;
  const inv = invert(xtx);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j]!, 0));
  const fitted = X.map((xi) => xi.reduce((s, v, j) => s + v * beta[j]!, 0));
  const resid = y.map((v, i) => v - fitted[i]!);
  const sse = resid.reduce((s, e) => s + e * e, 0);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const df = n - k;
  const sigma2 = sse / df;
  const se = inv.map((row, j) => Math.sqrt(Math.max(0, sigma2 * row[j]!)));
  return { beta, se, fitted, resid, r2: sst > 0 ? 1 - sse / sst : 0, sigma2, df, names };
}

/* ───────────────────────── Observations ───────────────────────── */

export interface Obs {
  /** Jour (UTC) du début de la période. */
  day: number;
  price: number;
  qty: number;
}

const DAY_MS = 86_400_000;
export const monthOf = (day: number) => new Date(day * DAY_MS).getUTCMonth();
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function formatDay(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/* ───────────────────────── Estimation ───────────────────────── */

export type Controls = 'mois' | 'trimestre' | 'aucun';

export interface Estimate {
  b: number;
  se: number;
  lo: number;
  hi: number;
  r2: number;
  n: number;
  df: number;
  fit: OlsFit;
}

export interface Analysis {
  naive: Estimate;
  controlled: Estimate;
  controls: Controls;
  trend: boolean;
  /** Log-volume « de référence » hors effet prix : moyenne, sur la dernière année, de ln Q̂ − b·ln P. */
  baseLog: number;
  /** Facteur de Duan pour repasser du log au niveau : moyenne de exp(résidu). */
  smear: number;
  /** Prix de référence : médiane des prix de la dernière année. */
  refPrice: number;
  priceRange: [number, number];
  /** Corrélation entre ln P et l'effet saisonnier estimé : signe et taille du biais de la régression naïve. */
  corrPriceSeason: number;
  /** Effet saisonnier estimé (en log) de chaque mois de l'année, 0 pour le mois de référence. */
  monthEffect: number[];
}

export class InputError extends Error {}

function estimate(fit: OlsFit, j: number): Estimate {
  const b = fit.beta[j]!;
  const se = fit.se[j]!;
  const t = tQuantile975(fit.df);
  return { b, se, lo: b - t * se, hi: b + t * se, r2: fit.r2, n: fit.resid.length, df: fit.df, fit };
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Choisit les contrôles saisonniers que les données permettent d'estimer. */
export function chooseControls(obs: Obs[]): Controls {
  const months = new Set(obs.map((o) => monthOf(o.day)));
  const spanDays = obs[obs.length - 1]!.day - obs[0]!.day;
  if (months.size === 12 && obs.length >= 40 && spanDays >= 330) return 'mois';
  const quarters = new Set(obs.map((o) => Math.floor(monthOf(o.day) / 3)));
  if (quarters.size === 4 && obs.length >= 20) return 'trimestre';
  return 'aucun';
}

/**
 * Deux régressions log-log :
 * - naïve : ln Q = a + b·ln P ;
 * - contrôlée : ln Q = a + b·ln P + saisonnalité (indicatrices) + tendance linéaire.
 */
export function analyze(input: Obs[], controls: Controls = chooseControls([...input].sort((a, b) => a.day - b.day))): Analysis {
  const obs = input.filter((o) => o.price > 0 && o.qty > 0).sort((a, b) => a.day - b.day);
  if (obs.length < 12) throw new InputError('Il faut au moins 12 périodes avec un prix et une quantité strictement positifs.');
  const lnP = obs.map((o) => Math.log(o.price));
  const lnQ = obs.map((o) => Math.log(o.qty));
  const meanLnP = lnP.reduce((s, v) => s + v, 0) / lnP.length;
  const sdLnP = Math.sqrt(lnP.reduce((s, v) => s + (v - meanLnP) ** 2, 0) / lnP.length);
  if (sdLnP < 0.005) throw new InputError('Le prix ne varie presque pas : sans variation de prix, l’élasticité ne peut pas être estimée.');

  const naiveFit = ols(lnP.map((p) => [1, p]), lnQ, ['constante', 'ln P']);
  if (!naiveFit) throw new InputError('Régression impossible sur ces données.');

  const t0 = obs[0]!.day;
  const trend = obs.length >= 20 && obs[obs.length - 1]!.day - t0 >= 120;
  const seasonOf = (day: number) => (controls === 'mois' ? monthOf(day) : controls === 'trimestre' ? Math.floor(monthOf(day) / 3) : 0);
  const present = [...new Set(obs.map((o) => seasonOf(o.day)))].sort((a, b) => a - b);
  const dummies = controls === 'aucun' ? [] : present.slice(1);
  const names = ['constante', 'ln P', ...dummies.map((s) => (controls === 'mois' ? MONTHS_SHORT[s]! : `T${s + 1}`)), ...(trend ? ['tendance (an)'] : [])];
  const X = obs.map((o, i) => [1, lnP[i]!, ...dummies.map((s) => (seasonOf(o.day) === s ? 1 : 0)), ...(trend ? [(o.day - t0) / 365.25] : [])]);
  const fullFit = ols(X, lnQ, names);
  if (!fullFit) throw new InputError('Régression impossible : trop peu d’observations pour estimer la saisonnalité.');

  const b = fullFit.beta[1]!;
  // Effet saisonnier estimé de chaque observation (indicatrices seulement), pour mesurer la confusion prix / saison.
  const seasonEffect = obs.map((o) => {
    const k = dummies.indexOf(seasonOf(o.day));
    return k >= 0 ? fullFit.beta[2 + k]! : 0;
  });
  const corrPriceSeason = corr(lnP, seasonEffect);
  const monthEffect = Array.from({ length: 12 }, (_, m) => {
    const k = dummies.indexOf(controls === 'trimestre' ? Math.floor(m / 3) : controls === 'mois' ? m : 0);
    return k >= 0 ? fullFit.beta[2 + k]! : 0;
  });

  const lastYearFrom = obs[obs.length - 1]!.day - 364;
  const recent = obs.map((o, i) => ({ o, i })).filter(({ o }) => o.day >= lastYearFrom);
  const baseLog = recent.reduce((s, { i }) => s + fullFit.fitted[i]! - b * lnP[i]!, 0) / recent.length;
  const smear = fullFit.resid.reduce((s, e) => s + Math.exp(e), 0) / fullFit.resid.length;
  const prices = obs.map((o) => o.price);

  return {
    naive: estimate(naiveFit, 1),
    controlled: estimate(fullFit, 1),
    controls,
    trend,
    baseLog,
    smear,
    refPrice: median(recent.map(({ o }) => o.price)),
    priceRange: [Math.min(...prices), Math.max(...prices)],
    corrPriceSeason,
    monthEffect,
  };
}

export function corr(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/* ───────────────────────── Simulateur ───────────────────────── */

/** Volume attendu par période au prix p, pour une élasticité b (courbe pivotée au prix de référence). */
export function demandAt(a: Analysis, p: number, b = a.controlled.b): number {
  const qRef = Math.exp(a.baseLog + a.controlled.b * Math.log(a.refPrice)) * a.smear;
  return qRef * Math.pow(p / a.refPrice, b);
}

export interface Outcome {
  price: number;
  qty: number;
  revenue: number;
  margin: number;
  /** Bornes issues de l'intervalle de confiance de l'élasticité. */
  marginLo: number;
  marginHi: number;
  qtyLo: number;
  qtyHi: number;
}

export function outcome(a: Analysis, price: number, cost: number): Outcome {
  const qty = demandAt(a, price);
  const q1 = demandAt(a, price, a.controlled.lo);
  const q2 = demandAt(a, price, a.controlled.hi);
  const qtyLo = Math.min(q1, q2), qtyHi = Math.max(q1, q2);
  const unit = price - cost;
  const m1 = unit * qtyLo, m2 = unit * qtyHi;
  return { price, qty, revenue: price * qty, margin: unit * qty, marginLo: Math.min(m1, m2), marginHi: Math.max(m1, m2), qtyLo, qtyHi };
}

/** Prix qui maximise la marge (p − c)·Q(p) avec Q = A·p^ε : p* = c·ε / (1 + ε), défini seulement si ε < −1 (formule de Lerner). */
export function optimalPrice(cost: number, elasticity: number): number | null {
  if (!(elasticity < -1) || cost <= 0) return null;
  return (cost * elasticity) / (1 + elasticity);
}

/** Bornes raisonnables du curseur : on ne simule pas loin des prix observés. */
export function sliderRange(a: Analysis): [number, number] {
  const [lo, hi] = a.priceRange;
  return [Math.max(0.01, Math.min(lo, a.refPrice * 0.6) * 0.95), Math.max(hi, a.refPrice * 1.5) * 1.05];
}

/* ───────────────────────── Données simulées ───────────────────────── */

export interface Scenario {
  categorie: Categorie;
  /** Élasticité vraie utilisée par la simulation. */
  trueElasticity: number;
  /** Prix de référence (moyenne des articles de la catégorie) et coût unitaire moyen. */
  basePrice: number;
  unitCost: number;
  baseVolume: number;
  /** Poids saisonnier de chaque mois. */
  season: number[];
  hint: string;
}

const SEASON_RETAIL = [0.8, 0.7, 0.85, 0.95, 1.0, 0.9, 0.75, 0.7, 0.95, 1.05, 1.45, 1.75];

const SCENARIO_SPECS: Record<Categorie, { e: number; vol: number; season: number[]; hint: string }> = {
  Luminaires: { e: -1.6, vol: 40, season: SEASON_RETAIL, hint: 'Pic de fin d’année, promotions concentrées en novembre et décembre.' },
  Textile: { e: -2.2, vol: 70, season: SEASON_RETAIL, hint: 'Très sensible au prix : les soldes déplacent beaucoup de volume.' },
  Cuisine: { e: -1.3, vol: 60, season: SEASON_RETAIL, hint: 'Sensibilité modérée, forte saison des cadeaux.' },
  Mobilier: { e: -2.8, vol: 18, season: [0.9, 0.8, 1.0, 1.05, 1.0, 0.9, 0.8, 0.85, 1.2, 1.15, 1.35, 1.0], hint: 'Gros paniers, achats réfléchis : la plus élastique.' },
  Papeterie: { e: -0.6, vol: 55, season: [0.9, 0.8, 0.85, 0.85, 0.9, 0.85, 0.8, 1.2, 1.6, 1.0, 1.1, 1.5], hint: 'Peu sensible au prix (inélastique), pics de rentrée et de fin d’année.' },
  Jardin: { e: -1.9, vol: 35, season: [0.5, 0.6, 1.0, 1.5, 1.7, 1.4, 1.0, 0.8, 0.8, 0.7, 0.6, 0.9], hint: 'Saison de printemps, promotions au moment où la demande est la plus forte.' },
};

export const SCENARIOS: Scenario[] = CATALOGUE.map((c) => {
  const spec = SCENARIO_SPECS[c.categorie];
  const basePrice = c.articles.reduce((s, [, p]) => s + p, 0) / c.articles.length;
  return {
    categorie: c.categorie,
    trueElasticity: spec.e,
    basePrice: Math.round(basePrice * 100) / 100,
    unitCost: Math.round(basePrice * (1 - c.marge) * 100) / 100,
    baseVolume: spec.vol,
    season: spec.season,
    hint: spec.hint,
  };
});

export const SIM_START_DAY = Math.floor(Date.UTC(2024, 0, 1) / DAY_MS); // lundi 1er janvier 2024
export const SIM_WEEKS = 104;

/**
 * 104 semaines simulées : ln Q = ln A + ε·ln(P/P₀) + ln S(mois) + 0,15·t + bruit.
 * Les promotions (−10 à −30 %) sont bien plus fréquentes en haute saison, et les prix augmentent de 6 % la deuxième année :
 * le prix est donc corrélé à la saison, ce qui biaise la régression naïve.
 */
export function simulate(s: Scenario, seed = 4242): Obs[] {
  const idx = SCENARIOS.findIndex((x) => x.categorie === s.categorie);
  const rnd = mulberry32(seed + idx * 7919);
  const gauss = () => {
    const u = Math.max(rnd(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const out: Obs[] = [];
  for (let w = 0; w < SIM_WEEKS; w++) {
    const day = SIM_START_DAY + 7 * w;
    const m = monthOf(day);
    const sw = s.season[m]!;
    const high = sw >= 1.35;
    const promo = rnd() < (high ? 0.55 : 0.08);
    const depth = promo ? 0.1 + rnd() * 0.2 : 0;
    const hike = w >= 52 ? 1.06 : 1;
    const price = Math.round(s.basePrice * hike * (1 - depth) * (1 + (rnd() - 0.5) * 0.03) * 100) / 100;
    const t = w / 52;
    const lnQ = Math.log(s.baseVolume) + s.trueElasticity * Math.log(price / s.basePrice) + Math.log(sw) + 0.15 * t + 0.12 * gauss();
    out.push({ day, price, qty: Math.max(1, Math.round(Math.exp(lnQ))) });
  }
  return out;
}

/** CSV d'un scénario simulé (pour le télécharger et le recharger ailleurs). */
export function toCsv(obs: Obs[]): string {
  const iso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
  return ['date;prix;quantite', ...obs.map((o) => `${iso(o.day)};${o.price.toFixed(2).replace('.', ',')};${o.qty}`)].join('\r\n');
}

/* ───────────────────────── Lecture d'un CSV ───────────────────────── */

function parseNum(raw: string): number | null {
  let s = raw.trim().replace(/[\s  €]/g, '');
  if (!s) return null;
  if (/,\d{1,3}$/.test(s) && !/\.\d{1,3},/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function parseDay(raw: string): number | null {
  const s = raw.trim();
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (r) return validDay(+r[1]!, +r[2]!, +r[3]!);
  r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (r) return validDay(+r[3]!, +r[2]!, +r[1]!);
  r = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (r) return validDay(+r[1]!, +r[2]!, 1);
  r = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (r) return validDay(+r[2]!, +r[1]!, 1);
  return null;
}
function validDay(y: number, m: number, d: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCMonth() === m - 1 ? Math.floor(t / DAY_MS) : null;
}

/** Lit des lignes CSV (déjà découpées) : repère les colonnes date, prix et quantité par leur en-tête, sinon par leur contenu. */
export function readRows(rows: string[][]): { obs: Obs[]; skipped: number; columns: { date: string; price: string; qty: string } } {
  if (rows.length < 2) throw new InputError('Le fichier ne contient pas assez de lignes.');
  const header = rows[0]!.map((h) => h.trim());
  const norm = (h: string) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const find = (re: RegExp) => header.findIndex((h) => re.test(norm(h)));
  let di = find(/date|semaine|jour|mois|period|week|day/);
  let pi = find(/prix|price|tarif|pu\b/);
  let qi = find(/quantit|qte|qty|volume|unites|units|ventes|sales/);
  let body = rows.slice(1);
  if (di < 0 || pi < 0 || qi < 0) {
    // Pas d'en-tête reconnu : date en première colonne, puis les deux premières colonnes numériques.
    const first = rows[0]!;
    const hasHeader = parseDay(first[0] ?? '') === null;
    body = hasHeader ? rows.slice(1) : rows;
    const sample = body.slice(0, 20);
    di = 0;
    const numeric = header.map((_, j) => j).filter((j) => j !== di && sample.every((r) => parseNum(r[j] ?? '') !== null));
    if (numeric.length < 2) throw new InputError('Colonnes introuvables : il faut une date, un prix et une quantité (en-têtes « date ; prix ; quantite »).');
    pi = numeric[0]!;
    qi = numeric[1]!;
  }
  const obs: Obs[] = [];
  let skipped = 0;
  for (const r of body) {
    const day = parseDay(r[di] ?? '');
    const price = parseNum(r[pi] ?? '');
    const qty = parseNum(r[qi] ?? '');
    if (day === null || price === null || qty === null || price <= 0 || qty <= 0) skipped++;
    else obs.push({ day, price, qty });
  }
  if (obs.length < 12) throw new InputError(`Seulement ${obs.length} lignes exploitables (date valide, prix et quantité positifs) : il en faut au moins 12.`);
  return { obs: obs.sort((a, b) => a.day - b.day), skipped, columns: { date: header[di] ?? 'colonne 1', price: header[pi] ?? 'prix', qty: header[qi] ?? 'quantité' } };
}
