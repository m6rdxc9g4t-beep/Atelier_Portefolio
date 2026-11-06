/**
 * Observatoire immobilier : types des données DVF agrégées (scripts/dvf/fetch-dvf.mjs) et fonctions pures
 * (lecture des statistiques, échelles, projection, régression hédonique). Aucune dépendance au DOM.
 */

/* ───────────────────────── Données ───────────────────────── */

export type TypeCode = 'T' | 'M' | 'A';
/** [effectif, 1er quartile, médiane, 3e quartile] du prix au m² (€). */
export type Resume = [number, number, number, number];
export type StatsAnnee = Partial<Record<TypeCode, Resume>>;

export interface Commune {
  /** Code INSEE */
  c: string;
  /** Nom */
  n: string;
  /** Centroïde (médiane des coordonnées des ventes), null sans coordonnées */
  x: number | null;
  y: number | null;
  /** Ventes retenues sur toute la période */
  v: number;
  /** Statistiques par année puis par type */
  s: Record<string, StatsAnnee>;
  /** Histogrammes du prix au m² sur la période, par type */
  h: Partial<Record<'M' | 'A', number[]>>;
}

export interface DepartementData {
  version: number;
  code: string;
  nom: string;
  annees: number[];
  periode: { debut: string | null; fin: string | null };
  filtres: { bornesPrixM2: [number, number]; lues: number; ecartees: number; retenues: number };
  histogramme: { largeur: number; max: number };
  departement: { v: number; s: Record<string, StatsAnnee>; h: Partial<Record<'M' | 'A', number[]>> };
  communes: Commune[];
  /** Lignes : [surface, pièces, type (0 maison, 1 appartement), année, prix, indice de commune] */
  echantillon: { colonnes: string[]; total: number; lignes: [number, number, number, number, number, number][] };
}

export interface DvfIndex {
  version: number;
  genere: string;
  source: string;
  producteur: string;
  licence: string;
  url: string;
  annees: number[];
  periode: { debut: string | null; fin: string | null };
  filtres: string;
  departements: { code: string; nom: string; fichier: string; ventes: number; communes: number; annees: number[] }[];
  /** Jeu d'exemple généré localement (jamais publié) : un bandeau le signale. */
  exemple?: boolean;
}

/** Contrôle minimal de forme : un index exploitable (sinon la démo affiche « Données en préparation »). */
export function isDvfIndex(x: unknown): x is DvfIndex {
  const o = x as DvfIndex | null;
  return !!o && typeof o === 'object' && Array.isArray(o.departements) && o.departements.length > 0 && Array.isArray(o.annees);
}

export function isDepartementData(x: unknown): x is DepartementData {
  const o = x as DepartementData | null;
  return (
    !!o &&
    typeof o === 'object' &&
    Array.isArray(o.communes) &&
    Array.isArray(o.annees) &&
    !!o.echantillon &&
    Array.isArray(o.echantillon.lignes)
  );
}

/** En dessous de ce nombre de ventes, la médiane n'est pas publiée (trop instable). */
export const MIN_VENTES = 5;

/** Résumé d'une commune (ou du département) pour une année et un type ; undefined si aucune vente. */
export function resumeOf(stats: Record<string, StatsAnnee>, annee: number, type: TypeCode): Resume | undefined {
  return stats[String(annee)]?.[type];
}

/** Médiane publiable (au moins MIN_VENTES ventes), sinon null. */
export function medianeOf(stats: Record<string, StatsAnnee>, annee: number, type: TypeCode): number | null {
  const r = resumeOf(stats, annee, type);
  return r && r[0] >= MIN_VENTES ? r[2] : null;
}

/** Évolution relative de la médiane par rapport à l'année précédente (null si l'une manque). */
export function evolution(stats: Record<string, StatsAnnee>, annee: number, type: TypeCode): number | null {
  const a = medianeOf(stats, annee, type);
  const b = medianeOf(stats, annee - 1, type);
  return a !== null && b !== null && b > 0 ? a / b - 1 : null;
}

/** Nombre de ventes d'une année et d'un type (0 si aucune). */
export function ventesOf(stats: Record<string, StatsAnnee>, annee: number, type: TypeCode): number {
  return resumeOf(stats, annee, type)?.[0] ?? 0;
}

/* ───────────────────────── Quantiles et classes ───────────────────────── */

