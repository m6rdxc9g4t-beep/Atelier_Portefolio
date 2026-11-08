import { describe, expect, it } from 'vitest';
import {
  chi2Sf,
  concordance,
  COVARIABLES,
  coxFit,
  covariateRow,
  HORIZON,
  kaplanMeier,
  lifetimeValue,
  logRank,
  meanTrap,
  mulberry32,
  N_ABONNES,
  normCdf,
  predictSurvival,
  restrictedMean,
  simulateAbonnes,
  survivalAt,
  TRUE_BETA,
} from '../../client/src/demos/duree-vie-client/model';

/** Données classiques de Freireich (leucémie, 6-MP contre placebo), référence des logiciels de survie. */
const MP_T = [6, 6, 6, 6, 7, 9, 10, 10, 11, 13, 16, 17, 19, 20, 22, 23, 25, 32, 32, 34, 35];
const MP_E = [1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0].map(Boolean);
const PL_T = [1, 1, 2, 2, 3, 4, 4, 5, 5, 8, 8, 8, 8, 11, 11, 12, 12, 15, 17, 22, 23];
const PL_E = PL_T.map(() => true);

describe('Durée de vie client — lois de probabilité', () => {
  it('normale et χ² aux points connus', () => {
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normCdf(-1)).toBeCloseTo(0.158655, 5);
    expect(chi2Sf(3.841459, 1)).toBeCloseTo(0.05, 6);
    expect(chi2Sf(7.814728, 3)).toBeCloseTo(0.05, 6);
  });
});

describe('Durée de vie client — Kaplan-Meier', () => {
  it('suit un petit exemple calculé à la main, censures comprises', () => {
    const t = [1, 2, 2, 3, 4, 5, 5, 6];
    const e = [1, 1, 0, 1, 0, 1, 1, 0].map(Boolean);
    const km = kaplanMeier(t, e);
    expect(km.steps.map((s) => s.t)).toEqual([0, 1, 2, 3, 5]);
    expect(km.steps.map((s) => s.nRisk)).toEqual([8, 8, 7, 5, 3]);
    [1, 0.875, 0.75, 0.6, 0.2].forEach((v, i) => expect(km.steps[i]!.s).toBeCloseTo(v, 12));
    expect(km.censorTimes).toEqual([2, 4, 6]);
    expect(km.median).toBe(5);
    // Greenwood : S² Σ d / (n (n − d)) = 0,04 × (1/56 + 1/42 + 1/20 + 2/3)
    expect(km.steps[4]!.variance).toBeCloseTo(0.04 * (1 / 56 + 1 / 42 + 1 / 20 + 2 / 3), 12);
    expect(survivalAt(km, 4.5).s).toBeCloseTo(0.6, 12);
    // Aire : 1×1 + 0,875×1 + 0,75×1 + 0,6×2 + 0,2×1 jusqu'à τ = 6
    expect(restrictedMean(km, 6)).toBeCloseTo(1 + 0.875 + 0.75 + 1.2 + 0.2, 12);
  });

  it('retrouve les survies et erreurs-types de Greenwood de référence (6-MP)', () => {
    const km = kaplanMeier(MP_T, MP_E);
    const ref: [number, number, number][] = [
      [6, 0.8571, 0.0764],
      [7, 0.8067, 0.0869],
      [10, 0.7529, 0.0963],
      [13, 0.6902, 0.1068],
      [16, 0.6275, 0.1141],
      [22, 0.5378, 0.1282],
      [23, 0.4482, 0.1346],
    ];
    for (const [t, s, se] of ref) {
      const st = survivalAt(km, t);
      expect(st.s).toBeCloseTo(s, 4);
      expect(Math.sqrt(st.variance)).toBeCloseTo(se, 4);
      expect(st.lo).toBeLessThan(st.s);
      expect(st.hi).toBeGreaterThan(st.s);
    }
    expect(km.median).toBe(23);
  });
});

