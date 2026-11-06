/** Modèle de la démo « Observatoire immobilier » : statistiques, échelles, MCO, modèle hédonique. */
import { describe, expect, it } from 'vitest';
import {
  classOf,
  communeParDefaut,
  estimer,
  evolution,
  fitHedonique,
  fitProjection,
  fmtPct,
  indiceCommune,
  invert,
  isDvfIndex,
  medianeOf,
  niceTicks,
  ols,
  quantileBreaks,
  quantileSorted,
  radius,
  searchCommunes,
  type Commune,
  type DepartementData,
} from '../../client/src/demos/observatoire-immobilier/model';

/** Jeu « cars » de R (Ezekiel, 1930) : vitesse (mph) et distance d'arrêt (ft), 50 observations. */
const speed = [4, 4, 7, 7, 8, 9, 10, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 20, 20, 20, 20, 20, 22, 23, 24, 24, 24, 24, 25];
const dist = [2, 10, 4, 22, 16, 10, 18, 26, 34, 17, 28, 14, 20, 24, 28, 26, 34, 34, 46, 26, 36, 60, 80, 20, 26, 54, 32, 40, 32, 40, 50, 42, 56, 76, 84, 36, 46, 68, 32, 48, 52, 56, 64, 66, 54, 70, 92, 93, 120, 85];

describe('moindres carrés ordinaires', () => {
  const fit = ols(speed.map((s) => [1, s]), dist);
  it('reproduit lm(dist ~ speed) de R sur « cars »', () => {
    expect(fit.beta[0]).toBeCloseTo(-17.5791, 4);
    expect(fit.beta[1]).toBeCloseTo(3.9324, 4);
    expect(fit.se[0]).toBeCloseTo(6.7584, 4);
    expect(fit.se[1]).toBeCloseTo(0.4155, 4);
    expect(fit.r2).toBeCloseTo(0.6511, 4);
    expect(fit.r2Adj).toBeCloseTo(0.6438, 4);
    expect(fit.sigma).toBeCloseTo(15.38, 2);
  });
  it('écart-type robuste HC1 = formule de White en régression simple × n/(n−k)', () => {
    const n = speed.length;
    const xbar = speed.reduce((s, v) => s + v, 0) / n;
    const sxx = speed.reduce((s, v) => s + (v - xbar) ** 2, 0);
    const hc0 = speed.reduce((s, v, i) => s + (v - xbar) ** 2 * fit.residuals[i] ** 2, 0) / sxx ** 2;
    expect(fit.seRobust[1]).toBeCloseTo(Math.sqrt((hc0 * n) / (n - 2)), 10);
  });
  it('inverse une matrice et détecte la colinéarité', () => {
    const inv = invert([[4, 7], [2, 6]]);
    expect(inv?.[0][0]).toBeCloseTo(0.6, 12);
    expect(inv?.[0][1]).toBeCloseTo(-0.7, 12);
    expect(inv?.[1][0]).toBeCloseTo(-0.2, 12);
    expect(inv?.[1][1]).toBeCloseTo(0.4, 12);
    expect(invert([[1, 2], [2, 4]])).toBeNull();
    expect(() => ols([[1, 1], [1, 1], [1, 1]], [1, 2, 3])).toThrow(/colinéaires/);
  });
});

