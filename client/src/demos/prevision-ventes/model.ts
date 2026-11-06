/**
 * Modèles de prévision de la démo « Prévision de ventes » : fonctions pures, sans dépendance.
 *
 * - Références : naïf saisonnier (ou naïf simple sans saisonnalité).
 * - Lissage exponentiel de Holt-Winters additif et multiplicatif (forme de Hyndman & Athanasopoulos,
 *   identique à statsmodels), paramètres estimés par Nelder-Mead sur l'erreur à un pas.
 * - Régression tendance linéaire + indicatrices saisonnières (moindres carrés ordinaires).
 * - Validation hors échantillon à origine glissante, intervalles par bootstrap des résidus (graine fixe).
 * - Décomposition classique (moyenne mobile centrée) pour la lecture tendance / saisonnalité.
 */

/* ───────────── Outils numériques ───────────── */

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
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

/** Tirage gaussien centré réduit (Box-Muller) à partir d'un générateur uniforme. */
export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mu = mean(xs);
  return xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1);
}

/** Quantile empirique, interpolation linéaire (type 7 de R, défaut de numpy). `sorted` doit être trié. */
export function quantileSorted(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Minimisation sans dérivées de Nelder-Mead (réflexion 1, expansion 2, contraction 0,5, réduction 0,5). */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  opts: { step?: number; maxIter?: number; tol?: number } = {},
): { x: number[]; fx: number; iterations: number } {
  const n = x0.length;
  const step = opts.step ?? 0.5;
  const maxIter = opts.maxIter ?? 200 * n;
  const tol = opts.tol ?? 1e-10;
  let simplex: { x: number[]; fx: number }[] = [{ x: [...x0], fx: f(x0) }];
  for (let i = 0; i < n; i++) {
    const x = [...x0];
    x[i] += step;
    simplex.push({ x, fx: f(x) });
  }
  let it = 0;
  for (; it < maxIter; it++) {
    simplex.sort((a, b) => a.fx - b.fx);
    const best = simplex[0];
    const worst = simplex[n];
    if (Math.abs(worst.fx - best.fx) <= tol * (Math.abs(best.fx) + tol)) break;
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n;
    const along = (t: number) => centroid.map((c, j) => c + t * (worst.x[j] - c));
    const xr = along(-1);
    const fr = f(xr);
    if (fr < best.fx) {
      const xe = along(-2);
      const fe = f(xe);
      simplex[n] = fe < fr ? { x: xe, fx: fe } : { x: xr, fx: fr };
    } else if (fr < simplex[n - 1].fx) {
      simplex[n] = { x: xr, fx: fr };
    } else {
      const outside = fr < worst.fx;
      const xc = along(outside ? -0.5 : 0.5);
      const fc = f(xc);
      if (fc < (outside ? fr : worst.fx)) {
        simplex[n] = { x: xc, fx: fc };
      } else {
        simplex = simplex.map((p, i) => {
          if (i === 0) return p;
          const x = p.x.map((v, j) => best.x[j] + 0.5 * (v - best.x[j]));
          return { x, fx: f(x) };
        });
      }
    }
  }
  simplex.sort((a, b) => a.fx - b.fx);
  return { x: simplex[0].x, fx: simplex[0].fx, iterations: it };
}

