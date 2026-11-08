/**
 * Segmentation clients : scores RFM, k-means (k-means++), silhouette et ACP, écrits à la main.
 * Fonctions pures, sans dépendance au DOM : testées dans shared/tests/demo-segmentation-clients.test.ts.
 */
import { mulberry32, type Canal, type ComptoirData, type Segment } from '../sql-lab/data';

/** Date de référence de la récence : la veille du 1er janvier 2026, fin des données. */
export const REFERENCE_DATE = '2025-12-31';
export const K_MIN = 2;
export const K_MAX = 8;
export const KMEANS_SEED = 20251231;
export const KMEANS_RUNS = 10;

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/* ───────────── Statistiques de base ───────────── */

export function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

/** Écart-type de population (division par n). */
export function sd(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
}

/**
 * Scores en quintiles de 1 à 5, par rang. Les ex æquo reçoivent tous le score de la première position
 * de leur groupe : deux clients à 1 commande ont toujours la même note F.
 * `higherIsBetter = false` inverse le sens (récence : moins de jours = meilleur score).
 */
export function quintileScores(values: readonly number[], higherIsBetter = true): number[] {
  const n = values.length;
  const order = values.map((v, i) => ({ v: higherIsBetter ? v : -v, i })).sort((a, b) => a.v - b.v);
  const scores = new Array<number>(n);
  let start = 0;
  while (start < n) {
    let end = start;
    while (end + 1 < n && order[end + 1]!.v === order[start]!.v) end++;
    const score = 1 + Math.floor((5 * start) / n);
    for (let k = start; k <= end; k++) scores[order[k]!.i] = score;
    start = end + 1;
  }
  return scores;
}

/** Centre et réduit chaque colonne : moyenne 0, écart-type 1 (une colonne constante reste à 0). */
export function standardize(rows: readonly number[][]): { z: number[][]; means: number[]; sds: number[] } {
  const d = rows[0]?.length ?? 0;
  const means: number[] = [];
  const sds: number[] = [];
  for (let j = 0; j < d; j++) {
    const col = rows.map((r) => r[j]!);
    means.push(mean(col));
    sds.push(sd(col));
  }
  const z = rows.map((r) => r.map((x, j) => (sds[j]! > 0 ? (x - means[j]!) / sds[j]! : 0)));
  return { z, means, sds };
}

const dist2 = (a: readonly number[], b: readonly number[]) => {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j]! - b[j]!) ** 2;
  return s;
};

/* ───────────── RFM ───────────── */

export type RfmSegment =
  | 'Champions'
  | 'Fidèles'
  | 'Fidèles en devenir'
  | 'Nouveaux'
  | 'Prometteurs'
  | 'À surveiller'
  | 'À réactiver'
  | 'À risque'
  | 'À ne pas perdre'
  | 'En sommeil'
  | 'Perdus';

/** Famille de couleur de chaque segment (une teinte par famille dans la feuille de style). */
export type RfmFamily = 'fidele' | 'nouveau' | 'attention' | 'risque' | 'perdu';

export const RFM_SEGMENTS: { name: RfmSegment; family: RfmFamily; rule: string; action: string }[] = [
  { name: 'Champions', family: 'fidele', rule: 'R 4–5, F 4–5', action: 'Récompenser, solliciter avis et parrainage, avant-premières.' },
  { name: 'Fidèles', family: 'fidele', rule: 'R 3, F 4–5', action: 'Programme de fidélité, ventes croisées sur d’autres catégories.' },
  { name: 'Fidèles en devenir', family: 'fidele', rule: 'R 4–5, F 2–3', action: 'Encourager la commande suivante : recommandations, offre de palier.' },
  { name: 'Nouveaux', family: 'nouveau', rule: 'R 5, F 1', action: 'Parcours de bienvenue, conseils d’usage, suivi de la livraison.' },
  { name: 'Prometteurs', family: 'nouveau', rule: 'R 4, F 1', action: 'Faire découvrir la marque : contenus, nouveautés de leur catégorie.' },
  { name: 'À surveiller', family: 'attention', rule: 'R 3, F 3', action: 'Offre limitée dans le temps, rappel des nouveautés.' },
  { name: 'À réactiver', family: 'attention', rule: 'R 3, F 1–2', action: 'Relance personnalisée sur leur dernier achat.' },
  { name: 'À risque', family: 'risque', rule: 'R 1–2, F 3–4', action: 'Relance individuelle, enquête de satisfaction, geste commercial.' },
  { name: 'À ne pas perdre', family: 'risque', rule: 'R 1–2, F 5', action: 'Contact direct : ce sont d’anciens très bons clients.' },
  { name: 'En sommeil', family: 'perdu', rule: 'R 2, F 1–2', action: 'Campagne de réactivation à faible coût.' },
  { name: 'Perdus', family: 'perdu', rule: 'R 1, F 1–2', action: 'Dernière relance, puis sortie des envois réguliers.' },
];

