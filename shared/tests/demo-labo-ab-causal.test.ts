import { describe, expect, it } from 'vitest';
import {
  betaCdf,
  betaQuantile,
  lgamma,
  mulberry32,
  normCdf,
  normQuantile,
  normSf,
  tCdf,
  tQuantile,
} from '../../client/src/demos/labo-ab-causal/stats';
import {
  bayesBetaBinomial,
  bonferroni,
  holm,
  minimalDetectableEffect,
  parseNumber,
  parsePValues,
  peekingFalsePositiveRate,
  powerTwoProportions,
  probBetaGreater,
  probBetaGreaterIntegral,
  sampleSize,
  simulateDid,
  srmCheck,
  totalSampleSize,
  twoProportionTest,
  welchTest,
} from '../../client/src/demos/labo-ab-causal/model';

/* Valeurs de référence : R 4.x (qnorm, pnorm, qt, pt, pbeta, power.prop.test, prop.test, t.test, chisq.test, p.adjust)
   et la table d'Armitage, McPherson et Rowe (1969) reprise par Jennison et Turnbull (2000, tableau 1.1). */

describe('loi normale', () => {
  it('quantiles (qnorm)', () => {
    expect(normQuantile(0.975)).toBeCloseTo(1.959963984540054, 13);
    expect(normQuantile(0.95)).toBeCloseTo(1.6448536269514722, 13);
    expect(normQuantile(0.8)).toBeCloseTo(0.8416212335729143, 13);
    expect(normQuantile(0.9)).toBeCloseTo(1.2815515655446004, 13);
    expect(normQuantile(0.025)).toBeCloseTo(-1.959963984540054, 13);
    expect(normQuantile(1e-10)).toBeCloseTo(-6.361340902404056, 11);
    expect(normQuantile(0.5)).toBe(0);
    expect(normQuantile(0)).toBe(-Infinity);
    expect(Number.isNaN(normQuantile(1.2))).toBe(true);
  });
  it('fonction de répartition (pnorm)', () => {
    expect(normCdf(1.96)).toBeCloseTo(0.9750021048517795, 14);
    expect(normCdf(1)).toBeCloseTo(0.8413447460685429, 14);
    expect(normCdf(-3)).toBeCloseTo(0.0013498980316301, 14);
    expect(normSf(5) / 2.866515718791939e-7).toBeCloseTo(1, 7);
    expect(normCdf(0)).toBe(0.5);
  });
  it('Φ(Φ⁻¹(p)) = p', () => {
    for (const p of [1e-8, 0.001, 0.05, 0.3, 0.5, 0.77, 0.99, 0.999999]) expect(normCdf(normQuantile(p)) / p).toBeCloseTo(1, 9);
  });
});

describe('Gamma, Beta, Student', () => {
  it('lgamma', () => {
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(lgamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    expect(lgamma(100.5)).toBeCloseTo(361.43554046777757, 9);
  });
  it('pbeta et qbeta', () => {
    expect(betaCdf(0.3, 2, 5)).toBeCloseTo(0.579825, 12);
    expect(betaCdf(0.5, 3, 3)).toBeCloseTo(0.5, 12);
    expect(betaQuantile(0.579825, 2, 5)).toBeCloseTo(0.3, 9);
  });
  it('pt et qt', () => {
    expect(tCdf(2, 5)).toBeCloseTo(0.9490302605850709, 12);
    expect(tCdf(-1.5, 3.7)).toBeCloseTo(1 - tCdf(1.5, 3.7), 12);
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228138851986274, 9);
    expect(tQuantile(0.975, 1)).toBeCloseTo(12.70620473617471, 8);
    expect(tQuantile(0.975, 72.99975532175192)).toBeCloseTo(1.9929972384291588, 9);
  });
});

