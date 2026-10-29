import { mulberry32 } from './random.js';

/** Matrice de poids spatiaux (dense) sur une grille rows × cols. */
export function gridWeights(
  rows: number,
  cols: number,
  contiguity: 'rook' | 'queen' = 'queen',
  rowStandardize = true,
): number[][] {
  const n = rows * cols;
  const W: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (contiguity === 'rook' && dr !== 0 && dc !== 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          W[i][rr * cols + cc] = 1;
        }
      }
      if (rowStandardize) {
        const s = W[i].reduce((a, b) => a + b, 0);
        if (s > 0) for (let j = 0; j < n; j++) W[i][j] /= s;
      }
    }
  }
  return W;
}

/** I de Moran : (n / S0) · (zᵀ W z) / (zᵀ z). */
export function moranI(values: number[], W: number[][]): number {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const z = values.map((v) => v - mean);
  let s0 = 0;
  let num = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const w = W[i][j];
      if (w === 0) continue;
      s0 += w;
      num += w * z[i] * z[j];
    }
  }
  const den = z.reduce((a, b) => a + b * b, 0);
  if (den === 0 || s0 === 0) return 0;
  return (n / s0) * (num / den);
}

/** Espérance de I sous l'hypothèse d'absence d'autocorrélation : −1 / (n − 1). */
export const moranExpected = (n: number): number => -1 / (n - 1);

/** p-value par permutations (test unilatéral d'autocorrélation positive). */
export function moranPermutationTest(values: number[], W: number[][], nperm = 199, seed = 7) {
  const observed = moranI(values, W);
  const rand = mulberry32(seed);
  const v = values.slice();
  let greater = 0;
  for (let k = 0; k < nperm; k++) {
    for (let i = v.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [v[i], v[j]] = [v[j], v[i]];
    }
    if (moranI(v, W) >= observed) greater++;
  }
  return { observed, pValue: (greater + 1) / (nperm + 1) };
}

/** Décalage spatial Wy (moyenne des voisins si W standardisée en lignes). */
export function spatialLag(values: number[], W: number[][]): number[] {
  return W.map((row) => row.reduce((acc, w, j) => acc + w * values[j], 0));
}
