import { Router } from 'express';
import { CATEGORY_LABELS, type Category } from '@atelier/shared';
import { getProfile, getProject, listProjects } from '../content.js';

export const projectsRouter = Router();

projectsRouter.get('/profile', (_req, res) => {
  res.json(getProfile());
});

projectsRouter.get('/projects', (req, res) => {
  const category = typeof req.query.category === 'string' ? (req.query.category as Category) : undefined;
  const all = listProjects();
  const projects = category ? all.filter((p) => p.category === category) : all;
  res.json({
    count: projects.length,
    categories: Object.entries(CATEGORY_LABELS)
      .map(([id, label]) => ({ id, label, count: all.filter((p) => p.category === id).length }))
      .filter((c) => c.count > 0),
    projects,
  });
});

projectsRouter.get('/projects/:slug', (req, res) => {
  const project = getProject(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Projet introuvable' });
  const all = listProjects();
  const i = all.findIndex((p) => p.slug === project.slug);
  const neighbour = (j: number) => {
    const p = all[(j + all.length) % all.length];
    return { slug: p.slug, title: p.title, accent: p.accent };
  };
  res.json({ ...project, previous: neighbour(i - 1), next: neighbour(i + 1) });
});