describe('taille d’échantillon et puissance', () => {
  it('reproduit power.prop.test (exemples de l’aide de R)', () => {
    // power.prop.test(p1 = .50, p2 = .75, power = .90) => n = 76.7 par groupe
    expect(totalSampleSize(0.5, 0.75, 0.05, 0.9, 'two', 0.5) / 2).toBeCloseTo(76.7069, 3);
    // power.prop.test(n = 50, p1 = .50, p2 = .75) => power = 0.740
    expect(powerTwoProportions(0.5, 0.75, 50, 50, 0.05, 'two')).toBeCloseTo(0.7401659, 5);
  });
  it('dimensionne un test e-commerce et arrondit à l’entier supérieur', () => {
    const r = sampleSize({ baseline: 0.04, mde: 0.1, mdeMode: 'relative', alpha: 0.05, power: 0.8, sides: 'two', shareB: 0.5, dailyTraffic: 5000 });
    expect(r.pB).toBeCloseTo(0.044, 12);
    // Formule à la main : ((1.959964·√(2·0.042·0.958) + 0.841621·√(0.04·0.96 + 0.044·0.956)) / 0.004)² = 39 474,76 (scipy)
    expect(r.nTotalExact / 2).toBeCloseTo(39474.7617, 3);
    expect(r.nA).toBe(39475);
    expect(r.nB).toBe(39475);
    expect(r.days).toBe(16);
    expect(powerTwoProportions(r.pA, r.pB, r.nA, r.nB, 0.05, 'two')).toBeGreaterThanOrEqual(0.8);
  });
  it('unilatéral et répartition inégale', () => {
    const one = totalSampleSize(0.1, 0.12, 0.05, 0.8, 'one', 0.5);
    const two = totalSampleSize(0.1, 0.12, 0.05, 0.8, 'two', 0.5);
    expect(one).toBeLessThan(two);
    const skew = totalSampleSize(0.1, 0.12, 0.05, 0.8, 'two', 0.2);
    expect(skew).toBeGreaterThan(two);
    expect(powerTwoProportions(0.1, 0.12, skew * 0.8, skew * 0.2, 0.05, 'two')).toBeCloseTo(0.8, 3);
  });
  it('l’effet minimal détectable inverse le dimensionnement', () => {
    const n = totalSampleSize(0.04, 0.044, 0.05, 0.8, 'two', 0.5);
    expect(minimalDetectableEffect(0.04, n, 0.05, 0.8, 'two', 0.5)).toBeCloseTo(0.004, 5);
  });
});

describe('analyse d’un test', () => {
  it('z de deux proportions = prop.test(correct = FALSE)', () => {
    // prop.test(c(130, 100), c(1000, 1000), correct = FALSE) : X-squared = 4.4215, p-value = 0.03549
    const r = twoProportionTest(1000, 100, 1000, 130, 0.05)!;
    expect(r.z ** 2).toBeCloseTo(4.421518054532056, 9);
    expect(r.pValue).toBeCloseTo(0.03548845046647463, 10);
    expect(r.diff).toBeCloseTo(0.03, 12);
    const se = Math.sqrt((0.1 * 0.9 + 0.13 * 0.87) / 1000);
    expect(r.ciLow).toBeCloseTo(0.03 - 1.959963984540054 * se, 12);
    expect(r.lift).toBeCloseTo(0.3, 12);
    expect(r.liftLow!).toBeLessThan(0.3);
    expect(r.liftHigh!).toBeGreaterThan(0.3);
  });
  it('refuse un test non défini', () => {
    expect(twoProportionTest(1000, 0, 1000, 0, 0.05)).toBeNull();
    expect(twoProportionTest(10, 10, 10, 10, 0.05)).toBeNull();
  });
  it('Welch = t.test(var.equal = FALSE)', () => {
    // moyennes 52,3 (sd 11,2, n 40) et 47,1 (sd 9,8, n 35) : t = 2.14444, ddl = 73.000, p = 0.035327
    const r = welchTest(47.1, 9.8, 35, 52.3, 11.2, 40, 0.05)!;
    expect(r.t).toBeCloseTo(2.1444438569900366, 10);
    expect(r.df).toBeCloseTo(72.99975532175192, 8);
    expect(r.pValue).toBeCloseTo(0.03532661896330343, 9);
    expect(r.ciLow).toBeCloseTo(5.2 - 1.9929972384291588 * r.se, 8);
    expect(welchTest(1, 0, 10, 2, 0, 10, 0.05)).toBeNull();
  });
  it('SRM = chisq.test sur les effectifs', () => {
    // chisq.test(c(5000, 5200)) : X-squared = 3.9216, p = 0.04767
    const r = srmCheck(5000, 5200, 0.5);
    expect(r.chi2).toBeCloseTo(3.9215686274509802, 10);
    expect(r.pValue).toBeCloseTo(0.0476703806561615, 10);
    expect(r.flagged).toBe(false);
    expect(srmCheck(10000, 10600, 0.5).flagged).toBe(true);
    // chisq.test(c(2000, 8000), p = c(.2, .8)) : X-squared = 0
    expect(srmCheck(2000, 8000, 0.8).chi2).toBeCloseTo(0, 12);
  });
  it('Bonferroni et Holm = p.adjust', () => {
    const p = [0.01, 0.04, 0.03, 0.02, 0.05];
    expect(bonferroni(p)).toEqual([0.05, 0.2, 0.15, 0.1, 0.25].map((v) => expect.closeTo(v, 12)));
    expect(holm(p)).toEqual([0.05, 0.09, 0.09, 0.08, 0.09].map((v) => expect.closeTo(v, 12)));
    expect(holm([0.5, 0.9])).toEqual([1, 1]);
  });
  it('regards répétés : table d’Armitage, McPherson et Rowe', () => {
    const table: [number, number][] = [[1, 0.05], [2, 0.083], [3, 0.107], [4, 0.126], [5, 0.142], [10, 0.193], [20, 0.248]];
    for (const [k, ref] of table) expect(Math.abs(peekingFalsePositiveRate(k, 0.05) - ref)).toBeLessThan(0.0015);
  });
});