/** Quantile d'un tableau trié, interpolation linéaire (type 7 de Hyndman & Fan, celui de R et d'Excel). */
export function quantileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Seuils de k classes d'effectifs égaux (quantiles), arrondis à `step` et strictement croissants.
 * Rend k − 1 seuils ; moins si les valeurs sont trop peu dispersées.
 */
export function quantileBreaks(values: number[], k = 5, step = 50): number[] {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < k; i++) {
    const b = Math.round(quantileSorted(s, i / k) / step) * step;
    if (b > s[0] && b <= s[s.length - 1] && (!out.length || b > out[out.length - 1])) out.push(b);
  }
  return out;
}

/** Classe (0 … breaks.length) d'une valeur : nombre de seuils qu'elle atteint. */
export function classOf(v: number, breaks: number[]): number {
  let c = 0;
  while (c < breaks.length && v >= breaks[c]) c++;
  return c;
}

/* ───────────────────────── Projection ───────────────────────── */

export interface Projection {
  (lon: number, lat: number): [number, number];
  width: number;
  height: number;
}

/**
 * Projection équirectangulaire locale (x = lon · cos φ₀, y = −lat) ajustée à une largeur donnée,
 * marges comprises ; la hauteur suit le rapport d'aspect des points (bornée par maxHeight).
 */
export function fitProjection(points: [number, number][], width: number, pad = 16, maxHeight = Infinity): Projection {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const lon0 = Math.min(...lons);
  const lon1 = Math.max(...lons);
  const lat0 = Math.min(...lats);
  const lat1 = Math.max(...lats);
  const k = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const spanX = Math.max(1e-6, (lon1 - lon0) * k);
  const spanY = Math.max(1e-6, lat1 - lat0);
  let scale = (width - 2 * pad) / spanX;
  let height = spanY * scale + 2 * pad;
  if (height > maxHeight) {
    scale = (maxHeight - 2 * pad) / spanY;
    height = maxHeight;
  }
  const offX = (width - spanX * scale) / 2;
  const f = ((lon: number, lat: number) => [offX + (lon - lon0) * k * scale, pad + (lat1 - lat) * scale]) as Projection;
  f.width = width;
  f.height = height;
  return f;
}

/** Rayon d'un point proportionnel en surface au nombre de ventes. */
export function radius(n: number, nMax: number, rMin = 1.6, rMax = 15): number {
  if (!(n > 0) || !(nMax > 0)) return rMin;
  return rMin + (rMax - rMin) * Math.sqrt(Math.min(1, n / nMax));
}

/* ───────────────────────── Algèbre linéaire ───────────────────────── */

/** Inverse d'une matrice carrée (Gauss–Jordan avec pivot partiel) ; null si singulière. */
export function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    const d = m[col][col];
    for (let j = 0; j < 2 * n; j++) m[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[col][j];
    }
  }
  return m.map((row) => row.slice(n));
}

export interface OlsResult {
  beta: number[];
  /** Écarts-types classiques (homoscédasticité) */
  se: number[];
  /** Écarts-types robustes à l'hétéroscédasticité (White, correction HC1) */
  seRobust: number[];
  residuals: number[];
  fitted: number[];
  r2: number;
  r2Adj: number;
  /** Écart-type résiduel σ̂ = √(SCR / (n − k)) */
  sigma: number;
  n: number;
  k: number;
}

/** Moindres carrés ordinaires par équations normales : β̂ = (X′X)⁻¹X′y. Lève une erreur si X′X est singulière. */
export function ols(X: number[][], y: number[]): OlsResult {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  if (n <= k) throw new Error('Trop peu d’observations pour estimer le modèle');
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let a = 0; a < k; a++) {
      xty[a] += xi[a] * y[i];
      for (let b = a; b < k; b++) xtx[a][b] += xi[a] * xi[b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a];
  const inv = invert(xtx);
  if (!inv) throw new Error('Variables colinéaires : le modèle ne peut pas être estimé');
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  const fitted = X.map((xi) => xi.reduce((s, v, j) => s + v * beta[j], 0));
  const residuals = y.map((yi, i) => yi - fitted[i]);
  const ssr = residuals.reduce((s, e) => s + e * e, 0);
  const ybar = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const s2 = ssr / (n - k);
  const se = inv.map((row, j) => Math.sqrt(s2 * row[j]));
  // Sandwich de White : (X′X)⁻¹ (Σ eᵢ² xᵢxᵢ′) (X′X)⁻¹ × n / (n − k)
  const meat = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < n; i++) {
    const e2 = residuals[i] ** 2;
    const xi = X[i];
    for (let a = 0; a < k; a++) for (let b = a; b < k; b++) meat[a][b] += e2 * xi[a] * xi[b];
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) meat[a][b] = meat[b][a];
  const seRobust = Array.from({ length: k }, (_, j) => {
    let v = 0;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) v += inv[j][a] * meat[a][b] * inv[b][j];
    return Math.sqrt((v * n) / (n - k));
  });
  const r2 = sst > 0 ? 1 - ssr / sst : 0;
  return { beta, se, seRobust, residuals, fitted, r2, r2Adj: 1 - ((1 - r2) * (n - 1)) / (n - k), sigma: Math.sqrt(s2), n, k };
}

