/**
 * Durée de vie client : analyse de survie écrite à la main.
 * Simulation à risques proportionnels (risque de base de Weibull, coefficients connus),
 * Kaplan-Meier (Greenwood, IC log-log), log-rank à k groupes, modèle de Cox (Breslow, Newton-Raphson),
 * concordance de Harrell, courbes prédites et valeur vie actualisée.
 */

/* ───────────────────────── Aléa à graine ───────────────────────── */

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────── Lois usuelles ───────────────────────── */

/** ln Γ(x), approximation de Lanczos (g = 7). */
export function lnGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fonction gamma incomplète régularisée supérieure Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** P(χ²_df > x). */
export const chi2Sf = (x: number, df: number) => gammaQ(df / 2, x / 2);
/** Fonction de répartition de la loi normale centrée réduite. */
export function normCdf(z: number): number {
  const q = 0.5 * gammaQ(0.5, (z * z) / 2); // = P(Z > |z|)
  return z >= 0 ? 1 - q : q;
}
/** p-valeur bilatérale d'une statistique normale. */
export const pNormal2 = (z: number) => gammaQ(0.5, (z * z) / 2);

/* ───────────────────────── Algèbre minimale ───────────────────────── */

/** Inverse d'une matrice symétrique définie positive (Gauss-Jordan avec pivot partiel). */
export function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    if (Math.abs(a[piv]![col]!) < 1e-14) throw new Error('Matrice singulière');
    [a[col], a[piv]] = [a[piv]!, a[col]!];
    const p = a[col]![col]!;
    for (let j = 0; j < 2 * n; j++) a[col]![j]! /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[col]![j]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/* ───────────────────────── Simulation ───────────────────────── */

export type Contrat = 'Mensuel' | 'Annuel';
export type Canal = 'Recherche' | 'Réseaux sociaux' | 'Parrainage' | 'Partenaire';
export type Region = 'Île-de-France' | 'Nord' | 'Ouest' | 'Est' | 'Sud';

export const CONTRATS: Contrat[] = ['Mensuel', 'Annuel'];
export const CANAUX: Canal[] = ['Recherche', 'Réseaux sociaux', 'Parrainage', 'Partenaire'];
export const REGIONS: Region[] = ['Île-de-France', 'Nord', 'Ouest', 'Est', 'Sud'];

export interface Abonne {
  id: number;
  /** Mois d'arrivée, compté depuis l'ouverture du service (0 à 36). */
  debut: number;
  contrat: Contrat;
  canal: Canal;
  remise: boolean;
  /** Usage des premières semaines, en heures par semaine. */
  usage: number;
  region: Region;
  /** Durée observée en mois (jusqu'à la résiliation ou jusqu'à la date d'observation). */
  duree: number;
  /** true si la résiliation est observée, false si l'abonné est encore actif (censure à droite). */
  resilie: boolean;
  /** Durée réelle simulée (connue seulement parce que c'est une simulation). */
  dureeVraie: number;
}

export const N_ABONNES = 3000;
/** Date d'observation : 36 mois après l'ouverture. */
export const HORIZON = 36;
export const SEED = 20251109;
/** Risque de base de Weibull : forme < 1, le risque décroît avec l'ancienneté. */
export const WEIBULL = { forme: 0.85, echelle: 15 };
/** Effet « fin d'engagement » : part des abonnés annuels qui, voulant partir avant 12 mois, attendent l'échéance. */
export const ENGAGEMENT_RETENUS = 0.8;

/** Coefficients VRAIS (log du rapport de risques) utilisés pour simuler. */
export const TRUE_BETA = {
  annuel: -0.7,
  reseaux: 0.35,
  parrainage: -0.45,
  partenaire: 0.15,
  remise: 0.4,
  usage: -0.18,
  nord: 0,
  ouest: 0,
  est: 0,
  sud: 0,
} as const;

export interface Covariable {
  key: keyof typeof TRUE_BETA;
  label: string;
  /** Modalité de référence ou unité, pour la lecture. */
  ref: string;
  value: (a: Pick<Abonne, 'contrat' | 'canal' | 'remise' | 'usage' | 'region'>) => number;
}

