import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import '@fontsource/spectral/300.css';
import '@fontsource/spectral/400.css';
import '@fontsource/spectral/500.css';
import '@fontsource/spectral/600.css';
import '@fontsource/spectral/400-italic.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/500-italic.css';
import type { Kpi } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import './editorial.css';

/**
 * Gabarit « éditorial papier » repris des pages d'origine du portfolio
 * (SHARE, churn, Arras, Flunch) : chaque projet le colore via --ed-* et y insère ses modules.
 */

export interface NavItem {
  id: string;
  label: string;
}

export function EditorialPage({
  project,
  className = '',
  style,
  brand,
  nav,
  children,
  closing,
}: {
  project: ProjectResponse;
  className?: string;
  style?: CSSProperties;
  brand: ReactNode;
  nav: NavItem[];
  children: ReactNode;
  closing: ReactNode;
}) {
  const active = useScrollSpy(nav.map((n) => n.id));
  return (
    <div className={`ed ${className}`} style={style}>
      <nav className="ed-nav" aria-label={`Sections — ${project.title}`}>
        <div className="ed-nav-in">
          <div className="ed-brand">{brand}</div>
          <div className="ed-links">
            {nav.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'active' : ''}>
                {n.label}
              </a>
            ))}
          </div>
          <BackToPortfolio />
        </div>
      </nav>
      {children}
      <div className="ed-closing">
        <div className="ed-wrap">
          <h3>{closing}</h3>
          <div className="ed-closing-meta">
            {project.content.authors.join(' · ')}
            <br />
            <b>{project.content.course}</b>
            <br />
            {project.content.date}
          </div>
        </div>
      </div>
      <ProjectEnd project={project} />
    </div>
  );
}

export function EdHero({
  kicker,
  title,
  lede,
  project,
  meta,
  deco = true,
  children,
}: {
  kicker: ReactNode;
  title: ReactNode;
  lede: ReactNode;
  project: ProjectResponse;
  meta: ReactNode;
  deco?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="ed-hero">
      {deco && <div className="ed-hero-deco" aria-hidden />}
      <div className="ed-wrap">
        {children}
        <div className="ed-kicker">{kicker}</div>
        <h1 className="ed-title">{title}</h1>
        <p className="ed-lede">{lede}</p>
        <div className="ed-authors">
          {project.content.authors.map((a) => (
            <div key={a} className="ed-author">
              <div className="nm">{a}</div>
              <div className="rl">Auteur</div>
            </div>
          ))}
          {project.content.supervisor && (
            <div className="ed-author">
              <div className="nm">{project.content.supervisor}</div>
              <div className="rl">Encadrement</div>
            </div>
          )}
          <div className="ed-course">{meta}</div>
        </div>
      </div>
    </header>
  );
}

export function EdStats({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="ed-wrap">
      <Reveal className="ed-stats" style={{ ['--ncol' as string]: Math.min(kpis.length, 5) }}>
        {kpis.slice(0, 5).map((k) => (
          <div key={k.label} className="ed-stat" title={k.note}>
            <div className="num">
              <CountUp value={k.value} />
            </div>
            <Md as="div" className="lab" text={k.label} />
          </div>
        ))}
      </Reveal>
    </div>
  );
}

export function EdSection({
  id,
  no,
  title,
  sub,
  children,
  divider = true,
}: {
  id: string;
  no: string | number;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <>
      {divider && (
        <div className="ed-wrap">
          <div className="ed-divider" />
        </div>
      )}
      <section id={id} className="ed-section">
        <div className="ed-wrap">
          <Reveal className="ed-sec-head">
            <span className="ed-sec-no">{String(no).padStart(2, '0')}</span>
            <h2>{title}</h2>
          </Reveal>
          {sub && <div className="ed-sec-sub">{sub}</div>}
          {children}
        </div>
      </section>
    </>
  );
}

export function EdAside({ title, rows }: { title: string; rows: [ReactNode, ReactNode][] }) {
  return (
    <aside className="ed-aside">
      <h4>{title}</h4>
      <ul>
        {rows.map(([a, b], i) => (
          <li key={i}>
            <span>{a}</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function EdFindings({ items }: { items: { title: string; text: string }[] }) {
  return (
    <div className="ed-find">
      {items.map((f, i) => (
        <Reveal key={f.title} className="ed-fcard" delay={i * 60} style={{ ['--i' as string]: `"${i + 1}"` }}>
          <h5>{f.title}</h5>
          <Md as="p" text={f.text} />
        </Reveal>
      ))}
    </div>
  );
}

export function EdPull({ children }: { children: ReactNode }) {
  return (
    <Reveal as="p" className="ed-pull">
      {children}
    </Reveal>
  );
}

export function EdLimits({ items }: { items: string[] }) {
  return (
    <Reveal as="ul" className="ed-limits">
      {items.map((t, i) => (
        <Md key={i} as="li" text={t} />
      ))}
    </Reveal>
  );
}

export function EdCard({ title, sub, children, className = '' }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Reveal className={`ed-chart-card ${className}`}>
      {title && <div className="ct">{title}</div>}
      {sub && <div className="cs">{sub}</div>}
      {children}
    </Reveal>
  );
}

export function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|')]);
  return active;
}
