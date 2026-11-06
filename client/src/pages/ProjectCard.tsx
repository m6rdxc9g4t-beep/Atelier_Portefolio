import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, type ProjectSummary } from '@atelier/shared';
import { AppTile, Icon } from '../components/Icon';
import { projectGlyph } from '../lib/projectIcons';

/** Vignette d'un projet : icône carrée (app de la Suite Atelier) ou glyphe / logo du sujet sur fond neutre. */
export function ProjectMark({ project: p }: { project: ProjectSummary }) {
  if (p.atelierApp) return <AppTile app={p.atelierApp} size="lg" />;
  if (p.logo)
    return (
      <span className="p-icon p-icon--logo" aria-hidden>
        <img src={p.logo} alt="" width={36} height={36} loading="lazy" />
      </span>
    );
  return (
    <span className="p-icon" aria-hidden>
      <Icon name={projectGlyph(p.slug)} size={18} />
    </span>
  );
}

export function ProjectCard({ project: p, showKpis = false }: { project: ProjectSummary; index?: number; showKpis?: boolean }) {
  return (
    <Link to={`/projets/${p.slug}`} className="pcard">
      <div className="p-top">
        <ProjectMark project={p} />
        <div className="p-head">
          <h3>{p.title}</h3>
          <div className="p-tag">
            {p.level !== 'Projet' ? `${p.level} · ` : ''}
            {CATEGORY_LABELS[p.category]}
          </div>
        </div>
      </div>
      <p className="p-desc">{p.subtitle}</p>
      {showKpis && p.kpis.length > 0 && (
        <dl className="p-kpis">
          {p.kpis.slice(0, 4).map((k) => (
            <div key={k.label} className="p-kpi">
              <dt className="k">{k.label}</dt>
              <dd className="v">{k.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="p-foot">
        <span className="p-interactive">
          <Icon name="mouse-pointer-click" size={14} /> {p.interactive}
        </span>
        <Icon name="arrow-right" size={16} className="arr" />
      </div>
    </Link>
  );
}
