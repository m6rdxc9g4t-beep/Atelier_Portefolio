import { useState } from 'react';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/bebas-neue/400.css';
import { fmt, type Block, type Section } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { BlockView, findSection } from '../../components/Blocks';
import { HBars, LineChart, VBars } from '../../components/charts';
import './style.css';

type Kind = 'films' | 'series';
type PerKind<T> = Record<Kind, T>;

interface Top {
  labels: string[];
  labels_fr?: string[];
  values: number[];
  pct?: number[];
}

/** Sections de la fiche selon le format affiché. */
const SECTION_IDS: Record<string, PerKind<string>> = {
  annees: { films: 'films-annees', series: 'series-annees' },
  format: { films: 'films-duree', series: 'series-saisons' },
  genres: { films: 'films-genres', series: 'series-genres' },
  origines: { films: 'films-origines', series: 'series-origines' },
  public: { films: 'films-public', series: 'series-public' },
};

const NAV = [
  { id: 'base', label: 'La base' },
  { id: 'annees', label: 'Années' },
  { id: 'format', label: 'Formats' },
  { id: 'genres', label: 'Genres' },
  { id: 'origines', label: 'Origines' },
  { id: 'public', label: 'Publics' },
  { id: 'match', label: 'Le match' },
];

const POSTERS = [
  { g: 'Drames', c1: '#5c0a0f', c2: '#140405' },
  { g: 'Comédies', c1: '#7a3b0c', c2: '#1a0d04' },
  { g: 'Anime', c1: '#1d2c5c', c2: '#070a16' },
  { g: 'Policier', c1: '#2b2b2b', c2: '#0b0b0b' },
  { g: 'Documentaires', c1: '#1e4a3a', c2: '#06120e' },
  { g: 'Jeunesse', c1: '#6b5a12', c2: '#171304' },
  { g: 'Stand-up', c1: '#4d1450', c2: '#120414' },
  { g: 'International', c1: '#8b0000', c2: '#1a0000' },
];

const LINE_COLORS: PerKind<string[]> = {
  films: ['#e50914', '#f5f5f1', '#8a8a8a', '#ff8a80', '#7a0a0f'],
  series: ['#d4a853', '#f5f5f1', '#8a8a8a', '#f0d79a', '#7d6230'],
};