/** Segment RFM d'une case de la matrice récence × fréquence (scores de 1 à 5). */
export function rfmSegmentOf(r: number, f: number): RfmSegment {
  if (r >= 4 && f >= 4) return 'Champions';
  if (r === 3 && f >= 4) return 'Fidèles';
  if (r >= 4 && f >= 2) return 'Fidèles en devenir';
  if (r === 5) return 'Nouveaux';
  if (r === 4) return 'Prometteurs';
  if (r === 3 && f === 3) return 'À surveiller';
  if (r === 3) return 'À réactiver';
  if (f === 5) return 'À ne pas perdre';
  if (f >= 3) return 'À risque';
  if (r === 2) return 'En sommeil';
  return 'Perdus';
}

export interface ClientRfm {
  id: number;
  nom: string;
  ville: string;
  region: string;
  type: Segment;
  /** Jours entre la dernière commande livrée et la date de référence. */
  recence: number;
  /** Nombre de commandes livrées. */
  frequence: number;
  /** CA livré, en euros. */
  montant: number;
  r: number;
  f: number;
  m: number;
  segment: RfmSegment;
  /** Nombre de commandes livrées par canal. */
  canaux: Record<Canal, number>;
}

/** Profil RFM de chaque client ayant au moins une commande livrée. */
export function computeRfm(data: ComptoirData, reference = REFERENCE_DATE): ClientRfm[] {
  const ref = toTime(reference);
  const prix = new Map(data.produits.map((p) => [p.id, p.prix_unitaire]));
  const montantCommande = new Map<number, number>();
  for (const l of data.lignes) {
    montantCommande.set(l.commande_id, (montantCommande.get(l.commande_id) ?? 0) + l.quantite * prix.get(l.produit_id)! * (1 - l.remise));
  }
  const acc = new Map<number, { last: number; n: number; m: number; canaux: Record<Canal, number> }>();
  for (const c of data.commandes) {
    if (c.statut !== 'livree') continue;
    const t = toTime(c.date_commande);
    let a = acc.get(c.client_id);
    if (!a) {
      a = { last: t, n: 0, m: 0, canaux: { 'Site web': 0, Application: 0, Boutique: 0 } };
      acc.set(c.client_id, a);
    }
    a.last = Math.max(a.last, t);
    a.n += 1;
    a.m += montantCommande.get(c.id) ?? 0;
    a.canaux[c.canal] += 1;
  }
  const base = data.clients
    .filter((c) => acc.has(c.id))
    .map((c) => {
      const a = acc.get(c.id)!;
      return {
        id: c.id,
        nom: `${c.prenom} ${c.nom}`,
        ville: c.ville,
        region: c.region,
        type: c.segment,
        recence: Math.round((ref - a.last) / DAY),
        frequence: a.n,
        montant: Math.round(a.m * 100) / 100,
        canaux: a.canaux,
      };
    });
  const rs = quintileScores(base.map((c) => c.recence), false);
  const fs = quintileScores(base.map((c) => c.frequence));
  const ms = quintileScores(base.map((c) => c.montant));
  return base.map((c, i) => ({ ...c, r: rs[i]!, f: fs[i]!, m: ms[i]!, segment: rfmSegmentOf(rs[i]!, fs[i]!) }));
}

