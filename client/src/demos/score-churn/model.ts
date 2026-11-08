/**
 * Score de churn : données simulées, régression logistique écrite à la main (IRLS + L2),
 * évaluation (ROC, précision/rappel, calibration, gain) et décision au coût.
 * Fonctions pures, sans dépendance au DOM : testées dans shared/tests/demo-score-churn.test.ts.
 */
import { mulberry32 } from '../sql-lab/data';

export const CHURN_SEED = 20251109;
export const N_ABONNES = 5000;

export type Contrat = 'Mensuel' | 'Annuel' | 'Biennal';
export type Canal = 'Recherche' | 'Réseaux sociaux' | 'Parrainage' | 'Partenaire';

export interface Abonne {
  id: number;
  /** Ancienneté en mois. */
  anciennete: number;
  /** Sessions sur les 30 derniers jours. */
  usage: number;
  /** Variation de l'usage sur 3 mois (−0,8 = −80 %). */
  tendance: number;
  /** Tickets au support sur 90 jours. */
  tickets: number;
  /** Retards de paiement sur 12 mois. */
  retards: number;
  contrat: Contrat;
  canal: Canal;
  /** Entré avec une remise de bienvenue. */
  remise: boolean;
  /** Mensualité en euros. */
  mensualite: number;
  /** Probabilité vraie de résiliation (connue parce que simulée). */
  pVraie: number;
  /** 1 = a résilié dans le mois qui suit. */
  churn: 0 | 1;
}

/** Coefficients du modèle générateur (échelle brute, logit). L'ancienneté agit en plus de façon non linéaire. */
export const VRAI = {
  constante: -1.45,
  usage: -0.055,
  tendance: -1.6,
  tickets: 0.35,
  retards: 0.55,
  annuel: -1.1,
  biennal: -1.8,
  reseaux: 0.35,
  parrainage: -0.45,
  partenaire: 0.1,
  remise: 0.3,
  mensualite: 0.012,
  /** Surcroît de risque des premiers mois : +a · exp(−ancienneté / τ). */
  nonLineaire: { a: 1.3, tau: 5 },
} as const;

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
export { sigmoid };

