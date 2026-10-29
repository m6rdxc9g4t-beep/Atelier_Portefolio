import { Router } from 'express';
import { z } from 'zod';
import {
  classifyReview,
  contributions,
  gridWeights,
  linearPredict,
  moranExpected,
  moranPermutationTest,
  predictProba,
  simulateGarch,
  simulateSelection,
  unconditionalVariance,
  halfLife,
  validateInputs,
  type LinearModel,
  type LogitModel,
} from '@atelier/shared';
import { getProject } from '../content.js';

export const modelsRouter = Router();

const inputsSchema = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));

interface ScoreBand {
  label: string;
  from: number;
  to: number;
}

/**
 * Prédiction à partir du modèle publié dans la fiche d'un projet.
 * - modèle logit  → probabilité, score (si échelle), bande, décision au seuil, contributions ;
 * - modèle linéaire → valeur prédite.
 */
modelsRouter.post('/models/:slug/predict', (req, res) => {
  const project = getProject(req.params.slug);
  const model = project?.content.model;
  if (!project || !model) return res.status(404).json({ error: 'Aucun modèle publié pour ce projet.' });

  const body = z.object({ inputs: inputsSchema, model: z.string().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Corps de requête invalide', details: body.error.issues });
  const { inputs } = body.data;

  const key = body.data.model ?? (model.logit ? 'logit' : 'linear');
  const spec = model[key];
  if (!spec) return res.status(404).json({ error: `Modèle « ${key} » introuvable.` });

  if (key === 'logit' || spec.kind === 'logit') {
    const logit = spec as LogitModel;
    const numericInputs = Object.fromEntries(
      Object.entries(inputs).map(([k, v]) => [k, typeof v === 'boolean' ? Number(v) : v]),
    );
    const errors = validateInputs(logit, numericInputs);
    if (errors.length) return res.status(422).json({ error: 'Entrées invalides', details: errors });
    const probability = predictProba(logit, numericInputs);
    const scale: number | undefined = model.scoreScale;
    const score = scale ? Math.round(probability * scale) : undefined;
    const bands: ScoreBand[] | undefined = model.bands;
    const band = score !== undefined && bands ? bands.find((b) => score >= b.from && score < b.to)?.label ?? bands[bands.length - 1].label : undefined;
    const threshold: number | undefined = model.threshold;
    return res.json({
      slug: project.slug,
      probability,
      score,
      band,
      decision:
        threshold !== undefined && score !== undefined
          ? score >= threshold
            ? 'à surveiller'
            : 'accepté'
          : undefined,
      contributions: contributions(logit, numericInputs),
    });
  }

  const linear = spec as LinearModel;
  return res.json({ slug: project.slug, prediction: linearPredict(linear, inputs) });
});

modelsRouter.post('/models/garch/simulate', (req, res) => {
  const schema = z.object({
    omega: z.number().positive().max(1),
    alpha: z.number().min(0).max(1),
    beta: z.number().min(0).max(1),
    a0: z.number().min(-1).max(1).optional(),
    a1: z.number().min(-0.99).max(0.99).optional(),
    n: z.number().int().min(50).max(3000).default(520),
    seed: z.number().int().min(0).max(1e9).default(42),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Paramètres invalides', details: parsed.error.issues });
  const p = parsed.data;
  const path = simulateGarch(p, p.n, p.seed);
  res.json({
    ...path,
    persistence: p.alpha + p.beta,
    unconditionalVariance: unconditionalVariance(p),
    halfLife: halfLife(p),
  });
});

modelsRouter.post('/models/moran', (req, res) => {
  const schema = z.object({
    rows: z.number().int().min(2).max(20),
    cols: z.number().int().min(2).max(20),
    values: z.array(z.number()),
    contiguity: z.enum(['rook', 'queen']).default('queen'),
    permutations: z.number().int().min(19).max(999).default(199),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Paramètres invalides', details: parsed.error.issues });
  const { rows, cols, values, contiguity, permutations } = parsed.data;
  if (values.length !== rows * cols) return res.status(400).json({ error: 'values doit contenir rows × cols valeurs' });
  const W = gridWeights(rows, cols, contiguity);
  const test = moranPermutationTest(values, W, permutations);
  res.json({ I: test.observed, expected: moranExpected(values.length), pValue: test.pValue });
});

modelsRouter.post('/models/selection', (req, res) => {
  const schema = z.object({
    rho: z.number().min(-0.95).max(0.95),
    n: z.number().int().min(100).max(5000).default(600),
    seed: z.number().int().min(0).max(1e9).default(2026),
    participationShift: z.number().min(-2).max(2).default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Paramètres invalides', details: parsed.error.issues });
  const { points, ...rest } = simulateSelection(parsed.data);
  res.json({ ...rest, n: points.length });
});

modelsRouter.post('/nlp/classify', (req, res) => {
  const parsed = z.object({ text: z.string().min(2).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Texte requis (2 à 2 000 caractères).' });
  res.json(classifyReview(parsed.data.text));
});