/** Variables du k-means : récence, log(1 + fréquence), log(montant). */
export function featuresOf(clients: readonly ClientRfm[]): number[][] {
  return clients.map((c) => [c.recence, Math.log1p(c.frequence), Math.log(Math.max(c.montant, 1))]);
}
export const FEATURE_LABELS = ['Récence (jours)', 'log(1 + fréquence)', 'log(montant)'] as const;

/* ───────────── k-means ───────────── */

export interface KMeansResult {
  k: number;
  labels: number[];
  centroids: number[][];
  inertia: number;
  iterations: number;
  converged: boolean;
}

/** Initialisation k-means++ : chaque nouveau centre est tiré avec une probabilité proportionnelle à D². */
function initPlusPlus(points: readonly number[][], k: number, rnd: () => number): number[][] {
  const centers: number[][] = [[...points[Math.floor(rnd() * points.length)]!]];
  const d2 = points.map((p) => dist2(p, centers[0]!));
  while (centers.length < k) {
    const total = d2.reduce((s, x) => s + x, 0);
    let idx = 0;
    if (total > 0) {
      let r = rnd() * total;
      for (idx = 0; idx < points.length - 1; idx++) {
        r -= d2[idx]!;
        if (r <= 0) break;
      }
    } else idx = Math.floor(rnd() * points.length);
    const c = [...points[idx]!];
    centers.push(c);
    for (let i = 0; i < points.length; i++) d2[i] = Math.min(d2[i]!, dist2(points[i]!, c));
  }
  return centers;
}

/** Un passage de Lloyd : affectation au centre le plus proche, puis recalcul des centres, jusqu'à stabilité. */
function lloyd(points: readonly number[][], init: number[][], maxIter: number): KMeansResult {
  const k = init.length;
  const d = points[0]!.length;
  let centroids = init.map((c) => [...c]);
  const labels = new Array<number>(points.length).fill(-1);
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIter; iterations++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = dist2(points[i]!, centroids[c]!);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    if (!changed) {
      converged = true;
      break;
    }
    const sums = Array.from({ length: k }, () => new Array<number>(d).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = labels[i]!;
      counts[c]! += 1;
      for (let j = 0; j < d; j++) sums[c]![j]! += points[i]![j]!;
    }
    centroids = centroids.map((old, c) => (counts[c]! > 0 ? sums[c]!.map((s) => s / counts[c]!) : old));
  }
  let inertia = 0;
  for (let i = 0; i < points.length; i++) inertia += dist2(points[i]!, centroids[labels[i]!]!);
  return { k, labels, centroids, inertia, iterations, converged };
}

/** k-means : plusieurs initialisations k-means++ à graine fixe, on garde la plus faible inertie. */
export function kmeans(points: readonly number[][], k: number, opts: { seed?: number; runs?: number; maxIter?: number } = {}): KMeansResult {
  const rnd = mulberry32(opts.seed ?? KMEANS_SEED);
  const runs = opts.runs ?? KMEANS_RUNS;
  let best: KMeansResult | null = null;
  for (let r = 0; r < runs; r++) {
    const res = lloyd(points, initPlusPlus(points, k, rnd), opts.maxIter ?? 200);
    if (!best || res.inertia < best.inertia - 1e-9) best = res;
  }
  return best!;
}

/** Renumérote les groupes par ordre décroissant d'une valeur (ex. montant moyen) : le groupe 1 est toujours le plus fort. */
export function relabelBy(res: KMeansResult, score: (cluster: number) => number): KMeansResult {
  const order = Array.from({ length: res.k }, (_, c) => c).sort((a, b) => score(b) - score(a));
  const map = new Array<number>(res.k);
  order.forEach((old, neu) => (map[old] = neu));
  return { ...res, labels: res.labels.map((l) => map[l]!), centroids: order.map((old) => res.centroids[old]!) };
}

/* ───────────── Silhouette ───────────── */

/** Matrice des distances euclidiennes (triangle stocké en entier, n ≈ 400 : 160 000 cases). */
export function distanceMatrix(points: readonly number[][]): Float64Array {
  const n = points.length;
  const m = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const v = Math.sqrt(dist2(points[i]!, points[j]!));
      m[i * n + j] = v;
      m[j * n + i] = v;
    }
  return m;
}

