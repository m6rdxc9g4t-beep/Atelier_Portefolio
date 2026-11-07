import type { ProjectResponse } from '../../api';
import { BlockView, SectionBody } from '../../components/Blocks';
import { AppTile, Icon } from '../../components/Icon';
import { Md } from '../../components/Md';
import { Reveal } from '../../components/Reveal';
import { ThemeSwitch } from '../../components/SiteChrome';
import { EdHero, EdLimits, EdSection, EditorialPage } from '../editorial/Editorial';
import './style.css';

/**
 * Adresse de la démo publique de DataMind (service datamind-demo du VPS), fixée à la construction :
 * VITE_DATAMIND_DEMO_URL (docker/portfolio.Dockerfile d'Atelier_Deploy : https://demo-datamind.<domaine>).
 * Vide (développement, autre hébergement) : le bouton est remplacé par une mention, sans lien mort.
 */
const DEMO_URL = (import.meta.env.VITE_DATAMIND_DEMO_URL ?? '').trim();
const CODE_URL = 'https://github.com/m6rdxc9g4t-beep/Agent_Data';

const NAV = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'analyses', label: 'Analyses' },
  { id: 'livrables', label: 'Livrables' },
  { id: 'local', label: 'Local' },
  { id: 'demo', label: 'Démo' },
  { id: 'architecture', label: 'Architecture' },
];

/** Bouton principal vers la démo, lien vers le code et mention honnête de ce qu'est la démo. */
function DemoActions({ id }: { id: string }) {
  return (
    <div className="dm-actions">
      <div className="dm-buttons">
        {DEMO_URL ? (
          <a className="dm-btn atelier-btn-primary" href={DEMO_URL} aria-describedby={`${id}-note`}>
            Essayer la démo
            <Icon name="arrow-up-right" size={15} />
          </a>
        ) : (
          <span className="dm-btn dm-btn--off" aria-disabled="true">
            Démo en ligne disponible sur le site publié
          </span>
        )}
        <a className="dm-btn" href={CODE_URL} target="_blank" rel="noopener noreferrer">
          <Icon name="github" size={15} />
          Code source
        </a>
      </div>
      <p className="dm-note" id={`${id}-note`}>
        <Icon name="circle-alert" size={14} />
        <span>Démo publique : jeux d’exemple, IA du serveur, réponses lentes.</span>
      </p>
    </div>
  );
}

/**
 * Page de DataMind (Agent_Data) : l'application réelle dans le système de la Suite Atelier
 * (signature indigo), chiffres clés en cartes, captures claires et sombres, accès à la démo publique.
 */
export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const sections = c.sections;
  // Capture principale (clair / sombre), sous les chiffres clés : figures.hero de la fiche.
  const hero = c.figures.hero as { src: string; srcDark?: string; caption: string } | undefined;
  const brand = (
    <span className="atelier-brand">
      <AppTile app="datamind" />
      <span className="atelier-brand__name">
        <span className="atelier-brand__prefix">Atelier </span>DataMind
      </span>
    </span>
  );
  return (
    <EditorialPage
      project={project}
      className="ed--atelier dm"
      app="datamind"
      tools={<ThemeSwitch />}
      brand={brand}
      nav={NAV}
      closing={c.conclusions[0] ?? c.subtitle}
    >
      <EdHero
        project={project}
        kicker={c.course}
        title={c.title}
        lede={c.abstract}
        meta={<>{c.date}</>}
        deco={false}
        actions={<DemoActions id="dm-hero" />}
      />

      <div className="ed-wrap">
        <Reveal className="dm-kpis">
          {c.kpis.map((k) => (
            <div key={k.label} className="dm-kpi">
              <strong className="dm-kpi__value">{k.value}</strong>
              <Md as="span" className="dm-kpi__label" text={k.label} />
            </div>
          ))}
        </Reveal>
        {hero && (
          <div className="dm-shot">
            <BlockView block={{ type: 'figure', ...hero }} />
          </div>
        )}
      </div>

      {sections.map((s, i) => (
        <EdSection key={s.id} id={s.id} no={i + 1} title={s.title}>
          <SectionBody section={s} />
          {s.id === 'demo' && (
            <div className="dm-demo-cta">
              <DemoActions id="dm-demo" />
            </div>
          )}
        </EdSection>
      ))}

      <EdSection id="conclusion" no={sections.length + 1} title="À retenir">
        <Md as="p" text={c.question} />
        <EdLimits items={c.conclusions} />
      </EdSection>
    </EditorialPage>
  );
}
