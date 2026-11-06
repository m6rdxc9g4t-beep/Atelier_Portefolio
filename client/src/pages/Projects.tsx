import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, type Category, type Level } from '@atelier/shared';
import { splitProjects } from '../lib/groups';
import { useApi, type ProjectsResponse } from '../api';
import { Icon } from '../components/Icon';
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

  // Cette page présente les projets data ; les applications IA & dev ont leur page (/ia-dev).
  const { data: dataProjects, build } = useMemo(() => splitProjects(data?.projects ?? []), [data]);
  const categories = useMemo(() => {
    const ids = Array.from(new Set(dataProjects.map((p) => p.category)));
    return ids.map((id) => ({ id, label: CATEGORY_LABELS[id], count: dataProjects.filter((p) => p.category === id).length }));
  }, [dataProjects]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return dataProjects.filter(
      (p) =>
        (cat === 'all' || p.category === cat) &&
        (level === 'Tous' || p.level === level) &&
        (!needle || [p.title, p.subtitle, ...p.tools, ...p.methods].join(' ').toLowerCase().includes(needle)),
    );
  }, [dataProjects, cat, level, q]);

  const levelsPresent = LEVELS.filter((l) => l === 'Tous' || dataProjects.some((p) => p.level === l));

  return (
    <main className="projects-page">
      <header className="pp-hero">
        <div className="wrap">
          <h1>
            Des données brutes à la <em>décision</em>.
          </h1>
          <p className="sec-lede">
            {dataProjects.length || 15} projets d’analyse, de data science et de visualisation — santé publique, scoring du risque, séries temporelles, immobilier, économétrie spatiale, NLP, tableaux de bord… Chaque page reprend les codes visuels de son sujet et propose un <b>module interactif</b> construit à partir des résultats du rapport, avec ses <b>tests et résultats en graphiques</b>.
          </p>
        </div>
      </header>

      <section className="wrap pp-body">
        <div className="pp-filters" role="search">
          <div className="pp-chips" aria-label="Filtrer par domaine">
            <button aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
              Tous les domaines <span>{dataProjects.length || ''}</span>
            </button>
            {categories.map((c) => (
              <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                {c.label} <span>{c.count}</span>
              </button>
            ))}
          </div>
          <div className="pp-row">
            <div className="pp-levels" aria-label="Filtrer par niveau">
              {levelsPresent.map((l) => (
                <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
            <label className="pp-search">
              <span className="sr-only">Rechercher un projet</span>
              <Icon name="search" size={15} />
              <input type="search" placeholder="Rechercher : logit, R, Power BI, survie…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            <Icon name="circle-alert" /> Impossible de charger les projets : {error.message}
          </p>
        )}
        <p className="pp-count" aria-live="polite">
          {filtered.length} projet{filtered.length > 1 ? 's' : ''}
        </p>
        <div className="proj-grid proj-grid-full">
          {filtered.map((p) => (
            <ProjectCard key={p.slug} project={p} showKpis />
          ))}
        </div>
        {data && filtered.length === 0 && (
          <div className="pp-empty">
            <p>Aucun projet ne correspond à ces filtres.</p>
            <button
              className="btn"
              onClick={() => {
                setCat('all');
                setLevel('Tous');
                setQ('');
              }}
            >
              Effacer les filtres
            </button>
          </div>
        )}
        {build.length > 0 && (
          <div className="pp-switch">
            <div>
              <strong>IA &amp; développement : {build.length} projets de plus.</strong>
              <span>La Suite Atelier, son hub d’agents IA et des prototypes d’agents dans des logiciels métier.</span>
            </div>
            <Link to="/ia-dev" className="btn btn-primary">
              Voir la page IA &amp; dev <Icon name="arrow-right" />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
