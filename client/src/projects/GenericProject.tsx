import type { ProjectResponse } from '../api';
import { Md } from '../components/Md';
import { SectionBody } from '../components/Blocks';
import { AppTile } from '../components/Icon';
import { ThemeSwitch } from '../components/SiteChrome';
import { EdHero, EdLimits, EdSection, EdStats, EditorialPage } from './editorial/Editorial';

/** Nom court d'une app de la Suite Atelier, tiré du titre (« Atelier Nexus — hub… » → « Nexus »). */
function appName(title: string) {
  return title.split(' — ')[0].replace(/^Atelier\s+/, '');
}

/** Page par défaut : affiche n'importe quelle fiche (utile pour ajouter un projet sans thème dédié). */
export default function GenericProject({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const nav = [...c.sections.map((s) => ({ id: s.id, label: s.title.split(' ')[0] })), { id: 'conclusion', label: 'Conclusion' }];
  const app = project.atelierApp;
  // Les apps de la Suite Atelier sont présentées dans le système de la suite : icône carrée, signature, thème clair / sombre.
  const brand = app ? (
    <span className="atelier-brand">
      <AppTile app={app} />
      <span className="atelier-brand__name">
        {c.title.startsWith('Atelier ') && <span className="atelier-brand__prefix">Atelier </span>}
        {c.title.startsWith('Atelier ') ? appName(c.title) : c.title.split(' — ')[0]}
      </span>
    </span>
  ) : (
    <>
      {project.icon} <b>{c.title}</b>
    </>
  );
  return (
    <EditorialPage
      project={project}
      className={app ? 'ed--atelier' : ''}
      app={app}
      tools={app ? <ThemeSwitch /> : undefined}
      style={app ? undefined : { ['--ed-accent' as string]: project.accent }}
      brand={brand}
      nav={nav.slice(0, 7)}
      closing={c.conclusions[0] ?? c.subtitle}
    >
      <EdHero project={project} kicker={c.course} title={c.title} lede={c.abstract} meta={<>{c.date}</>} deco={!app} />
      <EdStats kpis={c.kpis} />
      {c.sections.map((s, i) => (
        <EdSection key={s.id} id={s.id} no={i + 1} title={s.title}>
          <SectionBody section={s} />
        </EdSection>
      ))}
      <EdSection id="conclusion" no={c.sections.length + 1} title="À retenir">
        <Md as="p" text={c.question} />
        <EdLimits items={c.conclusions} />
      </EdSection>
    </EditorialPage>
  );
}