export const COVARIABLES: Covariable[] = [
  { key: 'annuel', label: 'Contrat annuel', ref: 'vs mensuel', value: (a) => +(a.contrat === 'Annuel') },
  { key: 'reseaux', label: 'Canal : réseaux sociaux', ref: 'vs recherche', value: (a) => +(a.canal === 'Réseaux sociaux') },
  { key: 'parrainage', label: 'Canal : parrainage', ref: 'vs recherche', value: (a) => +(a.canal === 'Parrainage') },
  { key: 'partenaire', label: 'Canal : partenaire', ref: 'vs recherche', value: (a) => +(a.canal === 'Partenaire') },
  { key: 'remise', label: 'Remise de bienvenue', ref: 'vs sans remise', value: (a) => +a.remise },
  { key: 'usage', label: 'Usage initial', ref: 'par heure / semaine', value: (a) => a.usage },
  { key: 'nord', label: 'Région : Nord', ref: 'vs Île-de-France', value: (a) => +(a.region === 'Nord') },
  { key: 'ouest', label: 'Région : Ouest', ref: 'vs Île-de-France', value: (a) => +(a.region === 'Ouest') },
  { key: 'est', label: 'Région : Est', ref: 'vs Île-de-France', value: (a) => +(a.region === 'Est') },
  { key: 'sud', label: 'Région : Sud', ref: 'vs Île-de-France', value: (a) => +(a.region === 'Sud') },
];

export const covariateRow = (a: Pick<Abonne, 'contrat' | 'canal' | 'remise' | 'usage' | 'region'>) => COVARIABLES.map((c) => c.value(a));
const TRUE_VECTOR = COVARIABLES.map((c) => TRUE_BETA[c.key]);

