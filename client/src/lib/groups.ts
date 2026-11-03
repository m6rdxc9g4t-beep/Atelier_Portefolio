import type { Category, ProjectSummary } from '@atelier/shared';

/**
 * Deux familles de projets dans le portfolio :
 * - les projets data (analyse, data science, visualisation) → page /projets ;
 * - les applications IA & développement (Suite Atelier, prototypes) → page /ia-dev.
 */
export function isBuildProject(p: { slug: string; category: Category }): boolean {
  return p.slug.startsWith('atelier-') || p.slug === 'agent-ops-lab' || p.category === 'ia' || p.category === 'dev';
}

export function splitProjects(projects: ProjectSummary[]) {
  return {
    data: projects.filter((p) => !isBuildProject(p)),
    build: projects.filter(isBuildProject),
  };
}
