import type { ReactNode } from 'react';
import type { Block } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { Md } from '../../components/Md';
import { BlockView, findSection } from '../../components/Blocks';
import { EdAside, EdFindings, EdHero, EdPull, EdSection, EdStats, useScrollSpy } from '../editorial/Editorial';
import { BoxCompare, CountryExplorer, LoessReader, ModelBlocks, ModelLadder, ProfileDumbbell } from './modules';
import './style.css';

const NAV = [
  { id: 'contexte', label: 'Contexte' },
  { id: 'donnees', label: 'Données' },
  { id: 'methode', label: 'Méthode' },
  { id: 'profils', label: 'Profils' },
  { id: 'acces', label: 'Accès' },
  { id: 'intensite', label: 'Intensité' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'retenir', label: 'À retenir' },
];

const BLOCKS = ['constante, pays', '+ profil', '+ santé', '+ statut social'];

/** « **Titre.** texte » → { title, text } */
const splitBold = (s: string) => {
  const m = s.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  return m ? { title: m[1].replace(/[.:]$/, ''), text: m[2] } : { title: '', text: s };
};

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const active = useScrollSpy(NAV.map((n) => n.id));
  const sec = (id: string) => findSection(c.sections, id);
  const blocks = (id: string, keep: (b: Block) => boolean = () => true) => (sec(id)?.blocks ?? []).filter(keep);
  const methodeList = blocks('methode', (b) => b.type === 'list')[0];
  const accesTexts = blocks('acces', (b) => b.type === 'text');
  const findings = accesTexts.filter((b) => b.type === 'text' && /^\*\*/.test(b.md)).map((b) => splitBold((b as Extract<Block, { type: 'text' }>).md));
  const figs = blocks('profils', (b) => b.type === 'figure');
  const [cursus, intitule] = c.course.split(' — ');

  return (
    <div className="ed rs">
      <nav className="ed-nav" aria-label={`Sections — ${c.title}`}>
        <div className="ed-nav-in">
          <div className="ed-brand">
            SHARE · <b>Recours aux soins</b>
          </div>
          <div className="ed-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'active' : ''}>
                {n.label}
              </a>
            ))}
          </div>
          <BackToPortfolio />
        </div>
      </nav>

      <EdHero
        project={project}
        kicker={`${intitule} — ${cursus}`}
        title={
          <>
            <span className="line">Qui consulte le médecin ?</span>
            <span className="line">
              Le <em>recours aux soins</em> des 50 ans et plus en Europe
            </span>
          </>
        }
        lede={c.subtitle + '.'}
        meta={
          <>
            Données · SHARE
            <br />
            11 pays européens
            <br />N = 27 246 répondants
          </>
        }
      >
        <div className="rs-hero-pulse" aria-hidden>
          <svg viewBox="0 0 600 80" preserveAspectRatio="none">
            <path d="M0 50 H170 l12 -26 l14 52 l12 -40 l10 14 H330 l10 -8 l10 8 H600" />
          </svg>
        </div>
      </EdHero>

      <EdStats kpis={c.kpis} />

      {/* 01 — contexte */}
      <EdSection id="contexte" no={1} title="Contexte et objectif" sub="Pourquoi étudier les inégalités de recours aux soins ?">
        <div className="ed-two">
          <Reveal>
            {blocks('contexte').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
            <Md as="p" className="rs-question" text={c.question} />
          </Reveal>
          <EdAside
            title="Deux recours, deux marges"
            rows={[
              ['Généraliste (GP)', 'consulter ? combien ?'],
              ['Hôpital (Hosp)', 'séjour ? combien ?'],
              ['Comparaison', 'migrants / natifs'],
              ['Population', '50 ans et plus'],
            ]}
          />
        </div>
      </EdSection>

      {/* 02 — données */}
      <EdSection id="donnees" no={2} title="Les données SHARE" sub="Survey of Health, Ageing and Retirement in Europe">
        <div className="ed-two">
          <Reveal>
            {blocks('donnees', (b) => b.type === 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <EdAside
            title="L'échantillon"
            rows={[
              ['Répondants', '27 246'],
              ['Consultants du généraliste', '21 504'],
              ['Sans consultation', '5 742'],
              ['Personnes hospitalisées', '3 541'],
              ['Migrants', '2 197 · 8,1 %'],
            ]}
          />
        </div>
        {f.pays && <CountryExplorer pays={f.pays} />}
        <details className="rs-details">
          <summary>Tableau 1 complet</summary>
          {blocks('donnees', (b) => b.type === 'table').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </details>
      </EdSection>

      {/* 03 — méthode */}
      <EdSection id="methode" no={3} title="Méthode : l'accès, puis l'intensité" sub="Deux décisions, quatre modèles emboîtés">
        <Reveal className="rs-stack">
          {blocks('methode', (b) => b.type === 'text' || b.type === 'formula').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        {methodeList?.type === 'list' && <ModelBlocks items={methodeList.items} />}
      </EdSection>

      {/* 04 — profils */}
      <EdSection id="profils" no={4} title="Qui consulte un généraliste ?" sub="Consultants et non-consultants · âge · statut migratoire">
        <Reveal>{blocks('profils', (b) => b.type === 'text').slice(0, 1).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
        {f.profils && <ProfileDumbbell rows={f.profils.rows} />}
        <Reveal>{blocks('profils', (b) => b.type === 'text').slice(1).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
        <div className="ed-grid2 rs-mt">
          {f.loess_age_log_gp && <LoessReader data={f.loess_age_log_gp} />}
          {f.boxplot_migrant && <BoxCompare box={f.boxplot_migrant} />}
        </div>
        {figs.length > 0 && (
          <details className="rs-details">
            <summary>Les figures originales du rapport ({figs.length})</summary>
            <div className="ed-grid2">
              {figs.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </div>
          </details>
        )}
      </EdSection>

      {/* 05 — accès */}
      <EdSection id="acces" no={5} title="Accès aux soins : quatre modèles" sub="Tableau 3 · moindres carrés ordinaires">
        <Reveal>{accesTexts.filter((b) => b.type === 'text' && !/^\*\*/.test(b.md)).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
        {f.acces_modeles && <ModelLadder acces={f.acces_modeles} blocks={BLOCKS} />}
        {findings.length > 0 && <EdFindings items={findings.slice(0, 3)} />}
        {findings.length > 3 && (
          <div className="ed-find rs-find-2">
            {findings.slice(3).map((it, i) => (
              <Reveal key={i} className="ed-fcard" style={{ ['--i' as string]: `"${i + 4}"` }}>
                <h5>{it.title}</h5>
                <Md as="p" text={it.text} />
              </Reveal>
            ))}
          </div>
        )}
        {blocks('acces', (b) => b.type === 'callout').map((b, i) => (
          <Reveal key={i} className="rs-mt">
            <BlockView block={b} />
          </Reveal>
        ))}
        <details className="rs-details">
          <summary>Tableau 3 complet et ajustement</summary>
          {blocks('acces', (b) => b.type === 'table').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </details>
      </EdSection>

      {/* 06 — intensité */}
      <EdSection id="intensite" no={6} title="Intensité du recours" sub="Généraliste et hôpital, chez ceux qui consultent">
        <div className="ed-two">
          <Reveal className="rs-stack">
            {blocks('intensite').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <div className="rs-n">
            <Reveal className="rs-n-card">
              <span>E(log #GP | #GP &gt; 0)</span>
              <b>21 504</b>
              <em>consultants du généraliste</em>
            </Reveal>
            <Reveal className="rs-n-card hosp" delay={80}>
              <span>E(log #Hosp | #Hosp &gt; 0)</span>
              <b>3 541</b>
              <em>personnes hospitalisées</em>
            </Reveal>
          </div>
        </div>
      </EdSection>

      {/* 07 — discussion */}
      <EdSection id="discussion" no={7} title="Discussion" sub="Ce que disent les résultats">
        <Reveal>
          {blocks('discussion').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        <EdPull>
          Être migrant n'est associé qu'à un <em>léger surcroît d'accès</em> ; vivre en couple pèse davantage.
        </EdPull>
      </EdSection>

      {/* 08 — à retenir */}
      <EdSection id="retenir" no={8} title="À retenir" sub="Les résultats clés du rapport">
        <ol className="rs-concl">
          {c.conclusions.map((t, i) => (
            <Reveal as="li" key={i} delay={(i % 4) * 50}>
              <Md text={t} />
            </Reveal>
          ))}
        </ol>
      </EdSection>

      <Closing project={project}>Recours aux soins et inégalités en Europe</Closing>
      <ProjectEnd project={project} />
    </div>
  );
}

function Closing({ project, children }: { project: ProjectResponse; children: ReactNode }) {
  const c = project.content;
  return (
    <div className="ed-closing">
      <div className="ed-wrap">
        <h3>{children}</h3>
        <div className="ed-closing-meta">
          {c.authors.join(' · ')}
          <br />
          <b>{c.course}</b>
          <br />
          Données SHARE · 11 pays · N = 27 246
        </div>
      </div>
    </div>
  );
}
