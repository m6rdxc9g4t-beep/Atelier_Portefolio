/**
 * Modèle de la démo « E-commerce en temps réel » : simulation d'une boutique en ligne et surveillance de ses indicateurs.
 *
 * Tout est fait de fonctions pures (aucune dépendance au DOM ni à React) :
 * - générateur pseudo-aléatoire à graine (mulberry32), tirages de Poisson, binomial, catégoriels ;
 * - intensité des sessions λ(t) = base × profil horaire × facteur du jour ;
 * - paniers (lignes, produits, quantités) dont les moments sont calculés exactement ;
 * - prévision du CA cumulé (processus de Poisson composé) avec bande d'incertitude ;
 * - cartes de contrôle EWMA sur résidus standardisés, et ARL par chaîne de Markov (Brook et Evans, 1972) ;
 * - moteur `advance` qui fait avancer l'état minute par minute (il copie l'état reçu : l'appelant n'est jamais modifié).
 *
 * Données entièrement simulées : aucun chiffre ne provient d'une boutique réelle.
 */

/* ───────────────────────── Aléa à graine ───────────────────────── */

/** État d'un générateur mulberry32 (entier 32 bits). Modifié en place par `nextU`. */
export interface Rng {
  s: number;
}

export const makeRng = (seed: number): Rng => ({ s: seed >>> 0 });

/** Uniforme sur [0, 1) (mulberry32). */
export function nextU(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Tirage de Poisson exact : méthode de Knuth par blocs de moyenne ≤ 20 (additivité de la loi de Poisson). */
export function poisson(r: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  let n = 0;
  let rest = lambda;
  while (rest > 0) {
    const l = Math.min(rest, 20);
    rest -= l;
    const limit = Math.exp(-l);
    let p = nextU(r);
    while (p > limit) {
      n += 1;
      p *= nextU(r);
    }
  }
  return n;
}

/** Tirage binomial par somme de Bernoulli (n reste petit ici : quelques dizaines de sessions par minute). */
export function binomial(r: Rng, n: number, p: number): number {
  if (p <= 0 || n <= 0) return 0;
  if (p >= 1) return n;
  let k = 0;
  for (let i = 0; i < n; i++) if (nextU(r) < p) k += 1;
  return k;
}

/** Indice tiré selon des poids positifs (non nécessairement normalisés). */
export function pickIndex(r: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let u = nextU(r) * total;
  for (let i = 0; i < weights.length; i++) {
    u -= weights[i]!;
    if (u < 0) return i;
  }
  return weights.length - 1;
}

/* ───────────────────────── Loi normale ───────────────────────── */

/** Fonction de répartition de N(0, 1) (erfc de W. J. Cody par fraction rationnelle, erreur < 1e-7). */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const y =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? 1 - y / 2 : y / 2;
}

/* ───────────────────────── Boutique simulée ───────────────────────── */

export type ChannelId = 'seo' | 'sea' | 'direct' | 'email' | 'social' | 'affil';
export type CategoryId = 'pap' | 'chaus' | 'maison' | 'beaute' | 'acc';

export interface Channel {
  id: ChannelId;
  label: string;
  /** Part des sessions. */
  share: number;
  /** Taux de conversion d'une session en commande. */
  conv: number;
}

export interface Product {
  id: string;
  label: string;
  price: number;
  /** Poids du produit dans sa catégorie. */
  weight: number;
}

export interface Category {
  id: CategoryId;
  label: string;
  /** Probabilité qu'une ligne de panier soit de cette catégorie. */
  weight: number;
  /** Part des articles retournés. */
  returnRate: number;
  products: Product[];
}

export const CHANNELS: readonly Channel[] = [
  { id: 'seo', label: 'Recherche naturelle', share: 0.33, conv: 0.026 },
  { id: 'sea', label: 'Liens sponsorisés', share: 0.21, conv: 0.031 },
  { id: 'direct', label: 'Accès direct', share: 0.17, conv: 0.036 },
  { id: 'email', label: 'E-mail et CRM', share: 0.1, conv: 0.045 },
  { id: 'social', label: 'Réseaux sociaux', share: 0.14, conv: 0.011 },
  { id: 'affil', label: 'Affiliation', share: 0.05, conv: 0.024 },
];

export const FLAGSHIP_ID = 'sneakers';

export const CATEGORIES: readonly Category[] = [
  {
    id: 'pap',
    label: 'Prêt-à-porter',
    weight: 0.34,
    returnRate: 0.16,
    products: [
      { id: 'tshirt', label: 'T-shirt coton', price: 24.9, weight: 0.35 },
      { id: 'pull', label: 'Pull maille', price: 59, weight: 0.25 },
      { id: 'jean', label: 'Jean droit', price: 69, weight: 0.25 },
      { id: 'veste', label: 'Veste légère', price: 99, weight: 0.15 },
    ],
  },
  {
    id: 'chaus',
    label: 'Chaussures',
    weight: 0.22,
    returnRate: 0.14,
    products: [
      { id: FLAGSHIP_ID, label: 'Sneakers cuir blanc', price: 119, weight: 0.6 },
      { id: 'sandales', label: 'Sandales', price: 49, weight: 0.2 },
      { id: 'bottines', label: 'Bottines', price: 139, weight: 0.2 },
    ],
  },
  {
    id: 'maison',
    label: 'Maison',
    weight: 0.18,
    returnRate: 0.04,
    products: [
      { id: 'bougie', label: 'Bougie parfumée', price: 22, weight: 0.4 },
      { id: 'plaid', label: 'Plaid laine', price: 79, weight: 0.3 },
      { id: 'lampe', label: 'Lampe à poser', price: 89, weight: 0.3 },
    ],
  },
  {
    id: 'beaute',
    label: 'Beauté',
    weight: 0.16,
    returnRate: 0.02,
    products: [
      { id: 'creme', label: 'Crème visage', price: 34, weight: 0.45 },
      { id: 'parfum', label: 'Parfum 30 ml', price: 62, weight: 0.3 },
      { id: 'coffret', label: 'Coffret soin', price: 45, weight: 0.25 },
    ],
  },
  {
    id: 'acc',
    label: 'Accessoires',
    weight: 0.1,
    returnRate: 0.05,
    products: [
      { id: 'bonnet', label: 'Bonnet', price: 19, weight: 0.3 },
      { id: 'cabas', label: 'Sac cabas', price: 75, weight: 0.35 },
      { id: 'ceinture', label: 'Ceinture cuir', price: 39, weight: 0.35 },
    ],
  },
];

