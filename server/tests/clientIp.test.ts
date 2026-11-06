import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { clientIp, verifyNetlifySignature } from '../src/lib/clientIp.js';

const SECRET = 'secret-de-test';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims: object, secret = SECRET, alg = 'HS256') {
  const head = b64({ alg, typ: 'JWT' });
  const body = b64(claims);
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function req(headers: Record<string, string>, ip = '203.0.113.9'): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ip, get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}
const now = Date.parse('2026-11-06T12:00:00Z');
const valid = token({ iss: 'netlify', exp: now / 1000 + 60, site_url: 'https://exemple.netlify.app' });

describe('relais Netlify', () => {
  it('accepte une signature valide', () => {
    expect(verifyNetlifySignature(valid, SECRET, now)).toBe(true);
  });
  it('refuse un mauvais secret, un jeton expiré, un autre émetteur ou un autre algorithme', () => {
    expect(verifyNetlifySignature(valid, 'autre', now)).toBe(false);
    expect(verifyNetlifySignature(token({ iss: 'netlify', exp: now / 1000 - 1 }), SECRET, now)).toBe(false);
    expect(verifyNetlifySignature(token({ iss: 'pirate', exp: now / 1000 + 60 }), SECRET, now)).toBe(false);
    expect(verifyNetlifySignature(token({ iss: 'netlify' }, SECRET, 'none'), SECRET, now)).toBe(false);
    expect(verifyNetlifySignature('pas.un.jeton', SECRET, now)).toBe(false);
  });
  it('prend l’adresse transmise par Netlify seulement si la requête est signée', () => {
    expect(clientIp(req({ 'x-nf-sign': valid, 'x-nf-client-connection-ip': '198.51.100.7' }), SECRET, now)).toBe('198.51.100.7');
    expect(clientIp(req({ 'x-nf-sign': valid, 'x-forwarded-for': '198.51.100.8, 10.0.0.1' }), SECRET, now)).toBe('198.51.100.8');
    expect(clientIp(req({ 'x-nf-client-connection-ip': '198.51.100.7' }), SECRET, now)).toBe('203.0.113.9');
    expect(clientIp(req({ 'x-nf-sign': token({ iss: 'netlify' }, 'faux'), 'x-nf-client-connection-ip': '198.51.100.7' }), SECRET, now)).toBe('203.0.113.9');
  });
  it('sans secret configuré, garde req.ip', () => {
    expect(clientIp(req({ 'x-nf-sign': valid, 'x-nf-client-connection-ip': '198.51.100.7' }), '', now)).toBe('203.0.113.9');
  });
});