/**
 * Silhouette moyenne : pour chaque point, s = (b − a) / max(a, b), avec a la distance moyenne à son groupe
 * et b la plus petite distance moyenne à un autre groupe. Un point seul dans son groupe vaut 0.
 */
export function silhouette(dist: Float64Array, labels: readonly number[], k: number): { mean: number; perPoint: number[] } {
  const n = labels.length;
  const counts = new Array<number>(k).fill(0);
  for (const l of labels) counts[l]! += 1;
  const perPoint = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const sums = new Array<number>(k).fill(0);
    for (let j = 0; j < n; j++) if (j !== i) sums[labels[j]!]! += dist[i * n + j]!;
    const own = labels[i]!;
    if (counts[own]! <= 1) {
      perPoint[i] = 0;
      continue;
    }
    const a = sums[own]! / (counts[own]! - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && counts[c]! > 0) b = Math.min(b, sums[c]! / counts[c]!);
    perPoint[i] = b === Infinity ? 0 : (b - a) / Math.max(a, b);
  }
  return { mean: mean(perPoint), perPoint };
}

/* ───────────── ACP ───────────── */

/** Valeurs et vecteurs propres d'une matrice symétrique (méthode de Jacobi), triés par valeur décroissante. */
export function symmetricEigen(matrix: readonly number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  const a = matrix.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p]![q]! ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[y]![y]! - a[x]![x]!);
  return { values: idx.map((i) => a[i]![i]!), vectors: idx.map((i) => v.map((row) => row[i]!)) };
}

export interface PcaResult {
  /** Coordonnées de chaque point sur les deux premières composantes. */
  coords: [number, number][];
  /** Toutes les valeurs propres (variances des composantes), décroissantes. */
  eigenvalues: number[];
  /** Vecteurs propres (une ligne par composante). */
  components: number[][];
  /** Part de la variance totale portée par chaque composante. */
  explained: number[];
  /** Variance totale des données d'entrée (trace de la covariance). */
  totalVariance: number;
}

/** ACP sur des données (déjà standardisées ou non) : covariance de population, puis projection. */
export function pca(rows: readonly number[][]): PcaResult {
  const n = rows.length;
  const d = rows[0]!.length;
  const means = Array.from({ length: d }, (_, j) => mean(rows.map((r) => r[j]!)));
  const centered = rows.map((r) => r.map((x, j) => x - means[j]!));
  const cov = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (const r of centered) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cov[i]![j]! += (r[i]! * r[j]!) / n;
  const { values, vectors } = symmetricEigen(cov);
  // Orientation stable : la plus grande coordonnée de chaque composante est positive.
  const components = vectors.map((vec) => {
    const big = vec.reduce((bi, x, i) => (Math.abs(x) > Math.abs(vec[bi]!) ? i : bi), 0);
    return vec[big]! < 0 ? vec.map((x) => -x) : vec;
  });
  const totalVariance = cov.reduce((s, row, i) => s + row[i]!, 0);
  const coords = centered.map((r) => [0, 1].map((c) => components[c]!.reduce((s, w, j) => s + w * r[j]!, 0)) as [number, number]);
  return { coords, eigenvalues: values, components, explained: values.map((v) => v / totalVariance), totalVariance };
}

/* ───────────── Portraits des groupes ───────────── */

export interface ClusterProfile {
  index: number;
  kind: ClusterKind;
  name: string;
  size: number;
  shareClients: number;
  shareCA: number;
  ca: number;
  medRecence: number;
  medFrequence: number;
  medMontant: number;
  /** Deux régions les plus représentées, avec leur part dans le groupe. */
  regions: { region: string; share: number }[];
  /** Canal le plus utilisé (part des commandes livrées du groupe). */
  canal: { canal: Canal; share: number };
  sharePro: number;
  recommendation: string;
}

const fmtInt = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v).replace(/[  ]/g, ' ');
const fmtNum1 = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v);

export type ClusterKind = 'cles' | 'reguliers' | 'eloignent' | 'reconquerir' | 'occasionnels' | 'petits' | 'recents' | 'inactifs' | 'perdus';

