import { describe, expect, it } from 'vitest';
import {
  analyse,
  DEFAULT_PARAMS,
  diffInDiff,
  invert,
  naiveBeforeAfter,
  permutationPValue,
  projectSimplex,
  regressionCounterfactual,
  simulate,
  syntheticControl,
} from '../../client/src/demos/impact-sans-temoin/model';
import { mulberry32 } from '../../client/src/demos/sql-lab/data';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('Impact sans témoin — projection sur le simplexe', () => {
  it('renvoie un point du simplexe, inchangé s’il y est déjà', () => {
    expect(projectSimplex([0.2, 0.3, 0.5])).toEqual([0.2, 0.3, 0.5].map((x) => expect.closeTo(x, 12)));
    const p = projectSimplex([3, -1, 0.5, 2]);
    expect(sum(p)).toBeCloseTo(1, 12);
    expect(p.every((x) => x >= 0)).toBe(true);
  });

  it('donne la projection euclidienne exacte (cas calculé à la main)', () => {
    // (1, 0) : déjà un sommet. (0,5 ; 0,5 ; 2) : θ = 1 → (0, 0, 1). (2, 1) : θ = 1 → (1, 0).
    expect(projectSimplex([1, 0])).toEqual([1, 0]);
    expect(projectSimplex([0.5, 0.5, 2])).toEqual([0, 0, 1]);
    expect(projectSimplex([2, 1])).toEqual([1, 0]);
    // (1, 1) → (0,5 ; 0,5) par symétrie.
    expect(projectSimplex([1, 1])).toEqual([0.5, 0.5]);
  });

  it('minimise bien la distance : aucun point aléatoire du simplexe n’est plus proche', () => {
    const rnd = mulberry32(7);
    const v = [0.9, -0.3, 0.4, 0.1, 1.2];
    const p = projectSimplex(v);
    const d = (w: number[]) => sum(w.map((x, i) => (x - v[i]!) ** 2));
    for (let k = 0; k < 500; k++) {
      const r = v.map(() => -Math.log(Math.max(rnd(), 1e-12)));
      const s = sum(r);
      expect(d(r.map((x) => x / s))).toBeGreaterThanOrEqual(d(p) - 1e-12);
    }
  });
});

describe('Impact sans témoin — contrôle synthétique', () => {
  it('retrouve des poids exacts quand la traitée est une combinaison convexe de deux contrôles', () => {
    const rnd = mulberry32(42);
    const T = 60, t0 = 40;
    const donors = Array.from({ length: 6 }, (_, j) => Array.from({ length: T }, (_, t) => 50 + 10 * j + 5 * Math.sin(t / (3 + j)) + 8 * rnd()));
    const treated = donors[1]!.map((x, t) => 0.3 * x + 0.7 * donors[4]![t]!);
    const fit = syntheticControl(treated, donors, t0, 20000);
    expect(fit.weights[1]).toBeCloseTo(0.3, 4);
    expect(fit.weights[4]).toBeCloseTo(0.7, 4);
    expect(sum(fit.weights)).toBeCloseTo(1, 10);
    expect(fit.weights.every((w) => w >= 0)).toBe(true);
    expect(fit.rmspePre).toBeLessThan(1e-3);
  });

  it('sur le scénario par défaut, retrouve l’effet vrai bien mieux que l’avant/après et la DiD', () => {
    const s = simulate(DEFAULT_PARAMS);
    const a = analyse(s);
    const by = Object.fromEntries(a.methods.map((m) => [m.id, m.effect]));
    const err = (x: number) => Math.abs(x - a.trueAvgEffect) / a.trueAvgEffect;
    expect(err(by.synth!)).toBeLessThan(0.15);
    expect(err(by.naif!)).toBeGreaterThan(0.25);
    expect(err(by.did!)).toBeGreaterThan(err(by.synth!));
    // Le cumul de l'effet synthétique est la somme des écarts après lancement.
    expect(a.synthCum.at(-1)).toBeCloseTo(sum(a.synth.gap.slice(a.t0)), 8);
    // Les poids les plus lourds sont ceux des vrais donneurs.
    const top = a.synth.weights.map((w, i) => ({ w, i })).sort((x, y) => y.w - x.w).slice(0, 3).map((o) => o.i).sort();
    const real = s.trueWeights.map((w, i) => ({ w, i })).filter((o) => o.w >= 0.2).map((o) => o.i).sort();
    expect(top).toEqual(real);
  });

  it('sans effet vrai, ne crie pas victoire : p-valeur des placebos élevée', () => {
    const a = analyse(simulate({ ...DEFAULT_PARAMS, effect: 0 }));
    expect(a.pValue).toBeGreaterThan(0.2);
    const withEffect = analyse(simulate(DEFAULT_PARAMS));
    expect(withEffect.rank).toBe(1);
    expect(withEffect.pValue).toBeCloseTo(1 / 20, 12);
  });

  it('le choc commun n’existe qu’après le lancement, et les réglages ne changent pas les données de fond', () => {
    const s1 = simulate(DEFAULT_PARAMS);
    const s2 = simulate({ ...DEFAULT_PARAMS, effect: 0.25 });
    expect(s1.shockWeeks.every((w) => w >= s1.params.t0)).toBe(true);
    expect(s2.controls).toEqual(s1.controls);
    expect(s2.counterfactual).toEqual(s1.counterfactual);
    expect(s2.trueEffect.slice(0, s2.params.t0).every((e) => e === 0)).toBe(true);
  });
});

