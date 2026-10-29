import { useMemo, useState } from 'react';
import type { Category, Level } from '@atelier/shared';
import { useApi, type ProjectsResponse } from '../api';
import { Reveal } from '../components/Reveal';
import { useTitle } from '../components/SiteChrome';
import { ProjectCard } from './ProjectCard';

const LEVELS: (Level | 'Tous')[] = ['Tous', 'M2', 'M1', 'Stage', 'Perso', 'Projet'];
const LEVEL_LABEL: Record<string, string> = { Tous: 'Tous', M2: 'Master 2', M1: 'Master 1', Stage: 'Stage', Perso: 'Perso', Projet: 'Power BI / autres' };

export default function Projects() {
  useTitle('Projets — François Pichon');
  const { data, error } = useApi<ProjectsResponse>('/projects');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [level, setLevel] = useState<Level | 'Tous'>('Tous');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.projects ?? []).filter(
      (p) =>
        (cat === 'all' || p.category === cat) &&
        (level === 'Tous' || p.level === level) &&
        (!needle || [p.title, p.subtitle, ...p.tools, ...p.methods].join(' ').toLowerCase().includes(needle)),
    );
  }, [data, cat, level, q]);

  const levelsPresent = LEVELS.filter((l) => l === 'Tous' || data?.projects.some((p) => p.level === l));

  return (
    <main className="projects-page">
      <header className="pp-hero">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">Portfolio · M2 Économétrie appliquée</span>
          </Reveal>
          <Reveal as="h1">
            Des données brutes à la <em>décision</em>.
          </Reveal>
          <Reveal as="p" className="sec-lede" delay={60}>
            {data?.count ?? 16} projets — santé publique, scoring du risque, séries temporelles, immobilier, économétrie spatiale, NLP, tableaux de bord… Chaque page reprend les codes visuels de son sujet et propose un <b>module interactif</b> construit à partir des résultats du rapport.
          </Reveal>
        </div>
      </header>

      <section className="wrap pp-body">
        <div className="pp-filters" role="search">
          <div className="pp-chips" aria-label="Filtrer par domaine">
            <button className={cat === 'all' ? 'is-on' : ''} onClick={() => setCat('all')}>
              Tous les domaines <span>{data?.count ?? ''}</span>
            </button>
            {data?.categories.map((c) => (
              <button key={c.id} className={cat === c.id ? 'is-on' : ''} onClick={() => setCat(c.id)}>
                {c.label} <span>{c.count}</span>
              </button>
            ))}
          </div>
          <div className="pp-row">
            <div className="pp-levels" aria-label="Filtrer par niveau">
              {levelsPresent.map((l) => (
                <button key={l} className={level === l ? 'is-on' : ''} onClick={() => setLevel(l)}>
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
            <label className="pp-search">
              <span className="sr-only">Rechercher un projet</span>
              <input type="search" placeholder="Rechercher : logit, R, Power BI, survie…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
        </div>

        {error && <p className="form-error">Impossible de charger les projets : {error.message}</p>}
        <p className="pp-count" aria-live="polite">
          {filtered.length} projet{filtered.length > 1 ? 's' : ''}
        </p>
        <div className="proj-grid proj-grid-full">
          {filtered.map((p, i) => (
            <ProjectCard key={p.slug} project={p} index={i} showKpis />
          ))}
        </div>
        {data && filtered.length === 0 && <p className="pp-empty">Aucun projet ne correspond à ces filtres.</p>}
      </section>
    </main>
  );
}
