import { useEffect, useState } from 'react';
import type { Category, Project, ProjectSummary } from '@atelier/shared';

export interface ProjectsResponse {
  count: number;
  categories: { id: Category; label: string; count: number }[];
  projects: ProjectSummary[];
}

export interface Neighbour {
  slug: string;
  title: string;
  accent: string;
}

export type ProjectResponse = Project & { previous: Neighbour; next: Neighbour };

export interface Profile {
  name: string;
  headline: string;
  status: string;
  school: string;
  intro: string;
  motto: string;
  about: string;
  photo: string;
  cv: string;
  contact: { email: string; phone: string; phoneHref: string; linkedin: string; github: string; location: string };
  skills: { group: string; certified?: boolean; items: string[]; highlight?: string[] }[];
  languages: { name: string; level: string }[];
  qualities: string[];
  experiences: { when: string; title: string; org: string; tag?: string; featured?: boolean; points: string[] }[];
  education: { when: string; title: string; org: string }[];
  highlights: { level: string; items: string[] }[];
  passions: { icon: string; title: string; figure: string; unit: string; text: string; tags: string[]; accent: string }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { Accept: 'application/json', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erreur ${res.status}`, data);
  return data as T;
}

const cache = new Map<string, unknown>();

/** Requête GET mise en cache pour la session (le contenu ne change pas pendant la visite). */
export function useApi<T>(path: string | null): { data: T | undefined; error: Error | undefined; loading: boolean } {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>(() => ({
    data: path ? (cache.get(path) as T | undefined) : undefined,
    loading: Boolean(path && !cache.has(path)),
  }));

  useEffect(() => {
    if (!path) return;
    if (cache.has(path)) {
      setState({ data: cache.get(path) as T, loading: false });
      return;
    }
    let alive = true;
    setState({ loading: true });
    api<T>(path)
      .then((data) => {
        cache.set(path, data);
        if (alive) setState({ data, loading: false });
      })
      .catch((error: Error) => alive && setState({ error, loading: false }));
    return () => {
      alive = false;
    };
  }, [path]);

  return { data: state.data, error: state.error, loading: state.loading };
}
