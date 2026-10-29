import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { rateLimit } from '../lib/rateLimit.js';

export const contactRouter = Router();

const schema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(120),
  email: z.email('Adresse e-mail invalide').max(200),
  company: z.string().trim().max(160).optional().default(''),
  message: z.string().trim().min(10, 'Message trop court').max(5000),
  /** Champ piège invisible : les robots le remplissent, les humains non. */
  website: z.string().max(0).optional().default(''),
});

contactRouter.post('/contact', rateLimit({ windowMs: 10 * 60_000, max: 5 }), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Formulaire incomplet',
      fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    });
  }
  const { website: _honeypot, ...message } = parsed.data;
  const entry = { ...message, receivedAt: new Date().toISOString(), ip: req.ip };
  await fs.mkdir(path.dirname(config.messagesFile), { recursive: true });
  await fs.appendFile(config.messagesFile, JSON.stringify(entry) + '\n', 'utf8');
  res.status(201).json({ ok: true });
});
