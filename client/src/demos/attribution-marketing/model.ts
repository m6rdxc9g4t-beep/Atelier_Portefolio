/**
 * Attribution marketing : parcours simulés avec une vérité causale connue, puis sept façons
 * d'attribuer les conversions aux canaux. Toutes les fonctions sont pures (testées dans shared/tests).
 */

export const CHANNELS = [
  "Recherche payante",
  "Réseaux sociaux",
  "E-mail",
  "Affiliation",
  "Display",
  "Direct",
  "SEO",
] as const;
export type ChannelName = (typeof CHANNELS)[number];
export const N_CHANNELS = CHANNELS.length;

export interface ChannelSpec {
  name: ChannelName;
  /** Poids d'exposition avant la décision d'achat. */
  exposure: number;
  /** Effet causal vrai : hausse des log-odds de conversion si le parcours contient le canal avant la décision. */
  beta: number;
  /** Budget de la période, en euros (0 pour un canal non payant). */
  budget: number;
  /** Canal qui se glisse souvent juste avant l'achat sans le provoquer. */
  opportunist: boolean;
}

export const SPECS: ChannelSpec[] = [
  {
    name: "Recherche payante",
    exposure: 0.2,
    beta: 0.55,
    budget: 42_000,
    opportunist: false,
  },
  {
    name: "Réseaux sociaux",
    exposure: 0.22,
    beta: 0.28,
    budget: 30_000,
    opportunist: false,
  },
  {
    name: "E-mail",
    exposure: 0.12,
    beta: 0.45,
    budget: 6_000,
    opportunist: false,
  },
  {
    name: "Affiliation",
    exposure: 0.04,
    beta: 0,
    budget: 18_000,
    opportunist: true,
  },
  {
    name: "Display",
    exposure: 0.22,
    beta: 0.12,
    budget: 24_000,
    opportunist: false,
  },
  { name: "Direct", exposure: 0.06, beta: 0, budget: 0, opportunist: true },
  { name: "SEO", exposure: 0.14, beta: 0.4, budget: 9_000, opportunist: false },
];

export const PANIER_MOYEN = 85;
export const N_PARCOURS = 20_000;
export const SEED = 20251109;
const ALPHA = -3.3;
const INTENT_W = 0.9;
const DIRECT = CHANNELS.indexOf("Direct");
const AFFILIATION = CHANNELS.indexOf("Affiliation");
const RECHERCHE = CHANNELS.indexOf("Recherche payante");
const SEO = CHANNELS.indexOf("SEO");

export type Opportunism = "faible" | "moyen" | "fort";
/** Probabilité qu'un acheteur passe par Direct, sinon par Affiliation, juste avant de payer. */
const OPP: Record<Opportunism, { direct: number; affiliation: number }> = {
  faible: { direct: 0.15, affiliation: 0.08 },
  moyen: { direct: 0.4, affiliation: 0.2 },
  fort: { direct: 0.6, affiliation: 0.3 },
};

export interface Journey {
  /** Canaux observés, dans l'ordre (index dans CHANNELS). */
  touches: number[];
  /** Jours entre chaque contact et la conversion (ou la fin du parcours). */
  daysBefore: number[];
  converted: boolean;
}

export interface Truth {
  /** Conversions attendues dues à chaque canal : somme sur les parcours de p(tout) − p(sans ce canal). */
  incremental: number[];
  /** Part de chaque canal dans l'effet causal (somme 1). */
  share: number[];
  /** Conversions attendues au total, et sans aucun canal causal. */
  expected: number;
  baseline: number;
}

