import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import type { DemoEntry } from '../demos/registry';

/** Carte d'une démo interactive (page /demos et accueil). */
export function DemoCard({ demo }: { demo: DemoEntry }) {
  return (
    <Link to={`/demos/${demo.slug}`} className="demo-card">
      <span className="demo-card-icon" aria-hidden="true">
        <Icon name={demo.icon as never} size={20} />
      </span>
      <span className="demo-card-body">
        <span className="demo-card-title">
          {demo.title}
          {demo.realData && <span className="demo-card-badge">Données réelles</span>}
        </span>
        <span className="demo-card-summary">{demo.summary}</span>
        <span className="demo-card-skills">
          {demo.skills.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </span>
      </span>
      <span className="demo-card-go">
        Ouvrir <Icon name="arrow-right" size={14} />
      </span>
    </Link>
  );
}
