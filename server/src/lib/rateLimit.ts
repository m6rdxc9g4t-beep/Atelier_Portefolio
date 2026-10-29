import type { NextFunction, Request, Response } from 'express';

/**
 * Limiteur de débit en mémoire (fenêtre fixe par adresse IP).
 * Suffisant pour un portfolio mono-instance ; à remplacer par Redis si l'app est répliquée.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: 'Trop de requêtes, réessayez dans un instant.' });
    }
    // Nettoyage opportuniste.
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}
