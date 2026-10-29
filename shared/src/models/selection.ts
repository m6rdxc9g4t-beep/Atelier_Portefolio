import { mulberry32, normalSampler, normCdf, normPdf } from './random.js';

/**
 * Illustration du biais de sélection (salaire observé seulement pour les personnes en emploi)
 * et de sa correction par la méthode en deux étapes de Heckman (1979).
 *
 * Processus simulé :
 *   participation  s* = γ0 + γ1·x + γ2·z + u,    s = 1 si s* > 0
 *   salaire        y  = β0 + β1·x + e            (observé seulement si s = 1)
 *   corr(u, e) = ρ.  z joue le rôle de restriction d'exclusion (ex. enfants en bas âge).
 */

export interface SelectionParams {
  rho: number;
  n?: number;
  seed?: number;
  /** Décalage de γ0 : plus il est bas, moins de personnes participent. */
  participationShift?: number;
}

export interface Fit {
  intercept: number;
  slope: number;
}

export interface SelectionPoint {
  x: number;
  y: number;
  selected: boolean;
}

export interface SelectionResult {
  points: SelectionPoint[];
  truth: Fit;
  olsSelected: Fit;
  heckman: Fit & { lambda: number };
  probit: number[];
  shareSelected: number;
}

const TRUE = { b0: 2.3, b1: 0.25, sigma: 0.5, g0: 0.2, g1: 0.8, g2: -0.9 };

/** Résolution d'un système linéaire (pivot de Gauss partiel). */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) throw new Error('Système singulier');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Moindres carrés ordinaires : β = (XᵀX)⁻¹ Xᵀy. */
export function ols(X: number[][], y: number[]): number[] {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const Xty = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let c = 0; c < k; c++) XtX[a][c] += X[i][a] * X[i][c];
    }
  }
  return solve(XtX, Xty);
}

/** Probit par scores de Fisher. */
export function probit(X: number[][], s: number[], iterations = 25): number[] {
  const k = X[0].length;
  let beta = new Array<number>(k).fill(0);
  for (let it = 0; it < iterations; it++) {
    const info = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const grad = new Array<number>(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      const xb = X[i].reduce((acc, v, j) => acc + v * beta[j], 0);
      const P = Math.min(Math.max(normCdf(xb), 1e-10), 1 - 1e-10);
      const f = normPdf(xb);
      const g = (f * (s[i] - P)) / (P * (1 - P));
      const w = (f * f) / (P * (1 - P));
      for (let a = 0; a < k; a++) {
        grad[a] += X[i][a] * g;
        for (let c = 0; c < k; c++) info[a][c] += w * X[i][a] * X[i][c];
      }
    }
    const step = solve(info, grad);
    beta = beta.map((b, j) => b + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return beta;
}

export function simulateSelection(params: SelectionParams): SelectionResult {
  const n = params.n ?? 600;
  const rho = Math.max(-0.95, Math.min(0.95, params.rho));
  const z0 = normalSampler(mulberry32(params.seed ?? 2026));
  const g0 = TRUE.g0 + (params.participationShift ?? 0);

  const points: SelectionPoint[] = [];
  const Xs: number[][] = [];
  const S: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = z0();
    const z = z0();
    const u = z0();
    const e = TRUE.sigma * (rho * u + Math.sqrt(1 - rho * rho) * z0());
    const selected = g0 + TRUE.g1 * x + TRUE.g2 * z + u > 0;
    points.push({ x, y: TRUE.b0 + TRUE.b1 * x + e, selected });
    Xs.push([1, x, z]);
    S.push(selected ? 1 : 0);
  }

  const sel = points.map((p, i) => ({ p, i })).filter((d) => d.p.selected);
  const naive = ols(
    sel.map((d) => [1, d.p.x]),
    sel.map((d) => d.p.y),
  );

  const gamma = probit(Xs, S);
  const withLambda = sel.map((d) => {
    const xb = Xs[d.i].reduce((acc, v, j) => acc + v * gamma[j], 0);
    return [1, d.p.x, normPdf(xb) / Math.max(normCdf(xb), 1e-10)];
  });
  const h = ols(
    withLambda,
    sel.map((d) => d.p.y),
  );

  return {
    points,
    truth: { intercept: TRUE.b0, slope: TRUE.b1 },
    olsSelected: { intercept: naive[0], slope: naive[1] },
    heckman: { intercept: h[0], slope: h[1], lambda: h[2] },
    probit: gamma,
    shareSelected: sel.length / n,
  };
}
