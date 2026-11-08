import { describe, expect, it } from 'vitest';
import { alignDesign, breuschPagan, buildDesign, coefTable, diagnose, jarqueBera, ols, vif } from '../../client/src/demos/labo-regression/model';
import { chi2Sf, fisherSf, normalQuantile, rng, studentCdf, studentQuantile, studentTwoSidedP } from '../../client/src/demos/labo-regression/stats';
import { examples } from '../../client/src/demos/labo-regression/examples';

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const corr = (a: number[], b: number[]) => {
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
};

/** Résout (X'X) β = X'y par élimination de Gauss avec pivot partiel : référence indépendante de la QR. */
function normalEquations(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A = Array.from({ length: k }, (_, i) => [...Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i]! * r[j]!, 0)), X.reduce((s, r, n) => s + r[i]! * y[n]!, 0)]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let j = c; j <= k; j++) A[r]![j]! -= f * A[c]![j]!;
    }
  }
  return A.map((row, i) => row[k]! / row[i]!);
}

describe('Labo de régression — lois de probabilité', () => {
  it('fonction de répartition de Student en des points connus', () => {
    expect(studentCdf(1, 1)).toBeCloseTo(0.75, 10); // Cauchy
    expect(studentCdf(2.228138851986274, 10)).toBeCloseTo(0.975, 9);
    expect(studentCdf(-2.570581835636314, 5)).toBeCloseTo(0.025, 9);
    expect(studentCdf(1.959963984540054, 1e7)).toBeCloseTo(0.975, 6);
    expect(studentCdf(0, 7)).toBe(0.5);
    expect(studentTwoSidedP(2.0859634472658644, 20)).toBeCloseTo(0.05, 9);
  });

  it('quantiles de Student et de la loi normale', () => {
    expect(studentQuantile(0.975, 10)).toBeCloseTo(2.228138851986274, 8);
    expect(studentQuantile(0.995, 3)).toBeCloseTo(5.84090929975, 7);
    expect(studentQuantile(0.025, 30)).toBeCloseTo(-2.042272456301238, 8);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 8);
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232306167813, 7);
  });

  it('lois du khi-deux et de Fisher', () => {
    expect(chi2Sf(3.841458820694124, 1)).toBeCloseTo(0.05, 9);
    expect(chi2Sf(5.991464547107979, 2)).toBeCloseTo(0.05, 9);
    expect(chi2Sf(18.30703805327515, 10)).toBeCloseTo(0.05, 8);
    expect(fisherSf(4.102821015130399, 2, 10)).toBeCloseTo(0.05, 8);
    expect(fisherSf(3.0545682167713, 4, 30)).toBeCloseTo(0.0318, 3);
  });
});