/** Sessions par jour en moyenne sur la semaine. */
export const SESSIONS_PER_DAY = 60000;
/** Nombre de lignes d'un panier : 1 + Poisson(LINES_EXTRA). */
export const LINES_EXTRA = 0.3;
/** Loi de la quantité par ligne : P(1), P(2), P(3). */
export const QTY_PROBS: readonly number[] = [0.88, 0.1, 0.02];
/** Plage horaire de traitement des retours (entrepôt), en minutes du jour. */
export const RETURNS_WINDOW: readonly [number, number] = [8 * 60, 20 * 60];

/** Profil horaire des sessions (valeur au milieu de chaque heure), renormalisé à une moyenne de 1. */
const HOURLY_RAW = [
  0.45, 0.28, 0.18, 0.13, 0.12, 0.16, 0.32, 0.58, 0.85, 1.05, 1.15, 1.2, 1.3, 1.32, 1.22, 1.18, 1.2, 1.25, 1.35, 1.45, 1.7,
  1.8, 1.5, 0.95,
];
const meanRaw = HOURLY_RAW.reduce((a, b) => a + b, 0) / 24;
export const HOURLY: readonly number[] = HOURLY_RAW.map((v) => v / meanRaw);

/** Facteur du jour (0 = lundi … 6 = dimanche), renormalisé à une moyenne de 1. */
const WEEKLY_RAW = [1.04, 1.0, 0.99, 0.97, 0.93, 0.9, 1.17];
const meanWeek = WEEKLY_RAW.reduce((a, b) => a + b, 0) / 7;
export const WEEKLY: readonly number[] = WEEKLY_RAW.map((v) => v / meanWeek);

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

/** Profil horaire interpolé linéairement entre les milieux d'heure (fonction continue et périodique sur 24 h). */
export function hourFactor(minuteOfDay: number): number {
  const x = minuteOfDay / 60 - 0.5;
  const i = Math.floor(x);
  const f = x - i;
  const a = HOURLY[((i % 24) + 24) % 24]!;
  const b = HOURLY[(((i + 1) % 24) + 24) % 24]!;
  return a * (1 - f) + b * f;
}

export const dayOfWeek = (absMinute: number) => Math.floor(absMinute / 1440) % 7;

/** Intensité attendue des sessions pendant la minute absolue t (sessions par minute). */
export function sessionRate(absMinute: number): number {
  const mod = ((absMinute % 1440) + 1440) % 1440;
  return (SESSIONS_PER_DAY / 1440) * hourFactor(mod + 0.5) * WEEKLY[dayOfWeek(absMinute)]!;
}

/** Taux de conversion moyen pondéré par la part de chaque canal. */
export const MEAN_CONV = CHANNELS.reduce((s, c) => s + c.share * c.conv, 0);

/** Commandes attendues pendant la minute t (en régime nominal). */
export const orderRate = (absMinute: number) => sessionRate(absMinute) * MEAN_CONV;

/* ───────────────────────── Moments du panier ───────────────────────── */

export interface BasketMoments {
  /** E[V], E[V²] d'une ligne (prix × quantité). */
  lineMean: number;
  lineSq: number;
  /** E[X], Var(X), E[X²] du montant X d'une commande. */
  mean: number;
  variance: number;
  second: number;
  /** Probabilité qu'une commande contienne le produit phare. */
  flagshipShare: number;
}

/**
 * Moments exacts du montant d'une commande X = Σ_{j=1}^{L} V_j, L = 1 + Poisson(μ), V_j iid indépendantes de L.
 * E[X] = E[L]·E[V] ; Var(X) = E[L]·Var(V) + Var(L)·E[V]² (formule de la variance totale), avec Var(L) = μ.
 */
export function basketMoments(
  categories: readonly Category[] = CATEGORIES,
  linesExtra = LINES_EXTRA,
  qty: readonly number[] = QTY_PROBS,
): BasketMoments {
  let ep = 0;
  let ep2 = 0;
  let qFlag = 0;
  const wc = categories.reduce((s, c) => s + c.weight, 0);
  for (const c of categories) {
    const wp = c.products.reduce((s, p) => s + p.weight, 0);
    for (const p of c.products) {
      const w = (c.weight / wc) * (p.weight / wp);
      ep += w * p.price;
      ep2 += w * p.price * p.price;
      if (p.id === FLAGSHIP_ID) qFlag += w;
    }
  }
  const qn = qty.reduce((s, v) => s + v, 0);
  let eq = 0;
  let eq2 = 0;
  qty.forEach((p, i) => {
    eq += ((i + 1) * p) / qn;
    eq2 += ((i + 1) * (i + 1) * p) / qn;
  });
  const lineMean = ep * eq;
  const lineSq = ep2 * eq2;
  const lineVar = lineSq - lineMean * lineMean;
  const el = 1 + linesExtra;
  const mean = el * lineMean;
  const variance = el * lineVar + linesExtra * lineMean * lineMean;
  // P(aucune ligne phare) = E[(1−q)^L] = (1−q)·exp(−μq) (fonction génératrice de la loi de Poisson).
  const flagshipShare = 1 - (1 - qFlag) * Math.exp(-linesExtra * qFlag);
  return { lineMean, lineSq, mean, variance, second: variance + mean * mean, flagshipShare };
}