/** Tire les abonnés à partir de la graine. */
export function simulateAbonnes(n = N_ABONNES, seed = CHURN_SEED): Abonne[] {
  const rnd = mulberry32(seed);
  const normal = () => {
    const u = Math.max(rnd(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const poisson = (lambda: number) => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rnd();
    } while (p > L);
    return k - 1;
  };
  const pick = <T,>(items: readonly T[], w: readonly number[]): T => {
    let r = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) {
      r -= w[i]!;
      if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  };

  const out: Abonne[] = [];
  for (let id = 1; id <= n; id++) {
    const contrat = pick<Contrat>(['Mensuel', 'Annuel', 'Biennal'], [55, 32, 13]);
    const canal = pick<Canal>(['Recherche', 'Réseaux sociaux', 'Parrainage', 'Partenaire'], [38, 27, 17, 18]);
    // Ancienneté : beaucoup de jeunes abonnés, une longue traîne de fidèles ; plus longue avec engagement.
    const anciennete = Math.min(72, Math.max(1, Math.round(-Math.log(Math.max(rnd(), 1e-9)) * (contrat === 'Mensuel' ? 11 : 20)) + 1));
    const remise = rnd() < (canal === 'Réseaux sociaux' ? 0.45 : 0.22);
    const usage = Math.max(0, Math.round(Math.exp(2.55 + 0.5 * normal() + (contrat === 'Mensuel' ? -0.1 : 0.08))));
    const tendance = Math.max(-0.85, Math.min(0.7, 0.03 + 0.24 * normal()));
    const tickets = Math.min(9, poisson(0.55 + (tendance < -0.2 ? 0.5 : 0)));
    const retards = Math.min(5, poisson(remise ? 0.42 : 0.28));
    const mensualite = [9.99, 14.99, 24.99][pick([0, 1, 2], [40, 42, 18])]!;

    const z =
      VRAI.constante +
      VRAI.usage * usage +
      VRAI.tendance * tendance +
      VRAI.tickets * tickets +
      VRAI.retards * retards +
      (contrat === 'Annuel' ? VRAI.annuel : 0) +
      (contrat === 'Biennal' ? VRAI.biennal : 0) +
      (canal === 'Réseaux sociaux' ? VRAI.reseaux : 0) +
      (canal === 'Parrainage' ? VRAI.parrainage : 0) +
      (canal === 'Partenaire' ? VRAI.partenaire : 0) +
      (remise ? VRAI.remise : 0) +
      VRAI.mensualite * mensualite +
      VRAI.nonLineaire.a * Math.exp(-anciennete / VRAI.nonLineaire.tau);
    const pVraie = sigmoid(z);
    out.push({ id, anciennete, usage, tendance, tickets, retards, contrat, canal, remise, mensualite, pVraie, churn: rnd() < pVraie ? 1 : 0 });
  }
  return out;
}

/* ───────────────────────── Découpage stratifié ───────────────────────── */

/** Découpe en apprentissage / test en gardant la même proportion de chaque classe. */
export function stratifiedSplit<T>(rows: readonly T[], label: (r: T) => 0 | 1, testShare = 0.3, seed = 7): { train: T[]; test: T[] } {
  const rnd = mulberry32(seed);
  const shuffle = (a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const train: T[] = [];
  const test: T[] = [];
  for (const cls of [0, 1] as const) {
    const group = shuffle(rows.filter((r) => label(r) === cls));
    const nTest = Math.round(group.length * testShare);
    test.push(...group.slice(0, nTest));
    train.push(...group.slice(nTest));
  }
  return { train, test };
}

/* ───────────────────────── Variables explicatives ───────────────────────── */

export interface Feature {
  key: string;
  /** Libellé court (tableau des coefficients). */
  label: string;
  /** Valeur brute pour un abonné. */
  value: (a: Abonne) => number;
  /** Unité d'interprétation de l'odds ratio, en unités brutes. */
  unit: number;
  /** « par ticket », « contrat annuel vs mensuel »… */
  unitLabel: string;
  /** Coefficient vrai (échelle brute), quand il existe. */
  truth: number | null;
  /** Phrase décrivant la valeur d'un abonné, pour expliquer son score. */
  describe: (a: Abonne) => string;
  binary?: boolean;
}

const pct = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))} %`;

export const BASE_FEATURES: Feature[] = [
  { key: 'anciennete', label: 'Ancienneté', value: (a) => a.anciennete, unit: 12, unitLabel: 'par année d’ancienneté', truth: null, describe: (a) => `${a.anciennete} mois d’ancienneté` },
  { key: 'usage', label: 'Usage', value: (a) => a.usage, unit: 10, unitLabel: 'par +10 sessions par mois', truth: VRAI.usage, describe: (a) => `${a.usage} session${a.usage > 1 ? 's' : ''} ce mois-ci` },
  { key: 'tendance', label: 'Tendance d’usage', value: (a) => a.tendance, unit: 0.1, unitLabel: 'par +10 points sur 3 mois', truth: VRAI.tendance, describe: (a) => `usage ${pct(a.tendance)} sur 3 mois` },
  { key: 'tickets', label: 'Tickets au support', value: (a) => a.tickets, unit: 1, unitLabel: 'par ticket', truth: VRAI.tickets, describe: (a) => `${a.tickets} ticket${a.tickets > 1 ? 's' : ''} au support` },
  { key: 'retards', label: 'Retards de paiement', value: (a) => a.retards, unit: 1, unitLabel: 'par retard', truth: VRAI.retards, describe: (a) => `${a.retards} retard${a.retards > 1 ? 's' : ''} de paiement` },
  { key: 'mensualite', label: 'Mensualité', value: (a) => a.mensualite, unit: 10, unitLabel: 'par +10 € par mois', truth: VRAI.mensualite, describe: (a) => `forfait à ${a.mensualite.toLocaleString('fr-FR')} €` },
  { key: 'annuel', label: 'Contrat annuel', value: (a) => (a.contrat === 'Annuel' ? 1 : 0), unit: 1, unitLabel: 'vs sans engagement', truth: VRAI.annuel, binary: true, describe: (a) => (a.contrat === 'Annuel' ? 'contrat annuel' : `contrat ${a.contrat.toLowerCase()}`) },
  { key: 'biennal', label: 'Contrat 2 ans', value: (a) => (a.contrat === 'Biennal' ? 1 : 0), unit: 1, unitLabel: 'vs sans engagement', truth: VRAI.biennal, binary: true, describe: (a) => (a.contrat === 'Biennal' ? 'contrat de 2 ans' : `contrat ${a.contrat.toLowerCase()}`) },
  { key: 'reseaux', label: 'Venu des réseaux sociaux', value: (a) => (a.canal === 'Réseaux sociaux' ? 1 : 0), unit: 1, unitLabel: 'vs recherche', truth: VRAI.reseaux, binary: true, describe: (a) => `venu par : ${a.canal.toLowerCase()}` },
  { key: 'parrainage', label: 'Venu par parrainage', value: (a) => (a.canal === 'Parrainage' ? 1 : 0), unit: 1, unitLabel: 'vs recherche', truth: VRAI.parrainage, binary: true, describe: (a) => `venu par : ${a.canal.toLowerCase()}` },
  { key: 'partenaire', label: 'Venu par un partenaire', value: (a) => (a.canal === 'Partenaire' ? 1 : 0), unit: 1, unitLabel: 'vs recherche', truth: VRAI.partenaire, binary: true, describe: (a) => `venu par : ${a.canal.toLowerCase()}` },
  { key: 'remise', label: 'Remise de bienvenue', value: (a) => (a.remise ? 1 : 0), unit: 1, unitLabel: 'vs prix plein', truth: VRAI.remise, binary: true, describe: (a) => (a.remise ? 'entré avec une remise' : 'entré au prix plein') },
];

/** Variable ajoutée pour capter le risque des premiers mois. */
export const LOG_ANCIENNETE: Feature = {
  key: 'logAnciennete',
  label: 'log(1 + ancienneté)',
  value: (a) => Math.log(1 + a.anciennete),
  unit: Math.LN2,
  unitLabel: 'quand l’ancienneté double',
  truth: null,
  describe: (a) => `${a.anciennete} mois d’ancienneté`,
};

export const featuresFor = (withLog: boolean) => (withLog ? [...BASE_FEATURES, LOG_ANCIENNETE] : BASE_FEATURES);

/* ───────────────────────── Régression logistique ───────────────────────── */

export interface LogitFit {
  /** Coefficients sur variables standardisées : [constante, β1…βp]. */
  betaStd: number[];
  /** Coefficients sur l'échelle brute : [constante, β1…βp]. */
  betaRaw: number[];
  /** Écarts-types approchés (échelle brute), hors constante, d'après l'inverse du hessien pénalisé. */
  seRaw: number[];
  mean: number[];
  sd: number[];
  iterations: number;
  converged: boolean;
}

/** Résout A x = b (A symétrique définie positive) par élimination de Gauss avec pivot partiel. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('Système singulier : une variable est constante ou redondante.');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

function invert(A: number[][]): number[][] {
  const n = A.length;
  const cols = Array.from({ length: n }, (_, j) => solve(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))));
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cols[j]![i]!));
}

/**
 * Ajuste une régression logistique par IRLS (Newton-Raphson) sur variables standardisées,
 * avec pénalité ridge λ‖β‖² / 2 (la constante n'est pas pénalisée).
 */
export function fitLogistic(X: number[][], y: number[], lambda = 0, maxIter = 50): LogitFit {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const mean = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j]!, 0) / n);
  const sd = Array.from({ length: p }, (_, j) => {
    const v = X.reduce((s, r) => s + (r[j]! - mean[j]!) ** 2, 0) / n;
    return Math.sqrt(v) || 1;
  });
  const Z = X.map((r) => [1, ...r.map((v, j) => (v - mean[j]!) / sd[j]!)]);
  const k = p + 1;
  let beta = new Array<number>(k).fill(0);
  let iterations = 0;
  let converged = false;
  let H: number[][] = [];
  for (; iterations < maxIter; iterations++) {
    const grad = new Array<number>(k).fill(0);
    H = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    for (let i = 0; i < n; i++) {
      const zi = Z[i]!;
      let eta = 0;
      for (let j = 0; j < k; j++) eta += zi[j]! * beta[j]!;
      const mu = sigmoid(eta);
      const w = Math.max(mu * (1 - mu), 1e-10);
      const r = y[i]! - mu;
      for (let j = 0; j < k; j++) {
        grad[j]! += zi[j]! * r;
        const wz = w * zi[j]!;
        for (let l = j; l < k; l++) H[j]![l]! += wz * zi[l]!;
      }
    }
    for (let j = 0; j < k; j++) for (let l = 0; l < j; l++) H[j]![l] = H[l]![j]!;
    for (let j = 1; j < k; j++) {
      grad[j]! -= lambda * beta[j]!;
      H[j]![j]! += lambda;
    }
    const step = solve(H, grad);
    beta = beta.map((b, j) => b + step[j]!);
    if (Math.max(...step.map(Math.abs)) < 1e-8) {
      converged = true;
      iterations++;
      break;
    }
  }
  const cov = invert(H);
  const betaRaw = [beta[0]! - beta.slice(1).reduce((s, b, j) => s + (b * mean[j]!) / sd[j]!, 0), ...beta.slice(1).map((b, j) => b / sd[j]!)];
  const seRaw = beta.slice(1).map((_, j) => Math.sqrt(Math.max(cov[j + 1]![j + 1]!, 0)) / sd[j]!);
  return { betaStd: beta, betaRaw, seRaw, mean, sd, iterations, converged };
}

/** Probabilité prédite pour une ligne de variables brutes. */
export function predict(fit: LogitFit, x: readonly number[]): number {
  let eta = fit.betaRaw[0]!;
  for (let j = 0; j < x.length; j++) eta += fit.betaRaw[j + 1]! * x[j]!;
  return sigmoid(eta);
}

/** Contribution de chaque variable au logit, par rapport à un abonné moyen (variables standardisées). */
export function contributions(fit: LogitFit, x: readonly number[]): number[] {
  return x.map((v, j) => (fit.betaStd[j + 1]! * (v - fit.mean[j]!)) / fit.sd[j]!);
}

/* ───────────────────────── Évaluation ───────────────────────── */

export interface Point {
  x: number;
  y: number;
}

/** Courbe ROC (taux de faux positifs, taux de vrais positifs), seuils décroissants ; les ex aequo forment un seul pas. */
export function rocCurve(scores: readonly number[], labels: readonly number[]): Point[] {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  const P = labels.reduce((s, v) => s + v, 0);
  const N = labels.length - P;
  const pts: Point[] = [{ x: 0, y: 0 }];
  let tp = 0;
  let fp = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]!;
    if (labels[i] === 1) tp++;
    else fp++;
    const next = idx[k + 1];
    if (next === undefined || scores[next] !== scores[i]) pts.push({ x: N ? fp / N : 0, y: P ? tp / P : 0 });
  }
  return pts;
}

/** Aire sous une courbe par la méthode des trapèzes. */
export function trapezoid(pts: readonly Point[]): number {
  let a = 0;
  for (let i = 1; i < pts.length; i++) a += ((pts[i]!.x - pts[i - 1]!.x) * (pts[i]!.y + pts[i - 1]!.y)) / 2;
  return a;
}

/** AUC par la statistique de Mann-Whitney : P(score d'un positif > score d'un négatif), ex aequo comptés pour moitié. */
export function aucMannWhitney(scores: readonly number[], labels: readonly number[]): number {
  const order = scores.map((s, i) => ({ s, y: labels[i]! })).sort((a, b) => a.s - b.s);
  let rankSumPos = 0;
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.s === order[i]!.s) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) if (order[k]!.y === 1) rankSumPos += avgRank;
    i = j + 1;
  }
  const nPos = labels.reduce((s, v) => s + v, 0);
  const nNeg = labels.length - nPos;
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

/** Courbe précision / rappel (x = rappel, y = précision) et précision moyenne. */
export function prCurve(scores: readonly number[], labels: readonly number[]): { points: Point[]; averagePrecision: number } {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  const P = labels.reduce((s, v) => s + v, 0);
  const points: Point[] = [];
  let tp = 0;
  let ap = 0;
  let prevRecall = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]!;
    if (labels[i] === 1) tp++;
    const next = idx[k + 1];
    if (next === undefined || scores[next] !== scores[i]) {
      const recall = tp / P;
      const precision = tp / (k + 1);
      ap += (recall - prevRecall) * precision;
      prevRecall = recall;
      points.push({ x: recall, y: precision });
    }
  }
  return { points, averagePrecision: ap };
}

export interface Decile {
  /** Probabilité moyenne prédite. */
  predicted: number;
  /** Taux observé. */
  observed: number;
  n: number;
}

/** Calibration : on range les abonnés par score et on compare, décile par décile, prédit et observé. */
export function calibrationDeciles(scores: readonly number[], labels: readonly number[], bins = 10): Decile[] {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a]! - scores[b]!);
  const out: Decile[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = Math.floor((b * idx.length) / bins);
    const hi = Math.floor(((b + 1) * idx.length) / bins);
    const slice = idx.slice(lo, hi);
    out.push({
      predicted: slice.reduce((s, i) => s + scores[i]!, 0) / slice.length,
      observed: slice.reduce((s, i) => s + labels[i]!, 0) / slice.length,
      n: slice.length,
    });
  }
  return out;
}

/** Gain cumulé : part des résiliations captées en contactant les x % d'abonnés les plus à risque. */
export function gainCurve(scores: readonly number[], labels: readonly number[], steps = 20): Point[] {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  const P = labels.reduce((s, v) => s + v, 0);
  const pts: Point[] = [{ x: 0, y: 0 }];
  for (let s = 1; s <= steps; s++) {
    const k = Math.round((s * idx.length) / steps);
    let tp = 0;
    for (let i = 0; i < k; i++) tp += labels[idx[i]!]!;
    pts.push({ x: k / idx.length, y: tp / P });
  }
  return pts;
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export function confusion(scores: readonly number[], labels: readonly number[], threshold: number): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  scores.forEach((s, i) => {
    const pos = s >= threshold;
    if (pos && labels[i] === 1) c.tp++;
    else if (pos) c.fp++;
    else if (labels[i] === 1) c.fn++;
    else c.tn++;
  });
  return c;
}

/* ───────────────────────── Décision ───────────────────────── */

export interface Economics {
  /** Valeur d'un abonné conservé (marge future), en euros. */
  valeur: number;
  /** Coût d'une offre de rétention envoyée, en euros. */
  coutOffre: number;
  /** Part des abonnés sur le départ que l'offre retient. */
  succes: number;
}

/**
 * Gain net par rapport à « ne contacter personne » : chaque abonné contacté coûte l'offre,
 * chaque futur résilié contacté est retenu avec la probabilité de succès.
 */
export const netGain = (c: Pick<Confusion, 'tp' | 'fp'>, e: Economics) => c.tp * e.succes * e.valeur - (c.tp + c.fp) * e.coutOffre;

/** Seuil théorique pour un score bien calibré : contacter dès que p · s · V ≥ c. */
export const theoreticalThreshold = (e: Economics) => Math.min(1, e.coutOffre / (e.succes * e.valeur));

export interface GainPoint {
  threshold: number;
  gain: number;
  contacted: number;
}

/** Gain net pour chaque seuil candidat (chaque score distinct, plus « personne »). */
export function gainByThreshold(scores: readonly number[], labels: readonly number[], e: Economics): GainPoint[] {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  const out: GainPoint[] = [{ threshold: 1.000001, gain: 0, contacted: 0 }];
  let tp = 0;
  let fp = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]!;
    if (labels[i] === 1) tp++;
    else fp++;
    const next = idx[k + 1];
    if (next === undefined || scores[next] !== scores[i]) out.push({ threshold: scores[i]!, gain: netGain({ tp, fp }, e), contacted: tp + fp });
  }
  return out;
}

/** Seuil qui maximise le gain net observé. */
export function bestThreshold(scores: readonly number[], labels: readonly number[], e: Economics): GainPoint {
  return gainByThreshold(scores, labels, e).reduce((best, g) => (g.gain > best.gain ? g : best));
}

/* ───────────────────────── Chaîne complète ───────────────────────── */

export interface ModelRun {
  features: Feature[];
  fit: LogitFit;
  train: Abonne[];
  test: Abonne[];
  testScores: number[];
  testLabels: (0 | 1)[];
  auc: number;
  averagePrecision: number;
  /** AUC du « vrai » modèle générateur sur le même test : le plafond atteignable. */
  aucOracle: number;
  churnRate: number;
}

export function runModel(abonnes: readonly Abonne[], opts: { lambda: number; withLog: boolean }): ModelRun {
  const features = featuresFor(opts.withLog);
  const { train, test } = stratifiedSplit(abonnes, (a) => a.churn, 0.3);
  const row = (a: Abonne) => features.map((f) => f.value(a));
  const fit = fitLogistic(train.map(row), train.map((a) => a.churn), opts.lambda);
  const testScores = test.map((a) => predict(fit, row(a)));
  const testLabels = test.map((a) => a.churn);
  return {
    features,
    fit,
    train,
    test,
    testScores,
    testLabels,
    auc: aucMannWhitney(testScores, testLabels),
    averagePrecision: prCurve(testScores, testLabels).averagePrecision,
    aucOracle: aucMannWhitney(test.map((a) => a.pVraie), testLabels),
    churnRate: abonnes.reduce((s, a) => s + a.churn, 0) / abonnes.length,
  };
}

export interface RiskReason {
  text: string;
  /** Contribution au logit (positive = augmente le risque). */
  weight: number;
}

/** Les k facteurs qui poussent le plus le score d'un abonné vers le haut. */
export function topReasons(run: Pick<ModelRun, 'features' | 'fit'>, a: Abonne, k = 3): RiskReason[] {
  const contrib = contributions(run.fit, run.features.map((f) => f.value(a)));
  // Ancienneté et log(ancienneté) décrivent la même chose : on additionne leurs contributions.
  const merged = new Map<string, RiskReason>();
  run.features.forEach((f, j) => {
    const text = f.describe(a);
    const prev = merged.get(text);
    merged.set(text, { text, weight: (prev?.weight ?? 0) + contrib[j]! });
  });
  return [...merged.values()].filter((r) => r.weight > 0.02).sort((x, y) => y.weight - x.weight).slice(0, k);
}