const KIND_NAME: Record<ClusterKind, string> = {
  cles: 'Clients clés',
  reguliers: 'Réguliers',
  eloignent: 'Réguliers qui s’éloignent',
  reconquerir: 'Bons clients à reconquérir',
  occasionnels: 'Occasionnels',
  petits: 'Petits paniers ponctuels',
  recents: 'Récents, encore peu engagés',
  inactifs: 'Inactifs',
  perdus: 'Perdus de vue',
};

/**
 * Type d'un groupe d'après son centre standardisé (z de récence, de log-fréquence et de log-montant) :
 * « valeur » = moyenne des z de fréquence et de montant ; récence en écarts-types (positive = plus ancienne).
 */
export function clusterKind(centroid: readonly number[]): ClusterKind {
  const zR = centroid[0]!;
  const value = (centroid[1]! + centroid[2]!) / 2;
  if (zR > 1) return value >= 0 ? 'reconquerir' : zR > 1.8 ? 'perdus' : 'inactifs';
  if (value > 0.6) return zR > 0.4 ? 'reconquerir' : 'cles';
  if (value > -0.2) return zR > 0.4 ? 'eloignent' : 'reguliers';
  if (value < -1.4) return 'petits';
  return zR < -0.5 ? 'recents' : 'occasionnels';
}

/** Nom et action marketing d'un groupe, appuyés sur ses médianes comparées à celles de toute la clientèle. */
export function describeCluster(
  kind: ClusterKind,
  med: { recence: number; frequence: number; montant: number },
  all: { recence: number; frequence: number; montant: number },
): { name: string; action: string } {
  const cmd = (v: number) => `${fmtNum1(v)} commande${v >= 2 ? 's' : ''}`;
  const facts = `médiane de ${cmd(med.frequence)} pour ${fmtInt(med.montant)} €, dernière il y a ${fmtInt(med.recence)} jours (ensemble : ${cmd(all.frequence)}, ${fmtInt(all.montant)} €, ${fmtInt(all.recence)} jours)`;
  const actions: Record<ClusterKind, string> = {
    cles: `À fidéliser en priorité : avant-premières, parrainage, service dédié plutôt que des remises qui rogneraient la marge.`,
    reguliers: `Développer le panier : ventes croisées vers les catégories qu’ils n’achètent pas encore, offre de palier.`,
    eloignent: `Le rythme ralentit : relance personnalisée sur leurs catégories habituelles avant qu’ils ne décrochent.`,
    reconquerir: `Anciens bons clients devenus silencieux : contact individuel, enquête de satisfaction, geste commercial ciblé.`,
    occasionnels: `Achat ponctuel : contenus d’inspiration et nouveautés de leur catégorie, sans pression commerciale.`,
    petits: `Peu de commandes et de petits montants : produits d’appel et frais de port offerts au-delà d’un seuil pour faire monter le panier.`,
    recents: `Objectif deuxième commande : parcours de bienvenue, recommandations, rappel des services.`,
    inactifs: `Campagne de réactivation à faible coût ; sans réponse, alléger la fréquence des envois.`,
    perdus: `Une dernière relance, puis sortie des envois réguliers : le coût de contact dépasse le potentiel.`,
  };
  return { name: KIND_NAME[kind], action: `${facts[0]!.toUpperCase()}${facts.slice(1)}. ${actions[kind]}` };
}