export const BASKET = basketMoments();

/* ───────────────────────── Incidents ───────────────────────── */

export type IncidentKind = 'payment' | 'traffic' | 'stockout';
export type MonitorId = 'sessions' | 'orders' | 'conversion' | 'aov' | 'flagship';

export interface IncidentDef {
  kind: IncidentKind;
  label: string;
  /** Description courte de ce qui se passe dans la simulation. */
  detail: string;
  /** Durée en minutes simulées. */
  duration: number;
  /** Écarts que l'incident est censé provoquer (indicateur, sens). */
  affects: readonly { monitor: MonitorId; dir: 1 | -1 }[];
}

export const INCIDENTS: readonly IncidentDef[] = [
  {
    kind: 'payment',
    label: 'Panne de paiement',
    detail: '90 % des paiements échouent pendant 40 min.',
    duration: 40,
    affects: [
      { monitor: 'orders', dir: -1 },
      { monitor: 'conversion', dir: -1 },
      { monitor: 'flagship', dir: -1 },
    ],
  },
  {
    kind: 'traffic',
    label: 'Pic de trafic',
    detail: 'Une publication virale amène des visiteurs peu acheteurs, pendant 1 h.',
    duration: 60,
    affects: [
      { monitor: 'sessions', dir: 1 },
      { monitor: 'conversion', dir: -1 },
    ],
  },
  {
    kind: 'stockout',
    label: 'Rupture du produit phare',
    detail: 'Les sneakers cuir blanc sont indisponibles pendant 2 h.',
    duration: 120,
    affects: [
      { monitor: 'flagship', dir: -1 },
      { monitor: 'conversion', dir: -1 },
      { monitor: 'orders', dir: -1 },
      { monitor: 'aov', dir: -1 },
    ],
  },
];

export const incidentDef = (kind: IncidentKind) => INCIDENTS.find((d) => d.kind === kind)!;

export interface Incident {
  id: number;
  kind: IncidentKind;
  /** Minutes absolues : [start, end). */
  start: number;
  end: number;
}

export interface Effects {
  /** Part des paiements qui aboutissent. */
  payment: number;
  /** Sessions supplémentaires (réseaux sociaux, faible intention d'achat) attendues pendant la minute. */
  spikeRate: number;
  flagshipOut: boolean;
}

/** Conversion des visiteurs amenés par un pic viral. */
export const SPIKE_CONV = 0.004;
/** Part des commandes contenant le produit phare qui sont abandonnées pendant une rupture. */
export const STOCKOUT_LOSS = 0.75;

/** Effets cumulés des incidents actifs à la minute t. */
export function effectsAt(incidents: readonly Incident[], absMinute: number): Effects {
  const fx: Effects = { payment: 1, spikeRate: 0, flagshipOut: false };
  for (const inc of incidents) {
    if (absMinute < inc.start || absMinute >= inc.end) continue;
    const tau = absMinute - inc.start + 0.5;
    if (inc.kind === 'payment') fx.payment *= 0.1;
    if (inc.kind === 'traffic') {
      // Montée rapide puis décroissance : τ/τp · e^{1−τ/τp}, maximum 1 à τ = τp.
      const tp = 6;
      const shape = (tau / tp) * Math.exp(1 - tau / tp);
      const social = CHANNELS.find((c) => c.id === 'social')!;
      fx.spikeRate += 5 * shape * sessionRate(absMinute) * social.share;
    }
    if (inc.kind === 'stockout') fx.flagshipOut = true;
  }
  return fx;
}

/* ───────────────────────── Simulation d'une minute ───────────────────────── */

export interface OrderLine {
  productId: string;
  label: string;
  categoryId: CategoryId;
  price: number;
  qty: number;
}

export interface OrderDraft {
  second: number;
  channel: ChannelId;
  lines: OrderLine[];
  total: number;
}

export interface ReturnDraft {
  second: number;
  categoryId: CategoryId;
  productLabel: string;
  amount: number;
}

export interface MinuteOutcome {
  /** Sessions par canal (dans l'ordre de CHANNELS), pic viral compris dans « social ». */
  sessions: number[];
  /** Sessions du pic viral (incluses dans `sessions`). */
  spikeSessions: number;
  orders: OrderDraft[];
  returns: ReturnDraft[];
  /** Commandes perdues à cause d'un incident (paiement ou rupture). */
  lost: number;
}

function drawLine(r: Rng): OrderLine {
  const c = CATEGORIES[pickIndex(r, CATEGORIES.map((x) => x.weight))]!;
  const p = c.products[pickIndex(r, c.products.map((x) => x.weight))]!;
  const qty = 1 + pickIndex(r, QTY_PROBS);
  return { productId: p.id, label: p.label, categoryId: c.id, price: p.price, qty };
}

