import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config.js';

/**
 * Adresse du visiteur, y compris quand le site est servi derrière le relais Netlify.
 *
 * Chemin : visiteur → Netlify (réécriture 200 signée) → Caddy → ce serveur. Sans précaution, tous les
 * visiteurs passés par Netlify auraient l'adresse d'un serveur Netlify et partageraient les limites
 * d'envoi. Netlify signe chaque requête relayée (en-tête `x-nf-sign`, jeton JWS HS256) avec le secret
 * NETLIFY_PROXY_SECRET : on ne croit l'adresse transmise par Netlify (`x-nf-client-connection-ip`)
 * que si cette signature est valide. Sans secret configuré ou sans signature valide : req.ip.
 */
export function clientIp(req: Request, secret = config.netlifyProxySecret, now = Date.now()): string {
  const fallback = req.ip ?? 'unknown';
  if (!secret) return fallback;
  const token = req.get('x-nf-sign');
  if (!token || !verifyNetlifySignature(token, secret, now)) return fallback;
  const forwarded = req.get('x-nf-client-connection-ip') || req.get('x-forwarded-for')?.split(',')[0];
  return forwarded?.trim() || fallback;
}

/** Vérifie un jeton JWS HS256 émis par Netlify : signature, émetteur et expiration. */
export function verifyNetlifySignature(token: string, secret: string, now = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts;
  try {
    const head = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string };
    if (head.alg !== 'HS256') return false;
    const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { iss?: string; exp?: number };
    if (claims.iss !== 'netlify') return false;
    if (typeof claims.exp === 'number' && claims.exp * 1000 < now) return false;
    return true;
  } catch {
    return false;
  }
}
