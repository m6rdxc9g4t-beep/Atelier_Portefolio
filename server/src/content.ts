import fs from 'node:fs';
import path from 'node:path';
import { CATALOG, type Project, type ProjectContent, type ProjectSummary } from '@atelier/shared';
import { config } from './config.js';

/**
 * Chargement des fiches projets (data/projects/<slug>.json) fusionnées avec le catalogue.
 * En développement, les fichiers sont relus à chaque requête pour voir les modifications sans redémarrer.
 */

let cache: Map<string, ProjectContent> | null = null;
let profileCache: unknown = null;

/** U+202F (espace fine insécable) n'existe dans aucune police du site : on sert U+00A0 à la place. */
function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/\u202f/g, '\u00a0')) as T;
}

function load(): Map<string, ProjectContent> {
  if (cache && config.isProd) return cache;
  const dir = path.join(config.dataDir, 'projects');
  const map = new Map<string, ProjectContent>();
  for (const meta of CATALOG) {
    const file = path.join(dir, `${meta.slug}.json`);
    if (!fs.existsSync(file)) continue;
    const content = readJson<ProjectContent>(file);
    if (content.slug !== meta.slug) {
      throw new Error(`Slug incohérent dans ${file} : ${content.slug}`);
    }
    map.set(meta.slug, content);
  }
  cache = map;
  return map;
}

export function listProjects(): ProjectSummary[] {
  const contents = load();
  return CATALOG.filter((m) => contents.has(m.slug))
    .sort((a, b) => a.order - b.order)
    .map((meta) => {
      const c = contents.get(meta.slug)!;
      return {
        ...meta,
        title: c.title,
        subtitle: c.subtitle,
        course: c.course,
        level: c.level,
        date: c.date,
        authors: c.authors,
        tools: c.tools,
        methods: c.methods,
        kpis: c.kpis.slice(0, 4),
      };
    });
}

export function getProject(slug: string): Project | undefined {
  const summary = listProjects().find((p) => p.slug === slug);
  if (!summary) return undefined;
  return { ...summary, content: load().get(slug)! };
}

export function getProfile(): unknown {
  if (profileCache && config.isProd) return profileCache;
  profileCache = readJson(path.join(config.dataDir, 'profile.json'));
  return profileCache;
}

/** Utilisé par les tests pour repartir d'un état propre. */
export function resetContentCache(): void {
  cache = null;
  profileCache = null;
}