/** Tire un panier : 1 + Poisson(μ) lignes ; lignes du même produit regroupées. */
export function drawBasket(r: Rng): OrderLine[] {
  const n = 1 + poisson(r, LINES_EXTRA);
  const lines: OrderLine[] = [];
  for (let i = 0; i < n; i++) {
    const l = drawLine(r);
    const same = lines.find((x) => x.productId === l.productId);
    if (same) same.qty += l.qty;
    else lines.push(l);
  }
  return lines;
}

const RETURN_WEIGHTS = CATEGORIES.map((c) => c.weight * c.returnRate);

/** Retours attendus par jour : commandes × lignes par commande × taux de retour moyen par ligne. */
export function returnsPerDay(): number {
  const wc = CATEGORIES.reduce((s, c) => s + c.weight, 0);
  const perLine = RETURN_WEIGHTS.reduce((a, b) => a + b, 0) / wc;
  return SESSIONS_PER_DAY * MEAN_CONV * (1 + LINES_EXTRA) * perLine;
}

const RETURNS_PER_MIN = returnsPerDay() / (RETURNS_WINDOW[1] - RETURNS_WINDOW[0]);

/**
 * Simule une minute : sessions ~ Poisson(λ·part) par canal, commandes ~ Binomiale(sessions, conversion),
 * panier tiré pour chaque commande, effets des incidents, retours ~ Poisson pendant les heures d'entrepôt.
 */
export function simulateMinute(r: Rng, absMinute: number, fx: Effects): MinuteOutcome {
  const lam = sessionRate(absMinute);
  const sessions: number[] = [];
  const orders: OrderDraft[] = [];
  let lost = 0;
  const spikeSessions = poisson(r, fx.spikeRate);
  CHANNELS.forEach((c) => {
    const s = poisson(r, lam * c.share);
    const extra = c.id === 'social' ? spikeSessions : 0;
    sessions.push(s + extra);
    const k = binomial(r, s, c.conv) + binomial(r, extra, SPIKE_CONV);
    for (let i = 0; i < k; i++) {
      let lines = drawBasket(r);
      if (nextU(r) >= fx.payment) {
        lost += 1;
        continue;
      }
      if (fx.flagshipOut && lines.some((l) => l.productId === FLAGSHIP_ID)) {
        if (nextU(r) < STOCKOUT_LOSS) {
          lost += 1;
          continue;
        }
        lines = lines.filter((l) => l.productId !== FLAGSHIP_ID);
        if (lines.length === 0) {
          lost += 1;
          continue;
        }
      }
      const total = Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100;
      orders.push({ second: Math.floor(nextU(r) * 60), channel: c.id, lines, total });
    }
  });
  orders.sort((a, b) => a.second - b.second);
  const returns: ReturnDraft[] = [];
  const mod = ((absMinute % 1440) + 1440) % 1440;
  if (mod >= RETURNS_WINDOW[0] && mod < RETURNS_WINDOW[1]) {
    const n = poisson(r, RETURNS_PER_MIN);
    for (let i = 0; i < n; i++) {
      const c = CATEGORIES[pickIndex(r, RETURN_WEIGHTS)]!;
      const p = c.products[pickIndex(r, c.products.map((x) => x.weight))]!;
      returns.push({ second: Math.floor(nextU(r) * 60), categoryId: c.id, productLabel: p.label, amount: p.price });
    }
    returns.sort((a, b) => a.second - b.second);
  }
  return { sessions, spikeSessions, orders, returns, lost };
}

/* ───────────────────────── Prévision du CA ───────────────────────── */

/** Commandes attendues cumulées depuis minuit, pour chaque minute du jour (tableau de 1441 valeurs, 0 à 1440). */
export function expectedOrdersCum(day: number): number[] {
  const out = [0];
  for (let m = 0; m < 1440; m++) out.push(out[m]! + orderRate(day * 1440 + m));
  return out;
}

export interface Band {
  mean: number;
  lo: number;
  hi: number;
  sd: number;
}

/**
 * CA d'un processus de Poisson composé : N ~ Poisson(Λ) commandes de montants iid X.
 * E[CA] = Λ·E[X] et Var(CA) = Λ·E[X²]. Bande = moyenne ± z·écart-type (z = 1,96 pour 95 %).
 */
export function compoundPoissonBand(lambdaTotal: number, m: BasketMoments = BASKET, z = 1.96): Band {
  const mean = lambdaTotal * m.mean;
  const sd = Math.sqrt(Math.max(0, lambdaTotal) * m.second);
  return { mean, sd, lo: Math.max(0, mean - z * sd), hi: mean + z * sd };
}

/* ───────────────────────── Cartes de contrôle EWMA ───────────────────────── */

export interface EwmaParams {
  lambda: number;
  /** Limite de contrôle, en écarts-types de la statistique EWMA. */
  L: number;
}

export type PresetId = 'reactive' | 'balanced' | 'cautious';

/** Même lissage λ = 0,1 (fenêtre effective d'une vingtaine de minutes) ; seule la limite change, pour isoler le compromis. */
export const PRESETS: Record<PresetId, EwmaParams & { label: string }> = {
  reactive: { label: 'Réactive', lambda: 0.1, L: 2.9 },
  balanced: { label: 'Équilibrée', lambda: 0.1, L: 3.3 },
  cautious: { label: 'Prudente', lambda: 0.1, L: 3.7 },
};

/**
 * Accumulateur EWMA sur résidus bruts r_t = x_t − μ_t, standardisé par sa variance exacte sous H0 :
 *   A_t = (1−λ)A_{t−1} + λ r_t,   V_t = (1−λ)²V_{t−1} + λ² v_t,   Z_t = A_t / √V_t.
 * Avec μ et v constants, √V_t tend vers σ√(λ/(2−λ)) : on retrouve la carte EWMA classique.
 * M et Q suivent Σw·μ et Σw²·μ pour mesurer le volume attendu dans la fenêtre effective (M²/Q).
 */