function pickWeighted<T>(rnd: () => number, items: readonly T[], weights: readonly number[]): T {
  const s = weights.reduce((x, y) => x + y, 0);
  let r = rnd() * s;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

const DAYS_PER_MONTH = 30.44;
const toDays = (m: number) => Math.max(1, Math.round(m * DAYS_PER_MONTH)) / DAYS_PER_MONTH;

/**
 * Abonnés simulés : arrivées étalées sur 3 ans (plus nombreuses vers la fin), durée tirée du modèle
 * à risques proportionnels, puis censure à la date d'observation. `engagement` ajoute l'effet
 * « fin d'engagement à 12 mois » des contrats annuels, qui viole la proportionnalité des risques.
 */
export function simulateAbonnes({ n = N_ABONNES, seed = SEED, engagement = true }: { n?: number; seed?: number; engagement?: boolean } = {}): Abonne[] {
  const rnd = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(rnd(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const out: Abonne[] = [];
  for (let i = 0; i < n; i++) {
    const debut = Math.round(HORIZON * Math.pow(rnd(), 0.75) * 100) / 100;
    const contrat: Contrat = rnd() < 0.4 ? 'Annuel' : 'Mensuel';
    const canal = pickWeighted(rnd, CANAUX, [40, 30, 15, 15]);
    const remise = rnd() < 0.3;
    const usage = Math.round(Math.min(20, Math.exp(Math.log(3.5) + 0.6 * gauss())) * 10) / 10;
    const region = pickWeighted(rnd, REGIONS, [30, 18, 20, 15, 17]);
    const x = covariateRow({ contrat, canal, remise, usage, region });
    const eta = x.reduce((s, v, j) => s + v * TRUE_VECTOR[j]!, 0);
    const u = Math.max(rnd(), 1e-12);
    let t = WEIBULL.echelle * Math.pow(-Math.log(u) / Math.exp(eta), 1 / WEIBULL.forme);
    const r2 = rnd();
    const r3 = rnd();
    if (engagement && contrat === 'Annuel' && t < 12 && r2 < ENGAGEMENT_RETENUS) {
      // Engagé jusqu'à l'échéance : il part juste après la date anniversaire.
      t = 12 + -Math.log(Math.max(r3, 1e-12)) * 0.4;
    }
    const dureeVraie = toDays(t);
    const suivi = Math.max(1 / DAYS_PER_MONTH, HORIZON - debut);
    const resilie = dureeVraie <= suivi;
    out.push({ id: i + 1, debut, contrat, canal, remise, usage, region, duree: resilie ? dureeVraie : toDays(suivi), resilie, dureeVraie });
  }
  return out;
}

/* ───────────────────────── Kaplan-Meier ───────────────────────── */

export interface KMStep {
  t: number;
  nRisk: number;
  events: number;
  censored: number;
  s: number;
  /** Variance de Greenwood de S(t). */
  variance: number;
  lo: number;
  hi: number;
}
export interface KMResult {
  n: number;
  events: number;
  /** Une marche par date d'événement, précédée du point de départ (t = 0, S = 1). */
  steps: KMStep[];
  /** Dates de censure (pour les marques sur la courbe). */
  censorTimes: number[];
  median: number | null;
  medianLo: number | null;
  medianHi: number | null;
}

/**
 * Estimateur de Kaplan-Meier. Variance de Greenwood ; intervalle de confiance par la transformation
 * log(−log S), qui reste dans [0, 1] (choix par défaut de nombreux logiciels).
 */
export function kaplanMeier(times: readonly number[], events: readonly boolean[], z = 1.959964): KMResult {
  const idx = times.map((_, i) => i).sort((a, b) => times[a]! - times[b]!);
  let n = times.length;
  let s = 1;
  let green = 0;
  let totalEvents = 0;
  const steps: KMStep[] = [{ t: 0, nRisk: n, events: 0, censored: 0, s: 1, variance: 0, lo: 1, hi: 1 }];
  const censorTimes: number[] = [];
  let k = 0;
  while (k < idx.length) {
    const t = times[idx[k]!]!;
    let d = 0;
    let c = 0;
    while (k < idx.length && times[idx[k]!] === t) {
      if (events[idx[k]!]) d++;
      else c++;
      k++;
    }
    if (d > 0) {
      s *= 1 - d / n;
      green += n > d ? d / (n * (n - d)) : Infinity;
      let lo = s;
      let hi = s;
      if (s > 0 && s < 1 && Number.isFinite(green)) {
        const se = Math.sqrt(green) / Math.abs(Math.log(s));
        lo = Math.pow(s, Math.exp(z * se));
        hi = Math.pow(s, Math.exp(-z * se));
      } else if (s === 0) {
        lo = 0;
        hi = 0;
      }
      steps.push({ t, nRisk: n, events: d, censored: c, s, variance: Number.isFinite(green) ? s * s * green : 0, lo, hi });
      totalEvents += d;
    }
    for (let j = 0; j < c; j++) censorTimes.push(t);
    n -= d + c;
  }
  const first = (pred: (st: KMStep) => boolean) => steps.find((st, i) => i > 0 && pred(st))?.t ?? null;
  return {
    n: times.length,
    events: totalEvents,
    steps,
    censorTimes,
    median: first((st) => st.s <= 0.5),
    medianLo: first((st) => st.lo <= 0.5),
    medianHi: first((st) => st.hi <= 0.5),
  };
}

/** Valeur de la fonction en escalier à la date t. */
export function survivalAt(km: KMResult, t: number): KMStep {
  let cur = km.steps[0]!;
  for (const st of km.steps) {
    if (st.t > t) break;
    cur = st;
  }
  return cur;
}

/** Durée moyenne restreinte à τ : aire sous la courbe de Kaplan-Meier entre 0 et τ. */
export function restrictedMean(km: KMResult, tau: number): number {
  let area = 0;
  for (let i = 0; i < km.steps.length; i++) {
    const a = km.steps[i]!;
    if (a.t >= tau) break;
    const b = km.steps[i + 1];
    const end = b ? Math.min(b.t, tau) : tau;
    area += a.s * (end - a.t);
  }
  return area;
}

/** Nombre de sujets encore suivis (à risque) à la date t. */
export const atRisk = (times: readonly number[], t: number) => times.reduce((n, x) => n + (x >= t ? 1 : 0), 0);

/* ───────────────────────── Log-rank ───────────────────────── */

export interface LogRankResult {
  chi2: number;
  df: number;
  p: number;
  observed: number[];
  expected: number[];
}

/** Test du log-rank à k groupes (groupes numérotés 0..k−1, chacun non vide). */
export function logRank(times: readonly number[], events: readonly boolean[], groups: readonly number[], k: number): LogRankResult {
  const idx = times.map((_, i) => i).sort((a, b) => times[a]! - times[b]!);
  const nG = Array.from({ length: k }, () => 0);
  for (const g of groups) nG[g]!++;
  const O = Array.from({ length: k }, () => 0);
  const E = Array.from({ length: k }, () => 0);
  const V = Array.from({ length: k }, () => Array.from({ length: k }, () => 0));
  let p = 0;
  while (p < idx.length) {
    const t = times[idx[p]!]!;
    const dG = Array.from({ length: k }, () => 0);
    const leave = Array.from({ length: k }, () => 0);
    while (p < idx.length && times[idx[p]!] === t) {
      const i = idx[p]!;
      if (events[i]) dG[groups[i]!]!++;
      leave[groups[i]!]!++;
      p++;
    }
    const d = dG.reduce((a, b) => a + b, 0);
    const n = nG.reduce((a, b) => a + b, 0);
    if (d > 0 && n > 0) {
      for (let g = 0; g < k; g++) {
        O[g]! += dG[g]!;
        E[g]! += (d * nG[g]!) / n;
        if (n > 1) {
          for (let h = 0; h < k; h++) {
            V[g]![h]! += ((d * (n - d)) / (n - 1)) * (nG[g]! / n) * ((g === h ? 1 : 0) - nG[h]! / n);
          }
        }
      }
    }
    for (let g = 0; g < k; g++) nG[g]! -= leave[g]!;
  }
  const m = k - 1;
  const diff = O.slice(0, m).map((o, g) => o - E[g]!);
  const Vi = invert(V.slice(0, m).map((r) => r.slice(0, m)));
  let chi2 = 0;
  for (let g = 0; g < m; g++) for (let h = 0; h < m; h++) chi2 += diff[g]! * Vi[g]![h]! * diff[h]!;
  return { chi2, df: m, p: chi2Sf(chi2, m), observed: O, expected: E };
}

/* ───────────────────────── Modèle de Cox ───────────────────────── */

export interface CoxFit {
  beta: number[];
  se: number[];
  z: number[];
  p: number[];
  /** Moyennes des covariables (le risque de base correspond à un abonné « moyen »). */
  means: number[];
  /** Risque de base cumulé de Breslow aux dates d'événement. */
  baseline: { t: number; H: number }[];
  loglik: number;
  loglik0: number;
  /** Rapport de vraisemblance global (χ² à p ddl). */
  lr: number;
  lrP: number;
  iterations: number;
}

interface PartialLik {
  loglik: number;
  grad: number[];
  info: number[][];
}

/** Vraisemblance partielle de Cox (ex æquo traités par la méthode de Breslow), gradient et information. */
function partialLik(Xc: readonly number[][], times: readonly number[], events: readonly boolean[], order: readonly number[], beta: readonly number[]): PartialLik {
  const p = beta.length;
  const grad = Array.from({ length: p }, () => 0);
  const info = Array.from({ length: p }, () => Array.from({ length: p }, () => 0));
  const S1 = Array.from({ length: p }, () => 0);
  const S2 = Array.from({ length: p }, () => Array.from({ length: p }, () => 0));
  let S0 = 0;
  let loglik = 0;
  let k = 0;
  // Parcours par durées décroissantes : l'ensemble à risque grossit au fil du parcours.
  while (k < order.length) {
    const t = times[order[k]!]!;
    let d = 0;
    const sumX = Array.from({ length: p }, () => 0);
    let sumEta = 0;
    while (k < order.length && times[order[k]!] === t) {
      const i = order[k]!;
      const x = Xc[i]!;
      let eta = 0;
      for (let j = 0; j < p; j++) eta += x[j]! * beta[j]!;
      const w = Math.exp(eta);
      S0 += w;
      for (let a = 0; a < p; a++) {
        S1[a]! += w * x[a]!;
        const row = S2[a]!;
        for (let b = a; b < p; b++) row[b]! += w * x[a]! * x[b]!;
      }
      if (events[i]) {
        d++;
        sumEta += eta;
        for (let j = 0; j < p; j++) sumX[j]! += x[j]!;
      }
      k++;
    }
    if (d === 0) continue;
    loglik += sumEta - d * Math.log(S0);
    for (let a = 0; a < p; a++) {
      const ma = S1[a]! / S0;
      grad[a]! += sumX[a]! - d * ma;
      for (let b = a; b < p; b++) {
        const v = d * (S2[a]![b]! / S0 - ma * (S1[b]! / S0));
        info[a]![b]! += v;
        if (b !== a) info[b]![a]! += v;
      }
    }
  }
  return { loglik, grad, info };
}

/** Modèle de Cox par Newton-Raphson (avec demi-pas si la vraisemblance baisse). */
export function coxFit(X: readonly number[][], times: readonly number[], events: readonly boolean[], { maxIter = 40, tol = 1e-10 } = {}): CoxFit {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const means = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j]!, 0) / n);
  const Xc = X.map((r) => r.map((v, j) => v - means[j]!));
  const order = times.map((_, i) => i).sort((a, b) => times[b]! - times[a]!);
  let beta = Array.from({ length: p }, () => 0);
  let cur = partialLik(Xc, times, events, order, beta);
  const loglik0 = cur.loglik;
  let it = 0;
  for (; it < maxIter; it++) {
    const step = invert(cur.info).map((row) => row.reduce((s, v, j) => s + v * cur.grad[j]!, 0));
    let scale = 1;
    let next = beta.map((b, j) => b + step[j]!);
    let cand = partialLik(Xc, times, events, order, next);
    while (cand.loglik < cur.loglik - 1e-12 && scale > 1 / 1024) {
      scale /= 2;
      next = beta.map((b, j) => b + scale * step[j]!);
      cand = partialLik(Xc, times, events, order, next);
    }
    const gain = cand.loglik - cur.loglik;
    beta = next;
    cur = cand;
    if (Math.abs(gain) < tol) break;
  }
  const cov = invert(cur.info);
  const se = cov.map((row, j) => Math.sqrt(row[j]!));
  const z = beta.map((b, j) => b / se[j]!);
  // Risque de base cumulé de Breslow, pour un abonné aux covariables moyennes.
  const asc = [...order].reverse();
  const etas = Xc.map((x) => Math.exp(x.reduce((s, v, j) => s + v * beta[j]!, 0)));
  let riskSum = etas.reduce((a, b) => a + b, 0);
  const baseline: { t: number; H: number }[] = [];
  let H = 0;
  let k = 0;
  while (k < asc.length) {
    const t = times[asc[k]!]!;
    let d = 0;
    let leaving = 0;
    while (k < asc.length && times[asc[k]!] === t) {
      const i = asc[k]!;
      if (events[i]) d++;
      leaving += etas[i]!;
      k++;
    }
    if (d > 0) {
      H += d / riskSum;
      baseline.push({ t, H });
    }
    riskSum -= leaving;
  }
  const lr = 2 * (cur.loglik - loglik0);
  return { beta, se, z, p: z.map(pNormal2), means, baseline, loglik: cur.loglik, loglik0, lr, lrP: chi2Sf(lr, p), iterations: it + 1 };
}

