import { describe, expect, it } from "vitest";
import {
  attributeAll,
  conversionProbability,
  economics,
  N_CHANNELS,
  reallocation,
  removalEffects,
  ruleAttribution,
  shapleyValues,
  simulate,
  SPECS,
  topPaths,
  touchWeights,
  transitionCounts,
} from "../../client/src/demos/attribution-marketing/model";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("Attribution marketing — simulation", () => {
  const sim = simulate("moyen", 6000);

  it("est déterministe et cohérente avec sa vérité terrain", () => {
    const again = simulate("moyen", 6000);
    expect(again.conversions).toBe(sim.conversions);
    expect(again.journeys[4321]).toEqual(sim.journeys[4321]);
    expect(sum(sim.truth.share)).toBeCloseTo(1, 12);
    // Les canaux opportunistes n'ont aucun effet causal.
    SPECS.forEach((s, c) => {
      if (s.opportunist) expect(sim.truth.incremental[c]).toBe(0);
      else expect(sim.truth.incremental[c]).toBeGreaterThan(0);
    });
    // Les conversions observées suivent les probabilités simulées (écart < 4 σ).
    const sd = Math.sqrt(sim.truth.expected);
    expect(Math.abs(sim.conversions - sim.truth.expected)).toBeLessThan(4 * sd);
  });

  it("le niveau d’opportunisme change l’observation, pas le monde causal", () => {
    const fort = simulate("fort", 6000);
    expect(fort.conversions).toBe(sim.conversions);
    expect(fort.truth.share).toEqual(sim.truth.share);
  });
});

describe("Modèles à règles", () => {
  it("chaque règle donne des poids qui somment à 1", () => {
    const days = [9, 4.5, 2, 0.3, 0];
    for (const rule of [
      "dernier",
      "premier",
      "lineaire",
      "decroissance",
      "en-u",
    ] as const) {
      for (const k of [1, 2, 3, 5])
        expect(
          sum(touchWeights(rule, days.slice(0, k), 7)),
          `${rule} k=${k}`,
        ).toBeCloseTo(1, 12);
    }
    expect(touchWeights("en-u", [5, 3, 2, 0])).toEqual([0.4, 0.1, 0.1, 0.4]);
    // Décroissance : un contact plus ancien d'une demi-vie pèse deux fois moins.
    const w = touchWeights("decroissance", [7, 0], 7);
    expect(w[1]! / w[0]!).toBeCloseTo(2, 12);
  });

  it("répartissent exactement 100 % des conversions", () => {
    const sim = simulate("moyen", 4000);
    for (const rule of [
      "dernier",
      "premier",
      "lineaire",
      "decroissance",
      "en-u",
    ] as const) {
      expect(sum(ruleAttribution(sim.journeys, rule, 5))).toBeCloseTo(
        sim.conversions,
        8,
      );
    }
    for (const r of attributeAll(sim, 7)) {
      expect(sum(r.credits), r.id).toBeCloseTo(sim.conversions, 6);
      expect(sum(r.share), r.id).toBeCloseTo(1, 8);
      expect(r.error).toBeGreaterThanOrEqual(0);
      expect(r.error).toBeLessThanOrEqual(100);
    }
  });
});