export interface EwmaState {
  A: number;
  V: number;
  M: number;
  Q: number;
}

export const EWMA_ZERO: EwmaState = { A: 0, V: 0, M: 0, Q: 0 };

export interface EwmaInput {
  /** Valeur observée, valeur attendue sous H0, variance sous H0, volume attendu (événements) de la minute. */
  x: number;
  mu: number;
  v: number;
  count: number;
}

export function ewmaStep(s: EwmaState, inp: EwmaInput, lambda: number): EwmaState {
  const k = 1 - lambda;
  return {
    A: k * s.A + lambda * (inp.x - inp.mu),
    V: k * k * s.V + lambda * lambda * inp.v,
    M: k * s.M + lambda * inp.count,
    Q: k * k * s.Q + lambda * lambda * inp.count,
  };
}

export const ewmaZ = (s: EwmaState) => (s.V > 0 ? s.A / Math.sqrt(s.V) : 0);
/** Nombre d'événements attendus dans la fenêtre effective de l'EWMA (M² / Q). */
export const ewmaVolume = (s: EwmaState) => (s.Q > 0 ? (s.M * s.M) / s.Q : 0);
/** En dessous de ce volume attendu, la loi de Z est trop asymétrique : l'indicateur est mis en veille. */
export const MIN_VOLUME = 4;
/** Une alerte se referme quand |Z| repasse sous ce seuil (hystérésis). */
export const CLOSE_Z = 1;

/**
 * ARL d'une carte EWMA (observations iid N(δ, 1), départ à 0), par chaîne de Markov à m états (Brook et Evans, 1972) :
 * ARL = (I − P)⁻¹·1, lu à l'état de départ. Limites en écarts-types asymptotiques de l'EWMA, σ_Z = √(λ/(2−λ)) :
 * signal sous −lower·σ_Z ou au-dessus de +upper·σ_Z. Carte unilatérale (baisse seulement) : upper grand.
 */
export function ewmaArl(lambda: number, lower: number, delta = 0, upper = lower, m = 201): number {
  const sz = Math.sqrt(lambda / (2 - lambda));
  const a = -lower * sz;
  const b = upper * sz;
  const w = (b - a) / m;
  const c = Array.from({ length: m }, (_, j) => a + (j + 0.5) * w);
  const A: number[][] = c.map((ci, i) =>
    c.map((cj, j) => {
      const hi = (cj + w / 2 - (1 - lambda) * ci) / lambda - delta;
      const lo = (cj - w / 2 - (1 - lambda) * ci) / lambda - delta;
      return (i === j ? 1 : 0) - (normCdf(hi) - normCdf(lo));
    }),
  );
  const rhs = new Array<number>(m).fill(1);
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    [A[col], A[piv]] = [A[piv]!, A[col]!];
    [rhs[col], rhs[piv]] = [rhs[piv]!, rhs[col]!];
    const rowC = A[col]!;
    for (let r = col + 1; r < m; r++) {
      const row = A[r]!;
      const f = row[col]! / rowC[col]!;
      if (f === 0) continue;
      for (let k = col; k < m; k++) row[k] = row[k]! - f * rowC[k]!;
      rhs[r] = rhs[r]! - f * rhs[col]!;
    }
  }
  const x = new Array<number>(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let acc = rhs[r]!;
    for (let k = r + 1; k < m; k++) acc -= A[r]![k]! * x[k]!;
    x[r] = acc / A[r]![r]!;
  }
  // État contenant 0.
  const start = Math.min(m - 1, Math.max(0, Math.floor((0 - a) / w)));
  return x[start]!;
}

/** Quantile de N(0, 1) (Acklam, erreur relative < 1,2e-9 après une itération de Newton). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  // Raffinement de Newton.
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/**
 * Test de l'absence de ventes (événement rare) : sous H0, le nombre de ventes depuis la dernière est Poisson(Λ),
 * Λ = somme des intensités attendues depuis cette vente. p = P(aucune vente) = e^{−Λ}, exprimé en z = Φ⁻¹(p) (borné à [−6, 0]).
 */
export function gapZ(lambdaSinceLast: number): number {
  const p = Math.exp(-lambdaSinceLast);
  return Math.max(-6, Math.min(0, normInv(p)));
}

/** Intensité cumulée Λ à partir de laquelle le test de l'absence de ventes signale, pour une limite L : e^{−Λ} = Φ(−L). */
export const gapThreshold = (L: number) => -Math.log(normCdf(-L));

/* ───────────────────────── Moteur de la boutique ───────────────────────── */

export interface MonitorDef {
  id: MonitorId;
  label: string;
  /** « ewma » : carte EWMA ; « gap » : test de l'absence de ventes. */
  method: 'ewma' | 'gap';
  /** « both » : hausse et baisse ; « down » : baisse seulement (une hausse de commandes n'est pas un incident). */
  sides: 'both' | 'down';
}

export const MONITORS: readonly MonitorDef[] = [
  { id: 'sessions', label: 'Sessions', method: 'ewma', sides: 'both' },
  { id: 'orders', label: 'Commandes', method: 'ewma', sides: 'down' },
  { id: 'conversion', label: 'Taux de conversion', method: 'ewma', sides: 'down' },
  { id: 'aov', label: 'Panier moyen', method: 'ewma', sides: 'down' },
  { id: 'flagship', label: 'Ventes du produit phare', method: 'gap', sides: 'down' },
];

