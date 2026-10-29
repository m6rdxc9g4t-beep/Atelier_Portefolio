/**
 * Régression logistique générique (prédiction) : utilisée par les simulateurs
 * de score (assurance auto, marketing) et par l'API /api/models/:slug/predict.
 */

export interface ContinuousTerm {
  key: string;
  label: string;
  type: 'continuous';
  coef: number;
  min: number;
  max: number;
  step?: number;
  default: number;
  unit?: string;
}

export interface CategoricalLevel {
  value: string;
  label: string;
  /** Coefficient de la modalité (0 pour la référence). */
  coef: number;
}

export interface CategoricalTerm {
  key: string;
  label: string;
  type: 'categorical';
  reference: string;
  levels: CategoricalLevel[];
  default?: string;
}

export type LogitTerm = ContinuousTerm | CategoricalTerm;

export interface LogitModel {
  intercept: number;
  terms: LogitTerm[];
}

export type ModelInputs = Record<string, number | string>;

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Profil par défaut (valeurs médianes / modalités de référence). */
export function defaultInputs(model: LogitModel): ModelInputs {
  const out: ModelInputs = {};
  for (const t of model.terms) {
    out[t.key] = t.type === 'continuous' ? t.default : t.default ?? t.reference;
  }
  return out;
}

function termValue(t: LogitTerm, raw: number | string | undefined): number {
  if (t.type === 'continuous') {
    const x = typeof raw === 'number' ? raw : Number(raw ?? t.default);
    if (!Number.isFinite(x)) throw new Error(`Valeur invalide pour ${t.key}`);
    return t.coef * x;
  }
  const v = raw === undefined ? t.default ?? t.reference : String(raw);
  if (v === t.reference) return 0;
  const lvl = t.levels.find((l) => l.value === v);
  if (!lvl) throw new Error(`Modalité inconnue « ${v} » pour ${t.key}`);
  return lvl.coef;
}

export function linearPredictor(model: LogitModel, inputs: ModelInputs): number {
  return model.terms.reduce((acc, t) => acc + termValue(t, inputs[t.key]), model.intercept);
}

export function predictProba(model: LogitModel, inputs: ModelInputs): number {
  return sigmoid(linearPredictor(model, inputs));
}

export interface Contribution {
  key: string;
  label: string;
  /** Écart de log-cote par rapport au profil de référence. */
  delta: number;
}

/**
 * Contribution de chaque variable à l'écart de log-cote entre le profil saisi
 * et le profil de référence : β·(x − x_ref) ou β_modalité − β_modalité_ref.
 */
export function contributions(model: LogitModel, inputs: ModelInputs, reference = defaultInputs(model)): Contribution[] {
  return model.terms.map((t) => ({
    key: t.key,
    label: t.label,
    delta: termValue(t, inputs[t.key]) - termValue(t, reference[t.key]),
  }));
}

/** Contrôle des entrées (bornes, modalités connues) — utilisé par l'API. */
export function validateInputs(model: LogitModel, inputs: ModelInputs): string[] {
  const errors: string[] = [];
  for (const t of model.terms) {
    const raw = inputs[t.key];
    if (raw === undefined) continue;
    if (t.type === 'continuous') {
      const x = Number(raw);
      if (!Number.isFinite(x)) errors.push(`${t.key} doit être un nombre`);
      else if (x < t.min || x > t.max) errors.push(`${t.key} doit être compris entre ${t.min} et ${t.max}`);
    } else {
      const v = String(raw);
      if (v !== t.reference && !t.levels.some((l) => l.value === v)) {
        errors.push(`${t.key} : modalité inconnue « ${v} »`);
      }
    }
  }
  const known = new Set(model.terms.map((t) => t.key));
  for (const k of Object.keys(inputs)) if (!known.has(k)) errors.push(`variable inconnue : ${k}`);
  return errors;
}
