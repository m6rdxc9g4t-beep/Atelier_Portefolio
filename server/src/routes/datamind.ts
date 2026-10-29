import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { rateLimit } from '../lib/rateLimit.js';

/**
 * Agent DataMind : l'ancien prototype appelait l'API Claude directement depuis le navigateur.
 * Ici, la clé reste côté serveur (variable ANTHROPIC_API_KEY) ; sans clé, l'agent est simplement désactivé
 * et la page reste utilisable (exploration du CSV, statistiques et graphiques automatiques).
 */
export const datamindRouter = Router();

const SYSTEM = `Tu es DataMind, un agent data analyst expert. Tu analyses des jeux de données avec précision et clarté.
Tes capacités : statistiques descriptives, détection d'outliers, corrélations, tendances, recommandations actionnables.
Format : titres courts en MAJUSCULES, chiffres précis, recommandations concrètes, concision. Réponds toujours en français.
Tu ne disposes que de l'aperçu et des statistiques fournis : signale quand une conclusion demanderait le jeu complet.`;

datamindRouter.get('/datamind/status', (_req, res) => {
  res.json({ enabled: Boolean(config.anthropicApiKey), model: config.anthropicApiKey ? config.anthropicModel : null });
});

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20_000) }))
    .min(1)
    .max(30),
});

datamindRouter.post('/datamind/chat', rateLimit({ windowMs: 10 * 60_000, max: 20 }), async (req, res) => {
  if (!config.anthropicApiKey) {
    return res.status(503).json({ error: "L'agent IA n'est pas activé sur ce serveur (ANTHROPIC_API_KEY absente)." });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Conversation invalide' });

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 1500,
      system: SYSTEM,
      messages: parsed.data.messages,
    }),
  });
  const data = (await upstream.json()) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
  if (!upstream.ok) {
    return res.status(502).json({ error: data.error?.message ?? "Erreur de l'API Claude" });
  }
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  res.json({ text });
});