describe('Impact sans témoin — estimateurs simples et inférence', () => {
  it('la différence de différences vaut exactement la formule sur un cas jouet', () => {
    const treated = [10, 12, 11, 20, 22];
    const control = [5, 6, 7, 9, 10];
    // avant : t = 0..2 ; après : t = 3..4.
    const expected = (21 - 11) - (9.5 - 6);
    expect(diffInDiff(treated, control, 3)).toBeCloseTo(expected, 12);
    expect(naiveBeforeAfter(treated, 3)).toBeCloseTo(21 - (12 + 11) / 2, 12);
  });

  it('la p-valeur par placebo vaut rang / (N + 1)', () => {
    expect(permutationPValue(5, [1, 2, 3, 4])).toEqual({ rank: 1, p: 1 / 5 });
    expect(permutationPValue(2.5, [1, 2, 3, 4])).toEqual({ rank: 3, p: 3 / 5 });
    // Ex æquo comptés contre l'unité traitée (test prudent).
    expect(permutationPValue(3, [3, 1, 2, 4])).toEqual({ rank: 3, p: 3 / 5 });
    expect(permutationPValue(0, [1, 2, 3])).toEqual({ rank: 4, p: 1 });
  });

  it('la régression sur les contrôles retrouve une relation linéaire exacte', () => {
    const T = 50, t0 = 35;
    const d1 = Array.from({ length: T }, (_, t) => 100 + t + 10 * Math.sin(t));
    const d2 = Array.from({ length: T }, (_, t) => 80 + 15 * Math.cos(t / 2));
    const treated = d1.map((x, t) => 5 + 0.6 * x + 0.3 * d2[t]!);
    const r = regressionCounterfactual(treated, [d1, d2], t0, 2);
    expect(r.coefs[0]).toBeCloseTo(5, 6);
    expect(r.coefs[1]).toBeCloseTo(0.6, 8);
    expect(r.coefs[2]).toBeCloseTo(0.3, 8);
    expect(Math.abs(r.effect)).toBeLessThan(1e-6);
  });

  it('l’inverse d’une matrice multipliée par elle donne l’identité', () => {
    const m = [[4, 1, 2], [1, 3, 0.5], [2, 0.5, 5]];
    const inv = invert(m);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) expect(m[i]!.reduce((s, x, k) => s + x * inv[k]![j]!, 0)).toBeCloseTo(i === j ? 1 : 0, 12);
  });
});