/** Ventes du produit phare par jour (en moyenne sur la semaine). */
export const FLAGSHIP_PER_DAY = SESSIONS_PER_DAY * MEAN_CONV * BASKET.flagshipShare;

/**
 * Durée moyenne entre deux fausses alertes, en minutes, pour l'ensemble des indicateurs (approximation normale,
 * indicateurs supposés indépendants) : Σ 1/ARL₀ pour les EWMA, et pour le test d'absence de ventes un taux
 * de ventes × P(écart > seuil) = taux × Φ(−L).
 */
export function falseAlarmEvery(L: number, lambda: number): { perMonitor: Record<MonitorId, number>; overall: number } {
  const two = ewmaArl(lambda, L, 0, L);
  const one = ewmaArl(lambda, L, 0, 12);
  const perMonitor = {} as Record<MonitorId, number>;
  let rate = 0;
  for (const m of MONITORS) {
    const arl = m.method === 'gap' ? 1440 / (FLAGSHIP_PER_DAY * normCdf(-L)) : m.sides === 'both' ? two : one;
    perMonitor[m.id] = arl;
    rate += 1 / arl;
  }
  return { perMonitor, overall: 1 / rate };
}

/** Entrées des cinq cartes de contrôle pour une minute simulée (attendus du modèle nominal, sans connaissance des incidents). */
export function monitorInputs(absMinute: number, out: MinuteOutcome): Record<MonitorId, EwmaInput> {
  const lam = sessionRate(absMinute);
  const muOrders = lam * MEAN_CONV;
  const sessions = out.sessions.reduce((a, b) => a + b, 0);
  const O = out.orders.length;
  // Conversion conditionnelle aux sessions observées de chaque canal (le mélange des canaux est neutralisé).
  let muConv = 0;
  let vConv = 0;
  CHANNELS.forEach((c, i) => {
    const s = out.sessions[i]!;
    muConv += s * c.conv;
    vConv += s * c.conv * (1 - c.conv);
  });
  const revenue = out.orders.reduce((s, o) => s + o.total, 0);
  const flag = out.orders.filter((o) => o.lines.some((l) => l.productId === FLAGSHIP_ID)).length;
  const muFlag = muOrders * BASKET.flagshipShare;
  return {
    sessions: { x: sessions, mu: lam, v: lam, count: lam },
    orders: { x: O, mu: muOrders, v: muOrders, count: muOrders },
    conversion: { x: O, mu: muConv, v: vConv, count: muOrders },
    aov: { x: revenue, mu: O * BASKET.mean, v: O * BASKET.variance, count: muOrders },
    flagship: { x: flag, mu: muFlag, v: muFlag, count: muFlag },
  };
}

export interface DaySeries {
  day: number;
  /** Valeurs par minute écoulée du jour (longueur = minutes simulées). */
  sessions: number[];
  orders: number[];
  revenue: number[];
}

export interface ChannelAgg {
  sessions: number;
  orders: number;
  revenue: number;
}

export interface CategoryAgg {
  units: number;
  revenue: number;
  returns: number;
  refunded: number;
}

export interface FeedEvent {
  kind: 'order' | 'return';
  key: string;
  /** Instant en secondes absolues simulées. */
  t: number;
  ref: string;
  label: string;
  items: number;
  amount: number;
  channel?: ChannelId;
}

export interface MonitorPoint {
  t: number;
  z: number;
  /** Faux quand le volume attendu est trop faible pour juger (veille). */
  active: boolean;
}

export interface MonitorState {
  ewma: EwmaState;
  /** Test d'absence de ventes : intensité attendue cumulée depuis la dernière vente. */
  gap: number;
  /** Entrées brutes des dernières minutes (pour recalculer si la sensibilité change). */
  raw: EwmaInput[];
  history: MonitorPoint[];
  openAlert: number | null;
}

export interface Alert {
  id: number;
  monitor: MonitorId;
  dir: 1 | -1;
  start: number;
  end: number | null;
  peak: number;
  incidentId: number | null;
}

export interface SimState {
  seed: number;
  rng: number;
  /** Minutes absolues entièrement simulées (la prochaine minute à simuler). */
  minute: number;
  today: DaySeries;
  yesterday: DaySeries | null;
  channels: Record<ChannelId, ChannelAgg>;
  categories: Record<CategoryId, CategoryAgg>;
  feed: FeedEvent[];
  monitors: Record<MonitorId, MonitorState>;
  alerts: Alert[];
  incidents: Incident[];
  preset: PresetId;
  nextOrder: number;
  nextReturn: number;
  nextId: number;
}

export const HISTORY_MIN = 180;
const RAW_MIN = 600;
const FEED_MAX = 40;
const ALERTS_MAX = 40;
/** Une alerte est rattachée à un incident si elle commence pendant celui-ci ou dans les 30 min qui suivent. */
export const ATTRIBUTION_TAIL = 30;

const emptyDay = (day: number): DaySeries => ({ day, sessions: [], orders: [], revenue: [] });
const emptyChannels = () =>
  Object.fromEntries(CHANNELS.map((c) => [c.id, { sessions: 0, orders: 0, revenue: 0 }])) as Record<ChannelId, ChannelAgg>;
const emptyCategories = () =>
  Object.fromEntries(CATEGORIES.map((c) => [c.id, { units: 0, revenue: 0, returns: 0, refunded: 0 }])) as Record<
    CategoryId,
    CategoryAgg
  >;
const emptyMonitors = () =>
  Object.fromEntries(
    MONITORS.map((m): [MonitorId, MonitorState] => [m.id, { ewma: EWMA_ZERO, gap: 0, raw: [], history: [], openAlert: null }]),
  ) as Record<
    MonitorId,
    MonitorState
  >;

