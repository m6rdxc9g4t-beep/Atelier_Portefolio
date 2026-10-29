import { Link } from 'react-router-dom';
import type { ProjectResponse } from '../api';
import { CodeBlock } from './CodeBlock';
import { Md } from './Md';
import './project-end.css';

/**
 * Pied de page commun aux pages projets (thématisé par les variables --pe-*) :
 * fiche technique, rapports à télécharger, extrait de code, navigation entre projets.
 */
export function ProjectEnd({ project, showCode = true }: { project: ProjectResponse; showCode?: boolean }) {
  const c = project.content;
  return (
    <footer className="pe">
      <div className="pe-wrap">
        {showCode && c.codeSnippet && (
          <section className="pe-code" aria-label="Extrait du code du projet">
            <h2 className="pe-h">Dans le code</h2>
            <CodeBlock snippet={c.codeSnippet} />
          </section>
        )}

        <section className="pe-grid" aria-label="Fiche technique">
          <div className="pe-card">
            <h2 className="pe-h">Fiche technique</h2>
            <dl>
              <dt>Cadre</dt>
              <dd>{c.course}</dd>
              {c.date && c.date !== '—' && (
                <>
                  <dt>Date</dt>
                  <dd>{c.date}</dd>
                </>
              )}
              <dt>{c.authors.length > 1 ? 'Auteurs' : 'Auteur'}</dt>
              <dd>{c.authors.join(' · ')}</dd>
              {c.supervisor && (
                <>
                  <dt>Encadrement</dt>
                  <dd>{c.supervisor}</dd>
                </>
              )}
              {c.data?.source && (
                <>
                  <dt>Données</dt>
                  <dd>
                    <Md text={c.data.source} />
                  </dd>
                </>
              )}
            </dl>
            <div className="pe-tags">
              {[...c.tools, ...c.methods].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
          <div className="pe-card">
            <h2 className="pe-h">Documents</h2>
            {project.reports && project.reports.length > 0 ? (
              <ul className="pe-docs">
                {project.reports.map((r) => (
                  <li key={r.file}>
                    <a href={`/reports/${r.file}`} target="_blank" rel="noopener noreferrer">
                      <span aria-hidden>↓</span> {r.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pe-muted">Pas de rapport public pour ce projet.</p>
            )}
            {c.limits.length > 0 && (
              <>
                <h3 className="pe-h pe-h-sm">Limites identifiées</h3>
                <ul className="pe-limits">
                  {c.limits.map((l, i) => (
                    <Md key={i} as="li" text={l} />
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <nav className="pe-nav" aria-label="Autres projets">
          <Link to={`/projets/${project.previous.slug}`} className="pe-prev">
            <small>← Projet précédent</small>
            <span>{project.previous.title}</span>
          </Link>
          <Link to="/projets" className="pe-all">
            Tous les projets
          </Link>
          <Link to={`/projets/${project.next.slug}`} className="pe-next">
            <small>Projet suivant →</small>
            <span>{project.next.title}</span>
          </Link>
        </nav>
        <p className="pe-sign">
          Portfolio de <Link to="/">François Pichon</Link> — économètre
        </p>
      </div>
    </footer>
  );
}

/** Lien discret de retour au portfolio, placé dans la barre de navigation de chaque thème. */
export function BackToPortfolio({ className = '' }: { className?: string }) {
  return (
    <Link to="/projets" className={`back-portfolio ${className}`} aria-label="Retour aux projets du portfolio">
      <span aria-hidden>←</span> Portfolio
    </Link>
  );
}
