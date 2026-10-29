import { describe, expect, it } from 'vitest';
import {
  arch1MomentCondition,
  classifyReview,
  contributions,
  defaultInputs,
  fmt,
  gridWeights,
  halfLife,
  interpolate,
  linearPredict,
  moranI,
  normCdf,
  predictProba,
  simulateGarch,
  simulateSelection,
  stepAt,
  unconditionalVariance,
  validateInputs,
  type LogitModel,
} from '../src/index';

const toy: LogitModel = {
  intercept: -2,
  terms: [
    { key: 'age', label: 'Âge', type: 'continuous', coef: -0.03, min: 18, max: 90, default: 40 },
    {
      key: 'type',
      label: 'Type',
      type: 'categorical',
      reference: 'A',
      levels: [
        { value: 'A', label: 'A', coef: 0 },
        { value: 'B', label: 'B', coef: 0.5 },
      ],
    },
  ],
};

describe('logit', () => {
  it('calcule la probabilité attendue', () => {
    const p = predictProba(toy, { age: 40, type: 'B' });
    const xb = -2 - 0.03 * 40 + 0.5;
    expect(p).toBeCloseTo(1 / (1 + Math.exp(-xb)), 12);
  });
  it('contributions nulles au profil de référence', () => {
    const c = contributions(toy, defaultInputs(toy));
    expect(c.every((x) => x.delta === 0)).toBe(true);
  });
  it('valide les entrées', () => {
    expect(validateInputs(toy, { age: 10 })).toHaveLength(1);
    expect(validateInputs(toy, { type: 'Z' })).toHaveLength(1);
    expect(validateInputs(toy, { foo: 1 })).toHaveLength(1);
    expect(validateInputs(toy, { age: 30, type: 'B' })).toHaveLength(0);
  });
});

describe('normale', () => {
  it('Φ(0) = 0,5 et Φ(1,96) ≈ 0,975', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 4);
  });
});

describe('survie', () => {
  it('fonction en escalier', () => {
    const t = [1, 6, 12];
    const s = [0.95, 0.88, 0.84];
    expect(stepAt(t, s, 0)).toBe(1);
    expect(stepAt(t, s, 7)).toBe(0.88);
    expect(stepAt(t, s, 99)).toBe(0.84);
    expect(interpolate([0, 10], [1, 0], 2.5)).toBeCloseTo(0.75);
  });
});

describe('GARCH', () => {
  const p = { omega: 3.387e-5, alpha: 0.18921, beta: 0.75695 };
  it('variance non conditionnelle et demi-vie', () => {
    expect(unconditionalVariance(p)).toBeCloseTo(3.387e-5 / (1 - 0.94616), 10);
    expect(halfLife(p)).toBeGreaterThan(12);
  });
  it('simulation reproductible et cohérente', () => {
    const a = simulateGarch(p, 3000, 1);
    const b = simulateGarch(p, 3000, 1);
    expect(a.returns).toEqual(b.returns);
    const v = a.returns.reduce((s, x) => s + x * x, 0) / a.returns.length;
    expect(v / unconditionalVariance(p)).toBeGreaterThan(0.5);
    expect(v / unconditionalVariance(p)).toBeLessThan(1.6);
  });
  it('conditions des moments ARCH(1)', () => {
    expect(arch1MomentCondition(0.2882, 2)).toBeCloseTo(3 * 0.2882 ** 2, 10);
    expect(arch1MomentCondition(0.2882, 5)).toBeGreaterThan(1);
  });
});

describe('Moran', () => {
  it('positif pour un gradient, négatif pour un damier', () => {
    const W = gridWeights(6, 6, 'rook');
    const gradient = Array.from({ length: 36 }, (_, i) => i % 6);
    const checker = Array.from({ length: 36 }, (_, i) => (Math.floor(i / 6) + (i % 6)) % 2);
    expect(moranI(gradient, W)).toBeGreaterThan(0.5);
    expect(moranI(checker, W)).toBeLessThan(-0.9);
  });
});

describe('sélection de Heckman', () => {
  it('la correction rapproche la pente de la vraie valeur quand ρ est fort', () => {
    const r = simulateSelection({ rho: 0.8, n: 4000, seed: 3 });
    const biasOls = Math.abs(r.olsSelected.slope - r.truth.slope);
    const biasH = Math.abs(r.heckman.slope - r.truth.slope);
    expect(biasH).toBeLessThan(biasOls);
    expect(r.shareSelected).toBeGreaterThan(0.3);
  });
});

describe('modèle linéaire', () => {
  it('prédiction log-log', () => {
    const y = linearPredict(
      { intercept: 1, logOutcome: true, terms: [{ key: 's', label: 's', coef: 0.5, transform: 'log' }] },
      { s: 100 },
    );
    expect(y).toBeCloseTo(Math.exp(1 + 0.5 * Math.log(100)), 8);
  });
});

describe('avis clients', () => {
  it('repère la famille et la polarité', () => {
    const pos = classifyReview('Personnel très aimable et accueil souriant, service rapide !');
    expect(pos.family).toBe('service_personnel');
    expect(pos.polarity).toBe('positif');
    const neg = classifyReview("Le plat était froid et la viande pas bonne, vraiment décevant.");
    expect(neg.family).toBe('nourriture');
    expect(neg.polarity).toBe('négatif');
  });
});

describe('format', () => {
  it('format français', () => {
    expect(fmt(7043)).toMatch(/^7\s043$/u);
    expect(fmt(0.756, 3)).toBe('0,756');
  });
});