const textOnly = (s: Section | undefined) => s?.blocks.filter((b) => b.type === 'text' || b.type === 'list' || b.type === 'callout') ?? [];

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const [kind, setKind] = useState<Kind>('films');
  const sec = (key: string) => findSection(c.sections, SECTION_IDS[key][kind]);
  const isF = kind === 'films';
  const kLabel = isF ? 'films' : 'séries';
  const figures = c.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'figure')) as Extract<Block, { type: 'figure' }>[];
  const calloutFinal = findSection(c.sections, 'comparaison')?.blocks.find((b) => b.type === 'callout');

  return (
    <div className={`nf ${isF ? '' : 'is-series'}`}>
      <header className="nf-head">
        <span className="nf-mark">
          <i aria-hidden /> Le catalogue à la loupe
        </span>
        <nav aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`}>
              {n.label}
            </a>
          ))}
        </nav>
        <BackToPortfolio />
      </header>

      <section className="nf-hero">
        <div className="nf-hero-bg" aria-hidden />
        <div className="nf-hero-grid" aria-hidden />
        <div className="nf-posters" aria-hidden>
          {POSTERS.map((p) => (
            <div key={p.g} className="nf-poster" data-g={p.g} style={{ ['--c1' as string]: p.c1, ['--c2' as string]: p.c2 }} />
          ))}
        </div>
        <div className="nf-eyebrow">
          {c.course} · {c.date}
        </div>
        <h1>
          Le catalogue <em>Netflix</em>
          <br />à la loupe
        </h1>
        <div className="nf-hero-bottom">
          <p className="nf-hero-desc">{c.abstract}</p>
          <div className="nf-chips">
            <span className="nf-chip">
              <b>8 807</b>
              <span>titres analysés</span>
            </span>
            <span className="nf-chip">
              <b>6 131 · 2 676</b>
              <span>films · séries</span>
            </span>
            <span className="nf-chip">
              <b>{c.authors.join(' & ')}</b>
            </span>
          </div>
        </div>
      </section>

      {/* 01 — la base */}
      <section id="base" className="nf-sec">
        <Head tag="01 · La base" title="8 807 titres, deux formats" />
        <Reveal className="nf-stat-grid nf-stat-6">
          {c.kpis.map((k, i) => (
            <div key={k.label} className="nf-cell">
              <span className={`v ${i % 2 === 0 ? 'acc' : ''}`}>
                <CountUp value={k.value} />
              </span>
              <span className="l">{k.label}</span>
              {k.note && <div className="s">{k.note}</div>}
            </div>
          ))}
        </Reveal>
        <div className="nf-two nf-mt">
          <Reveal className="nf-block">
            <h3>Les données</h3>
            <div className="blk-stack">
              {textOnly(findSection(c.sections, 'base')).map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </div>
          </Reveal>
          <Reveal className="nf-block">
            <h3>Préparation sous R</h3>
            <div className="blk-stack">
              {textOnly(findSection(c.sections, 'preparation')).map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* bascule films / séries */}
      <div className="nf-toggle">
        <div className="nf-toggle-in" role="tablist" aria-label="Format analysé">
          <button role="tab" aria-selected={isF} className={`films ${isF ? 'is-on' : ''}`} onClick={() => setKind('films')}>
            Films · 6 131
          </button>
          <button role="tab" aria-selected={!isF} className={!isF ? 'is-on' : ''} onClick={() => setKind('series')}>
            Séries · 2 676
          </button>
        </div>
      </div>

      {/* 02 — années */}
      <section id="annees" className="nf-sec">
        <Head tag={`02 · ${isF ? 'Films' : 'Séries'}`} title={isF ? 'Un catalogue très récent' : 'L’essor depuis 2010'} />
        <Years f={f} kind={kind} />
        <Prose blocks={textOnly(sec('annees'))} />
      </section>

      {/* 03 — formats */}
      <section id="format" className="nf-sec">
        <Head tag={`03 · ${isF ? 'Durée' : 'Saisons'}`} title={isF ? 'Le format 90–120 minutes domine' : 'Une saison, le plus souvent'} />
        {isF ? <Durations f={f} /> : <Seasons f={f} />}
        <Prose blocks={textOnly(sec('format'))} />
      </section>

      {/* 04 — genres */}
      <section id="genres" className="nf-sec">
        <Head tag="04 · Genres" title={isF ? 'Drames et comédies en tête' : 'L’international et le policier'} />
        <TopRow title={`Top 10 des genres — ${kLabel}`} top={f.top10_genres[kind] as Top} total={isF ? 6131 : 2676} />
        <GenreLines f={f} kind={kind} />
        <Prose blocks={textOnly(sec('genres'))} />
      </section>

      {/* 05 — origines et talents */}
      <section id="origines" className="nf-sec">
        <Head tag="05 · Origines" title={isF ? 'Les États-Unis, puis l’Inde' : 'Les États-Unis, puis le Royaume-Uni et l’Asie'} />
        <TopRow title={`Top 10 des pays (premier pays cité) — ${kLabel}`} top={f.top10_pays[kind] as Top} total={isF ? 6131 : 2676} />
        <div className="nf-two nf-mt">
          <Reveal className="nf-block">
            <h3>Zones géographiques</h3>
            <HBars
              max={60}
              data={(f.zones_geographiques.labels as string[]).map((l, i) => ({ label: l, value: f.zones_geographiques[kind].pct[i], display: `${fmt(f.zones_geographiques[kind].pct[i], 1, 1)} %` }))}
            />
            <p className="nf-note">Parts parmi les {kLabel} au pays renseigné ; un titre compte pour les États-Unis dès qu’ils figurent parmi ses pays.</p>
          </Reveal>
          <Talents f={f} kind={kind} />
        </div>
        <Prose blocks={textOnly(sec('origines'))} />
      </section>

      {/* 06 — publics */}
      <section id="public" className="nf-sec">
        <Head tag="06 · Publics" title={isF ? 'Un public d’abord adulte' : 'Un public plus large'} />
        <Audience f={f} kind={kind} />
        <Prose blocks={textOnly(sec('public'))} />
      </section>

      {/* 07 — le match */}
      <section id="match" className="nf-sec">
        <Head tag="07 · Le match" title="Films et séries, face à face" />
        <Reveal className="nf-compare">
          <div className="nf-cg films">
            <h3>Films</h3>
            {(f.comparaison.indicateurs.labels as string[]).map((l, i) => (
              <div key={l} className="nf-diff">
                <span>{l}</span>
                <span>{f.comparaison.indicateurs.films[i]}</span>
              </div>
            ))}
          </div>
          <div className="nf-cg-mid">vs</div>
          <div className="nf-cg series">
            <h3>Séries</h3>
            {(f.comparaison.indicateurs.labels as string[]).map((l, i) => (
              <div key={l} className="nf-diff">
                <span>{l}</span>
                <span>{f.comparaison.indicateurs.series[i]}</span>
              </div>
            ))}
          </div>
        </Reveal>
        <h3 className="nf-row-t nf-mt">
          Similitudes <small>ce qui rapproche les deux formats</small>
        </h3>
        <Reveal className="nf-sims">
          {(f.comparaison.similitudes as { titre: string; texte: string }[]).map((s, i) => (
            <div key={s.titre} className="nf-sim">
              <div className="num">0{i + 1}</div>
              <h4>{s.titre}</h4>
              <p>{s.texte}</p>
            </div>
          ))}
        </Reveal>
        <h3 className="nf-row-t nf-mt">
          Différences <small>ce qui les sépare</small>
        </h3>
        <Reveal className="nf-sims">
          {(f.comparaison.differences as { titre: string; texte: string }[]).map((s, i) => (
            <div key={s.titre} className="nf-sim">
              <div className="num">0{i + 1}</div>
              <h4>{s.titre}</h4>
              <p>{s.texte}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="nf-final">
        <h2>
          Un catalogue <em>récent</em>,
          <br />
          américain d’abord,
          <br />
          pensé pour les ados
          <br />
          et les adultes.
        </h2>
        <div className="nf-points">
          {calloutFinal?.type === 'callout' && (
            <div className="nf-point">
              <span className="n">★</span>
              <Md as="p" text={calloutFinal.md} />
            </div>
          )}
          {c.conclusions.map((t, i) => (
            <div key={i} className="nf-point">
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <Md as="p" text={t} />
            </div>
          ))}
        </div>
      </section>

      {figures.length > 0 && (
        <section className="nf-sec" aria-label="Graphiques de la présentation">
          <Head tag="Annexe" title="Les graphiques de la présentation" />
          <div className="nf-figs">
            {figures.map((b) => (
              <BlockView key={b.src} block={b} />
            ))}
          </div>
        </section>
      )}

      <ProjectEnd project={project} />
    </div>
  );
}

function Head({ tag, title }: { tag: string; title: string }) {
  return (
    <Reveal className="nf-sec-head">
      <span className="nf-sec-tag">{tag}</span>
      <h2>{title}</h2>
    </Reveal>
  );
}

function Prose({ blocks }: { blocks: Block[] }) {
  if (!blocks.length) return null;
  return (
    <Reveal className="nf-prose blk-stack">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </Reveal>
  );
}

/* ───────── Années de sortie ───────── */
function Years({ f, kind }: { f: Record<string, any>; kind: Kind }) {
  const t = f.titres_par_annee;
  const years = t.x as number[];
  const ys = t[kind].y as number[];
  const split = f.avant_depuis_2010[kind].pct as number[];
  const peak = Math.max(...ys);
  return (
    <div className="nf-two">
      <Reveal className="nf-block">
        <h3>
          Titres par année de sortie <small className="nf-small">1990–2021</small>
        </h3>
        <VBars
          ariaLabel={`Nombre de ${kind === 'films' ? 'films' : 'séries'} par année de sortie`}
          data={years.map((y, i) => ({ label: String(y), value: ys[i], display: `≈ ${fmt(ys[i])}`, color: ys[i] === peak ? 'var(--accent)' : y >= 2010 ? 'color-mix(in srgb, var(--accent) 70%, #333)' : '#3a3a3a' }))}
          height={260}
          labelEvery={5}
          yFormat={(v) => fmt(v)}
        />
        <p className="nf-note">
          Hauteurs lues sur les graphiques de la présentation (valeurs approchées). Avant 1990 : environ {fmt(t[kind].avant_1990)} titres au total.
        </p>
      </Reveal>
      <Reveal className="nf-block nf-split">
        <h3>Avant / depuis 2010</h3>
        <div className="nf-split-bar" aria-label={`${fmt(split[0], 1, 1)} % avant 2010, ${fmt(split[1], 1, 1)} % depuis 2010`}>
          <i style={{ flex: split[0] }} />
          <b style={{ flex: split[1] }} />
        </div>
        <div className="nf-split-legend">
          <div>
            <span className="v">{fmt(split[0], 1, 1)} %</span>
            <span className="l">avant 2010</span>
          </div>
          <div>
            <span className="v acc">{fmt(split[1], 1, 1)} %</span>
            <span className="l">depuis 2010</span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/* ───────── Durée des films ───────── */
function Durations({ f }: { f: Record<string, any> }) {
  const dist = f.duree_films_distribution;
  const tr = f.duree_films_tranches;
  const [sel, setSel] = useState<string | null>('90–120');
  const idx = (tr.labels as string[]).indexOf(sel ?? '');
  return (
    <div className="nf-two">
      <Reveal className="nf-block">
        <h3>
          Distribution des durées <small className="nf-small">en minutes</small>
        </h3>
        <VBars
          ariaLabel="Histogramme de la durée des films"
          data={(dist.x as number[]).map((x, i) => ({
            label: `${Math.round(x)}`,
            value: dist.y[i],
            display: `≈ ${fmt(dist.y[i])} films`,
            color: x >= 85 && x <= 125 ? 'var(--accent)' : '#4a4a4a',
          }))}
          height={260}
          labelEvery={3}
          showValues={false}
          yFormat={(v) => fmt(v)}
        />
        <p className="nf-note">30 classes d’environ 10,7 minutes, lues sur l’histogramme de la présentation. Seuil de 90 minutes : 67,5 % de films plus longs.</p>
      </Reveal>
      <Reveal className="nf-block">
        <h3>Par tranche de 30 minutes</h3>
        <div className="nf-slices" role="listbox" aria-label="Tranches de durée">
          {(tr.labels as string[]).map((l, i) => (
            <button key={l} role="option" aria-selected={sel === l} className={sel === l ? 'is-on' : ''} onMouseEnter={() => setSel(l)} onFocus={() => setSel(l)} onClick={() => setSel(l)}>
              <span className="lab">{l}</span>
              <span className="bar">
                <i style={{ width: `${(tr.values[i] / 3092) * 100}%` }} />
              </span>
              <span className="n">{fmt(tr.values[i])}</span>
            </button>
          ))}
        </div>
        {idx >= 0 && (
          <p className="nf-slice-detail" aria-live="polite">
            <b>{tr.labels[idx]} min</b> : {fmt(tr.values[idx])} films ({fmt((tr.values[idx] / tr.total) * 100, 1, 1)} %). Genre majoritaire : <b>{tr.genre_majoritaire[idx]}</b> ({fmt(tr.n_genre_majoritaire[idx])}{' '}
            films).
          </p>
        )}
      </Reveal>
    </div>
  );
}

/* ───────── Saisons des séries ───────── */
function Seasons({ f }: { f: Record<string, any> }) {
  const s = f.saisons_series;
  const total = (s.values as number[]).reduce((a: number, b: number) => a + b, 0);
  return (
    <div className="nf-two">
      <Reveal className="nf-block">
        <h3>Séries selon le nombre de saisons</h3>
        <VBars ariaLabel="Séries selon le nombre de saisons" data={(s.labels as string[]).map((l, i) => ({ label: l, value: s.values[i], display: `≈ ${fmt(s.values[i])}`, color: i === 0 ? 'var(--accent)' : '#4a4a4a' }))} height={260} yFormat={(v) => fmt(v)} />
        <p className="nf-note">Effectifs lus sur le graphique (≈ ±5 ; total reconstitué ≈ {fmt(total)}).</p>
      </Reveal>
      <Reveal className="nf-block nf-split">
        <h3>Une saison ou plus</h3>
        <div className="nf-split-bar">
          <b style={{ flex: s.exact.pct[0] }} />
          <i style={{ flex: s.exact.pct[1] }} />
        </div>
        <div className="nf-split-legend">
          <div>
            <span className="v acc">{s.exact.pct[0]} %</span>
            <span className="l">1 saison</span>
          </div>
          <div>
            <span className="v">{s.exact.pct[1]} %</span>
            <span className="l">2 saisons et +</span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/* ───────── Rangée « Top 10 » façon plateforme ───────── */
function TopRow({ title, top, total }: { title: string; top: Top; total: number }) {
  const labels = top.labels_fr ?? top.labels;
  const max = Math.max(...top.values);
  return (
    <Reveal>
      <h3 className="nf-row-t">
        {title} <small>faites défiler →</small>
      </h3>
      <div className="nf-row" tabIndex={0} aria-label={title}>
        {labels.map((l, i) => (
          <div key={`${l}-${i}`} className="nf-tile">
            <span className="nf-rank" aria-hidden>
              {i + 1}
            </span>
            <div className="nf-card">
              <b>{l || 'Non renseigné'}</b>
              <div>
                <div className="pct">{top.pct ? `${fmt(top.pct[i], 1, 1)} %` : fmt(top.values[i])}</div>
                <div className="n">
                  {fmt(top.values[i])} / {fmt(total)}
                </div>
                <div className="bar">
                  <i style={{ width: `${(top.values[i] / max) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ───────── Évolution des 5 genres principaux ───────── */
function GenreLines({ f, kind }: { f: Record<string, any>; kind: Kind }) {
  const ev = f.evolution_genres;
  const lines = ev[kind].lines as { name: string; label_fr?: string; y: number[] }[];
  const [off, setOff] = useState<string[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const x = ev.x as number[];
  const max = Math.max(...lines.flatMap((l) => l.y));
  const hi = hover === null ? null : Math.round(hover) - x[0];
  return (
    <Reveal className="nf-block nf-mt nf-lines">
      <div className="nf-lines-head">
        <h3>Évolution des cinq genres principaux</h3>
        <div className="nf-legend">
          {lines.map((l, i) => (
            <button
              key={l.name}
              className={off.includes(l.name) ? 'is-off' : ''}
              onClick={() => setOff((o) => (o.includes(l.name) ? o.filter((n) => n !== l.name) : [...o, l.name]))}
              aria-pressed={!off.includes(l.name)}
            >
              <i style={{ background: LINE_COLORS[kind][i] }} /> {l.label_fr ?? l.name}
              {hi !== null && hi >= 0 && hi < l.y.length && <b>{l.y[hi]}</b>}
            </button>
          ))}
        </div>
      </div>
      <LineChart
        ariaLabel="Nombre de titres par année pour les cinq genres principaux"
        xDomain={[x[0], x[x.length - 1]]}
        yDomain={[0, max * 1.08]}
        height={300}
        width={1000}
        xTicks={[1990, 1995, 2000, 2005, 2010, 2015, 2020]}
        xFormat={(v) => String(v)}
        yFormat={(v) => fmt(v)}
        cursorX={hover}
        onHoverX={setHover}
        series={lines
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => !off.includes(l.name))
          .map(({ l, i }) => ({ id: l.name, points: l.y.map((v, j) => [x[j], v] as [number, number]), color: LINE_COLORS[kind][i], width: i === 0 ? 2.6 : 1.8, smooth: true }))}
      />
      <p className="nf-note">
        Courbes lues sur les graphiques de la présentation (valeurs approchées). {hover !== null ? `Année ${Math.round(hover)}.` : 'Survolez le graphique pour lire une année ; cliquez un genre pour le masquer.'}
      </p>
    </Reveal>
  );
}

/* ───────── Acteurs et réalisateurs ───────── */
function Talents({ f, kind }: { f: Record<string, any>; kind: Kind }) {
  const [who, setWho] = useState<'acteurs' | 'realisateurs'>('acteurs');
  const top = (who === 'acteurs' ? f.top10_acteurs : f.top10_realisateurs)[kind] as Top;
  const max = Math.max(...top.values);
  return (
    <Reveal className="nf-block">
      <div className="nf-talent-head">
        <h3>Les talents les plus présents</h3>
        <div className="nf-mini-toggle">
          <button className={who === 'acteurs' ? 'is-on' : ''} onClick={() => setWho('acteurs')}>
            Acteurs
          </button>
          <button className={who === 'realisateurs' ? 'is-on' : ''} onClick={() => setWho('realisateurs')}>
            Réalisateurs
          </button>
        </div>
      </div>
      <ol className="nf-cast">
        {top.labels.map((n, i) => (
          <li key={n}>
            <span className="r">{i + 1}</span>
            <span className="nm">{n}</span>
            <span className="bar">
              <i style={{ width: `${(top.values[i] / max) * 100}%` }} />
            </span>
            <span className="n">{top.values[i]}</span>
          </li>
        ))}
      </ol>
      {who === 'realisateurs' && kind === 'series' && <p className="nf-note">Nombreux ex aequo à 2 séries : la liste s’arrête au dixième nom.</p>}
    </Reveal>
  );
}

/* ───────── Publics ───────── */
function Audience({ f, kind }: { f: Record<string, any>; kind: Kind }) {
  const pc = f.public_cible;
  const det = f.public_cible_details[kind];
  return (
    <div className="nf-two">
      <Reveal className="nf-block">
        <h3>Répartition selon le public cible</h3>
        <HBars
          max={50}
          data={(pc.labels as string[]).map((l, i) => ({ label: l, value: pc[kind].pct[i], display: `${fmt(pc[kind].pct[i], 1, 1)} %` }))}
        />
        <p className="nf-note">Classification d’âge recodée : Enfants, Famille, Ados, Adultes, Non classé.</p>
      </Reveal>
      <Reveal className="nf-block">
        <h3>Ce que regarde chaque public</h3>
        <div className="nf-aud">
          {(det.labels as string[]).map((l, i) => (
            <div key={l} className="nf-aud-row">
              <span className="who">{l}</span>
              <span className="g">
                {(det.top3_genres[i] as string[]).map((g) => (
                  <em key={g}>{g}</em>
                ))}
              </span>
              {det.duree_moyenne && <span className="d">{fmt(det.duree_moyenne[i], 2, 2)} min</span>}
            </div>
          ))}
        </div>
        {det.duree_moyenne && <p className="nf-note">Durée moyenne des films par public.</p>}
      </Reveal>
    </div>
  );
}
