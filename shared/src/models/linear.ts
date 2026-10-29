/**
 * Modèle linéaire générique avec transformations des régresseurs,
 * pour les estimateurs de prix (régression hédonique log-log, gradient monocentrique…).
 */

export type Transform = 'identity' | 'log' | 'log1p' | 'square' | 'dummy';

export interface LinearTerm {
  key: string;
  label: string;
  coef: number;
  transform?: Transform;
  /** Pour un terme 'dummy' : valeur de l'entrée qui active l'indicatrice. */
  activeWhen?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  default?: number | string | boolean;
  unit?: string;
}

export interface LinearModel {
  intercept: number;
  terms: LinearTerm[];
  /** La variable dépendante est-elle en logarithme ? (prédiction = exp(xβ)). */
  logOutcome?: boolean;
}

export function applyTransform(t: LinearTerm, raw: number | string | boolean | undefined): number {
  const tr = t.transform ?? 'identity';
  if (tr === 'dummy') return raw === t.activeWhen ? 1 : 0;
  const x = Number(raw ?? t.default ?? 0);
  switch (tr) {
    case 'log':
      return Math.log(Math.max(x, 1e-9));
    case 'log1p':
      return Math.log1p(Math.max(x, 0));
    case 'square':
      return x * x;
    default:
      return x;
  }
}

export function linearPredict(model: LinearModel, inputs: Record<string, number | string | boolean>): number {
  const xb = model.terms.reduce((acc, t) => acc + t.coef * applyTransform(t, inputs[t.key]), model.intercept);
  return model.logOutcome ? Math.exp(xb) : xb;
}

/** Élasticité / effet en % d'une variation de coefficient β sur un modèle en log : 100·(e^β − 1). */
export const pctEffect = (beta: number): number => 100 * (Math.exp(beta) - 1);