/** Risque de base cumulé à la date t (fonction en escalier). */
export function baselineAt(fit: CoxFit, t: number): number {
  let H = 0;
  for (const b of fit.baseline) {
    if (b.t > t) break;
    H = b.H;
  }
  return H;
}

/** Survie prédite par le modèle de Cox pour un profil x : S(t | x) = exp(−H₀(t) · e^{(x − x̄)β}). */
export function predictSurvival(fit: CoxFit, x: readonly number[], t: number): number {
  const eta = x.reduce((s, v, j) => s + (v - fit.means[j]!) * fit.beta[j]!, 0);
  return Math.exp(-baselineAt(fit, t) * Math.exp(eta));
}

/** Indice de concordance de Harrell : part des paires comparables bien ordonnées par le score de risque. */
export function concordance(times: readonly number[], events: readonly boolean[], risk: readonly number[]): number {
  let conc = 0;
  let comparable = 0;
  const n = times.length;
  for (let i = 0; i < n; i++) {
    if (!events[i]) continue;
    const ti = times[i]!;
    const ri = risk[i]!;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const tj = times[j]!;
      if (tj > ti || (tj === ti && !events[j])) {
        comparable++;
        const rj = risk[j]!;
        if (ri > rj) conc++;
        else if (ri === rj) conc += 0.5;
      }
    }
  }
  return comparable ? conc / comparable : 0.5;
}

