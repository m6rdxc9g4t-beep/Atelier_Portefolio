import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOG } from '@atelier/shared';

let app: ReturnType<typeof import('../src/app').createApp>;
const messages = path.join(os.tmpdir(), `portfolio-messages-${process.pid}.jsonl`);

beforeAll(async () => {
  process.env.MESSAGES_FILE = messages;
  process.env.ANTHROPIC_API_KEY = '';
  const { createApp } = await import('../src/app');
  app = createApp({ serveClient: false });
});

describe('contenu', () => {
  it('santé', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });

  it('liste tous les projets du catalogue, dans l’ordre', async () => {
    const r = await request(app).get('/api/projects');
    expect(r.status).toBe(200);
    const slugs = r.body.projects.map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual([...CATALOG].sort((a, b) => a.order - b.order).map((p) => p.slug).filter((s) => slugs.includes(s)));
    expect(r.body.projects.length).toBeGreaterThanOrEqual(4);
    for (const p of r.body.projects) {
      expect(p.title).toBeTruthy();
      expect(Array.isArray(p.kpis)).toBe(true);
    }
  });

  it('filtre par catégorie', async () => {
    const r = await request(app).get('/api/projects?category=bi');
    expect(r.body.projects.every((p: { category: string }) => p.category === 'bi')).toBe(true);
  });

  it('chaque fiche est complète et ses figures existent', async () => {
    const list = await request(app).get('/api/projects');
    for (const { slug } of list.body.projects) {
      const r = await request(app).get(`/api/projects/${slug}`);
      expect(r.status).toBe(200);
      const c = r.body.content;
      expect(c.slug).toBe(slug);
      expect(c.sections.length).toBeGreaterThan(0);
      expect(c.kpis.length).toBeGreaterThan(0);
      expect(r.body.previous.slug).toBeTruthy();
      for (const s of c.sections)
        for (const b of s.blocks)
          if (b.type === 'figure') {
            const file = path.resolve(__dirname, '../../client/public', b.src.replace(/^\//, ''));
            expect(fs.existsSync(file), `${slug} : figure manquante ${b.src}`).toBe(true);
          }
      for (const rep of r.body.reports ?? []) {
        const file = path.resolve(__dirname, '../../client/public/reports', rep.file);
        expect(fs.existsSync(file), `${slug} : rapport manquant ${rep.file}`).toBe(true);
      }
    }
  });

  it('404 pour un projet inconnu', async () => {
    const r = await request(app).get('/api/projects/inconnu');
    expect(r.status).toBe(404);
  });

  it('profil', async () => {
    const r = await request(app).get('/api/profile');
    expect(r.body.name).toBe('François Pichon');
  });
});

describe('modèles', () => {
  it('simulation GARCH bornée et reproductible', async () => {
    const body = { omega: 3.4e-5, alpha: 0.19, beta: 0.76, n: 300, seed: 7 };
    const a = await request(app).post('/api/models/garch/simulate').send(body);
    const b = await request(app).post('/api/models/garch/simulate').send(body);
    expect(a.status).toBe(200);
    expect(a.body.returns).toHaveLength(300);
    expect(a.body.returns).toEqual(b.body.returns);
    expect(a.body.persistence).toBeCloseTo(0.95, 6);
    const bad = await request(app).post('/api/models/garch/simulate').send({ ...body, n: 10_000 });
    expect(bad.status).toBe(400);
  });

  it('I de Moran', async () => {
    const values = Array.from({ length: 25 }, (_, i) => i % 5);
    const r = await request(app).post('/api/models/moran').send({ rows: 5, cols: 5, values, contiguity: 'rook' });
    expect(r.status).toBe(200);
    expect(r.body.I).toBeGreaterThan(0.5);
    expect(r.body.pValue).toBeLessThan(0.05);
  });

  it('biais de sélection', async () => {
    const r = await request(app).post('/api/models/selection').send({ rho: 0.7, n: 1500 });
    expect(r.status).toBe(200);
    expect(r.body.heckman.slope).toBeTypeOf('number');
  });

  it('classification d’un avis', async () => {
    const r = await request(app).post('/api/nlp/classify').send({ text: 'Accueil très agréable, personnel souriant' });
    expect(r.body.polarity).toBe('positif');
    expect(r.body.family).toBe('service_personnel');
    const empty = await request(app).post('/api/nlp/classify').send({ text: '' });
    expect(empty.status).toBe(400);
  });

  it('pas de modèle publié → 404', async () => {
    const r = await request(app).post('/api/models/stage-ecm/predict').send({ inputs: {} });
    expect(r.status).toBe(404);
  });
});

describe('contact & agent', () => {
  it('refuse un formulaire incomplet', async () => {
    const r = await request(app).post('/api/contact').send({ name: 'A', email: 'pas-un-email', message: 'court' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.fields)).toEqual(expect.arrayContaining(['name', 'email', 'message']));
  });

  it('enregistre un message valide', async () => {
    const r = await request(app)
      .post('/api/contact')
      .send({ name: 'Recruteur Test', email: 'test@example.com', message: 'Bonjour, votre profil nous intéresse beaucoup.' });
    expect(r.status).toBe(201);
    const last = fs.readFileSync(messages, 'utf8').trim().split('\n').pop()!;
    expect(JSON.parse(last).email).toBe('test@example.com');
  });

  it('ignore les robots (champ piège rempli)', async () => {
    const r = await request(app)
      .post('/api/contact')
      .send({ name: 'Bot', email: 'bot@example.com', message: 'Message automatique de robot', website: 'http://spam' });
    expect(r.status).toBe(400);
  });

  it('agent désactivé sans clé', async () => {
    const s = await request(app).get('/api/datamind/status');
    expect(s.body.enabled).toBe(false);
    const r = await request(app).post('/api/datamind/chat').send({ messages: [{ role: 'user', content: 'Bonjour' }] });
    expect(r.status).toBe(503);
  });
});