/* ───────────────────────── Modèle hédonique ───────────────────────── */

/** Profil de référence : maison de 100 m², 4 pièces, dans une commune au niveau du département. */
export const REF_SURFACE = 100;
export const REF_PIECES = 4;
/** Poids de rétrécissement de l'indice de commune vers le département (ventes « équivalentes »). */
export const SHRINK_K = 20;
/** Quantile de la loi normale pour un intervalle à 80 %. */
export const Z80 = 1.2815515655446004;

/**
 * Niveau de prix au m² d'une série (moyenne des médianes annuelles pondérée par les effectifs), tous types.
 * Rend [niveau, effectif].
 */
export function niveauPrix(stats: Record<string, StatsAnnee>): [number, number] {
  let w = 0;
  let s = 0;
  for (const y of Object.values(stats)) {
    const r = y.T;
    if (r && r[0] > 0) {
      w += r[0];
      s += r[0] * r[2];
    }
  }
  return [w > 0 ? s / w : NaN, w];
}

/**
 * Indice de localisation d'une commune, en log, relatif au département :
 * ln(Iᶜ / Iᵈ) rétréci vers 0 avec le poids w = n / (n + K) (estimateur bayésien empirique simple),
 * pour qu'une commune de 3 ventes ne reçoive pas un indice extrême.
 */
export function indiceCommune(c: Commune, dep: DepartementData, k = SHRINK_K): number {
  const [nivDep] = niveauPrix(dep.departement.s);
  const [niv, n] = niveauPrix(c.s);
  if (!(niv > 0) || !(nivDep > 0)) return 0;
  const w = n / (n + k);
  return w * Math.log(niv / nivDep);
}

export interface Bien {
  surface: number;
  pieces: number;
  type: 'M' | 'A';
  annee: number;
  /** ln(indice de commune / niveau du département) */
  lnIndice: number;
}

/** Ligne de la matrice X : constante, ln(S/100), pièces − 4, appartement, ln indice, indicatrices d'année. */
export function designRow(b: Bien, annees: number[]): number[] {
  return [
    1,
    Math.log(b.surface / REF_SURFACE),
    b.pieces - REF_PIECES,
    b.type === 'A' ? 1 : 0,
    b.lnIndice,
    ...annees.slice(1).map((a) => (b.annee === a ? 1 : 0)),
  ];
}

export interface Coefficient {
  key: string;
  label: string;
  beta: number;
  se: number;
  /** Statistique t robuste */
  t: number;
}

export interface ModeleHedonique {
  departement: string;
  annees: number[];
  coefs: Coefficient[];
  beta: number[];
  sigma: number;
  r2: number;
  r2Adj: number;
  n: number;
  /** Validation hors échantillon (1 vente sur 5 mise de côté) */
  validation: { n: number; erreurMediane: number; couverture80: number };
}

/** Ventes de l'échantillon utilisables (pièces 1 à 10, prix et surface positifs), en biens. */
export function biensEchantillon(dep: DepartementData): { biens: Bien[]; prix: number[] } {
  const ind = dep.communes.map((c) => indiceCommune(c, dep));
  const biens: Bien[] = [];
  const prix: number[] = [];
  for (const [surface, pieces, type, annee, p, ci] of dep.echantillon.lignes) {
    if (!(surface > 0 && p > 0 && pieces >= 1 && pieces <= 10) || ind[ci] === undefined || !dep.annees.includes(annee)) continue;
    biens.push({ surface, pieces, type: type === 1 ? 'A' : 'M', annee, lnIndice: ind[ci] });
    prix.push(p);
  }
  return { biens, prix };
}

const LABELS: Record<string, string> = {
  const: 'Constante (profil de référence)',
  lnS: 'ln(surface / 100 m²)',
  pieces: 'Pièces (écart à 4)',
  appart: 'Appartement (réf. maison)',
  lnI: 'ln(indice de la commune)',
};