/** Résout le système symétrique défini positif A x = b (Cholesky). Renvoie null si A n'est pas inversible. */
export function solveSPD(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const L = A.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-10 * Math.max(1, Math.abs(A[i][i]))) return null;
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  const z = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * z[k];
    z[i] = s / L[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

/** Moindres carrés ordinaires : coefficients de y sur les colonnes de X (équations normales). */
export function ols(X: number[][], y: number[]): number[] | null {
  const p = X[0]?.length ?? 0;
  const XtX = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Xty = new Array<number>(p).fill(0);
  for (let r = 0; r < X.length; r++) {
    const row = X[r];
    for (let i = 0; i < p; i++) {
      if (row[i] === 0) continue;
      Xty[i] += row[i] * y[r];
      for (let j = 0; j <= i; j++) XtX[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) XtX[j][i] = XtX[i][j];
  return solveSPD(XtX, Xty);
}

/* ───────────── Métriques d'erreur ───────────── */

export interface Metrics {
  mae: number;
  rmse: number;
  /** En %, NaN si une valeur observée est nulle ou négative. */
  mape: number;
  /** sMAPE en % (0 à 200). */
  smape: number;
  n: number;
}

/** MAE, RMSE, MAPE et sMAPE (définition 2|e| / (|y| + |ŷ|)). */
export function metrics(actual: readonly number[], forecast: readonly number[]): Metrics {
  const n = Math.min(actual.length, forecast.length);
  let ae = 0;
  let se = 0;
  let ape = 0;
  let sape = 0;
  let mapeOk = true;
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const e = a - forecast[i];
    ae += Math.abs(e);
    se += e * e;
    if (a <= 0) mapeOk = false;
    else ape += Math.abs(e) / a;
    const d = Math.abs(a) + Math.abs(forecast[i]);
    sape += d === 0 ? 0 : (2 * Math.abs(e)) / d;
  }
  return {
    mae: ae / n,
    rmse: Math.sqrt(se / n),
    mape: mapeOk ? (100 * ape) / n : NaN,
    smape: (100 * sape) / n,
    n,
  };
}

/* ───────────── Holt-Winters ───────────── */

export type SeasonKind = 'add' | 'mul' | 'none';

export interface HWParams {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface HWState {
  level: number;
  trend: number;
  /** Composante saisonnière par position t mod m (vide sans saisonnalité). */
  season: number[];
}

/** Un pas de la récursion : prévision à un pas de y_t puis mise à jour de l'état avec l'observation. */
export function hwStep(state: HWState, y: number, t: number, p: HWParams, kind: SeasonKind): { yhat: number; next: HWState } {
  const { level: l, trend: b } = state;
  const m = state.season.length;
  const j = m ? t % m : 0;
  const s = m ? state.season[j] : kind === 'mul' ? 1 : 0;
  let yhat: number;
  let ln: number;
  let sn = s;
  if (kind === 'mul') {
    yhat = (l + b) * s;
    ln = p.alpha * (y / s) + (1 - p.alpha) * (l + b);
    sn = p.gamma * (y / (l + b)) + (1 - p.gamma) * s;
  } else {
    yhat = l + b + s;
    ln = p.alpha * (y - s) + (1 - p.alpha) * (l + b);
    if (kind === 'add') sn = p.gamma * (y - l - b) + (1 - p.gamma) * s;
  }
  const bn = p.beta * (ln - l) + (1 - p.beta) * b;
  let season = state.season;
  if (m) {
    season = state.season.slice();
    season[j] = sn;
  }
  return { yhat, next: { level: ln, trend: bn, season } };
}

/** Filtre la série à partir d'un état initial (t commence à t0) : valeurs ajustées à un pas et état final. */
export function hwFilter(y: readonly number[], p: HWParams, kind: SeasonKind, init: HWState, t0 = 0): { fitted: number[]; state: HWState } {
  let state = init;
  const fitted: number[] = [];
  for (let i = 0; i < y.length; i++) {
    const r = hwStep(state, y[i], t0 + i, p, kind);
    fitted.push(r.yhat);
    state = r.next;
  }
  return { fitted, state };
}

/** Prévision ponctuelle à h pas depuis l'état final ; `tNext` = indice de la première période prévue. */
export function hwForecast(state: HWState, kind: SeasonKind, h: number, tNext: number): number[] {
  const m = state.season.length;
  const out: number[] = [];
  for (let k = 1; k <= h; k++) {
    const base = state.level + k * state.trend;
    if (!m || kind === 'none') out.push(base);
    else {
      const s = state.season[(tNext + k - 1) % m];
      out.push(kind === 'mul' ? base * s : base + s);
    }
  }
  return out;
}

/**
 * État initial estimé sur les données (classique) : pente = écart des moyennes des deux premiers cycles / m,
 * saisonnalité = écart (ou rapport) du premier cycle à la droite de tendance, normalisée.
 * Renvoie l'état à la fin du premier cycle : le filtre reprend à t = m. Sans saisonnalité : droite des
 * moindres carrés sur les k premiers points, filtre repris à t = k.
 */
export function hwInitialState(y: readonly number[], m: number, kind: SeasonKind): { state: HWState; start: number } {
  if (kind === 'none' || m < 2) {
    const k = Math.min(y.length, Math.max(3, Math.min(8, Math.floor(y.length / 3))));
    const xs = Array.from({ length: k }, (_, i) => i);
    const xm = mean(xs);
    const ym = mean(y.slice(0, k));
    let num = 0;
    let den = 0;
    for (let i = 0; i < k; i++) {
      num += (xs[i] - xm) * (y[i] - ym);
      den += (xs[i] - xm) ** 2;
    }
    const slope = den ? num / den : 0;
    return { state: { level: ym + slope * (k - 1 - xm), trend: slope, season: [] }, start: k };
  }
  const m1 = mean(y.slice(0, m));
  const m2 = mean(y.slice(m, 2 * m));
  const b0 = (m2 - m1) / m;
  const mid = (m - 1) / 2;
  let season = Array.from({ length: m }, (_, j) => {
    const line = m1 + b0 * (j - mid);
    return kind === 'mul' ? y[j] / line : y[j] - line;
  });
  const sm = mean(season);
  season = season.map((s) => (kind === 'mul' ? s / sm : s - sm));
  return { state: { level: m1 + b0 * mid, trend: b0, season }, start: m };
}

const LO = 1e-4;
const HI = 0.9999;
const toUnit = (x: number) => LO + (HI - LO) / (1 + Math.exp(-x));
const fromUnit = (p: number) => -Math.log((HI - LO) / (p - LO) - 1);

/** Somme des carrés des erreurs à un pas (après la période d'initialisation). */
export function hwSSE(y: readonly number[], m: number, kind: SeasonKind, p: HWParams): number {
  const { state, start } = hwInitialState(y, m, kind);
  let st = state;
  let sse = 0;
  for (let t = start; t < y.length; t++) {
    if (kind === 'mul' && !(st.level + st.trend > 0)) return Number.POSITIVE_INFINITY;
    const r = hwStep(st, y[t], t, p, kind);
    const e = y[t] - r.yhat;
    if (!Number.isFinite(e)) return Number.POSITIVE_INFINITY;
    sse += e * e;
    st = r.next;
  }
  return sse;
}

/** Estime α, β, γ par Nelder-Mead (paramètres bornés dans ]0, 1[ par transformation logistique, 3 départs). */
export function fitHoltWinters(y: readonly number[], m: number, kind: SeasonKind): HWParams {
  const seasonal = kind !== 'none' && m >= 2;
  const unpack = (x: number[]): HWParams => ({ alpha: toUnit(x[0]), beta: toUnit(x[1]), gamma: seasonal ? toUnit(x[2]) : 0 });
  const obj = (x: number[]) => hwSSE(y, m, kind, unpack(x));
  const starts: number[][] = [
    [0.3, 0.05, 0.1],
    [0.7, 0.1, 0.3],
    [0.1, 0.01, 0.05],
  ].map((s) => (seasonal ? s : s.slice(0, 2)).map(fromUnit));
  let best: { x: number[]; fx: number } | null = null;
  for (const x0 of starts) {
    const r = nelderMead(obj, x0, { step: 1, maxIter: 300 * x0.length });
    if (!best || r.fx < best.fx) best = r;
  }
  return unpack(best!.x);
}

/* ───────────── Modèles ajustés (interface commune) ───────────── */

export type ModelId = 'snaive' | 'hw-add' | 'hw-mul' | 'reg';

export interface FittedModel {
  id: ModelId;
  /** Valeurs ajustées à un pas (NaN pendant l'initialisation). */
  fitted: number[];
  /** Erreurs utilisées pour le bootstrap : absolues (additif) ou relatives (multiplicatif). */
  residuals: number[];
  relativeErrors: boolean;
  forecast: (h: number) => number[];
  /** Trajectoires simulées (h colonnes) en réinjectant des résidus tirés avec remise. */
  simulate: (h: number, paths: number, rand: () => number) => number[][];
  params: { label: string; value: number }[];
}

const centered = (r: number[]) => {
  const mu = mean(r);
  return r.map((v) => v - mu);
};

function draw(pool: readonly number[], rand: () => number): number {
  return pool[Math.floor(rand() * pool.length)] ?? 0;
}

/** Naïf saisonnier : ŷ_{t} = y_{t−m} (naïf simple si m = 1). */
export function fitSeasonalNaive(y: readonly number[], m: number): FittedModel {
  const lag = Math.max(1, m);
  const fitted = y.map((_, t) => (t >= lag ? y[t - lag] : NaN));
  const residuals = centered(y.slice(lag).map((v, i) => v - y[i]));
  const run = (h: number, noise: () => number) => {
    const buf = y.slice(-lag);
    const out: number[] = [];
    for (let k = 0; k < h; k++) {
      const v = buf[buf.length - lag] + noise();
      buf.push(v);
      out.push(v);
    }
    return out;
  };
  return {
    id: 'snaive',
    fitted,
    residuals,
    relativeErrors: false,
    forecast: (h) => run(h, () => 0),
    simulate: (h, paths, rand) => Array.from({ length: paths }, () => run(h, () => draw(residuals, rand))),
    params: [{ label: 'Décalage', value: lag }],
  };
}

/** Holt-Winters (additif, multiplicatif, ou Holt sans saisonnalité) ajusté sur y. */
export function fitHW(y: readonly number[], m: number, kind: SeasonKind, params?: HWParams): FittedModel {
  const seasonal = kind !== 'none' && m >= 2;
  const k: SeasonKind = seasonal ? kind : 'none';
  const p = params ?? fitHoltWinters(y, m, k);
  const { state: init, start } = hwInitialState(y, seasonal ? m : 1, k);
  const { fitted: f, state } = hwFilter(y.slice(start), p, k, init, start);
  const fitted = [...new Array<number>(start).fill(NaN), ...f];
  const rel = k === 'mul';
  const residuals = centered(y.slice(start).map((v, i) => (rel ? (v - f[i]) / f[i] : v - f[i])));
  const n = y.length;
  const run = (h: number, noise: () => number) => {
    let st = state;
    const out: number[] = [];
    for (let i = 0; i < h; i++) {
      const t = n + i;
      const yhat = hwStep(st, 0, t, p, k).yhat;
      const e = noise();
      const v = rel ? yhat * (1 + e) : yhat + e;
      st = hwStep(st, v, t, p, k).next;
      out.push(v);
    }
    return out;
  };
  const prm = [
    { label: 'α (niveau)', value: p.alpha },
    // β affiché dans la convention ETS / statsmodels : β* = α·β (vitesse de correction de la pente par l'erreur).
    { label: 'β (tendance)', value: p.alpha * p.beta },
  ];
  if (seasonal) prm.push({ label: 'γ (saison)', value: p.gamma });
  return {
    id: kind === 'mul' ? 'hw-mul' : 'hw-add',
    fitted,
    residuals,
    relativeErrors: rel,
    forecast: (h) => hwForecast(state, k, h, n),
    simulate: (h, paths, rand) => Array.from({ length: paths }, () => run(h, () => draw(residuals, rand))),
    params: prm,
  };
}

/** Ligne de la matrice de régression : constante, tendance t, indicatrices des positions 1..m−1. */
function regRow(t: number, m: number): number[] {
  const row = [1, t];
  for (let j = 1; j < m; j++) row.push(t % m === j ? 1 : 0);
  return row;
}

/** Régression tendance linéaire + indicatrices saisonnières (MCO). */
export function fitRegression(y: readonly number[], m: number): FittedModel {
  const mm = Math.max(1, m);
  const X = y.map((_, t) => regRow(t, mm));
  const beta = ols(X, [...y]) ?? [mean(y), 0, ...new Array<number>(mm - 1).fill(0)];
  const predict = (t: number) => regRow(t, mm).reduce((s, x, i) => s + x * beta[i], 0);
  const fitted = y.map((_, t) => predict(t));
  const n = y.length;
  const pDim = beta.length;
  const scale = n > pDim ? Math.sqrt(n / (n - pDim)) : 1;
  const residuals = centered(y.map((v, t) => (v - fitted[t]) * scale));
  return {
    id: 'reg',
    fitted,
    residuals,
    relativeErrors: false,
    forecast: (h) => Array.from({ length: h }, (_, k) => predict(n + k)),
    simulate: (h, paths, rand) =>
      Array.from({ length: paths }, () => Array.from({ length: h }, (_, k) => predict(n + k) + draw(residuals, rand))),
    params: [{ label: 'Pente / période', value: beta[1] }],
  };
}

export interface ModelSpec {
  id: ModelId;
  name: string;
  short: string;
  fit: (y: readonly number[], m: number) => FittedModel;
}

/** Catalogue des modèles comparés ; le multiplicatif n'est proposé que pour une série strictement positive. */
export function modelSpecs(positive: boolean, seasonal: boolean): ModelSpec[] {
  const specs: ModelSpec[] = [
    { id: 'snaive', name: seasonal ? 'Naïf saisonnier' : 'Naïf', short: 'Référence', fit: fitSeasonalNaive },
    {
      id: 'hw-add',
      name: seasonal ? 'Holt-Winters additif' : 'Lissage de Holt',
      short: 'Lissage exponentiel',
      fit: (y, m) => fitHW(y, m, seasonal ? 'add' : 'none'),
    },
  ];
  if (positive && seasonal) specs.push({ id: 'hw-mul', name: 'Holt-Winters multiplicatif', short: 'Lissage exponentiel', fit: (y, m) => fitHW(y, m, 'mul') });
  specs.push({
    id: 'reg',
    name: seasonal ? 'Régression tendance + saison' : 'Régression sur la tendance',
    short: 'Moindres carrés',
    fit: fitRegression,
  });
  return specs;
}

/* ───────────── Intervalles de prédiction ───────────── */

export interface Band {
  mean: number[];
  lo80: number[];
  hi80: number[];
  lo95: number[];
  hi95: number[];
}

/** Quantiles 2,5 / 10 / 90 / 97,5 % des trajectoires bootstrap, horizon par horizon. */
export function bandFromPaths(point: number[], paths: number[][]): Band {
  const h = point.length;
  const band: Band = { mean: point, lo80: [], hi80: [], lo95: [], hi95: [] };
  for (let k = 0; k < h; k++) {
    const col = paths.map((p) => p[k]).sort((a, b) => a - b);
    band.lo95.push(quantileSorted(col, 0.025));
    band.lo80.push(quantileSorted(col, 0.1));
    band.hi80.push(quantileSorted(col, 0.9));
    band.hi95.push(quantileSorted(col, 0.975));
  }
  return band;
}

/* ───────────── Validation hors échantillon ───────────── */

export interface BacktestPlan {
  origins: number[];
  horizon: number;
}

/**
 * Origines de la validation glissante : jusqu'à 3 origines espacées de ⌈H/2⌉, chacune avec au moins
 * `minTrain` observations pour l'estimation. Renvoie null si même une origine est impossible.
 */
export function backtestPlan(n: number, horizon: number, minTrain: number, maxOrigins = 3): BacktestPlan | null {
  const H = Math.min(horizon, n - minTrain);
  if (H < 1) return null;
  const step = Math.max(1, Math.ceil(H / 2));
  const origins: number[] = [];
  for (let k = maxOrigins - 1; k >= 0; k--) {
    const o = n - H - k * step;
    if (o >= minTrain) origins.push(o);
  }
  return origins.length ? { origins, horizon: H } : null;
}

export interface BacktestResult {
  metrics: Metrics;
  /** Part des observations de validation tombées dans l'intervalle à 80 %. */
  coverage80: number;
  /** Prévision depuis la dernière origine (pour la superposer au graphique). */
  last: { origin: number; forecast: number[] };
}

export function backtest(y: readonly number[], m: number, spec: ModelSpec, plan: BacktestPlan, seed = 7, paths = 300): BacktestResult {
  const actual: number[] = [];
  const pred: number[] = [];
  let inside = 0;
  let last = { origin: 0, forecast: [] as number[] };
  plan.origins.forEach((o, i) => {
    const train = y.slice(0, o);
    const test = y.slice(o, o + plan.horizon);
    const model = spec.fit(train, m);
    const fc = model.forecast(test.length);
    const band = bandFromPaths(fc, model.simulate(test.length, paths, mulberry32(seed + i)));
    test.forEach((v, k) => {
      actual.push(v);
      pred.push(fc[k]);
      if (v >= band.lo80[k] && v <= band.hi80[k]) inside++;
    });
    last = { origin: o, forecast: fc };
  });
  return { metrics: metrics(actual, pred), coverage80: actual.length ? inside / actual.length : NaN, last };
}

/* ───────────── Décomposition classique ───────────── */

export interface Decomposition {
  kind: 'add' | 'mul';
  /** Tendance (moyenne mobile centrée), NaN aux bords. */
  trend: number[];
  /** Indice saisonnier par position (somme nulle en additif, moyenne 1 en multiplicatif). */
  figure: number[];
  seasonal: number[];
  remainder: number[];
  /** Parts de variance (tendance, saisonnalité, irrégulier), additif : somme = 1. */
  shares: { trend: number; seasonal: number; remainder: number };
  /** Force saisonnière F_S = max(0, 1 − Var(R) / Var(S + R)). */
  seasonalStrength: number;
  trendStrength: number;
}

/** Moyenne mobile centrée d'ordre m (2×m si m est pair), comme `decompose` de R / statsmodels. */
export function centeredMA(y: readonly number[], m: number): number[] {
  const n = y.length;
  const out = new Array<number>(n).fill(NaN);
  const half = Math.floor(m / 2);
  const len = m % 2 ? m : m + 1;
  const w = Array.from({ length: len }, (_, i) => (m % 2 ? 1 / m : i === 0 || i === len - 1 ? 1 / (2 * m) : 1 / m));
  for (let t = half; t < n - half; t++) {
    let s = 0;
    for (let i = 0; i < w.length; i++) s += w[i] * y[t - half + i];
    out[t] = s;
  }
  return out;
}

export function decompose(y: readonly number[], m: number, kind: 'add' | 'mul'): Decomposition {
  const trend = centeredMA(y, m);
  const sums = new Array<number>(m).fill(0);
  const counts = new Array<number>(m).fill(0);
  y.forEach((v, t) => {
    if (!Number.isFinite(trend[t])) return;
    sums[t % m] += kind === 'mul' ? v / trend[t] : v - trend[t];
    counts[t % m]++;
  });
  let figure = sums.map((s, j) => (counts[j] ? s / counts[j] : kind === 'mul' ? 1 : 0));
  const fm = mean(figure);
  figure = figure.map((f) => (kind === 'mul' ? f / fm : f - fm));
  const seasonal = y.map((_, t) => figure[t % m]);
  const remainder = y.map((v, t) => (kind === 'mul' ? v / (trend[t] * seasonal[t]) : v - trend[t] - seasonal[t]));
  // Parts de variance lues sur une décomposition additive (en multiplicatif, sur le logarithme).
  const T: number[] = [];
  const S: number[] = [];
  const R: number[] = [];
  y.forEach((_, t) => {
    if (!Number.isFinite(trend[t])) return;
    if (kind === 'mul') {
      T.push(Math.log(trend[t]));
      S.push(Math.log(seasonal[t]));
      R.push(Math.log(remainder[t]));
    } else {
      T.push(trend[t]);
      S.push(seasonal[t]);
      R.push(remainder[t]);
    }
  });
  const vT = variance(T);
  const vS = variance(S);
  const vR = variance(R);
  const tot = vT + vS + vR;
  const strength = (a: number[]) => {
    const v = variance(a.map((x, i) => x + R[i]));
    return v > 0 ? Math.max(0, 1 - vR / v) : 0;
  };
  return {
    kind,
    trend,
    figure,
    seasonal,
    remainder,
    shares: tot > 0 ? { trend: vT / tot, seasonal: vS / tot, remainder: vR / tot } : { trend: 0, seasonal: 0, remainder: 0 },
    seasonalStrength: strength(S),
    trendStrength: strength(T),
  };
}

/* ───────────── Analyse complète ───────────── */

export interface ModelResult {
  id: ModelId;
  name: string;
  short: string;
  backtest: BacktestResult | null;
  /** Gain de MAE par rapport à la référence naïve (en %, positif = meilleur). */
  gainVsNaive: number;
  band: Band;
  /** Total prévu sur l'horizon et son intervalle à 80 % (quantiles des sommes des trajectoires). */
  total: { mean: number; lo80: number; hi80: number };
  fitted: number[];
  params: { label: string; value: number }[];
}

export interface Analysis {
  m: number;
  seasonal: boolean;
  horizon: number;
  plan: BacktestPlan | null;
  models: ModelResult[];
  bestId: ModelId;
  decomposition: Decomposition | null;
  /** Raisons pour lesquelles certaines options sont désactivées. */
  limits: string[];
}

export const MIN_POINTS = 12;
export const FINAL_PATHS = 1000;
export const BOOT_SEED = 42;

/**
 * Compare les modèles en validation glissante, choisit le meilleur (MAE la plus faible), puis réestime
 * chaque modèle sur toute la série pour la prévision et ses intervalles bootstrap.
 */
export function analyze(y: readonly number[], m: number, horizon: number): Analysis {
  if (y.length < MIN_POINTS) throw new Error(`Série trop courte : ${y.length} périodes (il en faut au moins ${MIN_POINTS} pour estimer puis valider un modèle).`);
  const limits: string[] = [];
  const positive = y.every((v) => v > 0);
  let seasonal = m >= 2;
  let plan: BacktestPlan | null = null;
  if (seasonal) {
    plan = backtestPlan(y.length, horizon, 2 * m);
    if (!plan || y.length < 2 * m + 2) {
      seasonal = false;
      limits.push(`Moins de deux cycles complets (${2 * m} périodes) en plus de la validation : la saisonnalité n'est pas estimée.`);
    }
  }
  const mm = seasonal ? m : 1;
  if (!seasonal) plan = backtestPlan(y.length, horizon, Math.max(6, Math.floor(y.length / 2)));
  if (!positive && seasonal) limits.push('Valeurs nulles ou négatives : Holt-Winters multiplicatif et MAPE désactivés.');
  const specs = modelSpecs(positive, seasonal);
  const rows = specs.map((spec) => {
    const bt = plan ? backtest(y, mm, spec, plan) : null;
    const model = spec.fit(y, mm);
    const point = model.forecast(horizon);
    const paths = model.simulate(horizon, FINAL_PATHS, mulberry32(BOOT_SEED));
    const band = bandFromPaths(point, paths);
    const sums = paths.map((p) => p.reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
    const total = { mean: point.reduce((a, b) => a + b, 0), lo80: quantileSorted(sums, 0.1), hi80: quantileSorted(sums, 0.9) };
    return { id: spec.id, name: spec.name, short: spec.short, backtest: bt, gainVsNaive: NaN, band, total, fitted: model.fitted, params: model.params };
  });
  const naive = rows.find((r) => r.id === 'snaive')?.backtest?.metrics.mae ?? NaN;
  rows.forEach((r) => {
    const mae = r.backtest?.metrics.mae;
    r.gainVsNaive = mae !== undefined && naive > 0 ? (100 * (naive - mae)) / naive : NaN;
  });
  const ranked = rows.filter((r) => r.backtest && Number.isFinite(r.backtest.metrics.mae)).sort((a, b) => a.backtest!.metrics.mae - b.backtest!.metrics.mae);
  const bestId = (ranked[0] ?? rows[0]).id;
  const decomposition = seasonal && y.length >= 2 * m ? decompose(y, m, positive ? 'mul' : 'add') : null;
  return { m: mm, seasonal, horizon, plan, models: rows, bestId, decomposition, limits };
}