/** Le visiteur arrive un mardi à 11 h : la veille (lundi) et la matinée sont déjà simulées. */
export const START_MINUTE = 1440 + 11 * 60;
export const DEFAULT_SEED = 20261106;

/** Crée la boutique et simule son passé jusqu'à `startMinute` (sans incident). */
export function createSim(seed = DEFAULT_SEED, preset: PresetId = 'balanced', startMinute = START_MINUTE): SimState {
  const base: SimState = {
    seed,
    rng: seed >>> 0,
    minute: 0,
    today: emptyDay(0),
    yesterday: null,
    channels: emptyChannels(),
    categories: emptyCategories(),
    feed: [],
    monitors: emptyMonitors(),
    alerts: [],
    incidents: [],
    preset,
    nextOrder: 104_210 + (seed % 900),
    nextReturn: 8_120 + (seed % 90),
    nextId: 1,
  };
  const s = advance(base, startMinute);
  // Le journal démarre vide : une fluctuation de la nuit précédente n'est pas une alerte du jour.
  return { ...s, alerts: s.alerts.filter((a) => a.end === null), nextId: s.nextId };
}

function cloneForStep(s: SimState): SimState {
  const monitors = {} as Record<MonitorId, MonitorState>;
  for (const m of MONITORS) {
    const ms = s.monitors[m.id];
    monitors[m.id] = { ewma: ms.ewma, gap: ms.gap, raw: ms.raw.slice(), history: ms.history.slice(), openAlert: ms.openAlert };
  }
  return {
    ...s,
    today: { day: s.today.day, sessions: s.today.sessions.slice(), orders: s.today.orders.slice(), revenue: s.today.revenue.slice() },
    channels: Object.fromEntries(CHANNELS.map((c) => [c.id, { ...s.channels[c.id] }])) as Record<ChannelId, ChannelAgg>,
    categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, { ...s.categories[c.id] }])) as Record<CategoryId, CategoryAgg>,
    feed: s.feed.slice(),
    monitors,
    alerts: s.alerts.map((a) => ({ ...a })),
    incidents: s.incidents.slice(),
  };
}

/** Incident auquel rattacher une alerte (indicateur et sens attendus, début dans la fenêtre). */
export function attributeAlert(incidents: readonly Incident[], monitor: MonitorId, dir: 1 | -1, start: number): number | null {
  for (let i = incidents.length - 1; i >= 0; i--) {
    const inc = incidents[i]!;
    if (start < inc.start || start >= inc.end + ATTRIBUTION_TAIL) continue;
    if (incidentDef(inc.kind).affects.some((a) => a.monitor === monitor && a.dir === dir)) return inc.id;
  }
  return null;
}

/** Fait avancer la boutique de `minutes` minutes simulées. Ne modifie pas l'état reçu. */
export function advance(state: SimState, minutes: number): SimState {
  if (minutes <= 0) return state;
  const s = cloneForStep(state);
  const r: Rng = { s: s.rng };
  const { lambda, L } = PRESETS[s.preset];
  for (let n = 0; n < minutes; n++) {
    const t = s.minute;
    const day = Math.floor(t / 1440);
    if (day !== s.today.day) {
      s.yesterday = s.today;
      s.today = emptyDay(day);
      s.channels = emptyChannels();
      s.categories = emptyCategories();
    }
    const out = simulateMinute(r, t, effectsAt(s.incidents, t));

    // Séries du jour et ventilations.
    const sessions = out.sessions.reduce((a, b) => a + b, 0);
    const revenue = out.orders.reduce((a, o) => a + o.total, 0);
    s.today.sessions.push(sessions);
    s.today.orders.push(out.orders.length);
    s.today.revenue.push(revenue);
    CHANNELS.forEach((c, i) => (s.channels[c.id].sessions += out.sessions[i]!));
    const events: FeedEvent[] = [];
    for (const o of out.orders) {
      const ch = s.channels[o.channel];
      ch.orders += 1;
      ch.revenue += o.total;
      for (const l of o.lines) {
        const cat = s.categories[l.categoryId];
        cat.units += l.qty;
        cat.revenue += l.price * l.qty;
      }
      const items = o.lines.reduce((a, l) => a + l.qty, 0);
      const first = o.lines[0]!;
      const others = items - first.qty;
      const label = `${first.qty > 1 ? `${first.qty} × ` : ''}${first.label}${others > 0 ? ` + ${others} article${others > 1 ? 's' : ''}` : ''}`;
      const ref = `C-${s.nextOrder++}`;
      events.push({ kind: 'order', key: ref, t: t * 60 + o.second, ref, label, items, amount: o.total, channel: o.channel });
    }
    for (const ret of out.returns) {
      const cat = s.categories[ret.categoryId];
      cat.returns += 1;
      cat.refunded += ret.amount;
      const ref = `R-${s.nextReturn++}`;
      events.push({ kind: 'return', key: ref, t: t * 60 + ret.second, ref, label: ret.productLabel, items: 1, amount: -ret.amount });
    }
    events.sort((a, b) => a.t - b.t);
    if (events.length) s.feed = [...events.reverse(), ...s.feed].slice(0, FEED_MAX);

    // Cartes de contrôle.
    const inputs = monitorInputs(t, out);
    for (const m of MONITORS) {
      const ms = s.monitors[m.id];
      const inp = inputs[m.id];
      ms.raw.push(inp);
      if (ms.raw.length > RAW_MIN) ms.raw.shift();
      let z: number;
      let active: boolean;
      if (m.method === 'gap') {
        ms.gap = inp.x > 0 ? 0 : ms.gap + inp.mu;
        z = gapZ(ms.gap);
        active = true;
      } else {
        ms.ewma = ewmaStep(ms.ewma, inp, lambda);
        z = ewmaZ(ms.ewma);
        active = ewmaVolume(ms.ewma) >= MIN_VOLUME;
      }
      ms.history.push({ t, z, active });
      if (ms.history.length > HISTORY_MIN) ms.history.shift();
      const beyond = m.sides === 'both' ? Math.abs(z) > L : z < -L;
      const open = ms.openAlert === null ? undefined : s.alerts.find((a) => a.id === ms.openAlert);
      if (open) {
        if (Math.abs(z) > Math.abs(open.peak) && Math.sign(z) === open.dir) open.peak = z;
        if (Math.abs(z) < CLOSE_Z || Math.sign(z) !== open.dir) {
          open.end = t;
          ms.openAlert = null;
        }
      } else if (active && beyond) {
        const dir: 1 | -1 = z > 0 ? 1 : -1;
        const alert: Alert = { id: s.nextId++, monitor: m.id, dir, start: t, end: null, peak: z, incidentId: attributeAlert(s.incidents, m.id, dir, t) };
        s.alerts = [alert, ...s.alerts].slice(0, ALERTS_MAX);
        ms.openAlert = alert.id;
      } else if (ms.openAlert !== null) {
        ms.openAlert = null; // alerte sortie du journal
      }
    }
    s.minute = t + 1;
  }
  s.rng = r.s;
  return s;
}

