import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, type Category } from '@atelier/shared';
import { useApi, type ProjectsResponse } from '../api';
import { Icon } from '../components/Icon';
import { SuiteSchema } from '../components/SuiteSchema';
import { CountUp } from '../components/CountUp';
import { useTitle } from '../components/SiteChrome';
import { splitProjects } from '../lib/groups';
import { ProjectCard } from './ProjectCard';

/** Page « IA & développement » : la Suite Atelier et les prototypes d'agents IA. */
export default function IaDev() {
  useTitle('IA & développement — François Pichon');
  const { data, error } = useApi<ProjectsResponse>('/projects');
  const build = useMemo(() => splitProjects(data?.projects ?? []).build, [data]);
  const [cat, setCat] = useState<Category | 'all'>('all');

  const cats = useMemo(() => {
    const ids = Array.from(new Set(build.map((p) => p.category)));
    return ids.map((id) => ({ id, label: CATEGORY_LABELS[id], count: build.filter((p) => p.category === id).length }));
  }, [build]);
  const shown = cat === 'all' ? build : build.filter((p) => p.category === cat);
  const suite = build.filter((p) => p.slug.startsWith('atelier-')).length;

  return (
    <main className="projects-page iadev-page">
      <header className="pp-hero">
        <div className="wrap">
          <h1>
            Des agents et des applications qui <em>travaillent</em> ensemble.
          </h1>
          <p className="sec-lede">
            Au-delà de l’analyse, je construis les outils : la <b>Suite Atelier</b> — BI locale, tableur, conversion de relevés, gestion de projet, finances, CRM freelance — reliée par <b>Atelier Nexus</b>, un hub d’agents IA qui lisent, analysent et agissent avec une <b>validation humaine</b> de chaque action. Et des prototypes d’agents dans des logiciels métier, comme <b>Agent Ops Lab</b>.
          </p>
          <div className="stat-band iadev-stats">
            <div className="stat">
              <div className="v">
                <CountUp value={String(build.length || 9)} />
              </div>
              <div className="k">Projets IA &amp; développement</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value={String(suite || 7)} />
              </div>
              <div className="k">Applications de la Suite Atelier</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value="17" />
              </div>
              <div className="k">Agents experts orchestrés par Nexus</div>
            </div>
            <div className="stat">
              <div className="v">100&nbsp;%</div>
              <div className="k">Local possible pour les données sensibles</div>
            </div>
          </div>
        </div>
      </header>

      <section className="wrap iadev-schema-sec">
        <SuiteSchema />
        <div className="iadev-principles">
          <div className="iadev-principle">
            <Icon name="shield-check" size={18} />
            <h3>L’humain valide</h3>
            <p>Les agents proposent, expliquent leur raisonnement et attendent l’accord avant d’agir.</p>
          </div>
          <div className="iadev-principle">
            <Icon name="hard-drive" size={18} />
            <h3>Local d’abord</h3>
            <p>Les données restent sur la machine par défaut ; l’IA en ligne ne s’active que sur demande.</p>
          </div>
          <div className="iadev-principle">
            <Icon name="link-2" size={18} />
            <h3>Un contrat commun</h3>
            <p>Les applications partagent un format de tables et un manifeste d’actions : rien n’est ressaisi.</p>
          </div>
        </div>
      </section>

      <section className="wrap pp-body">
        <div className="pp-filters" role="search">
          <div className="pp-chips" aria-label="Filtrer par type">
            <button aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
              Tous <span>{build.length || ''}</span>
            </button>
            {cats.map((c) => (
              <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                {c.label} <span>{c.count}</span>
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="circle-alert" /> Impossible de charger les projets : {error.message}
          </p>
        )}
        <div className="proj-grid proj-grid-full">
          {shown.map((p) => (
            <ProjectCard key={p.slug} project={p} showKpis />
          ))}
        </div>
        <div className="pp-switch">
          <div>
            <strong>Le cœur de mon métier reste la donnée.</strong>
            <span>Scoring, séries temporelles, économétrie spatiale, analyse textuelle, tableaux de bord : chaque étude a sa page interactive.</span>
          </div>
          <Link to="/projets" className="btn btn-primary">
            Voir les projets data <Icon name="arrow-right" />
          </Link>
        </div>
      </section>
    </main>
  );
}
