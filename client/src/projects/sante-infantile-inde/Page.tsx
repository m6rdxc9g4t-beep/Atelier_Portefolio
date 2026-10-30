import { useEffect, useState, type ReactNode } from 'react';
import type { Block } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { BlockView, findSection } from '../../components/Blocks';
import { useScrollSpy } from '../editorial/Editorial';
import {
  ConcentrationExplorer,
  CorrMatrix,
  Decomposition,
  GrowthSchematic,
  InequalityExplorer,
  LogitTable,
  SampleFunnel,
  StateGroups,
  ZScoreReader,
  type IndKey,
} from './modules';
import './style.css';

const TOC = [
  { id: 'contexte', label: 'Contexte et problématique' },
  { id: 'revue', label: 'Revue de littérature' },
  { id: 'donnees', label: 'Données et échantillon' },
  { id: 'methode', label: 'Méthode' },
  { id: 'descriptif', label: 'Une malnutrition socialement marquée' },
  { id: 'determinants', label: 'Déterminants : trois logits' },
  { id: 'etats', label: 'Disparités entre États' },
  { id: 'inegalites', label: 'Mesurer les inégalités' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'retenir', label: 'À retenir' },
];

/** « **Titre.** texte » → { title, text } */
const splitBold = (s: string) => {
  const m = s.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  return m ? { title: m[1].replace(/\.$/, ''), text: m[2] } : { title: '', text: s };
};

function useReadingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return p;
}

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const m = c.model as Record<string, any>;
  const active = useScrollSpy(TOC.map((t) => t.id));
  const progress = useReadingProgress();
  const [ind, setInd] = useState<IndKey>('stunting');

  const sec = (id: string) => findSection(c.sections, id);
  const blocks = (id: string, keep: (b: Block, i: number) => boolean = () => true) => (sec(id)?.blocks ?? []).filter(keep);
  const [cursus, intitule] = c.course.split(' — ');
  const sup = c.supervisor ?? '';
  const prevalence = Object.fromEntries((f.prevalence_overall.keys as IndKey[]).map((k, i) => [k, f.prevalence_overall.y[i] as number])) as Record<IndKey, number>;
  const selectionTable = sec('donnees')?.blocks.find((b) => b.type === 'table');
  const criteria = selectionTable?.type === 'table' ? selectionTable.rows.map((r) => r[1]) : [];
  const revueList = sec('revue')?.blocks.find((b) => b.type === 'list');
  const reco = sec('discussion')?.blocks.find((b) => b.type === 'list');
  const descr = sec('descriptif')?.blocks ?? [];
  const findings = descr.filter((b) => b.type === 'text' && /^\*\*/.test(b.md)) as Extract<Block, { type: 'text' }>[];
  const descrFigs = descr.filter((b) => b.type === 'figure');
  const etatsFigs = blocks('etats', (b) => b.type === 'figure');

  return (
    <div className="si">
      <div className="si-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />

      <header className="si-cover">
        <div className="si-cover-grid" aria-hidden />
        <div className="si-cover-in">
          <div className="si-cover-top">
            <BackToPortfolio />
            <span className="si-cover-tag">Mémoire · {c.level}</span>
          </div>
          <div className="si-cover-cols">
            <div>
              <div className="si-univ">Université de Lille · {cursus}</div>
              <div className="si-subuniv">
                {intitule}
                {sup && ` — sous la direction ${/^[aeiouyéè]/i.test(sup) ? 'd’' : 'de '}${sup}`}
              </div>
              <h1>
                Inégalités de santé infantile <em>en Inde</em>
              </h1>
              <p className="si-deck">{c.subtitle}</p>
              <div className="si-meta">
                <span>
                  Auteur <b>{c.authors.join(', ')}</b>
                </span>
                {sup && (
                  <span>
                    Encadrement <b>{sup}</b>
                  </span>
                )}
                <span>
                  Session <b>{c.date.replace('Session ', '')}</b>
                </span>
                <span>
                  Données <b className="mono">NFHS-5 · 2019–2021</b>
                </span>
              </div>
            </div>
            <GrowthSchematic />
          </div>
        </div>
      </header>

      <div className="si-kfig">
        <Reveal className="si-kfig-in">
          {c.kpis.slice(0, 6).map((k) => (
            <div key={k.label} className="si-kf" title={k.note}>
              <div className="v">
                <CountUp value={k.value} />
              </div>
              <Md as="div" className="k" text={k.label} />
            </div>
          ))}
        </Reveal>
      </div>

      <div className="si-shell">
        <aside className="si-toc" aria-label="Sommaire du mémoire">
          <div className="si-toc-label">Sommaire</div>
          <nav>
            {TOC.map((t, i) => (
              <a key={t.id} href={`#${t.id}`} className={active === t.id ? 'active' : ''}>
                <span>{String(i + 1).padStart(2, '0')}</span> {t.label}
              </a>
            ))}
          </nav>
          <div className="si-toc-docs">
            {(project.reports ?? []).map((r) => (
              <a key={r.file} href={`/reports/${r.file}`} target="_blank" rel="noopener noreferrer">
                ↓ {r.label.replace(' (PDF)', '')}
              </a>
            ))}
          </div>
        </aside>

        <article className="si-article">
          {/* 01 — contexte */}
          <Sec id="contexte" n={1} title="Contexte et problématique">
            <Reveal>
              {blocks('contexte').map((b, i) =>
                b.type === 'text' ? <Md key={i} as="p" className={i === 0 ? 'si-lead si-drop' : ''} text={b.md} /> : <BlockView key={i} block={b} />,
              )}
            </Reveal>
            {(() => {
              const q = sec('problematique')?.blocks.find((b) => b.type === 'callout');
              return q?.type === 'callout' ? (
                <Reveal className="si-question">
                  <span className="ql">Problématique</span>
                  <Md text={q.md.replace(/\*\*/g, '')} />
                </Reveal>
              ) : null;
            })()}
            <div className="si-objectives">
              {(sec('problematique')?.blocks.find((b) => b.type === 'list') as Extract<Block, { type: 'list' }> | undefined)?.items.map((it, i) => (
                <Reveal key={i} className="si-obj" delay={i * 60}>
                  <span>Objectif {i + 1}</span>
                  <Md as="p" text={it} />
                </Reveal>
              ))}
            </div>
            <Reveal>
              {blocks('problematique', (b) => b.type === 'text')
                .slice(1)
                .map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
            </Reveal>
          </Sec>

          {/* 02 — revue */}
          <Sec id="revue" n={2} title="Revue de littérature">
            <Reveal>{blocks('revue', (b) => b.type === 'text').map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            <div className="si-lit">
              {revueList?.type === 'list' &&
                revueList.items.map((it, i) => {
                  const { title, text } = splitBold(it);
                  return (
                    <Reveal key={i} className="si-lit-card" delay={(i % 2) * 70}>
                      <span className="n">{String(i + 1).padStart(2, '0')}</span>
                      <h4>{title}</h4>
                      <Md as="p" text={text} />
                    </Reveal>
                  );
                })}
            </div>
          </Sec>

          {/* 03 — données */}
          <Sec id="donnees" n={3} title="Données et échantillon">
            <Reveal>{blocks('donnees', (b) => b.type === 'text').slice(0, 1).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            <SampleFunnel flow={f.sample_flow} criteria={criteria} />
            <Reveal>{blocks('donnees', (b) => b.type === 'text').slice(1).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
          </Sec>

          {/* 04 — méthode */}
          <Sec id="methode" n={4} title="Méthode : scores Z, logits et indices">
            <Reveal>{blocks('methode').slice(0, 2).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            <ZScoreReader prevalence={prevalence} />
            <Reveal className="si-stack">{blocks('methode', (b) => b.type !== 'table').slice(2).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
          </Sec>

          {/* 05 — descriptif */}
          <Sec id="descriptif" n={5} title="Une malnutrition massive et socialement marquée">
            <Reveal>{descr.filter((b) => b.type === 'text' && !/^\*\*/.test(b.md)).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            <InequalityExplorer f={f} ind={ind} setInd={setInd} />
            <div className="si-findings">
              {findings.map((b, i) => {
                const { title, text } = splitBold(b.md);
                return (
                  <Reveal key={i} className="si-finding" delay={(i % 2) * 70}>
                    <h4>{title}</h4>
                    <Md as="p" text={text} />
                  </Reveal>
                );
              })}
            </div>
            {descrFigs.length > 0 && (
              <details className="si-figs">
                <summary>Voir les graphiques originaux du mémoire ({descrFigs.length})</summary>
                {descrFigs.map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
              </details>
            )}
          </Sec>

          {/* 06 — déterminants */}
          <Sec id="determinants" n={6} title="Déterminants : trois modèles logit">
            <Reveal>{blocks('determinants', (b) => b.type === 'text').slice(0, 1).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            {Array.isArray(m.variables) && <LogitTable vars={m.variables} ind={ind} setInd={setInd} />}
            <Reveal className="si-stack">
              {blocks('determinants', (b) => b.type === 'list').map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
              {blocks('determinants', (b) => b.type === 'text')
                .slice(1)
                .map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
            </Reveal>
            {f.correlation_continuous && <CorrMatrix data={f.correlation_continuous} />}
          </Sec>

          {/* 07 — États */}
          <Sec id="etats" n={7} title="Disparités entre États">
            <Reveal>{blocks('etats', (b) => b.type === 'text').map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            {m.stateFixedEffects && <StateGroups fe={m.stateFixedEffects} />}
            {etatsFigs.length > 0 && (
              <Reveal className="si-maps">
                {etatsFigs.map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
              </Reveal>
            )}
          </Sec>

          {/* 08 — inégalités */}
          <Sec id="inegalites" n={8} title="Mesurer et décomposer les inégalités">
            <ConcentrationExplorer f={f} ind={ind} setInd={setInd} />
            <Reveal>{blocks('inegalites', (b) => b.type === 'text').slice(0, 1).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            <Decomposition f={f} ind={ind} setInd={setInd} />
            <Reveal className="si-stack">
              {blocks('inegalites', (b) => b.type === 'text')
                .slice(1)
                .map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
            </Reveal>
            {(() => {
              const q = sec('inegalites')?.blocks.find((b) => b.type === 'callout');
              return q?.type === 'callout' ? (
                <Reveal as="p" className="si-pquote">
                  <span className="qm">«</span> <Md text={q.md} /> <span className="qm">»</span>
                </Reveal>
              ) : null;
            })()}
          </Sec>

          {/* 09 — discussion */}
          <Sec id="discussion" n={9} title="Discussion et recommandations">
            <Reveal>{blocks('discussion', (b) => b.type === 'text').slice(0, 2).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
            <div className="si-reco">
              {reco?.type === 'list' &&
                reco.items.map((it, i) => (
                  <Reveal key={i} className="si-reco-card" delay={(i % 3) * 60}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <Md as="p" text={it} />
                  </Reveal>
                ))}
            </div>
            <Reveal>{blocks('discussion', (b) => b.type === 'text').slice(2).map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
          </Sec>

          {/* 10 — à retenir */}
          <Sec id="retenir" n={10} title="À retenir">
            <ol className="si-concl">
              {c.conclusions.map((t, i) => (
                <Reveal as="li" key={i} delay={i * 50}>
                  <Md text={t} />
                </Reveal>
              ))}
            </ol>
          </Sec>
        </article>
      </div>

      <ProjectEnd project={project} />
    </div>
  );
}

function Sec({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} className="si-sec">
      <Reveal className="si-h">
        <span className="num">{String(n).padStart(2, '0')}</span>
        <h2>{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}

