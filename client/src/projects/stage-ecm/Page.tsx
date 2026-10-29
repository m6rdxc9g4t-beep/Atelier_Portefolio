import { useState } from 'react';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { Md } from '../../components/Md';
import { CountUp } from '../../components/CountUp';
import './style.css';

interface Module {
  id: string;
  label: string;
  icon: string;
  pages: string[];
}

/** Stage ECM : réplique interactive de la coquille de l'outil de reporting (sans données internes). */
export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const modules = c.figures.modules as Module[];
  const [mod, setMod] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const current = modules.find((m) => m.id === mod);

  const select = (id: string | null, p = 0) => {
    setMod(id);
    setPage(p);
  };

  return (
    <div className="ecm">
      <nav className="ecm-nav">
        <div className="ecm-wrap ecm-nav-in">
          <span className="ecm-brand">
            <span className="ecm-dot" /> Stage · <b>ECM</b>
          </span>
          <BackToPortfolio />
        </div>
      </nav>

      <header className="ecm-hero">
        <div className="ecm-wrap">
          <Reveal className="ecm-eyebrow">{c.course} · {c.date}</Reveal>
          <Reveal as="h1">
            Un outil de reporting,
            <em> un seul point d’entrée.</em>
          </Reveal>
          <Reveal as="p" className="ecm-lede" delay={80}>
            {c.abstract}
          </Reveal>
          <Reveal className="ecm-kpis" delay={140}>
            {c.kpis.map((k) => (
              <div key={k.label}>
                <strong>
                  <CountUp value={k.value} />
                </strong>
                <span>{k.label}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </header>

      <section className="ecm-wrap ecm-section">
        <Reveal className="ecm-sec-head">
          <span>01</span>
          <h2>Architecture de l’outil</h2>
        </Reveal>
        <Reveal as="p" className="ecm-sec-lede">
          Cliquez dans la barre latérale : c’est la structure de navigation de l’outil livré (vue globale, modules métiers et leurs pages). Les données de l’entreprise sont confidentielles, les écrans ci-dessous sont donc des maquettes vides.
        </Reveal>

        <Reveal className="ecm-app" delay={60}>
          <aside className="ecm-side">
            <div className="ecm-logo">ECM</div>
            <div className="ecm-side-label">Tableau de bord</div>
            <button className={`ecm-global ${mod === null ? 'is-on' : ''}`} onClick={() => select(null)}>
              <span>🏠</span> Vue globale
            </button>
            <div className="ecm-sep" />
            {modules.map((m) => (
              <div key={m.id} className={`ecm-mod ${mod === m.id ? 'open' : ''}`}>
                <button className="ecm-mod-head" onClick={() => (mod === m.id ? select(null) : select(m.id))} aria-expanded={mod === m.id}>
                  <span>{m.icon}</span> {m.label} <i>›</i>
                </button>
                <div className="ecm-sub">
                  {m.pages.map((p, i) => (
                    <button key={p} className={mod === m.id && page === i ? 'is-on' : ''} onClick={() => select(m.id, i)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="ecm-side-foot">
              <span className="ecm-dot" /> Système prêt
            </div>
          </aside>
          <div className="ecm-main">
            <div className="ecm-top">
              <div>
                <div className="ecm-crumb">
                  {current ? (
                    <>
                      {current.label} <span>›</span> <b>{current.pages[page]}</b>
                    </>
                  ) : (
                    <b>Vue globale</b>
                  )}
                </div>
                <div className="ecm-title">{current ? `${current.label} — ${current.pages[page]}` : 'Vue globale des modules'}</div>
              </div>
              <div className="ecm-top-btns">
                <span>↻ Actualiser</span>
                <span>⛶ Plein écran</span>
              </div>
            </div>
            <div className="ecm-canvas" key={`${mod}-${page}`}>
              {current ? (
                <div className="ecm-mock">
                  <div className="ecm-mock-kpis">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="sk sk-kpi" />
                    ))}
                  </div>
                  <div className="ecm-mock-row">
                    <div className="sk sk-chart">
                      {Array.from({ length: 12 }, (_, i) => (
                        <i key={i} style={{ height: `${30 + ((i * 37 + page * 13 + current.id.length * 7) % 60)}%` }} />
                      ))}
                    </div>
                    <div className="sk sk-donut" />
                  </div>
                  <div className="sk sk-table" />
                  <p className="ecm-confidential">Page « {current.pages[page]} » du module {current.label} — données internes non publiées.</p>
                </div>
              ) : (
                <div className="ecm-overview">
                  {modules.map((m) => (
                    <button key={m.id} className="ecm-tile" onClick={() => select(m.id)}>
                      <span className="ecm-tile-ic">{m.icon}</span>
                      <b>{m.label}</b>
                      <small>{m.pages.length} pages</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </section>

      <section className="ecm-wrap ecm-section">
        <Reveal className="ecm-sec-head">
          <span>02</span>
          <h2>La mission</h2>
        </Reveal>
        <div className="ecm-mission">
          {c.sections[0].blocks.flatMap((b) => (b.type === 'list' ? b.items : [])).map((it, i) => (
            <Reveal key={i} className="ecm-mission-card" delay={i * 70}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <Md as="p" text={it} />
            </Reveal>
          ))}
        </div>
      </section>

      <ProjectEnd project={project} />
    </div>
  );
}