export function profileClusters(clients: readonly ClientRfm[], res: Pick<KMeansResult, 'labels' | 'centroids' | 'k'>): ClusterProfile[] {
  const { labels, k } = res;
  const all = {
    recence: median(clients.map((c) => c.recence)),
    frequence: median(clients.map((c) => c.frequence)),
    montant: median(clients.map((c) => c.montant)),
  };
  const caTotal = clients.reduce((s, c) => s + c.montant, 0);
  const profiles: ClusterProfile[] = [];
  for (let g = 0; g < k; g++) {
    const members = clients.filter((_, i) => labels[i] === g);
    const med = {
      recence: median(members.map((c) => c.recence)),
      frequence: median(members.map((c) => c.frequence)),
      montant: median(members.map((c) => c.montant)),
    };
    const ca = members.reduce((s, c) => s + c.montant, 0);
    const regionCount = new Map<string, number>();
    for (const c of members) regionCount.set(c.region, (regionCount.get(c.region) ?? 0) + 1);
    const regions = [...regionCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
      .slice(0, 2)
      .map(([region, n]) => ({ region, share: n / members.length }));
    const canaux: Record<Canal, number> = { 'Site web': 0, Application: 0, Boutique: 0 };
    for (const c of members) for (const key of Object.keys(canaux) as Canal[]) canaux[key] += c.canaux[key];
    const nCmd = Object.values(canaux).reduce((s, x) => s + x, 0);
    const top = (Object.keys(canaux) as Canal[]).sort((a, b) => canaux[b] - canaux[a])[0]!;
    const kind = clusterKind(res.centroids[g]!);
    const { name, action } = describeCluster(kind, med, all);
    profiles.push({
      index: g,
      kind,
      name,
      size: members.length,
      shareClients: members.length / clients.length,
      shareCA: caTotal ? ca / caTotal : 0,
      ca,
      medRecence: med.recence,
      medFrequence: med.frequence,
      medMontant: med.montant,
      regions,
      canal: { canal: top, share: nCmd ? canaux[top] / nCmd : 0 },
      sharePro: members.length ? members.filter((c) => c.type === 'Professionnel').length / members.length : 0,
      recommendation: action,
    });
  }
  return profiles;
}

/* ───────────── Analyse complète ───────────── */

export interface Segmentation {
  clients: ClientRfm[];
  z: number[][];
  pca: PcaResult;
  /** Résultat k-means pour chaque k de K_MIN à K_MAX (groupes renumérotés par montant moyen décroissant). */
  byK: Map<number, KMeansResult>;
  /** Inertie pour k = 1 … K_MAX (coude). */
  inertia: { k: number; value: number }[];
  /** Silhouette moyenne pour k = K_MIN … K_MAX. */
  silhouettes: { k: number; value: number }[];
  bestK: number;
}

export function segment(data: ComptoirData): Segmentation {
  const clients = computeRfm(data);
  const { z } = standardize(featuresOf(clients));
  const dist = distanceMatrix(z);
  const byK = new Map<number, KMeansResult>();
  const inertia: { k: number; value: number }[] = [];
  const silhouettes: { k: number; value: number }[] = [];
  // k = 1 : l'inertie est la somme des carrés autour de la moyenne (= n × nombre de variables, données standardisées).
  inertia.push({ k: 1, value: kmeans(z, 1, { runs: 1 }).inertia });
  for (let k = K_MIN; k <= K_MAX; k++) {
    const raw = kmeans(z, k);
    const meanMontant = (c: number) => {
      let s = 0;
      let n = 0;
      raw.labels.forEach((l, i) => {
        if (l === c) {
          s += clients[i]!.montant;
          n++;
        }
      });
      return n ? s / n : 0;
    };
    const res = relabelBy(raw, meanMontant);
    byK.set(k, res);
    inertia.push({ k, value: res.inertia });
    silhouettes.push({ k, value: silhouette(dist, res.labels, k).mean });
  }
  const bestK = silhouettes.reduce((b, s) => (s.value > b.value ? s : b)).k;
  return { clients, z, pca: pca(z), byK, inertia, silhouettes, bestK };
}

/** Projette un centre (espace standardisé) sur le plan de l'ACP. */
export function projectCentroid(p: PcaResult, z: readonly number[][], centroid: readonly number[]): [number, number] {
  const d = centroid.length;
  const means = Array.from({ length: d }, (_, j) => mean(z.map((r) => r[j]!)));
  const c = centroid.map((x, j) => x - means[j]!);
  return [0, 1].map((k) => p.components[k]!.reduce((s, w, j) => s + w * c[j]!, 0)) as [number, number];
}

/** Effectifs de la matrice récence (colonnes) × fréquence (lignes), scores 1 à 5. */
export function rfMatrix(clients: readonly ClientRfm[]): number[][] {
  const m = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
  for (const c of clients) m[c.f - 1]![c.r - 1]! += 1;
  return m;
}
