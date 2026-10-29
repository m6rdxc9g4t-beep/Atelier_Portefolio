import type { ProjectResponse } from '../api';
import { Md } from '../components/Md';
import { SectionBody } from '../components/Blocks';
import { EdHero, EdLimits, EdSection, EdStats, EditorialPage } from './editorial/Editorial';

/** Page par défaut : affiche n'importe quelle fiche (utile pour ajouter un projet sans thème dédié). */
export default function GenericProject({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const nav = [...c.sections.map((s) => ({ id: s.id, label: s.title.split(' ')[0] })), { id: 'conclusion', label: 'Conclusion' }];
  return (
    <EditorialPage
      project={project}
      style={{ ['--ed-accent' as string]: project.accent }}
      brand={<>{project.icon} <b>{c.title}</b></>}
      nav={nav.slice(0, 7)}
      closing={c.conclusions[0] ?? c.subtitle}
    >
      <EdHero project={project} kicker={c.course} title={c.title} lede={c.abstract} meta={<>{c.date}</>} />
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
