import { useState } from 'react';
import '@fontsource-variable/archivo/standard.css';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import './style.css';

/** Projet Power BI « gammes » : sélecteur façon configurateur automobile + rapport intégré. */
export default function Page({ project }: { project: ProjectResponse }) {
  const pages = project.powerbi ?? [];
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const c = project.content;

  return (
    <div className="pw">
      <nav className="pw-nav">
        <div className="pw-wrap pw-nav-in">
          <span className="pw-brand">Suivi des gammes · Power BI</span>
          <BackToPortfolio />
        </div>
      </nav>

      <header className="pw-hero">
        <div className="pw-speed" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ top: `${12 + i * 9}%`, animationDelay: `${i * 0.35}s`, width: `${30 + ((i * 23) % 50)}%` }} />
          ))}
        </div>
        <div className="pw-wrap">
          <Reveal className="pw-kicker">{c.course}</Reveal>
          <Reveal as="h1">
            Trois gammes.
            <br />
            <span>Trois tableaux de bord.</span>
          </Reveal>
          <Reveal as="p" className="pw-lede" delay={80}>
            {c.abstract}
          </Reveal>
        </div>
      </header>

      <section className="pw-wrap pw-config" aria-label="Choix de la gamme">
        <div className="pw-models" role="tablist">
          {pages.map((p, i) => (
            <button
              key={p.label}
              role="tab"
              aria-selected={i === active}
              className={i === active ? 'is-on' : ''}
              onClick={() => setActive(i)}
            >
              <small>{String(i + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}</small>
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        <Reveal className="pw-stage">
          <div className="pw-stage-head">
            <div>
              <div className="pw-stage-label">Gamme sélectionnée</div>
              <div className="pw-stage-title">{pages[active]?.label}</div>
            </div>
            <a href={pages[active]?.url} target="_blank" rel="noopener noreferrer" className="pw-ext">
              Ouvrir dans Power BI ↗
            </a>
          </div>
          <div className="pw-frame">
            {loaded ? (
              <iframe key={pages[active]?.url} src={pages[active]?.url} title={`Tableau de bord ${pages[active]?.label}`} allowFullScreen loading="lazy" />
            ) : (
              <div className="pw-gate">
                <div className="pw-gauge" aria-hidden>
                  <svg viewBox="0 0 200 120">
                    <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="10" strokeLinecap="round" />
                    <path className="pw-gauge-arc" d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="#d5001c" strokeWidth="10" strokeLinecap="round" />
                    {Array.from({ length: 11 }, (_, i) => {
                      const a = Math.PI - (i / 10) * Math.PI;
                      return <line key={i} x1={100 + Math.cos(a) * 64} y1={110 - Math.sin(a) * 64} x2={100 + Math.cos(a) * 56} y2={110 - Math.sin(a) * 56} stroke="currentColor" strokeOpacity=".5" />;
                    })}
                  </svg>
                </div>
                <p>Le rapport interactif est hébergé par Microsoft Power BI.</p>
                <button onClick={() => setLoaded(true)}>Démarrer le tableau de bord</button>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      <ProjectEnd project={project} />
    </div>
  );
}
