import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, type ProjectSummary } from '@atelier/shared';
import { Reveal } from '../components/Reveal';

export function ProjectCard({ project: p, index = 0, showKpis = false }: { project: ProjectSummary; index?: number; showKpis?: boolean }) {
  return (
    <Reveal delay={(index % 3) * 70} className="pcard-wrap">
      <Link to={`/projets/${p.slug}`} className="pcard" style={{ ['--accent' as string]: p.accent }}>
        <div className="p-top">
          <div className="p-icon" aria-hidden>
            {p.icon}
          </div>
          <div>
            <h3>{p.title}</h3>
            <div className="p-tag">
              {p.level !== 'Projet' ? `${p.level} · ` : ''}
              {CATEGORY_LABELS[p.category]}
            </div>
          </div>
        </div>
        <p className="p-desc">{p.subtitle}</p>
        {showKpis && p.kpis.length > 0 && (
          <div className="p-kpis">
            {p.kpis.slice(0, 4).map((k) => (
              <div key={k.label} className="p-kpi">
                <div className="v">{k.value}</div>
                <div className="k">{k.label}</div>
              </div>
            ))}
          </div>
        )}
        <div className="p-foot">
          <span className="p-interactive">◆ {p.interactive}</span>
          <span className="arr" aria-hidden>
            →
          </span>
        </div>
      </Link>
    </Reveal>
  );
}