describe('Labo de régression — MCO', () => {
  it('retrouve exactement des coefficients sans bruit', () => {
    const X = [
      [1, 1, 4],
      [1, 2, 1],
      [1, 3, 7],
      [1, 5, 2],
      [1, 8, 3],
    ];
    const y = X.map((r) => 2 + 3 * r[1]! - r[2]!);
    const fit = ols(X, y, ['c', 'x1', 'x2']);
    expect(fit.beta[0]).toBeCloseTo(2, 10);
    expect(fit.beta[1]).toBeCloseTo(3, 10);
    expect(fit.beta[2]).toBeCloseTo(-1, 10);
    expect(fit.ssr).toBeCloseTo(0, 12);
    expect(fit.r2).toBeCloseTo(1, 12);
  });

  it('égale la solution des équations normales sur des données bruitées', () => {
    const r = rng(7);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 300; i++) {
      const a = r.normal() * 3 + 10;
      const b = r.uniform() * 5;
      X.push([1, a, b, a * b]);
      y.push(1 + 0.5 * a - 2 * b + 0.1 * a * b + r.normal());
    }
    const fit = ols(X, y, ['c', 'a', 'b', 'ab']);
    const ref = normalEquations(X, y);
    ref.forEach((v, j) => expect(fit.beta[j]).toBeCloseTo(v, 8));
    // (X'X)⁻¹ issu de la QR : son produit par X'X doit être l'identité.
    const k = 4;
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) {
        let s = 0;
        for (let c = 0; c < k; c++) s += fit.xtxInv[i]![c]! * X.reduce((acc, row) => acc + row[c]! * row[j]!, 0);
        expect(s).toBeCloseTo(i === j ? 1 : 0, 8);
      }
    // R² ajusté, F et AIC cohérents avec leurs définitions.
    expect(fit.adjR2).toBeCloseTo(1 - ((1 - fit.r2) * 299) / 296, 12);
    expect(fit.F).toBeCloseTo((fit.r2 / 3) / ((1 - fit.r2) / 296), 8);
    expect(fit.aic).toBeCloseTo(-2 * fit.logLik + 8, 10);
  });

  it('erreurs-types robustes HC0 et HC1 : valeur calculée à la main en régression simple', () => {
    const x = [1, 2, 3, 4, 5, 6];
    const y = [1.2, 1.9, 3.4, 3.8, 5.9, 5.6];
    const fit = ols(x.map((v) => [1, v]), y, ['c', 'x']);
    // Formule fermée : Var_HC0(β1) = Σ (x_i − x̄)² e_i² / (Σ (x_i − x̄)²)²
    const xb = mean(x);
    const sxx = x.reduce((s, v) => s + (v - xb) ** 2, 0);
    const hc0 = x.reduce((s, v, i) => s + (v - xb) ** 2 * fit.resid[i]! ** 2, 0) / (sxx * sxx);
    expect(fit.seHC0[1]).toBeCloseTo(Math.sqrt(hc0), 12);
    expect(fit.seRobust[1]).toBeCloseTo(Math.sqrt((hc0 * 6) / 4), 12);
    // Erreur-type classique : s / √Sxx
    expect(fit.seClassic[1]).toBeCloseTo(Math.sqrt(fit.ssr / 4 / sxx), 12);
    // Valeurs de référence (calcul indépendant) : β1 = 0,982857…, HC1(β1) = 0,123496… (numpy)
    expect(fit.beta[1]).toBeCloseTo(0.9828571428571429, 12);
    expect(fit.seRobust[1]).toBeCloseTo(0.12349595, 7);
  });

  it('IC à 95 % = β ± t(0,975 ; n − k) × e.-t.', () => {
    const r = rng(11);
    const X = Array.from({ length: 40 }, () => [1, r.normal()]);
    const y = X.map((row) => 3 + 2 * row[1]! + r.normal());
    const fit = ols(X, y, ['c', 'x']);
    const [, row] = coefTable(fit, 'classic');
    const q = studentQuantile(0.975, 38);
    expect(row!.lo).toBeCloseTo(row!.beta - q * row!.se, 12);
    expect(row!.p).toBeCloseTo(studentTwoSidedP(row!.t, 38), 12);
  });

  it('retire une colonne parfaitement colinéaire et le signale', () => {
    const X = [1, 2, 3, 4, 5, 6, 7].map((v) => [1, v, 2 * v + 1, (v * v) % 5]);
    const y = X.map((r) => r[1]! + r[3]! + 0.1 * Math.sin(r[1]!));
    const fit = ols(X, y, ['c', 'a', 'b', 'd']);
    expect(fit.aliased).toEqual(['b']);
    expect(fit.names).toEqual(['c', 'a', 'd']);
  });
});

describe('Labo de régression — diagnostics', () => {
  it('Breusch-Pagan (Koenker) = n · corr(x, e²)² en régression simple', () => {
    const r = rng(23);
    const x = Array.from({ length: 200 }, () => r.uniform() * 10);
    const y = x.map((v) => 1 + v + (0.2 + 0.3 * v) * r.normal());
    const X = x.map((v) => [1, v]);
    const fit = ols(X, y, ['c', 'x']);
    const bp = breuschPagan(X, fit.resid);
    const e2 = fit.resid.map((e) => e * e);
    expect(bp.df).toBe(1);
    expect(bp.stat).toBeCloseTo(200 * corr(x, e2) ** 2, 9);
    expect(bp.p).toBeLessThan(0.001);
  });

  it('VIF = 1 / (1 − r²) avec deux régresseurs', () => {
    const r = rng(5);
    const a = Array.from({ length: 150 }, () => r.normal());
    const b = a.map((v) => 0.8 * v + 0.6 * r.normal());
    const X = a.map((v, i) => [1, v, b[i]!]);
    const v = vif(X, ['c', 'a', 'b']);
    const rho = corr(a, b);
    expect(v[0]!.vif).toBeCloseTo(1 / (1 - rho * rho), 9);
    expect(v[1]!.vif).toBeCloseTo(1 / (1 - rho * rho), 9);
  });

  it('Jarque-Bera ne rejette pas des résidus gaussiens, rejette des résidus asymétriques', () => {
    const r = rng(9);
    expect(jarqueBera(Array.from({ length: 2000 }, () => r.normal())).p).toBeGreaterThan(0.01);
    expect(jarqueBera(Array.from({ length: 2000 }, () => Math.exp(r.normal()))).p).toBeLessThan(1e-6);
  });
});

