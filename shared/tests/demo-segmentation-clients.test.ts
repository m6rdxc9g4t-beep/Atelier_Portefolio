import { describe, expect, it } from 'vitest';
import { generateComptoir } from '../../client/src/demos/sql-lab/data';
import {
  computeRfm,
  distanceMatrix,
  kmeans,
  K_MAX,
  K_MIN,
  pca,
  profileClusters,
  quintileScores,
  rfmSegmentOf,
  rfMatrix,
  segment,
  silhouette,
  standardize,
  symmetricEigen,
} from '../../client/src/demos/segmentation-clients/model';
import { mulberry32 } from '../../client/src/demos/sql-lab/data';

/** Trois nuages gaussiens bien séparés, de 40 points chacun. */
function blobs(seed = 7) {
  const rnd = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const centers = [
    [0, 0],
    [10, 10],
    [-10, 10],
  ];
  const points: number[][] = [];
  const truth: number[] = [];
  centers.forEach((c, g) => {
    for (let i = 0; i < 40; i++) {
      points.push([c[0]! + gauss(), c[1]! + gauss()]);
      truth.push(g);
    }
  });
  return { points, truth };
}

describe('Segmentation clients — briques statistiques', () => {
  it('quintiles : 1 à 5 par rang, ex æquo regroupés, sens inversable', () => {
    expect(quintileScores([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(quintileScores([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false)).toEqual([5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
    // Six valeurs égales à 1 : toutes reçoivent le score de la première position du groupe.
    const s = quintileScores([1, 1, 1, 1, 1, 1, 2, 3, 4, 5]);
    expect(new Set(s.slice(0, 6))).toEqual(new Set([1]));
    expect(s.slice(6)).toEqual([4, 4, 5, 5]);
  });

  it('standardisation : moyenne 0 et écart-type 1 par colonne, colonne constante à 0', () => {
    const { z } = standardize([
      [1, 5, 3],
      [2, 5, 6],
      [3, 5, 9],
      [6, 5, 0],
    ]);
    for (const j of [0, 2]) {
      const col = z.map((r) => r[j]!);
      const m = col.reduce((a, b) => a + b, 0) / col.length;
      const v = col.reduce((a, b) => a + (b - m) ** 2, 0) / col.length;
      expect(m).toBeCloseTo(0, 12);
      expect(v).toBeCloseTo(1, 12);
    }
    expect(z.every((r) => r[1] === 0)).toBe(true);
  });

  it('k-means retrouve trois groupes connus et converge', () => {
    const { points, truth } = blobs();
    const res = kmeans(points, 3);
    expect(res.converged).toBe(true);
    // Chaque vrai groupe tombe entièrement dans un seul groupe trouvé, et les trois sont distincts.
    const mapping = [0, 1, 2].map((g) => new Set(res.labels.filter((_, i) => truth[i] === g)));
    for (const m of mapping) expect(m.size).toBe(1);
    expect(new Set(mapping.map((m) => [...m][0]))).toEqual(new Set([0, 1, 2]));
    // Plus de groupes = inertie plus faible (meilleure solution à graine fixe).
    expect(kmeans(points, 4).inertia).toBeLessThan(res.inertia);
  });

  it('silhouette : proche de 1 pour des groupes nets, cas à la main exact', () => {
    const { points } = blobs();
    const res = kmeans(points, 3);
    expect(silhouette(distanceMatrix(points), res.labels, 3).mean).toBeGreaterThan(0.8);
    // Quatre points sur une droite : {0, 1} et {10, 11}.
    const pts = [[0], [1], [10], [11]];
    const s = silhouette(distanceMatrix(pts), [0, 0, 1, 1], 2);
    // Point 0 : a = 1, b = (10 + 11) / 2 = 10,5 → s = 9,5 / 10,5.
    expect(s.perPoint[0]).toBeCloseTo(9.5 / 10.5, 12);
    // Point 1 : a = 1, b = (9 + 10) / 2 = 9,5 → s = 8,5 / 9,5.
    expect(s.perPoint[1]).toBeCloseTo(8.5 / 9.5, 12);
  });

  it('ACP : les valeurs propres conservent la variance totale, vecteurs orthonormés', () => {
    const rnd = mulberry32(3);
    const rows = Array.from({ length: 200 }, () => {
      const a = rnd() * 4;
      const b = rnd();
      return [a, 2 * a + b, b - a + rnd() * 0.3];
    });
    const p = pca(rows);
    const sum = p.eigenvalues.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(p.totalVariance, 9);
    expect(p.explained.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    expect(p.eigenvalues[0]!).toBeGreaterThanOrEqual(p.eigenvalues[1]!);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const dot = p.components[i]!.reduce((s, x, k) => s + x * p.components[j]![k]!, 0);
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 9);
      }
    // La variance des coordonnées sur la 1re composante est la 1re valeur propre.
    const c1 = p.coords.map((c) => c[0]);
    const m = c1.reduce((s, x) => s + x, 0) / c1.length;
    expect(c1.reduce((s, x) => s + (x - m) ** 2, 0) / c1.length).toBeCloseTo(p.eigenvalues[0]!, 9);
  });

  it('Jacobi : matrice diagonale connue', () => {
    const e = symmetricEigen([
      [2, 1],
      [1, 2],
    ]);
    expect(e.values[0]).toBeCloseTo(3, 12);
    expect(e.values[1]).toBeCloseTo(1, 12);
  });
});

describe('Segmentation clients — Comptoir Lumen', () => {
  const data = generateComptoir();
  const clients = computeRfm(data);

  it('RFM : un profil par client livré, totaux cohérents avec les commandes', () => {
    const livrees = data.commandes.filter((c) => c.statut === 'livree');
    expect(clients).toHaveLength(new Set(livrees.map((c) => c.client_id)).size);
    expect(clients.reduce((s, c) => s + c.frequence, 0)).toBe(livrees.length);
    const prix = new Map(data.produits.map((p) => [p.id, p.prix_unitaire]));
    const ids = new Set(livrees.map((c) => c.id));
    const ca = data.lignes.filter((l) => ids.has(l.commande_id)).reduce((s, l) => s + l.quantite * prix.get(l.produit_id)! * (1 - l.remise), 0);
    expect(clients.reduce((s, c) => s + c.montant, 0)).toBeCloseTo(ca, 0);
    expect(clients.every((c) => c.recence >= 0 && c.recence <= 731)).toBe(true);
    for (const c of clients) expect(c.segment).toBe(rfmSegmentOf(c.r, c.f));
  });

  it('la matrice R × F compte chaque client une fois', () => {
    const m = rfMatrix(clients);
    expect(m.flat().reduce((s, x) => s + x, 0)).toBe(clients.length);
  });

  it('les segments couvrent toute la grille R × F', () => {
    for (let r = 1; r <= 5; r++) for (let f = 1; f <= 5; f++) expect(rfmSegmentOf(r, f)).toBeTruthy();
    expect(rfmSegmentOf(5, 5)).toBe('Champions');
    expect(rfmSegmentOf(5, 1)).toBe('Nouveaux');
    expect(rfmSegmentOf(1, 1)).toBe('Perdus');
    expect(rfmSegmentOf(1, 5)).toBe('À ne pas perdre');
  });

  it('segmentation complète : k de 2 à 8, groupes triés par montant, portraits cohérents', () => {
    const t0 = performance.now();
    const s = segment(data);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect([...s.byK.keys()]).toEqual(Array.from({ length: K_MAX - K_MIN + 1 }, (_, i) => K_MIN + i));
    // L'inertie décroît quand k augmente.
    for (let i = 1; i < s.inertia.length; i++) expect(s.inertia[i]!.value).toBeLessThanOrEqual(s.inertia[i - 1]!.value + 1e-9);
    // k = 1 : somme des carrés des données standardisées = n × 3.
    expect(s.inertia[0]!.value).toBeCloseTo(s.clients.length * 3, 6);
    expect(s.bestK).toBeGreaterThanOrEqual(K_MIN);
    const res = s.byK.get(s.bestK)!;
    const profiles = profileClusters(s.clients, res);
    expect(profiles[0]!.kind).toBe('cles');
    expect(profiles.reduce((a, p) => a + p.size, 0)).toBe(s.clients.length);
    expect(profiles.reduce((a, p) => a + p.shareCA, 0)).toBeCloseTo(1, 9);
    // Groupe 1 = montant moyen le plus élevé.
    const avg = (g: number) => {
      const m = s.clients.filter((_, i) => res.labels[i] === g);
      return m.reduce((a, c) => a + c.montant, 0) / m.length;
    };
    for (let g = 1; g < res.k; g++) expect(avg(g - 1)).toBeGreaterThanOrEqual(avg(g));
    expect(s.pca.explained[0]! + s.pca.explained[1]!).toBeGreaterThan(0.6);
  });
});
