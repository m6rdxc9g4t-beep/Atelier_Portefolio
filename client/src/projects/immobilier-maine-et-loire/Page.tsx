import { useState, type ReactNode } from 'react';
import '@fontsource-variable/archivo/standard.css';
import '@fontsource/fraunces/900.css';
import '@fontsource/fraunces/900-italic.css';
import { fmt, type Block, type Section } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { BlockView, SectionBody, findSection } from '../../components/Blocks';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { HBars, LineChart } from '../../components/charts';
import { useScrollSpy } from '../editorial/Editorial';
import { DistanceRings, GroupedBars, MonthClock } from './Charts';
import { Estimator, type HedonicModel } from './Estimator';
import './style.css';

const NAV = [
  { id: 'contexte', label: 'Contexte' },
  { id: 'volumes', label: 'Monocentrisme' },
  { id: 'dynamique', label: 'Dynamique' },
  { id: 'trajets', label: 'Prix & trajets' },
  { id: 'hedonique', label: 'Prix hédoniques' },
  { id: 'estimateur', label: 'Estimateur' },
  { id: 'synthese', label: 'Synthèse' },
];

const nb = (t: string) => t.replace(/ /g, ' ');
const pick = (s: Section | undefined, keep: (b: Block, i: number) => boolean): Block[] => s?.blocks.filter(keep) ?? [];

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const sec = (id: string) => findSection(c.sections, id);
  const active = useScrollSpy(NAV.map((n) => n.id));
  const model = c.model as unknown as HedonicModel | undefined;
  const figs = Object.fromEntries(
    c.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'figure').map((b) => [(b as Extract<Block, { type: 'figure' }>).src.split('/').pop(), b])),
  ) as Record<string, Extract<Block, { type: 'figure' }>>;
  const fig = (n: number) => figs[`fig-${n}.png`];

  const dist = f.transactions_selon_distance;
  const years = f.transactions_par_annee;
  const season = f.saisonnalite_mensuelle;
  const types = f.transactions_par_type;
  const communes = f.transactions_communes;
  const r2 = f.r2_specifications;

  return (
    <div className="ml">
      <nav className="ml-nav" aria-label="Sections du projet">
        <div className="ml-wrap ml-nav-in">
          <span className="ml-brand">
            CPI <b>·</b> Maine-et-Loire
          </span>
          <div className="ml-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'is-on' : ''}>
                {n.label}
              </a>
            ))}
          </div>
          <BackToPortfolio />
        </div>
      </nav>

      <header className="ml-hero">
        <div className="ml-wrap ml-hero-grid">
          <div>
            <Reveal className="ml-kicker">Étude de cas · {c.course.split('—')[0].trim()} · base notariale 2014–2018</Reveal>
            <Reveal as="h1">
              Le marché immobilier <em>résidentiel</em> du Maine-et-Loire
            </Reveal>
            <Reveal as="p" className="ml-lede" delay={80}>
              {c.subtitle}.
            </Reveal>
            <Reveal className="ml-meta" delay={140}>
              <div>
                <b>75 695</b>transactions notariales
              </div>
              <div>
                <b>22 048</b>observations retenues
              </div>
              <div>
                <b>2014–2018</b>période d’observation
              </div>
              <div>
                <b>{c.authors.length} auteurs</b>
                {c.authors.join(', ')}
              </div>
            </Reveal>
          </div>
          <Reveal delay={120}>{dist && <DistanceRings x={dist.x} y={dist.y} />}</Reveal>
        </div>
      </header>

      <div className="ml-wrap">
        <Reveal className="ml-stats">
          {c.kpis.slice(0, 6).map((k, i) => (
            <div key={k.label} className="ml-stat" title={k.note}>
              <div className={`num ${['', 't', '', 'r', 't', ''][i]}`}>
                <CountUp value={nb(k.value)} />
              </div>
              <div className="lab">{k.label}</div>
              {k.note && <div className="note">{k.note}</div>}
            </div>
          ))}
        </Reveal>
      </div>

      {/* Contexte */}
      <Axis id="contexte" n="Contexte" title="Angers, cœur d’un département monocentrique" intro={c.question}>
        <div className="ml-grid2">
          <Reveal className="ml-prose">
            <SectionBody section={{ ...sec('contexte')!, blocks: pick(sec('contexte'), (b) => b.type !== 'callout') }} />
          </Reveal>
          <Reveal className="ml-callout">
            <h3>Une base notariale très lacunaire</h3>
            {pick(sec('donnees'), (b) => b.type === 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
        </div>
        <Reveal className="ml-steps-wrap">
          <h4>Préparation des données</h4>
          <ol className="ml-steps">
            {(c.data?.cleaning ?? []).map((t, i) => (
              <li key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <Md text={t} />
              </li>
            ))}
          </ol>
        </Reveal>
      </Axis>

      {/* Axe 1 */}
      <Axis id="volumes" n="Axe 1" title="Le monocentrisme vu par les volumes" intro="Angers concentre l’activité ; le volume décroît avec la distance, avec un léger rebond périurbain vers 15 km.">
        <div className="ml-grid2">
          {fig(1) && (
            <Reveal className="ml-fig">
              <BlockView block={fig(1)} />
            </Reveal>
          )}
          <Reveal className="ml-card">
            <h4>Transactions 2014–2018 des communes citées</h4>
            <HBars
              className="ml-hbars"
              data={(communes.x as string[]).map((n: string, i: number) => ({ label: n, value: communes.y[i], display: nb(fmt(communes.y[i])) }))}
            />
            <p className="ml-note">Angers ≈ trois fois Cholet. Orée d’Anjou, Sèvremoine et Beaupréau-en-Mauges se situent entre 1 875 et 2 469 transactions.</p>
          </Reveal>
        </div>
        <Reveal className="ml-card ml-mt">
          <h4>Transactions par commune selon la distance moyenne à Angers</h4>
          <LineChart
            ariaLabel="Courbe lissée du nombre de transactions par commune selon la distance à Angers"
            xDomain={[0, 20]}
            yDomain={[0, 1050]}
            height={300}
            width={980}
            margin={{ top: 14, right: 20, bottom: 42, left: 60 }}
            xTicks={[0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20]}
            xFormat={(v) => `${fmt(v, 1)} km`}
            yFormat={(v) => nb(fmt(v))}
            series={[{ id: 'd', points: (dist.x as number[]).map((x: number, i: number) => [x, dist.y[i]] as [number, number]), color: 'var(--slate)', width: 3, smooth: true, area: true, areaOpacity: 0.12 }]}
            markers={[
              { x: 11.8, y: 235, r: 6, color: 'var(--terra)', label: '≈ 235 vers 12 km' },
              { x: 14.8, y: 305, r: 6, color: 'var(--rouge)', label: 'rebond ≈ 305 vers 15 km' },
            ]}
          />
          <p className="ml-note">
            Courbe lue sur le graphique du rapport (≈) ; communes à moins de 20 km, Angers exclue (plus de 14 000 transactions).{' '}
            {fig(2) && (
              <a className="ml-link" href={`/${fig(2).src}`} target="_blank" rel="noopener noreferrer">
                Voir la figure originale ↗
              </a>
            )}
          </p>
        </Reveal>
        <Reveal className="ml-prose ml-mt">
          {pick(sec('monocentrisme'), (b) => b.type === 'text')
            .slice(-1)
            .map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
        </Reveal>
      </Axis>

      {/* Axe 2 */}
      <Axis id="dynamique" n="Axe 2" title="Des volumes en hausse, une saisonnalité marquée" intro="Le marché progresse jusqu’en 2017 ; l’activité culmine en juin et juillet.">
        <div className="ml-grid2">
          <Reveal className="ml-card">
            <h4>Transactions par année</h4>
            <GroupedBars
              labels={(years.x as number[]).map(String)}
              series={[{ name: 'Transactions', values: years.y, cls: 'slate' }]}
              yMax={20000}
              ariaLabel="Nombre de transactions par année"
              format={(v) => (v >= 1000 ? `${nb(fmt(v / 1000, 1))} k` : nb(fmt(v)))}
              hatch={(i) => years.x[i] === 2018}
            />
            <p className="ml-note">Lu sur le graphique du rapport (≈). Hachuré : 2018, sous-enregistrée lors du passage à la nouvelle base centralisée, exclue des analyses temporelles.</p>
          </Reveal>
          <Reveal className="ml-card">
            <h4>Saisonnalité des ventes</h4>
            <MonthClock months={season.x} index={season.index} />
          </Reveal>
        </div>
        <div className="ml-grid2 ml-mt">
          <Reveal className="ml-prose">
            {pick(sec('dynamique'), (b) => b.type === 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <Reveal className="ml-card">
            <h4>Maisons et appartements vendus</h4>
            <GroupedBars
              labels={(types.x as number[]).map(String)}
              series={(types.series as { name: string; y: number[] }[]).map((s, k) => ({ name: s.name, values: s.y, cls: k === 0 ? 'terra' : 'slate' }))}
              yMax={6000}
              ariaLabel="Ventes de maisons et d’appartements par année"
              format={(v) => nb(fmt(v))}
            />
            <div className="ml-legend">
              <span>
                <i className="terra" /> Maisons
              </span>
              <span>
                <i className="slate" /> Appartements
              </span>
              <span>Valeurs lues sur le graphique du rapport (≈).</span>
            </div>
          </Reveal>
        </div>
      </Axis>

      {/* Axe 3 */}
      <Axis id="trajets" n="Axe 3" title="Prix au m² et temps de trajet vers Angers" intro="Plus on s’éloigne d’Angers, plus le prix au m² baisse — avec de nettes exceptions.">
        <Reveal className="ml-prose">
          {pick(sec('prix-distance'), (b, i) => b.type === 'text' && i === 0).map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        <MapsCompare a={fig(3)} b={fig(4)} />
        <div className="ml-grid2 ml-mt">
          <Reveal className="ml-prose">
            {pick(sec('prix-distance'), (b, i) => b.type === 'text' && i > 0).map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <Reveal className="ml-callout">
            <h3>La distance à Angers ne suffit pas</h3>
            {pick(sec('prix-distance'), (b) => b.type === 'callout').map((b, i) => (
              <Md key={i} as="p" text={b.type === 'callout' ? b.md : ''} />
            ))}
          </Reveal>
        </div>
      </Axis>

      {/* Axe 4 */}
      <Axis id="hedonique" n="Axe 4" title="Les prix hédoniques" intro="Deux régressions linéaires, une pour les maisons, une pour les appartements : mêmes variables, lectures opposées.">
        <div className="ml-grid2">
          <Reveal className="ml-prose">
            <SectionBody section={{ ...sec('preparation')!, blocks: pick(sec('preparation'), (b) => b.type !== 'figure') }} />
          </Reveal>
          {fig(5) && (
            <Reveal className="ml-fig">
              <BlockView block={fig(5)} />
              <TrendNote tr={f.tendances_nuages_filtres} />
            </Reveal>
          )}
        </div>
        <Reveal className="ml-prose ml-mt">
          {pick(sec('modeles'), (b) => b.type === 'text' || b.type === 'formula')
            .slice(0, 2)
            .map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
        </Reveal>
        <div className="ml-grid2 ml-mt">
          <Reveal className="ml-prose">
            {pick(sec('modeles'), (b) => (b.type === 'table' && !b.title?.startsWith('Qualité')) || b.type === 'text')
              .filter((b) => !(b.type === 'text' && pick(sec('modeles'), (x) => x.type === 'text')[0] === b))
              .map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
          </Reveal>
          <Reveal className="ml-card">
            <h4>Qualité d’ajustement (R²) des quatre spécifications</h4>
            <GroupedBars
              labels={r2.x}
              series={(r2.series as { name: string; y: number[] }[]).map((s, k) => ({ name: s.name, values: s.y, cls: k === 0 ? 'terra' : 'slate' }))}
              yMax={0.32}
              ariaLabel="R² des quatre spécifications pour les maisons et les appartements"
              format={(v) => fmt(v, 3, v === 0 ? 0 : 2)}
            />
            <div className="ml-legend">
              <span>
                <i className="terra" /> Maisons
              </span>
              <span>
                <i className="slate" /> Appartements
              </span>
              <span>Le modèle 1 s’ajuste le mieux pour les deux types de bien.</span>
            </div>
          </Reveal>
        </div>
        <CoefTabs section={sec('resultats')} />
      </Axis>

      {/* Estimateur */}
      <Axis id="estimateur" n="Simulateur" title="Composer un prix avec le modèle 1" intro="Choisissez un type de bien, sa surface, ses pièces et son terrain : chaque coefficient publié apporte sa contribution.">
        {model?.equations && (
          <Reveal className="ml-est-card">
            <Estimator model={model} />
          </Reveal>
        )}
      </Axis>

      {/* Synthèse */}
      <Axis id="synthese" n="Synthèse" title="Ce qu’il faut retenir">
        <div className="ml-reco">
          {c.conclusions.map((t, i) => (
            <Reveal key={i} className="ml-reco-c" delay={i * 50}>
              <div className="t">{['Angers domine', 'Gradient de volumes', 'Un marché en hausse', 'Saisonnalité', 'Prix et distance', 'Prix hédoniques'][i] ?? `Point ${i + 1}`}</div>
              <Md as="p" text={t} />
            </Reveal>
          ))}
        </div>
      </Axis>

      <ProjectEnd project={project} />
    </div>
  );
}

function Axis({ id, n, title, intro, children }: { id: string; n: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="ml-sec">
      <div className="ml-wrap">
        <Reveal className="ml-axis">{n}</Reveal>
        <Reveal as="h2">{title}</Reveal>
        {intro && (
          <Reveal as="p" className="ml-intro">
            {intro}
          </Reveal>
        )}
        <div className="ml-sec-body">{children}</div>
      </div>
    </section>
  );
}

function MapsCompare({ a, b }: { a?: Extract<Block, { type: 'figure' }>; b?: Extract<Block, { type: 'figure' }> }) {
  if (!a || !b) return null;
  return (
    <div className="ml-maps">
      <Reveal className="ml-map">
        <div className="ml-map-t">
          <span>1</span> Temps de trajet en voiture vers Angers
        </div>
        <BlockView block={a} />
      </Reveal>
      <Reveal className="ml-map" delay={100}>
        <div className="ml-map-t">
          <span>2</span> Prix moyen des logements au m²
        </div>
        <BlockView block={b} />
      </Reveal>
    </div>
  );
}

function TrendNote({ tr }: { tr?: { series: { name: string; slope: number }[] } }) {
  if (!tr) return null;
  return (
    <p className="ml-note">
      Droites de tendance lues sur les nuages (≈) :{' '}
      {tr.series.map((s, i) => (
        <span key={s.name}>
          {i > 0 && ' ; '}
          {s.name.toLowerCase()}s {s.slope > 0 ? '+' : '−'}
          {nb(fmt(Math.abs(s.slope)))} € par m²
        </span>
      ))}{' '}
      (régressions simples prix ~ surface, distinctes du modèle 1).
    </p>
  );
}

function CoefTabs({ section }: { section: Section | undefined }) {
  const [tab, setTab] = useState(0);
  if (!section) return null;
  const tables = section.blocks.filter((b) => b.type === 'table') as Extract<Block, { type: 'table' }>[];
  const texts = section.blocks.filter((b) => b.type === 'text');
  const callout = section.blocks.find((b) => b.type === 'callout');
  const labels = ['Appartements', 'Maisons'];
  return (
    <div className="ml-coefs ml-mt">
      <div className="ml-grid2">
        <Reveal className="ml-prose">
          {texts.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        {callout && callout.type === 'callout' && (
          <Reveal className="ml-callout">
            <h3>Mêmes variables, lectures opposées</h3>
            <Md as="p" text={callout.md.replace(/^\*\*[^*]+\*\*\s*/, '')} />
          </Reveal>
        )}
      </div>
      <Reveal className="ml-tabs-wrap">
        <div className="ml-seg" role="tablist" aria-label="Équation du modèle 1">
          {tables.map((t, i) => (
            <button key={i} role="tab" aria-selected={tab === i} className={tab === i ? 'is-on' : ''} onClick={() => setTab(i)}>
              {labels[i] ?? t.title}
            </button>
          ))}
        </div>
        {tables[tab] && <BlockView block={tables[tab]} />}
      </Reveal>
    </div>
  );
}
