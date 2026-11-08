import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../client/src/demos/sql-lab/data';
import {
  aucMannWhitney,
  bestThreshold,
  calibrationDeciles,
  confusion,
  fitLogistic,
  gainCurve,
  netGain,
  prCurve,
  rocCurve,
  runModel,
  sigmoid,
  simulateAbonnes,
  stratifiedSplit,
  theoreticalThreshold,
  topReasons,
  trapezoid,
} from '../../client/src/demos/score-churn/model';

describe('Score de churn — régression logistique', () => {
  it('retrouve les coefficients d’un modèle logistique simulé sans erreur de spécification', () => {
    const rnd = mulberry32(42);
    const normal = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(2 * Math.PI * rnd());
    const truth = [-1.2, 0.8, -0.5, 1.5];
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 30000; i++) {
      // Variables d'échelles différentes, dont une binaire, pour exercer la standardisation et le retour à l'échelle brute.
      const x = [normal() * 3 + 10, normal() * 0.5, rnd() < 0.4 ? 1 : 0];
      const p = sigmoid(truth[0]! + truth[1]! * (x[0]! - 10) / 3 + truth[2]! * x[1]! + truth[3]! * x[2]!);
      X.push(x);
      y.push(rnd() < p ? 1 : 0);
    }
    const fit = fitLogistic(X, y, 0);
    expect(fit.converged).toBe(true);
    // Coefficients bruts attendus : β1 / 3 sur la première variable, constante décalée de −β1·10/3.
    const want = [truth[0]! - (truth[1]! * 10) / 3, truth[1]! / 3, truth[2]!, truth[3]!];
    fit.betaRaw.forEach((b, j) => expect(Math.abs(b - want[j]!), `β${j}`).toBeLessThan(4 * (j === 0 ? 0.12 : fit.seRaw[j - 1]!)));
    // Les écarts-types approchés sont du bon ordre de grandeur.
    for (const se of fit.seRaw) {
      expect(se).toBeGreaterThan(0);
      expect(se).toBeLessThan(0.1);
    }
  });

  it('la pénalité ridge rétrécit les coefficients sans toucher à la constante', () => {
    const ab = simulateAbonnes(2000);
    const X = ab.map((a) => [a.tickets, a.retards, a.usage]);
    const y = ab.map((a) => a.churn);
    const free = fitLogistic(X, y, 0);
    const ridge = fitLogistic(X, y, 5000);
    const norm = (b: number[]) => Math.hypot(...b.slice(1));
    expect(norm(ridge.betaStd)).toBeLessThan(norm(free.betaStd) * 0.5);
    // Avec des coefficients écrasés, la constante tend vers le logit du taux moyen.
    const rate = y.reduce((s, v) => s + v, 0) / y.length;
    expect(ridge.betaStd[0]!).toBeCloseTo(Math.log(rate / (1 - rate)), 1);
  });
});

describe('Score de churn — évaluation', () => {
  it('l’AUC par trapèzes sur la courbe ROC égale la statistique de Mann-Whitney, ex aequo compris', () => {
    const rnd = mulberry32(3);
    const labels = Array.from({ length: 800 }, () => (rnd() < 0.3 ? 1 : 0));
    // Scores arrondis au dixième : beaucoup d'ex aequo.
    const scores = labels.map((y) => Math.round((rnd() + 0.35 * y) * 10) / 10);
    const roc = rocCurve(scores, labels);
    expect(roc[0]).toEqual({ x: 0, y: 0 });
    expect(roc[roc.length - 1]).toEqual({ x: 1, y: 1 });
    expect(trapezoid(roc)).toBeCloseTo(aucMannWhitney(scores, labels), 12);
  });

  it('cas limites de l’AUC : classement parfait, inversé, aléatoire', () => {
    const labels = [0, 0, 1, 1];
    expect(aucMannWhitney([0.1, 0.2, 0.8, 0.9], labels)).toBe(1);
    expect(aucMannWhitney([0.9, 0.8, 0.2, 0.1], labels)).toBe(0);
    expect(aucMannWhitney([0.5, 0.5, 0.5, 0.5], labels)).toBe(0.5);
  });

  it('précision moyenne, calibration et gain cumulé sont cohérents', () => {
    const labels = [1, 1, 0, 1, 0, 0, 0, 0, 0, 0];
    const scores = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1];
    // Rappels 1/3, 2/3, 1 atteints aux rangs 1, 2, 4 : AP = (1 + 1 + 3/4) / 3.
    expect(prCurve(scores, labels).averagePrecision).toBeCloseTo((1 + 1 + 0.75) / 3, 12);
    const deciles = calibrationDeciles(scores, labels, 5);
    expect(deciles.map((d) => d.n)).toEqual([2, 2, 2, 2, 2]);
    expect(deciles[4]!.observed).toBe(1);
    const gain = gainCurve(scores, labels, 10);
    expect(gain[gain.length - 1]).toEqual({ x: 1, y: 1 });
    expect(gain[2]!.y).toBeCloseTo(2 / 3, 12);
  });
});