describe('quantiles, classes, échelles', () => {
  it('quantile de type 7', () => {
    expect(quantileSorted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.25)).toBeCloseTo(3.25, 12);
  });
  it('seuils de classes d’effectifs égaux', () => {
    const v = Array.from({ length: 101 }, (_, i) => 1000 + i * 20); // 1000 … 3000
    expect(quantileBreaks(v, 5, 50)).toEqual([1400, 1800, 2200, 2600]);
    expect(quantileBreaks([2000, 2000, 2000], 5)).toEqual([]);
    expect(classOf(999, [1400, 1800])).toBe(0);
    expect(classOf(1400, [1400, 1800])).toBe(1);
    expect(classOf(5000, [1400, 1800])).toBe(2);
  });
  it('projection : garde les proportions et tient dans le cadre', () => {
    const pts: [number, number][] = [[-1, 47], [0, 47], [-1, 48], [0, 48]];
    const p = fitProjection(pts, 400, 10);
    const [x0, y0] = p(-1, 48);
    const [x1, y1] = p(0, 47);
    expect(x0).toBeCloseTo(10, 9);
    expect(y0).toBeCloseTo(10, 9);
    expect(x1).toBeCloseTo(390, 9);
    // 1° de latitude = 1° de longitude / cos(47,5°)
    expect((y1 - y0) / (x1 - x0)).toBeCloseTo(1 / Math.cos((47.5 * Math.PI) / 180), 9);
    expect(p.height).toBeCloseTo(y1 + 10, 9);
    const capped = fitProjection(pts, 400, 10, 200);
    expect(capped.height).toBe(200);
    expect(capped(0, 47)[1]).toBeCloseTo(190, 9);
  });
  it('graduations rondes englobant le domaine', () => {
    expect(niceTicks(1230, 2870, 4)).toEqual([1000, 1500, 2000, 2500, 3000]);
    expect(niceTicks(0, 10, 5)).toEqual([0, 5, 10]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });
  it('rayon proportionnel en surface', () => {
    expect(radius(100, 100, 2, 12)).toBe(12);
    expect(radius(25, 100, 2, 12)).toBe(7);
    expect(radius(0, 100, 2, 12)).toBe(2);
  });
  it('formats français', () => {
    expect(fmtPct(0.0321, true)).toBe('+3,2 %');
    expect(fmtPct(-0.05, true)).toBe('−5,0 %');
    expect(fmtPct(0.0001, true)).toBe('0,0 %');
    expect(fmtPct(null)).toBe('—');
  });
});

/* ─── Département synthétique : prix exactement hédoniques (sans bruit) ─── */
const B = { b0: Math.log(200000), b1: 0.8, b2: 0.02, b3: -0.15, b4: 1, g: { 2023: 0.05, 2024: 0.08 } as Record<number, number> };

function syntheticDep(noise = 0): DepartementData {
  const annees = [2022, 2023, 2024];
  // trois communes : niveaux 1 500, 2 000 et 3 000 €/m², avec beaucoup de ventes (rétrécissement faible)
  const niveaux = [1500, 2000, 3000];
  const communes: Commune[] = niveaux.map((niv, i) => ({
    c: `4900${i}`, n: ['Alpha', 'Beaulieu-sur-Layon', 'Écouflant'][i], x: -0.5 + i * 0.1, y: 47.4, v: 3000,
    s: Object.fromEntries(annees.map((a) => [String(a), { T: [1000, niv - 200, niv, niv + 200] as [number, number, number, number] }])),
    h: {},
  }));
  const dep: DepartementData = {
    version: 1, code: '49', nom: 'Maine-et-Loire', annees, periode: { debut: '2022-01-03', fin: '2024-12-30' },
    filtres: { bornesPrixM2: [500, 6000], lues: 0, ecartees: 0, retenues: 9000 },
    histogramme: { largeur: 250, max: 8000 },
    departement: { v: 9000, s: Object.fromEntries(annees.map((a) => [String(a), { T: [3000, 1800, 2000, 2400] as [number, number, number, number] }])), h: {} },
    communes,
    echantillon: { colonnes: [], total: 0, lignes: [] },
  };
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1200; i++) {
    const ci = i % 3;
    const annee = annees[Math.floor(rnd() * 3)];
    const type = rnd() < 0.4 ? 1 : 0;
    const surface = Math.round(30 + rnd() * 150);
    const pieces = Math.max(1, Math.min(8, Math.round(surface / 25 + (rnd() - 0.5) * 2)));
    const lnI = indiceCommune(communes[ci], dep);
    const lp = B.b0 + B.b1 * Math.log(surface / 100) + B.b2 * (pieces - 4) + B.b3 * type + B.b4 * lnI + (B.g[annee] ?? 0) + noise * (rnd() - 0.5);
    dep.echantillon.lignes.push([surface, pieces, type, annee, Math.exp(lp), ci]);
  }
  return dep;
}