/** Déclenche un incident à partir de la prochaine minute simulée. Refusé si un incident du même type est en cours. */
export function injectIncident(state: SimState, kind: IncidentKind): SimState {
  if (activeIncident(state, kind)) return state;
  const def = incidentDef(kind);
  const inc: Incident = { id: state.nextId, kind, start: state.minute, end: state.minute + def.duration };
  return { ...state, incidents: [...state.incidents, inc], nextId: state.nextId + 1 };
}

export const activeIncident = (state: SimState, kind?: IncidentKind) =>
  state.incidents.find((i) => (kind === undefined || i.kind === kind) && state.minute >= i.start && state.minute < i.end);

/** Change la sensibilité : les cartes sont recalculées sur les dernières minutes conservées. */
export function setPreset(state: SimState, preset: PresetId): SimState {
  if (preset === state.preset) return state;
  const { lambda } = PRESETS[preset];
  const monitors = {} as Record<MonitorId, MonitorState>;
  for (const m of MONITORS) {
    const ms = state.monitors[m.id];
    if (m.method === 'gap') {
      monitors[m.id] = ms;
      continue;
    }
    let e = EWMA_ZERO;
    const history: MonitorPoint[] = [];
    const t0 = state.minute - ms.raw.length;
    ms.raw.forEach((inp, i) => {
      e = ewmaStep(e, inp, lambda);
      if (i >= ms.raw.length - HISTORY_MIN) history.push({ t: t0 + i, z: ewmaZ(e), active: ewmaVolume(e) >= MIN_VOLUME });
    });
    monitors[m.id] = { ewma: e, gap: ms.gap, raw: ms.raw, history, openAlert: ms.openAlert };
  }
  return { ...state, preset, monitors };
}

/** Premier écart détecté et rattaché à chaque incident : délai de détection en minutes (null si pas encore détecté). */
export function detectionDelay(state: SimState, incidentId: number): { alert: Alert; delay: number } | null {
  const inc = state.incidents.find((i) => i.id === incidentId);
  if (!inc) return null;
  const linked = state.alerts.filter((a) => a.incidentId === incidentId).sort((a, b) => a.start - b.start);
  const first = linked[0];
  return first ? { alert: first, delay: first.start - inc.start } : null;
}

/* ───────────────────────── Indicateurs ───────────────────────── */

export interface Kpis {
  revenue: number;
  orders: number;
  sessions: number;
  aov: number | null;
  conversion: number | null;
}

/** Indicateurs cumulés d'une journée jusqu'à `minutes` minutes écoulées. */
export function kpisAt(day: DaySeries, minutes: number): Kpis {
  const n = Math.min(minutes, day.sessions.length);
  let revenue = 0;
  let orders = 0;
  let sessions = 0;
  for (let i = 0; i < n; i++) {
    revenue += day.revenue[i]!;
    orders += day.orders[i]!;
    sessions += day.sessions[i]!;
  }
  return {
    revenue,
    orders,
    sessions,
    aov: orders > 0 ? revenue / orders : null,
    conversion: sessions > 0 ? orders / sessions : null,
  };
}

/** Variation relative (null si la base est nulle ou absente). */
export const relChange = (now: number | null, before: number | null) =>
  now === null || before === null || before === 0 ? null : now / before - 1;

/** Cumul d'une série par minute (tableau de longueur n + 1, commençant à 0). */
export function cumulative(values: readonly number[]): number[] {
  const out = [0];
  for (const v of values) out.push(out[out.length - 1]! + v);
  return out;
}

/** Projection du CA de fin de journée sachant le CA observé à la minute `m` (processus de Poisson composé sur le reste du jour). */
export function landing(observed: number, expCum: readonly number[], m: number, z = 1.96): Band {
  const rest = expCum[1440]! - expCum[Math.min(1440, m)]!;
  const b = compoundPoissonBand(rest, BASKET, z);
  return { mean: observed + b.mean, sd: b.sd, lo: observed + b.mean - z * b.sd, hi: observed + b.hi };
}