describe('Durée de vie client — log-rank', () => {
  it('donne la statistique de référence sur 6-MP contre placebo', () => {
    const lr = logRank([...MP_T, ...PL_T], [...MP_E, ...PL_E], [...MP_T.map(() => 0), ...PL_T.map(() => 1)], 2);
    expect(lr.chi2).toBeCloseTo(16.7929, 3);
    expect(lr.df).toBe(1);
    expect(lr.p).toBeCloseTo(4.1688e-5, 8);
    expect(lr.observed).toEqual([9, 21]);
    expect(lr.observed[0]! + lr.observed[1]!).toBeCloseTo(lr.expected[0]! + lr.expected[1]!, 10);
  });

  it('ne voit pas de différence entre deux moitiés d’un même groupe', () => {
    const t = [...PL_T, ...PL_T];
    const lr = logRank(t, t.map(() => true), t.map((_, i) => (i < PL_T.length ? 0 : 1)), 2);
    expect(lr.chi2).toBeCloseTo(0, 10);
  });
});

describe('Durée de vie client — modèle de Cox', () => {
  it('retrouve le coefficient de référence (Breslow) sur 6-MP contre placebo', () => {
    const X = [...MP_T.map(() => [0]), ...PL_T.map(() => [1])];
    const fit = coxFit(X, [...MP_T, ...PL_T], [...MP_E, ...PL_E]);
    expect(fit.beta[0]).toBeCloseTo(1.50919, 4);
    expect(fit.se[0]).toBeCloseTo(0.40956, 4);
  });

  it('retrouve les coefficients simulés à ± 2 erreurs-types (sans effet d’engagement)', () => {
    const data = simulateAbonnes({ engagement: false });
    const fit = coxFit(data.map(covariateRow), data.map((a) => a.duree), data.map((a) => a.resilie));
    COVARIABLES.forEach((c, j) => {
      expect(Math.abs(fit.beta[j]! - TRUE_BETA[c.key]), c.key).toBeLessThan(2 * fit.se[j]!);
    });
  });

  it('la survie prédite vaut 1 au départ et décroît', () => {
    const data = simulateAbonnes();
    const fit = coxFit(data.map(covariateRow), data.map((a) => a.duree), data.map((a) => a.resilie));
    const x = covariateRow({ contrat: 'Mensuel', canal: 'Recherche', remise: false, usage: 3.5, region: 'Nord' });
    expect(predictSurvival(fit, x, 0)).toBe(1);
    expect(predictSurvival(fit, x, 6)).toBeGreaterThan(predictSurvival(fit, x, 24));
  });
});

describe('Durée de vie client — concordance', () => {
  const data = simulateAbonnes({ n: 600, seed: 7 });
  const times = data.map((a) => a.duree);
  const events = data.map((a) => a.resilie);

  it('vaut 1 pour un score parfait', () => {
    // Le risque le plus élevé pour la durée la plus courte (à durée égale, celui qui part avant celui qui reste).
    expect(concordance(times, events, times.map((t, i) => -t + (events[i] ? 1e-9 : 0)))).toBe(1);
  });

  it('vaut 0,5 en moyenne pour un score au hasard', () => {
    const rnd = mulberry32(3);
    const c = Array.from({ length: 20 }, () => concordance(times, events, times.map(() => rnd())));
    const mean = c.reduce((a, b) => a + b, 0) / c.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02);
  });
});

describe('Durée de vie client — simulation et lecture', () => {
  const data = simulateAbonnes();

  it('est déterministe, avec une censure à droite naturelle', () => {
    expect(data).toHaveLength(N_ABONNES);
    expect(simulateAbonnes()[1234]).toEqual(data[1234]);
    const actifs = data.filter((a) => !a.resilie);
    expect(actifs.length / data.length).toBeGreaterThan(0.25);
    expect(actifs.every((a) => a.dureeVraie > a.duree - 1e-9 && a.debut + a.duree <= HORIZON + 0.05)).toBe(true);
  });

  it('montre le piège de la moyenne : ignorer les actifs sous-estime la durée', () => {
    const km = kaplanMeier(data.map((a) => a.duree), data.map((a) => a.resilie));
    const m = meanTrap(data, km);
    expect(m.partisSeuls).toBeLessThan(m.observeesBrutes);
    expect(m.observeesBrutes).toBeLessThan(m.kaplanMeier);
    expect(Math.abs(m.kaplanMeier - m.vraie) / m.vraie).toBeLessThan(0.08);
  });

  it('valeur vie : somme actualisée de la survie', () => {
    expect(lifetimeValue(() => 1, 10, 0, 12)).toBeCloseTo(120, 10);
    expect(lifetimeValue(() => 1, 10, 0.1, 12)).toBeLessThan(120);
    expect(lifetimeValue((k) => (k < 3 ? 1 : 0), 10, 0, 12)).toBeCloseTo(30, 10);
  });
});