describe('lecture bayésienne', () => {
  it('cas analytique : Beta(1, 2) contre Beta(2, 1) donne 5/6', () => {
    expect(probBetaGreater(1, 2, 2, 1)).toBeCloseTo(5 / 6, 12);
    expect(probBetaGreater(2, 1, 1, 2)).toBeCloseTo(1 / 6, 12);
    expect(probBetaGreater(1, 1, 1, 1)).toBeCloseTo(0.5, 12);
  });
  it('formule exacte = intégration numérique = simulation', () => {
    const exact = probBetaGreater(121, 1881, 151, 1851);
    expect(probBetaGreaterIntegral(121, 1881, 151, 1851)).toBeCloseTo(exact, 7);
    // 4 millions de tirages (numpy, graine 1) : 0,97048
    expect(Math.abs(exact - 0.97048)).toBeLessThan(0.0015);
    const r = bayesBetaBinomial(2000, 120, 2000, 150);
    expect(r.probBBeatsA).toBeCloseTo(exact, 12);
    expect(r.ciA[0]).toBeLessThan(0.06);
    expect(r.ciA[1]).toBeGreaterThan(0.06);
  });
  it('gros effectifs (sommation sur le plus petit paramètre)', () => {
    const p = probBetaGreater(1 + 4000, 1 + 96000, 1 + 4300, 1 + 95700);
    expect(p).toBeGreaterThan(0.99);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('différence de différences simulée', () => {
  const base = { trend: 0.4, effect: 3, noise: 2, gap: 6, violation: 0 };
  it('est reproductible à graine égale', () => {
    expect(simulateDid({ ...base, seed: 7 })).toEqual(simulateDid({ ...base, seed: 7 }));
    expect(simulateDid({ ...base, seed: 7 }).did).not.toBe(simulateDid({ ...base, seed: 8 }).did);
  });
  it('sans bruit, retrouve exactement l’effet, et les naïfs portent leurs biais', () => {
    const r = simulateDid({ ...base, noise: 0, seed: 1 });
    expect(r.did).toBeCloseTo(3, 10);
    // avant/après naïf = effet + tendance × écart moyen de dates (10 semaines)
    expect(r.naiveBeforeAfter).toBeCloseTo(3 + 0.4 * 10, 10);
  });
  it('est sans biais sous tendances parallèles, biaisée de δ × 10 sinon', () => {
    const mean = (violation: number) => {
      let s = 0;
      for (let seed = 1; seed <= 200; seed++) s += simulateDid({ ...base, violation, seed }).did;
      return s / 200;
    };
    expect(Math.abs(mean(0) - 3)).toBeLessThan(0.05);
    expect(Math.abs(mean(0.3) - (3 + 3))).toBeLessThan(0.05);
    expect(simulateDid({ ...base, violation: 0.3, seed: 1 }).didBias).toBeCloseTo(3, 12);
  });
  it('l’intervalle à 95 % couvre l’effet réel environ 95 fois sur 100', () => {
    let cover = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = simulateDid({ ...base, seed });
      if (r.didLow <= 3 && 3 <= r.didHigh) cover++;
    }
    expect(cover / 400).toBeGreaterThan(0.92);
    expect(cover / 400).toBeLessThan(0.98);
  });
  it('le test de pré-tendances détecte une violation marquée', () => {
    expect(simulateDid({ ...base, violation: 0.6, seed: 3 }).preTrend.pValue).toBeLessThan(0.01);
  });
  it('générateur uniforme dans [0, 1[', () => {
    const u = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = u();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('saisie', () => {
  it('lit les nombres à la française', () => {
    expect(parseNumber('4,5')).toBe(4.5);
    expect(parseNumber(' 5 000 ')).toBe(5000);
    expect(parseNumber('5 000')).toBe(5000);
    expect(parseNumber('12 %')).toBe(12);
    expect(parseNumber('1e-3')).toBe(0.001);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('1,2,3')).toBeNull();
  });
  it('lit une liste de p-valeurs', () => {
    expect(parsePValues('0,01; 0,2\n0.03').values).toEqual([0.01, 0.2, 0.03]);
    expect(parsePValues('0.01, 0.02').values).toEqual([0.01, 0.02]);
    expect(parsePValues('').values).toEqual([]);
    expect(parsePValues('0,5 2').error).toMatch(/« 2 »/);
  });
});