/**
 * Ajuste ln(prix) = β₀ + β₁ ln(S/100) + β₂ (pièces − 4) + β₃ appartement + β₄ ln(indice commune) + Σ γₐ 1[année = a] + ε
 * sur l'échantillon du département ; valide hors échantillon (une vente sur cinq), puis réestime sur tout l'échantillon.
 */
export function fitHedonique(dep: DepartementData): ModeleHedonique {
  const { biens, prix } = biensEchantillon(dep);
  const annees = dep.annees.filter((a) => biens.some((b) => b.annee === a));
  const X = biens.map((b) => designRow(b, annees));
  const y = prix.map((p) => Math.log(p));

  const trainX: number[][] = [];
  const trainY: number[] = [];
  const testX: number[][] = [];
  const testY: number[] = [];
  X.forEach((row, i) => {
    if (i % 5 === 4) {
      testX.push(row);
      testY.push(y[i]);
    } else {
      trainX.push(row);
      trainY.push(y[i]);
    }
  });
  const train = ols(trainX, trainY);
  const errs: number[] = [];
  let couverts = 0;
  testX.forEach((row, i) => {
    const xb = row.reduce((s, v, j) => s + v * train.beta[j], 0);
    errs.push(Math.abs(Math.exp(xb) / Math.exp(testY[i]) - 1));
    if (Math.abs(testY[i] - xb) <= Z80 * train.sigma) couverts++;
  });
  errs.sort((a, b) => a - b);

  const fit = ols(X, y);
  const keys = ['const', 'lnS', 'pieces', 'appart', 'lnI', ...annees.slice(1).map((a) => `a${a}`)];
  const coefs = keys.map((key, j) => ({
    key,
    label: LABELS[key] ?? `Année ${key.slice(1)} (réf. ${annees[0]})`,
    beta: fit.beta[j],
    se: fit.seRobust[j],
    t: fit.beta[j] / fit.seRobust[j],
  }));
  return {
    departement: dep.code,
    annees,
    coefs,
    beta: fit.beta,
    sigma: fit.sigma,
    r2: fit.r2,
    r2Adj: fit.r2Adj,
    n: fit.n,
    validation: { n: testY.length, erreurMediane: quantileSorted(errs, 0.5), couverture80: testY.length ? couverts / testY.length : NaN },
  };
}

export interface Facteur {
  key: string;
  label: string;
  /** Effet multiplicatif sur le prix par rapport au profil de référence */
  facteur: number;
}

export interface Estimation {
  /** Prix médian conditionnel exp(x′β̂) */
  prix: number;
  prixM2: number;
  /** Intervalle de prévision à 80 % (incertitude des résidus ; celle des coefficients est négligeable ici) */
  bas: number;
  haut: number;
  /** Prix de référence exp(β₀) et facteurs multiplicatifs : prix = référence × Π facteurs */
  reference: number;
  facteurs: Facteur[];
}

/** Estimation d'un bien et décomposition multiplicative à partir du profil de référence. */
export function estimer(m: ModeleHedonique, b: Bien): Estimation {
  const annee = m.annees.includes(b.annee) ? b.annee : m.annees[m.annees.length - 1];
  const x = designRow({ ...b, annee }, m.annees);
  const xb = x.reduce((s, v, j) => s + v * m.beta[j], 0);
  const prix = Math.exp(xb);
  const ia = m.annees.indexOf(annee);
  const facteurs: Facteur[] = [
    { key: 'lnS', label: `Surface ${fmtInt(b.surface)} m²`, facteur: Math.exp(m.beta[1] * x[1]) },
    { key: 'pieces', label: `${b.pieces} pièce${b.pieces > 1 ? 's' : ''}`, facteur: Math.exp(m.beta[2] * x[2]) },
    { key: 'appart', label: b.type === 'A' ? 'Appartement' : 'Maison', facteur: Math.exp(m.beta[3] * x[3]) },
    { key: 'lnI', label: 'Commune', facteur: Math.exp(m.beta[4] * x[4]) },
    { key: 'annee', label: `Année ${annee}`, facteur: ia > 0 ? Math.exp(m.beta[4 + ia]) : 1 },
  ];
  return {
    prix,
    prixM2: prix / b.surface,
    bas: Math.exp(xb - Z80 * m.sigma),
    haut: Math.exp(xb + Z80 * m.sigma),
    reference: Math.exp(m.beta[0]),
    facteurs,
  };
}