export interface Simulation {
  journeys: Journey[];
  conversions: number;
  truth: Truth;
}

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
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Simule les parcours. La décision d'achat dépend de l'intention et des canaux causaux ; les opportunistes s'ajoutent après. */
export function simulate(
  opportunism: Opportunism = "moyen",
  n = N_PARCOURS,
  seed = SEED,
): Simulation {
  const rnd = mulberry32(seed);
  const gauss = () =>
    Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const expo = (mean: number) => -Math.log(1 - rnd()) * mean;
  const cum: number[] = [];
  let acc = 0;
  for (const s of SPECS) cum.push((acc += s.exposure));
  const drawChannel = () => {
    const r = rnd() * acc;
    const i = cum.findIndex((c) => r <= c);
    return i < 0 ? N_CHANNELS - 1 : i;
  };
  const opp = OPP[opportunism];

  const journeys: Journey[] = [];
  const incremental = new Array<number>(N_CHANNELS).fill(0);
  let expected = 0;
  let baseline = 0;
  let conversions = 0;

  for (let i = 0; i < n; i++) {
    const intent = gauss();
    let k = 1;
    while (k < 8 && rnd() < 0.55) k++;
    const pre: number[] = [];
    for (let j = 0; j < k; j++) pre.push(drawChannel());
    // Les plus décidés cherchent davantage : un contact de recherche de plus.
    if (intent > 1 && rnd() < 0.5) pre.push(rnd() < 0.55 ? RECHERCHE : SEO);

    const exposed = new Set(pre.filter((c) => SPECS[c]!.beta > 0));
    const base = ALPHA + INTENT_W * intent;
    let lin = base;
    for (const c of exposed) lin += SPECS[c]!.beta;
    const p = sigmoid(lin);
    expected += p;
    baseline += sigmoid(base);
    for (const c of exposed)
      incremental[c]! += p - sigmoid(lin - SPECS[c]!.beta);

    const converted = rnd() < p;
    // Dates : le dernier contact précède la décision de 0 à quelques jours, les précédents s'étalent avant.
    const days: number[] = new Array<number>(pre.length);
    let d = 0.1 + expo(1.2);
    for (let j = pre.length - 1; j >= 0; j--) {
      days[j] = d;
      d += expo(2.5);
    }
    const touches = [...pre];
    if (converted) {
      conversions++;
      const r = rnd();
      if (r < opp.direct) {
        touches.push(DIRECT);
        days.push(0);
      } else if (r < opp.direct + opp.affiliation) {
        touches.push(AFFILIATION);
        days.push(0);
      }
    } else {
      const r = rnd();
      if (r < 0.06) {
        touches.push(DIRECT);
        days.push(0);
      } else if (r < 0.09) {
        touches.push(AFFILIATION);
        days.push(0);
      }
    }
    journeys.push({ touches, daysBefore: days, converted });
  }

  const totalInc = incremental.reduce((a, b) => a + b, 0);
  return {
    journeys,
    conversions,
    truth: {
      incremental,
      share: incremental.map((v) => v / totalInc),
      expected,
      baseline,
    },
  };
}

/* ───────────────────────── Modèles heuristiques ───────────────────────── */

export type ModelId =
  | "dernier"
  | "premier"
  | "lineaire"
  | "decroissance"
  | "en-u"
  | "markov"
  | "shapley";
export const MODELS: {
  id: ModelId;
  label: string;
  short: string;
  family: "Règle" | "Données";
}[] = [
  {
    id: "dernier",
    label: "Dernier clic",
    short: "Dernier clic",
    family: "Règle",
  },
  {
    id: "premier",
    label: "Premier clic",
    short: "Premier clic",
    family: "Règle",
  },
  { id: "lineaire", label: "Linéaire", short: "Linéaire", family: "Règle" },
  {
    id: "decroissance",
    label: "Décroissance temporelle",
    short: "Décroissance",
    family: "Règle",
  },
  { id: "en-u", label: "En U (40/20/40)", short: "En U", family: "Règle" },
  {
    id: "markov",
    label: "Chaînes de Markov",
    short: "Markov",
    family: "Données",
  },
  {
    id: "shapley",
    label: "Valeurs de Shapley",
    short: "Shapley",
    family: "Données",
  },
];

/** Poids de chaque contact d'un parcours converti selon une règle ; la somme vaut toujours 1. */
export function touchWeights(
  rule: Exclude<ModelId, "markov" | "shapley">,
  daysBefore: number[],
  halfLife = 7,
): number[] {
  const k = daysBefore.length;
  if (k === 0) return [];
  switch (rule) {
    case "dernier":
      return daysBefore.map((_, i) => (i === k - 1 ? 1 : 0));
    case "premier":
      return daysBefore.map((_, i) => (i === 0 ? 1 : 0));
    case "lineaire":
      return daysBefore.map(() => 1 / k);
    case "decroissance": {
      const raw = daysBefore.map((d) => Math.pow(2, -d / halfLife));
      const s = raw.reduce((a, b) => a + b, 0);
      return raw.map((w) => w / s);
    }
    case "en-u": {
      if (k === 1) return [1];
      if (k === 2) return [0.5, 0.5];
      return daysBefore.map((_, i) =>
        i === 0 || i === k - 1 ? 0.4 : 0.2 / (k - 2),
      );
    }
  }
}

/** Conversions attribuées à chaque canal par une règle. */
export function ruleAttribution(
  journeys: Journey[],
  rule: Exclude<ModelId, "markov" | "shapley">,
  halfLife = 7,
): number[] {
  const out = new Array<number>(N_CHANNELS).fill(0);
  for (const j of journeys) {
    if (!j.converted) continue;
    const w = touchWeights(rule, j.daysBefore, halfLife);
    j.touches.forEach((c, i) => (out[c]! += w[i]!));
  }
  return out;
}