/* ───────────────────────── Valeur vie ───────────────────────── */

/**
 * Valeur vie actualisée sur un horizon de H mois : marge encaissée chaque mois où l'abonné est encore là,
 * S(k), actualisée au taux mensuel équivalent au taux annuel.
 */
export function lifetimeValue(survival: (month: number) => number, margeMensuelle: number, tauxAnnuel: number, horizon = HORIZON): number {
  const r = Math.pow(1 + tauxAnnuel, 1 / 12) - 1;
  let v = 0;
  for (let k = 0; k < horizon; k++) v += (margeMensuelle * survival(k)) / Math.pow(1 + r, k);
  return v;
}

/* ───────────────────────── Regroupements ───────────────────────── */

export type GroupingKey = 'aucun' | 'contrat' | 'canal' | 'remise' | 'usage' | 'region';

export interface Grouping {
  key: GroupingKey;
  label: string;
  groups: string[];
  of: (a: Abonne) => number;
}

/** Regroupements proposés pour comparer les courbes ; l'usage est découpé en terciles des données. */
export function groupings(data: readonly Abonne[]): Grouping[] {
  const u = data.map((a) => a.usage).sort((a, b) => a - b);
  const q1 = u[Math.floor(u.length / 3)]!;
  const q2 = u[Math.floor((2 * u.length) / 3)]!;
  const f = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return [
    { key: 'aucun', label: 'Tous', groups: ['Tous les abonnés'], of: () => 0 },
    { key: 'contrat', label: 'Contrat', groups: [...CONTRATS], of: (a) => CONTRATS.indexOf(a.contrat) },
    { key: 'canal', label: 'Canal', groups: [...CANAUX], of: (a) => CANAUX.indexOf(a.canal) },
    { key: 'remise', label: 'Remise', groups: ['Sans remise', 'Avec remise'], of: (a) => +a.remise },
    {
      key: 'usage',
      label: 'Usage',
      groups: [`Faible (< ${f(q1)} h)`, `Moyen`, `Fort (≥ ${f(q2)} h)`],
      of: (a) => (a.usage < q1 ? 0 : a.usage < q2 ? 1 : 2),
    },
    { key: 'region', label: 'Région', groups: [...REGIONS], of: (a) => REGIONS.indexOf(a.region) },
  ];
}

/* ───────────────────────── Le piège de la moyenne ───────────────────────── */

export interface MeanTrap {
  /** Moyenne des durées des seuls abonnés partis. */
  partisSeuls: number;
  /** Moyenne des durées observées, en traitant les actifs comme s'ils venaient de partir. */
  observeesBrutes: number;
  /** Aire sous la courbe de Kaplan-Meier jusqu'à l'horizon (durée moyenne restreinte). */
  kaplanMeier: number;
  /** Vraie durée moyenne restreinte, connue grâce à la simulation. */
  vraie: number;
}

export function meanTrap(data: readonly Abonne[], km: KMResult, tau = HORIZON): MeanTrap {
  const partis = data.filter((a) => a.resilie);
  return {
    partisSeuls: partis.reduce((s, a) => s + a.duree, 0) / Math.max(1, partis.length),
    observeesBrutes: data.reduce((s, a) => s + a.duree, 0) / data.length,
    kaplanMeier: restrictedMean(km, tau),
    vraie: data.reduce((s, a) => s + Math.min(a.dureeVraie, tau), 0) / data.length,
  };
}