describe('Labo de régression — scénarios', () => {
  const ex = examples();
  const fitOf = (id: string, which: 'spec' | number) => {
    const e = ex.find((x) => x.id === id)!;
    const spec = which === 'spec' ? e.spec : e.presets[which]!.spec;
    const d = buildDesign(e.data, spec);
    const fit = ols(d.X, d.y, d.names);
    return { d, fit, diag: diagnose(alignDesign(d, fit), fit) };
  };

  it('salaires : hétéroscédasticité détectée, rendement de l’éducation proche de 7,5 %', () => {
    const { fit, diag } = fitOf('salaires', 'spec');
    expect(diag.bp.p).toBeLessThan(0.001);
    expect(fit.beta[fit.names.indexOf('education')]).toBeGreaterThan(0.06);
    expect(fit.beta[fit.names.indexOf('education')]).toBeLessThan(0.09);
    expect(fit.names).toContain('experience²');
  });

  it('ventes : VIF au-delà de 10 pour les deux budgets, effet net du budget total', () => {
    const { diag } = fitOf('ventes', 'spec');
    expect(diag.vif.find((v) => v.name === 'pub_tv')!.vif).toBeGreaterThan(10);
    const total = fitOf('ventes', 2).fit;
    const j = total.names.indexOf('budget_total');
    expect(total.beta[j]).toBeGreaterThan(5);
    expect(total.beta[j]).toBeLessThan(7);
    expect(total.seClassic[j]).toBeLessThan(0.5);
  });

  it('formation : le coefficient baisse vers 0,5 quand on ajoute l’aptitude', () => {
    const sans = fitOf('formation', 0).fit;
    const avec = fitOf('formation', 1).fit;
    const bSans = sans.beta[sans.names.indexOf('heures_formation')]!;
    const bAvec = avec.beta[avec.names.indexOf('heures_formation')]!;
    expect(bSans).toBeGreaterThan(0.8);
    expect(bAvec).toBeGreaterThan(0.4);
    expect(bAvec).toBeLessThan(0.6);
  });

  it('un budget total ajouté aux deux budgets est retiré comme colinéaire', () => {
    const e = ex.find((x) => x.id === 'ventes')!;
    const d = buildDesign(e.data, { ...e.spec, xs: [...e.spec.xs, { col: 'budget_total', fn: 'lin', sq: false }] });
    const fit = ols(d.X, d.y, d.names);
    // Les budgets sont arrondis au centime : la somme n'est pas exacte au bit près, mais la colinéarité doit être détectée ou le VIF exploser.
    if (fit.aliased.length === 0) expect(Math.max(...vif(alignDesign(d, fit), fit.names).map((v) => v.vif))).toBeGreaterThan(1e3);
    else expect(fit.aliased).toEqual(['budget_total']);
  });

  it('écarte les lignes non positives sous un logarithme', () => {
    const d = buildDesign(
      { n: 4, columns: [{ name: 'y', kind: 'num', values: [1, 2, 3, 4] }, { name: 'x', kind: 'num', values: [1, 0, -2, 5] }] },
      { y: 'y', logY: false, xs: [{ col: 'x', fn: 'log', sq: false }], inter: [] },
    );
    expect(d.rows).toEqual([0, 3]);
    expect(d.names).toEqual(['Constante', 'log(x)']);
  });
});