describe('Score de churn — décision au coût', () => {
  const e = { valeur: 400, coutOffre: 20, succes: 0.25 };

  it('gain net : chaque retenu rapporte s·V, chaque contact coûte c', () => {
    expect(netGain({ tp: 10, fp: 30 }, e)).toBe(10 * 0.25 * 400 - 40 * 20);
    expect(theoreticalThreshold(e)).toBeCloseTo(0.2, 12);
  });

  it('le seuil optimal sur un cas jouet est celui qu’on calcule à la main', () => {
    // Classement : 1, 1, 0, 0, 1, 0, 0, 0. Gain si on contacte les k premiers : s·V = 100 par résilié, 20 par contact.
    const scores = [0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
    const labels = [1, 1, 0, 0, 1, 0, 0, 0];
    // k=1 : 80 ; k=2 : 160 ; k=3 : 140 ; k=4 : 120 ; k=5 : 200 ; k=6 : 180…
    const best = bestThreshold(scores, labels, e);
    expect(best).toEqual({ threshold: 0.6, gain: 200, contacted: 5 });
    expect(confusion(scores, labels, best.threshold)).toEqual({ tp: 3, fp: 2, fn: 0, tn: 3 });
  });
});

describe('Score de churn — données et chaîne complète', () => {
  const ab = simulateAbonnes();

  it('est déterministe et réaliste', () => {
    expect(simulateAbonnes()[1234]).toEqual(ab[1234]);
    const rate = ab.reduce((s, a) => s + a.churn, 0) / ab.length;
    expect(rate).toBeGreaterThan(0.12);
    expect(rate).toBeLessThan(0.25);
  });

  it('le découpage stratifié est une partition qui garde le taux de churn', () => {
    const { train, test } = stratifiedSplit(ab, (a) => a.churn, 0.3);
    expect(train.length + test.length).toBe(ab.length);
    expect(new Set([...train, ...test].map((a) => a.id)).size).toBe(ab.length);
    expect(test.length).toBeCloseTo(ab.length * 0.3, -1);
    const rate = (xs: typeof ab) => xs.reduce((s, a) => s + a.churn, 0) / xs.length;
    expect(Math.abs(rate(train) - rate(test))).toBeLessThan(0.002);
  });

  it('le modèle approche le plafond du vrai modèle, et log(ancienneté) aide', () => {
    const lin = runModel(ab, { lambda: 1, withLog: false });
    const log = runModel(ab, { lambda: 1, withLog: true });
    expect(lin.auc).toBeGreaterThan(0.72);
    expect(log.auc).toBeGreaterThan(lin.auc);
    expect(log.auc).toBeLessThanOrEqual(log.aucOracle + 0.01);
    // Les effets clés sont retrouvés avec le bon signe.
    const coef = (k: string) => log.fit.betaRaw[log.features.findIndex((f) => f.key === k) + 1]!;
    expect(coef('tickets')).toBeGreaterThan(0.2);
    expect(coef('retards')).toBeGreaterThan(0.3);
    expect(coef('biennal')).toBeLessThan(-1);
  });

  it('explique un score par ses facteurs les plus lourds', () => {
    const run = runModel(ab, { lambda: 1, withLog: true });
    const i = run.testScores.indexOf(Math.max(...run.testScores));
    const reasons = topReasons(run, run.test[i]!);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
    for (let k = 1; k < reasons.length; k++) expect(reasons[k - 1]!.weight).toBeGreaterThanOrEqual(reasons[k]!.weight);
  });
});