describe("Chaînes de Markov", () => {
  it("calcule l’effet de retrait d’un graphe simple comme à la main", () => {
    // Canaux A (0) et B (1). Chemins : A→conv, A→B→conv, B→abandon, A→abandon.
    const paths = [
      { touches: [0], converted: true },
      { touches: [0, 1], converted: true },
      { touches: [1], converted: false },
      { touches: [0], converted: false },
    ];
    const counts = transitionCounts(paths, 2);
    // Départ : A 3/4, B 1/4. A : conv 1/3, B 1/3, abandon 1/3. B : conv 1/2, abandon 1/2.
    // P(conv | B) = 1/2 ; P(conv | A) = 1/3 + 1/3 · 1/2 = 1/2 ; P = 3/4 · 1/2 + 1/4 · 1/2 = 1/2.
    expect(conversionProbability(counts, null)).toBeCloseTo(0.5, 12);
    // Sans A : seul le départ vers B subsiste : 1/4 · 1/2 = 1/8 → effet de retrait 1 − (1/8)/(1/2) = 3/4.
    // Sans B : départ → A (3/4) puis A → conv 1/3 : 1/4 → effet 1 − (1/4)/(1/2) = 1/2.
    const re = removalEffects(counts);
    expect(re[0]).toBeCloseTo(0.75, 12);
    expect(re[1]).toBeCloseTo(0.5, 12);
  });

  it("gère les boucles (un canal qui revient sur lui-même)", () => {
    const counts = transitionCounts(
      [
        { touches: [0, 0, 0], converted: true },
        { touches: [0], converted: false },
      ],
      1,
    );
    // A → A 2/4, A → conv 1/4, A → abandon 1/4 : P = (1/4) / (1 − 1/2) = 1/2.
    expect(conversionProbability(counts)).toBeCloseTo(0.5, 12);
  });
});

describe("Valeurs de Shapley", () => {
  it("respectent l’efficience et la symétrie sur un jeu jouet", () => {
    // 3 joueurs : A et B interchangeables, C seul ne vaut rien mais complète A ou B.
    const v = (mask: number) => {
      const a = mask & 1 ? 1 : 0;
      const b = mask & 2 ? 1 : 0;
      const c = mask & 4 ? 1 : 0;
      return 10 * Math.max(a, b) + 6 * c * Math.max(a, b) + 2 * a * b;
    };
    const phi = shapleyValues(v, 3);
    expect(sum(phi)).toBeCloseTo(v(7) - v(0), 12);
    expect(phi[0]).toBeCloseTo(phi[1]!, 12);
    // Joueur nul : un canal qui n'ajoute jamais rien reçoit 0.
    const phiNull = shapleyValues((m) => (m & 1 ? 5 : 0), 3);
    expect(phiNull[1]).toBeCloseTo(0, 12);
    expect(phiNull[2]).toBeCloseTo(0, 12);
    expect(phiNull[0]).toBeCloseTo(5, 12);
  });

  it("tient en un temps raisonnable sur 7 canaux (128 coalitions)", () => {
    const t0 = performance.now();
    const phi = shapleyValues((m) => m % 7, N_CHANNELS);
    expect(phi).toHaveLength(N_CHANNELS);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("Économie des canaux et chemins", () => {
  const sim = simulate("moyen", 5000);
  const models = attributeAll(sim, 7);
  const lastClick = models.find((m) => m.id === "dernier")!;

  it("la réallocation conserve le budget payant total", () => {
    const r = reallocation(lastClick, sim);
    const paidBudget = sum(SPECS.map((s) => s.budget));
    expect(sum(r.map((x) => x.byModel))).toBeCloseTo(paidBudget, 6);
    expect(sum(r.map((x) => x.byTruth))).toBeCloseTo(paidBudget, 6);
    expect(sum(r.map((x) => x.gap))).toBeCloseTo(0, 6);
  });

  it("le dernier clic surévalue les canaux opportunistes", () => {
    const eco = economics(lastClick, sim);
    for (const e of eco)
      if (SPECS[e.channel]!.opportunist) expect(e.deviation).toBeGreaterThan(5);
    // Direct n'a pas de budget : pas de CPA ni de ROAS.
    const direct = eco.find((e) => SPECS[e.channel]!.name === "Direct")!;
    expect(direct.cpa).toBeNull();
    expect(direct.roas).toBeNull();
  });

  it("les chemins les plus fréquents sont triés et fusionnent les répétitions", () => {
    const top = topPaths(sim.journeys, 8);
    expect(top).toHaveLength(8);
    for (let i = 1; i < top.length; i++)
      expect(top[i - 1]!.count).toBeGreaterThanOrEqual(top[i]!.count);
    for (const p of top)
      for (let i = 1; i < p.path.length; i++)
        expect(p.path[i]).not.toBe(p.path[i - 1]);
  });
});
