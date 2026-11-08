import { describe, expect, it } from 'vitest';
import {
  analyze,
  demandAt,
  invert,
  ols,
  optimalPrice,
  outcome,
  readRows,
  SCENARIOS,
  simulate,
  tQuantile975,
  toCsv,
  type Obs,
} from '../../client/src/demos/elasticite-prix/model';

describe('Élasticité-prix — algèbre et MCO', () => {
  it('inverse une matrice et détecte une matrice singulière', () => {
    const inv = invert([
      [4, 7],
      [2, 6],
    ])!;
    expect(inv[0]![0]).toBeCloseTo(0.6, 10);
    expect(inv[0]![1]).toBeCloseTo(-0.7, 10);
    expect(inv[1]![0]).toBeCloseTo(-0.2, 10);
    expect(inv[1]![1]).toBeCloseTo(0.4, 10);
    expect(
      invert([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull();
  });

  it('retrouve exactement les coefficients sur des données sans bruit', () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 30; i++) {
      const x1 = Math.sin(i) * 3;
      const x2 = (i % 7) - 3;
      X.push([1, x1, x2]);
      y.push(2.5 - 1.7 * x1 + 0.4 * x2);
    }
    const fit = ols(X, y, ['c', 'x1', 'x2'])!;
    expect(fit.beta[0]).toBeCloseTo(2.5, 9);
    expect(fit.beta[1]).toBeCloseTo(-1.7, 9);
    expect(fit.beta[2]).toBeCloseTo(0.4, 9);
    expect(fit.r2).toBeCloseTo(1, 9);
  });

  it('le quantile de Student tend vers 1,96 et vaut ≈ 2,00 à 60 degrés de liberté', () => {
    expect(tQuantile975(60)).toBeCloseTo(2.0003, 3);
    expect(tQuantile975(20)).toBeCloseTo(2.086, 2);
    expect(tQuantile975(1e6)).toBeCloseTo(1.96, 3);
  });
});

describe('Élasticité-prix — données simulées', () => {
  it('est déterministe', () => {
    const s = SCENARIOS[0]!;
    expect(simulate(s)).toEqual(simulate(s));
    expect(simulate(s)).toHaveLength(104);
  });

  it('l’estimation contrôlée retrouve l’élasticité vraie à ± 2 erreurs-types, pour chaque catégorie', () => {
    for (const s of SCENARIOS) {
      const a = analyze(simulate(s));
      expect(a.controls, s.categorie).toBe('mois');
      expect(Math.abs(a.controlled.b - s.trueElasticity), s.categorie).toBeLessThan(2 * a.controlled.se);
      expect(a.controlled.lo).toBeLessThan(a.controlled.b);
      expect(a.controlled.hi).toBeGreaterThan(a.controlled.b);
    }
  });

  it('la régression naïve surestime la sensibilité au prix quand les promotions tombent en haute saison', () => {
    for (const s of SCENARIOS) {
      const a = analyze(simulate(s));
      // Prix bas et demande haute en même temps : la pente naïve est plus négative que la vraie.
      expect(a.naive.b, s.categorie).toBeLessThan(s.trueElasticity);
      expect(Math.abs(a.naive.b - s.trueElasticity), s.categorie).toBeGreaterThan(Math.abs(a.controlled.b - s.trueElasticity));
      expect(a.corrPriceSeason, s.categorie).toBeLessThan(0);
    }
  });

  it('cas confondu pur : la régression naïve est biaisée, la contrôlée ne l’est pas', () => {
    // Demande saisonnière forte en décembre ; prix baissé en décembre seulement ; élasticité vraie −1.
    const obs: Obs[] = [];
    const start = Math.floor(Date.UTC(2023, 0, 2) / 86_400_000);
    for (let w = 0; w < 156; w++) {
      const day = start + 7 * w;
      const dec = new Date(day * 86_400_000).getUTCMonth() === 11;
      const price = dec ? 80 : 100 * (1 + 0.02 * Math.sin(w));
      const qty = Math.round(1000 * Math.pow(price / 100, -1) * (dec ? 2 : 1));
      obs.push({ day, price, qty });
    }
    const a = analyze(obs);
    expect(a.controlled.b).toBeCloseTo(-1, 1);
    expect(a.naive.b).toBeLessThan(-2);
  });
});

describe('Élasticité-prix — prix optimal et simulateur', () => {
  it('formule de Lerner : p* = c·ε/(1+ε), indéfinie si la demande est inélastique', () => {
    expect(optimalPrice(50, -2)).toBeCloseTo(100, 10);
    expect(optimalPrice(30, -3)).toBeCloseTo(45, 10);
    expect(optimalPrice(30, -1)).toBeNull();
    expect(optimalPrice(30, -0.6)).toBeNull();
  });

  it('le prix de Lerner maximise bien la marge simulée', () => {
    const s = SCENARIOS.find((x) => x.categorie === 'Textile')!;
    const a = analyze(simulate(s));
    const pStar = optimalPrice(s.unitCost, a.controlled.b)!;
    const m = (p: number) => outcome(a, p, s.unitCost).margin;
    expect(m(pStar)).toBeGreaterThan(m(pStar * 0.95));
    expect(m(pStar)).toBeGreaterThan(m(pStar * 1.05));
  });

  it('la demande baisse quand le prix monte, et la bande d’incertitude encadre la prévision', () => {
    const s = SCENARIOS[0]!;
    const a = analyze(simulate(s));
    expect(demandAt(a, a.refPrice * 1.1)).toBeLessThan(demandAt(a, a.refPrice));
    const o = outcome(a, a.refPrice * 1.2, s.unitCost);
    expect(o.qtyLo).toBeLessThanOrEqual(o.qty);
    expect(o.qtyHi).toBeGreaterThanOrEqual(o.qty);
    expect(o.marginLo).toBeLessThanOrEqual(o.margin + 1e-9);
    expect(o.marginHi).toBeGreaterThanOrEqual(o.margin - 1e-9);
  });
});

describe('Élasticité-prix — lecture de CSV', () => {
  it('relit le CSV exporté (décimales à virgule, en-têtes français)', () => {
    const s = SCENARIOS[1]!;
    const obs = simulate(s);
    const rows = toCsv(obs)
      .split('\r\n')
      .map((l) => l.split(';'));
    const r = readRows(rows);
    expect(r.obs).toHaveLength(obs.length);
    expect(r.obs[10]).toEqual(obs[10]);
    expect(r.columns).toEqual({ date: 'date', price: 'prix', qty: 'quantite' });
  });

  it('accepte des dates JJ/MM/AAAA et ignore les lignes invalides', () => {
    const rows = [['Semaine', 'Prix unitaire', 'Quantité vendue']];
    for (let i = 1; i <= 20; i++) rows.push([`${String(i).padStart(2, '0')}/03/2025`, `${10 + (i % 3)},50`, String(100 - i)]);
    rows.push(['pas une date', '12', '3'], ['21/03/2025', '0', '5']);
    const r = readRows(rows);
    expect(r.obs).toHaveLength(20);
    expect(r.skipped).toBe(2);
    expect(r.obs[0]!.price).toBeCloseTo(11.5, 10);
  });

  it('refuse un prix constant avec un message clair', () => {
    const obs: Obs[] = Array.from({ length: 30 }, (_, i) => ({ day: 20000 + 7 * i, price: 10, qty: 50 + i }));
    expect(() => analyze(obs)).toThrow(/ne varie presque pas/);
  });
});