describe('modèle hédonique', () => {
  it('indice de commune rétréci vers le département', () => {
    const dep = syntheticDep();
    const [alpha] = dep.communes;
    // niveau 1 500 vs 2 000, poids 3 000 / (3 000 + 20)
    expect(indiceCommune(alpha, dep)).toBeCloseTo((3000 / 3020) * Math.log(1500 / 2000), 12);
    const petite = { ...alpha, s: { '2024': { T: [5, 1000, 1500, 2000] as [number, number, number, number] } } };
    expect(indiceCommune(petite, dep)).toBeCloseTo((5 / 25) * Math.log(1500 / 2000), 12);
  });

  it('retrouve exactement les coefficients sur des prix sans bruit', () => {
    const m = fitHedonique(syntheticDep());
    const get = (k: string) => m.coefs.find((c) => c.key === k)?.beta;
    expect(get('const')).toBeCloseTo(B.b0, 8);
    expect(get('lnS')).toBeCloseTo(B.b1, 8);
    expect(get('pieces')).toBeCloseTo(B.b2, 8);
    expect(get('appart')).toBeCloseTo(B.b3, 8);
    expect(get('lnI')).toBeCloseTo(B.b4, 8);
    expect(get('a2023')).toBeCloseTo(0.05, 8);
    expect(get('a2024')).toBeCloseTo(0.08, 8);
    expect(m.r2).toBeCloseTo(1, 10);
    expect(m.validation.erreurMediane).toBeLessThan(1e-8);
    expect(m.validation.n).toBe(240);
  });

  it('avec bruit : couverture de l’intervalle à 80 % proche de 80 %', () => {
    const m = fitHedonique(syntheticDep(0.6)); // bruit uniforme, σ ≈ 0,17
    expect(m.sigma).toBeCloseTo(0.6 / Math.sqrt(12), 1);
    expect(m.validation.couverture80).toBeGreaterThan(0.7);
    expect(m.validation.couverture80).toBeLessThan(0.95);
    expect(m.coefs.find((c) => c.key === 'lnS')?.beta).toBeCloseTo(0.8, 1);
  });

  it('estimation = référence × produit des facteurs ; intervalle autour du prix', () => {
    const dep = syntheticDep();
    const m = fitHedonique(dep);
    const lnIndice = indiceCommune(dep.communes[2], dep);
    const e = estimer(m, { surface: 70, pieces: 3, type: 'A', annee: 2024, lnIndice });
    const produit = e.facteurs.reduce((p, f) => p * f.facteur, e.reference);
    expect(produit).toBeCloseTo(e.prix, 6);
    const attendu = Math.exp(B.b0 + B.b1 * Math.log(0.7) + B.b2 * -1 + B.b3 + lnIndice + 0.08);
    expect(e.prix / attendu).toBeCloseTo(1, 8);
    expect(e.prixM2).toBeCloseTo(e.prix / 70, 8);
    expect(e.bas).toBeLessThanOrEqual(e.prix);
    expect(e.haut).toBeGreaterThanOrEqual(e.prix);
    // année hors période : la plus récente
    expect(estimer(m, { surface: 70, pieces: 3, type: 'A', annee: 2030, lnIndice }).prix).toBeCloseTo(e.prix, 6);
  });
});

describe('lecture des statistiques', () => {
  const dep = syntheticDep();
  it('médiane publiée à partir de 5 ventes ; évolution annuelle', () => {
    const s = { '2023': { T: [10, 1, 2000, 3] as [number, number, number, number] }, '2024': { T: [4, 1, 2200, 3] as [number, number, number, number] } };
    expect(medianeOf(s, 2023, 'T')).toBe(2000);
    expect(medianeOf(s, 2024, 'T')).toBeNull();
    expect(evolution(s, 2024, 'T')).toBeNull();
    expect(evolution(dep.communes[0].s, 2024, 'T')).toBe(0);
  });
  it('recherche sans accents ni casse, par début puis contenu', () => {
    expect(searchCommunes(dep.communes, 'ecou').map((c) => c.n)).toEqual(['Écouflant']);
    expect(searchCommunes(dep.communes, 'sur layon').map((c) => c.n)).toEqual(['Beaulieu-sur-Layon']);
    expect(searchCommunes(dep.communes, '49001').map((c) => c.n)).toEqual(['Beaulieu-sur-Layon']);
    expect(searchCommunes(dep.communes, '  ')).toEqual([]);
  });
  it('commune par défaut et contrôle de l’index', () => {
    expect(communeParDefaut(dep)?.c).toBe('49000');
    expect(isDvfIndex({ departements: [], annees: [] })).toBe(false);
    expect(isDvfIndex('<!doctype html>')).toBe(false);
    expect(isDvfIndex({ departements: [{ code: '49' }], annees: [2024] })).toBe(true);
  });
});