/** Lecture en clair d'un coefficient (effet en pourcentage sur le prix, toutes choses égales par ailleurs). */
export function lecture(c: Coefficient, anneeRef: number): string {
  const pct = (x: number) => fmtPct(x, true);
  switch (c.key) {
    case 'const':
      return `Prix d’une maison de 100 m², 4 pièces, dans une commune au niveau du département, en ${anneeRef} : ${fmtEur(Math.exp(c.beta))}.`;
    case 'lnS':
      return `Élasticité : +10 % de surface, à pièces égales → ${pct(Math.pow(1.1, c.beta) - 1)} sur le prix.`;
    case 'pieces':
      return `Une pièce de plus à surface égale (pièces plus petites) → ${pct(Math.exp(c.beta) - 1)}.`;
    case 'appart':
      return `À surface, pièces et commune égales, un appartement vaut ${pct(Math.exp(c.beta) - 1)} par rapport à une maison.`;
    case 'lnI':
      return `Une commune 10 % plus chère au m² → ${pct(Math.pow(1.1, c.beta) - 1)} ; 1 signifierait un report intégral.`;
    default:
      return `À caractéristiques égales, ${pct(Math.exp(c.beta) - 1)} par rapport à ${anneeRef} (indice hédonique).`;
  }
}

/* ───────────────────────── Formats (français) ───────────────────────── */

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Signe moins typographique (U+2212) à la place du trait d'union d'Intl. */
const minus = (s: string) => s.replace(/^-/, '\u2212');
export const fmtInt = (x: number) => minus(nf0.format(x));
export const fmtDec = (x: number, d = 2) => minus((d === 1 ? nf1 : d === 3 ? nf3 : nf2).format(x));
/** Montant en euros arrondi : au millier au-delà de 10 000 €. */
export function fmtEur(x: number): string {
  if (!Number.isFinite(x)) return '—';
  const r = Math.abs(x) >= 10000 ? Math.round(x / 1000) * 1000 : Math.round(x);
  return `${nf0.format(r)} €`;
}
export const fmtM2 = (x: number | null) => (x === null || !Number.isFinite(x) ? '—' : `${nf0.format(Math.round(x))} €/m²`);
/** Pourcentage ; avec signe explicite si `signed` (−, +), en signe moins typographique. */
export function fmtPct(x: number | null, signed = false): string {
  if (x === null || !Number.isFinite(x)) return '—';
  const v = nf1.format(Math.abs(x) * 100);
  const zero = Math.abs(x) < 0.0005; // « 0,0 % » sans signe
  const sign = zero ? '' : x < 0 ? '−' : signed ? '+' : '';
  return `${sign}${v} %`;
}
/** Date ISO « 2025-06-30 » → « 30 juin 2025 ». */
export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Normalisation pour la recherche de commune (casse, accents, tirets). */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’\s]+/g, ' ')
    .trim();
}

/** Communes dont le nom (ou le code) commence par la saisie, puis qui la contiennent ; triées par ventes. */
export function searchCommunes(communes: Commune[], q: string, limit = 8): Commune[] {
  const nq = normalize(q);
  if (!nq) return [];
  const starts: Commune[] = [];
  const contains: Commune[] = [];
  for (const c of communes) {
    const nn = normalize(c.n);
    if (nn.startsWith(nq) || c.c.startsWith(nq)) starts.push(c);
    else if (nn.includes(nq)) contains.push(c);
  }
  const byV = (a: Commune, b: Commune) => b.v - a.v;
  return [...starts.sort(byV), ...contains.sort(byV)].slice(0, limit);
}

/** Commune affichée par défaut : la préfecture si elle a des ventes, sinon la commune la plus active. */
export const PREFECTURES: Record<string, string> = { '49': '49007', '62': '62041', '59': '59350', '44': '44109', '35': '35238' };
export function communeParDefaut(dep: DepartementData): Commune | undefined {
  const pref = PREFECTURES[dep.code];
  return dep.communes.find((c) => c.c === pref && c.x !== null) ?? [...dep.communes].sort((a, b) => b.v - a.v)[0];
}

/** Graduations « rondes » (1, 2, 5 × 10ⁿ) couvrant [min, max], bornes comprises. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  if (out[out.length - 1] < max) out.push(Number((out[out.length - 1] + step).toPrecision(12)));
  return out;
}