/* ───────────────────────── Chaînes de Markov ───────────────────────── */

/** Résout A x = b (élimination de Gauss avec pivot partiel). */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const p = M[col]![col]!;
    if (Math.abs(p) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / p;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/**
 * Graphe de transition : état 0 = départ, 1..m = canaux, puis deux états absorbants (conversion, abandon).
 * `counts[s][t]` compte les passages de s vers t, avec t dans 1..m, m+1 (conversion), m+2 (abandon).
 */
export function transitionCounts(
  paths: { touches: number[]; converted: boolean }[],
  m = N_CHANNELS,
): number[][] {
  const counts = Array.from({ length: m + 1 }, () =>
    new Array<number>(m + 3).fill(0),
  );
  for (const p of paths) {
    let s = 0;
    for (const c of p.touches) {
      counts[s]![c + 1]!++;
      s = c + 1;
    }
    counts[s]![p.converted ? m + 1 : m + 2]!++;
  }
  return counts;
}

/** Probabilité d'atteindre la conversion depuis le départ ; `removed` = canal retiré (ses passages mènent à l'abandon). */
export function conversionProbability(
  counts: number[][],
  removed: number | null = null,
): number {
  const m = counts.length - 1;
  const states = Array.from({ length: m + 1 }, (_, s) => s).filter(
    (s) => removed === null || s !== removed + 1,
  );
  const idx = new Map(states.map((s, i) => [s, i]));
  const A = states.map(() => new Array<number>(states.length).fill(0));
  const b = new Array<number>(states.length).fill(0);
  states.forEach((s, i) => {
    const row = counts[s]!;
    const tot = row.reduce((a, v) => a + v, 0);
    A[i]![i] = 1;
    if (tot === 0) return;
    for (let t = 1; t <= m; t++) {
      const j = idx.get(t);
      if (j !== undefined && row[t]! > 0) A[i]![j]! -= row[t]! / tot;
    }
    b[i] = row[m + 1]! / tot;
  });
  return solveLinear(A, b)[idx.get(0)!]!;
}

/** Effet de retrait de chaque canal : 1 − P(conversion sans le canal) / P(conversion). */
export function removalEffects(counts: number[][]): number[] {
  const m = counts.length - 1;
  const p = conversionProbability(counts);
  return Array.from({ length: m }, (_, c) =>
    p > 0 ? 1 - conversionProbability(counts, c) / p : 0,
  );
}

export function markovAttribution(journeys: Journey[]): number[] {
  const counts = transitionCounts(journeys);
  const re = removalEffects(counts);
  const s = re.reduce((a, b) => a + b, 0);
  const conv = journeys.reduce((a, j) => a + (j.converted ? 1 : 0), 0);
  return re.map((r) => (s > 0 ? (r / s) * conv : 0));
}

/* ───────────────────────── Valeurs de Shapley ───────────────────────── */

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

/** Valeurs de Shapley exactes d'un jeu donné par v(S), S codé en masque de bits sur m joueurs. */
export function shapleyValues(
  v: (mask: number) => number,
  m: number,
): number[] {
  const full = (1 << m) - 1;
  const vals = new Array<number>(1 << m);
  for (let s = 0; s <= full; s++) vals[s] = v(s);
  const popcount = (x: number) => {
    let c = 0;
    while (x) {
      x &= x - 1;
      c++;
    }
    return c;
  };
  const w = Array.from(
    { length: m },
    (_, s) => (factorial(s) * factorial(m - s - 1)) / factorial(m),
  );
  const phi = new Array<number>(m).fill(0);
  for (let c = 0; c < m; c++) {
    const bit = 1 << c;
    for (let s = 0; s <= full; s++) {
      if (s & bit) continue;
      phi[c]! += w[popcount(s)]! * (vals[s | bit]! - vals[s]!);
    }
  }
  return phi;
}

/**
 * Jeu « conversions si seuls les canaux de S existaient » : chaque parcours, réduit aux canaux de S, prend le taux de
 * conversion observé des parcours qui ont exactement cet ensemble de canaux (lissé vers la moyenne, k = 5).
 */
export function coalitionGame(
  journeys: Journey[],
  m = N_CHANNELS,
): (mask: number) => number {
  const size = 1 << m;
  const n = new Array<number>(size).fill(0);
  const conv = new Array<number>(size).fill(0);
  let tot = 0;
  let totConv = 0;
  for (const j of journeys) {
    let mask = 0;
    for (const c of j.touches) mask |= 1 << c;
    n[mask]!++;
    tot++;
    if (j.converted) {
      conv[mask]!++;
      totConv++;
    }
  }
  const mean = tot > 0 ? totConv / tot : 0;
  const rate = n.map((nn, mask) =>
    mask === 0 ? 0 : (conv[mask]! + 5 * mean) / (nn + 5),
  );
  const present = n
    .map((nn, mask) => (nn > 0 ? mask : -1))
    .filter((mask) => mask >= 0);
  return (s: number) =>
    present.reduce((acc, t) => acc + n[t]! * rate[t & s]!, 0);
}

export function shapleyAttribution(journeys: Journey[]): number[] {
  const phi = shapleyValues(coalitionGame(journeys), N_CHANNELS);
  const s = phi.reduce((a, b) => a + b, 0);
  const conv = journeys.reduce((a, j) => a + (j.converted ? 1 : 0), 0);
  return phi.map((p) => (s > 0 ? (p / s) * conv : 0));
}

/* ───────────────────────── Synthèse ───────────────────────── */

export interface ModelResult {
  id: ModelId;
  credits: number[];
  share: number[];
  /** Écart à la vérité : demi-somme des écarts absolus de parts, en points de pourcentage (0 = parfait, 100 = tout faux). */
  error: number;
}

export function attributeAll(sim: Simulation, halfLife = 7): ModelResult[] {
  const conv = sim.conversions;
  return MODELS.map(({ id }) => {
    const credits =
      id === "markov"
        ? markovAttribution(sim.journeys)
        : id === "shapley"
          ? shapleyAttribution(sim.journeys)
          : ruleAttribution(sim.journeys, id, halfLife);
    const share = credits.map((c) => (conv > 0 ? c / conv : 0));
    const error =
      50 * share.reduce((a, s, i) => a + Math.abs(s - sim.truth.share[i]!), 0);
    return { id, credits, share, error };
  });
}

export interface ChannelEconomics {
  channel: number;
  budget: number;
  credited: number;
  cpa: number | null;
  roas: number | null;
  trueIncremental: number;
  trueRoas: number | null;
  /** Part attribuée − part vraie, en points. */
  deviation: number;
}

export function economics(
  model: ModelResult,
  sim: Simulation,
): ChannelEconomics[] {
  return SPECS.map((s, c) => {
    const credited = model.credits[c]!;
    const inc = sim.truth.incremental[c]!;
    return {
      channel: c,
      budget: s.budget,
      credited,
      cpa: s.budget > 0 && credited > 0.5 ? s.budget / credited : null,
      roas: s.budget > 0 ? (credited * PANIER_MOYEN) / s.budget : null,
      trueIncremental: inc,
      trueRoas: s.budget > 0 ? (inc * PANIER_MOYEN) / s.budget : null,
      deviation: 100 * (model.share[c]! - sim.truth.share[c]!),
    };
  });
}

/**
 * Réallocation : budget payant total réparti au prorata des conversions attribuées par le modèle,
 * comparé à une répartition au prorata des conversions réellement causées. Écart en euros par canal.
 */
export function reallocation(
  model: ModelResult,
  sim: Simulation,
): { channel: number; byModel: number; byTruth: number; gap: number }[] {
  const paid = SPECS.map((s, c) => (s.budget > 0 ? c : -1)).filter(
    (c) => c >= 0,
  );
  const total = paid.reduce((a, c) => a + SPECS[c]!.budget, 0);
  const sumModel = paid.reduce((a, c) => a + model.credits[c]!, 0);
  const sumTruth = paid.reduce((a, c) => a + sim.truth.incremental[c]!, 0);
  return paid.map((c) => {
    const byModel = sumModel > 0 ? (total * model.credits[c]!) / sumModel : 0;
    const byTruth =
      sumTruth > 0 ? (total * sim.truth.incremental[c]!) / sumTruth : 0;
    return { channel: c, byModel, byTruth, gap: byModel - byTruth };
  });
}

export interface PathStat {
  path: number[];
  count: number;
  conversions: number;
  rate: number;
}

/** Chemins les plus fréquents (canaux consécutifs identiques fusionnés). */
export function topPaths(journeys: Journey[], limit = 10): PathStat[] {
  const map = new Map<string, PathStat>();
  for (const j of journeys) {
    const path = j.touches.filter((c, i) => i === 0 || c !== j.touches[i - 1]);
    const key = path.join(">");
    let s = map.get(key);
    if (!s) map.set(key, (s = { path, count: 0, conversions: 0, rate: 0 }));
    s.count++;
    if (j.converted) s.conversions++;
  }
  return [...map.values()]
    .map((s) => ({ ...s, rate: s.conversions / s.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
