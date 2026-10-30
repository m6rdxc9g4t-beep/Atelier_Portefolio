import { useMemo, useState } from 'react';
import { fmt, type Block, type Section } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { Reveal } from '../../components/Reveal';
import { Md } from '../../components/Md';
import { BlockView, findSection } from '../../components/Blocks';
import { EdAside, EdCard, EdLimits, EdPull, EdSection, EdStats, EditorialPage } from '../editorial/Editorial';
import { SurvivalLab } from './SurvivalLab';
import './style.css';

/* ───────── Séries de la fiche ───────── */
interface Curve {
  x: number[];
  y: number[];
  lower?: (number | null)[];
  upper?: (number | null)[];
  exact?: boolean[];
}
interface LifeTableFig {
  x: number[];
  y: number[];
  n_risk: number[];
  events: number[];
  censored: number[];
  quality: string[];
}
interface Histo {
  labels: string[];
  x: number[];
  events: number[];
  censored: number[];
  total: number[];
}
interface Box {
  groups: string[];
  whisker_low: number[];
  q1: number[];
  median: number[];
  q3: number[];
  whisker_high: number[];
}

const NAV = [
  { id: 'contexte', label: 'Intro' },
  { id: 'donnees', label: 'Données' },
  { id: 'methode', label: 'Méthode' },
  { id: 'resultats', label: 'Résultats' },
  { id: 'covariables', label: 'Covariables' },
  { id: 'conclusion', label: 'Conclusion' },
];

const blocksOf = (s: Section | undefined, keep: (b: Block) => boolean) => s?.blocks.filter(keep) ?? [];
const isProse = (b: Block) => b.type === 'text' || b.type === 'list' || b.type === 'callout' || b.type === 'formula';

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, unknown>;
  const km = f.km_curve as Curve;
  const na = f.cumhaz_curve as Curve;
  const lt = f.hazard_discrete as LifeTableFig;
  const sec = (id: string) => findSection(c.sections, id);
  const figures = c.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'figure')) as Extract<Block, { type: 'figure' }>[];
  const tables = (id: string) => blocksOf(sec(id), (b) => b.type === 'table');
  const covList = sec('covariables')?.blocks.find((b) => b.type === 'list');
  const covCards =
    covList?.type === 'list'
      ? covList.items.map((it) => {
          const m = it.match(/^\*\*(.+?)\*\*\s*(\(([^)]*)\))?\s*:\s*(.*)$/);
          const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
          return m ? { title: m[1], vars: m[3] ?? '', text: cap(m[4]) } : { title: '', vars: '', text: it };
        })
      : [];
  const transparency = sec('transparence')?.blocks.find((b) => b.type === 'callout');

  return (
    <EditorialPage
      project={project}
      className="ch"
      brand={
        <>
          TELCO · <b>Analyse de survie</b>
        </>
      }
      nav={NAV}
      closing="Le churn se joue au démarrage : c’est là que la rétention compte."
    >
      <header className="ed-hero ch-hero">
        <div className="ed-hero-deco" aria-hidden />
        <div className="ed-wrap ch-hero-grid">
          <div>
            <div className="ed-kicker">Modèles de durée — M2 Économétrie appliquée</div>
            <h1 className="ed-title">
              <span className="line">Quand part</span>
              <span className="line">
                le <em>client</em> ?
              </span>
            </h1>
            <p className="ed-lede">{c.subtitle}.</p>
            <div className="ed-authors">
              {c.authors.map((a) => (
                <div key={a} className="ed-author">
                  <div className="nm">{a}</div>
                  <div className="rl">Auteur</div>
                </div>
              ))}
            </div>
          </div>
          <HeroCurve km={km} />
        </div>
        <div className="ed-wrap">
          <div className="ed-course ch-course">
            Données · Telco Customer Churn
            <br />N = 7 043 clients · 0–72 mois
            <br />
            Kaplan–Meier · Nelson–Aalen · {c.date}
          </div>
        </div>
      </header>

      <EdStats kpis={c.kpis.slice(0, 5)} />

      {/* 01 — contexte */}
      <EdSection id="contexte" no={1} title="Non pas « qui part », mais « quand »" sub="Introduction et question de recherche" divider={false}>
        <div className="ed-two">
          <Reveal className="blk-stack">
            {blocksOf(sec('contexte'), (b) => b.type === 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <Reveal delay={80}>
            <EdAside
              title="Question de recherche"
              rows={[
                ['Objet', 'survie / hasard'],
                ['Sans', 'covariables'],
                ['Censure', 'à droite'],
                ['Enjeu', 'quand partir ?'],
              ]}
            />
            {blocksOf(sec('contexte'), (b) => b.type === 'callout').map((b, i) => (
              <div key={i} className="ch-question">
                <BlockView block={b} />
              </div>
            ))}
          </Reveal>
        </div>
      </EdSection>

      {/* 02 — données et censure */}
      <EdSection id="donnees" no={2} title="Données & censure" sub="Durée = ancienneté, événement = résiliation">
        <div className="ed-two">
          <Reveal className="blk-stack">
            {blocksOf(sec('donnees'), isProse).map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <Reveal delay={80} className="ch-side">
            <EdAside
              title="Censure & événements"
              rows={[
                ['N total', '7 043'],
                ['Événements (résiliations)', '1 869'],
                ['Censures (encore abonnés)', '5 174'],
                ['Taux de censure', '73,46 %'],
                ['Ancienneté moyenne', '≈ 32,4 mois'],
              ]}
            />
            <CensusSplit />
          </Reveal>
        </div>
        <div className="ed-grid2 ch-mt">
          <EdCard title="Durées d’abonnement" sub="Résiliations et clients encore actifs, par classes de 2 mois">
            <DurationHistogram h={f.events_censoring_histogram as Histo} />
          </EdCard>
          <EdCard title="Les churners partent tôt" sub="Boîtes à moustaches selon le statut (lues sur les figures 1 et 2)">
            <Boxplots tenure={f.boxplot_tenure as Box} charges={f.boxplot_totalcharges as Box} />
          </EdCard>
        </div>
      </EdSection>

      {/* 03 — méthode */}
      <EdSection id="methode" no={3} title="Trois estimateurs, une même question" sub="Kaplan–Meier · Nelson–Aalen · hasard discret">
        <Reveal className="blk-stack ch-intro">
          {blocksOf(sec('methode'), (b) => b.type === 'text').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        <div className="ch-formulas">
          {blocksOf(sec('methode'), (b) => b.type === 'formula').map((b, i) => (
            <Reveal key={i} delay={i * 60}>
              <BlockView block={b} />
            </Reveal>
          ))}
        </div>
        {blocksOf(sec('methode'), (b) => b.type === 'callout').map((b, i) => (
          <Reveal key={i} className="ch-precision">
            <BlockView block={b} />
          </Reveal>
        ))}
        <LifeTable lt={lt} km={km} />
      </EdSection>

      {/* 04 — résultats */}
      <EdSection id="resultats" no={4} title="Un churn de démarrage" sub="Survie, hasard cumulé et cohorte de 100 abonnés">
        <Reveal>
          <SurvivalLab
            data={{
              times: km.x,
              surv: km.y,
              survLow: km.lower as number[],
              survHigh: km.upper as number[],
              hazTimes: na.x,
              cumHaz: na.y,
              atRiskTimes: lt.x,
              atRisk: lt.n_risk,
              approx: true,
            }}
          />
        </Reveal>
        <p className="ch-note">
          Courbes mois par mois relevées sur les figures du rapport et calées sur ses tableaux (valeurs publiées aux mois 1, 3, 6, 12, 24, 36, 48, 60 et 72 ; écart maximal de
          l’ordre de 10⁻⁵).
        </p>
        <div className="ed-two ch-mt">
          <Reveal className="blk-stack">
            {blocksOf(sec('resultats'), (b) => b.type === 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <Reveal delay={80} className="blk-stack ch-sticky">
            {blocksOf(sec('resultats'), (b) => b.type === 'callout').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
        </div>
        <div className="ed-grid2 ch-mt ch-tables">
          {tables('resultats').map((b, i) => (
            <Reveal key={i} delay={i * 80}>
              <BlockView block={b} />
            </Reveal>
          ))}
        </div>
      </EdSection>

      {/* 05 — covariables */}
      <EdSection id="covariables" no={5} title="Discussion des covariables" sub="Quels facteurs pourraient expliquer ces écarts ?">
        <Reveal className="blk-stack ch-intro">
          {blocksOf(sec('covariables'), (b) => b.type === 'text').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        <div className="ed-find ch-find">
          {covCards.map((cv, i) => (
            <Reveal key={cv.title || i} className="ed-fcard" delay={i * 60} style={{ ['--i' as string]: `"${i + 1}"` }}>
              <h5>{cv.title}</h5>
              {cv.vars && <div className="ch-vars">{cv.vars}</div>}
              <Md as="p" text={cv.text} />
            </Reveal>
          ))}
          <Reveal className="ed-fcard ch-fcard-limit" delay={covCards.length * 60} style={{ ['--i' as string]: `"${covCards.length + 1}"` }}>
            <h5>Limite causale</h5>
            <p>Aucun modèle multivarié n’est estimé : ces mécanismes sont des pistes, à tester ensuite avec un modèle de durée à covariables.</p>
          </Reveal>
        </div>
      </EdSection>

      {/* 06 — conclusion */}
      <EdSection id="conclusion" no={6} title="À retenir" sub="Le message des courbes">
        <EdPull>
          « Le risque est <em>maximal dès le premier mois</em>, puis chute rapidement : la rétention se joue dès l’<em>onboarding</em>. »
        </EdPull>
        <EdLimits items={c.conclusions} />
        {transparency?.type === 'callout' && (
          <Reveal className="ch-transp">
            <span>Transparence</span>
            <Md as="p" text={transparency.md} />
          </Reveal>
        )}
        {figures.length > 0 && (
          <div className="ch-figs">
            <h3>Les figures du rapport</h3>
            <div className="ch-figs-grid">
              {figures.map((b) => (
                <BlockView key={b.src} block={b} />
              ))}
            </div>
          </div>
        )}
      </EdSection>
    </EditorialPage>
  );
}

/* ───────── Hero : la courbe de Kaplan–Meier, du mois 0 au mois 72 ───────── */
function HeroCurve({ km }: { km: Curve }) {
  const W = 360;
  const H = 230;
  const m = { l: 34, r: 14, t: 18, b: 28 };
  const x = (t: number) => m.l + (t / 72) * (W - m.l - m.r);
  const y = (s: number) => m.t + ((1 - s) / 0.5) * (H - m.t - m.b);
  let d = `M${x(0)} ${y(1)}`;
  km.x.forEach((t, i) => {
    if (i === 0) return;
    d += ` H${x(t).toFixed(1)} V${y(km.y[i]).toFixed(1)}`;
  });
  d += ` H${x(72)}`;
  const last = km.y[km.y.length - 1];
  return (
    <figure className="ch-hero-card" aria-label="Courbe de survie de Kaplan–Meier : 59,3 % des clients encore abonnés à 72 mois">
      <div className="ch-hero-card-t">
        <span>Ŝ(t) · probabilité d’être encore abonné</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {[1, 0.9, 0.8, 0.7, 0.6, 0.5].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0.5 ? 'mid' : 'grid'} />
            <text x={m.l - 6} y={y(v) + 3.5} textAnchor="end">
              {fmt(v, 1, 1)}
            </text>
          </g>
        ))}
        {[0, 12, 24, 36, 48, 60, 72].map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle">
            {t}
          </text>
        ))}
        <path d={`${d} V${y(0.5)} H${x(0)} Z`} className="area" />
        <path d={d} className="curve" pathLength={1} />
        <circle cx={x(72)} cy={y(last)} r={5} className="dot" />
        <text x={x(72) - 4} y={y(last) + 20} textAnchor="end" className="lab">
          {fmt(last * 100, 1, 1)} % à 72 mois
        </text>
        <text x={x(9)} y={y(0.958)} className="lab drop">
          ← −5,4 points dès le 1er mois
        </text>
      </svg>
      <figcaption>Axe vertical tronqué à 0,5 : la médiane de survie n’est pas atteinte sur l’horizon observé.</figcaption>
    </figure>
  );
}

/* ───────── 1 869 départs, 5 174 encore abonnés ───────── */
function CensusSplit() {
  const ev = 1869;
  const ce = 5174;
  return (
    <div className="ch-split" aria-label="1 869 résiliations observées (26,54 %) et 5 174 clients censurés (73,46 %)">
      <div className="ch-split-bar">
        <i style={{ flex: ev }}>
          <b>26,54 %</b>
        </i>
        <em style={{ flex: ce }}>
          <b>73,46 %</b>
        </em>
      </div>
      <div className="ch-split-leg">
        <span>
          <i className="ev" /> {fmt(ev)} résiliations observées
        </span>
        <span>
          <i className="ce" /> {fmt(ce)} encore abonnés (censurés)
        </span>
      </div>
    </div>
  );
}

/* ───────── Histogramme empilé : départs et censures ───────── */
function DurationHistogram({ h }: { h: Histo }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 260;
  const m = { l: 40, r: 8, t: 12, b: 30 };
  const max = 650;
  const bw = (W - m.l - m.r) / h.x.length;
  const y = (v: number) => m.t + (1 - v / max) * (H - m.t - m.b);
  const i = hover;
  return (
    <div className="ch-histo">
      <div className="ch-readout" aria-live="polite">
        {i !== null ? (
          <>
            <b>{h.labels[i]} mois</b> · {fmt(h.events[i])} résiliations · {fmt(h.censored[i])} encore abonnés · {fmt((100 * h.events[i]) / h.total[i], 0)} % de départs
          </>
        ) : (
          <span>Survolez une barre : les départs (en bas) dominent les premiers mois, les clients actifs (en haut) la fin de période.</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ch-svg" role="img" aria-label="Histogramme empilé des durées d’abonnement : résiliations et censures">
        {[0, 200, 400, 600].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="tick">
              {fmt(v)}
            </text>
          </g>
        ))}
        {h.x.map((t, k) => (
          <g key={t} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} className={hover !== null && hover !== k ? 'dim' : ''}>
            <rect x={m.l + k * bw + 1} y={y(h.events[k])} width={bw - 2} height={y(0) - y(h.events[k])} className="ev" />
            <rect x={m.l + k * bw + 1} y={y(h.total[k])} width={bw - 2} height={y(h.events[k]) - y(h.total[k])} className="ce" />
            <rect x={m.l + k * bw} y={m.t} width={bw} height={H - m.t - m.b} fill="transparent" />
            {t % 12 === 0 && (
              <text x={m.l + k * bw + bw / 2} y={H - 10} textAnchor="middle" className="tick">
                {t}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="ch-leg">
        <span>
          <i className="ev" /> résiliations (événements)
        </span>
        <span>
          <i className="ce" /> encore abonnés (censures)
        </span>
        <span className="muted">Ancienneté en mois · lues à l’unité sur les figures 3 et 4</span>
      </div>
    </div>
  );
}

/* ───────── Boîtes à moustaches (No / Yes) ───────── */
function Boxplots({ tenure, charges }: { tenure: Box; charges: Box }) {
  const [which, setWhich] = useState<'tenure' | 'charges'>('tenure');
  const b = which === 'tenure' ? tenure : charges;
  const max = which === 'tenure' ? 72 : 9000;
  const W = 520;
  const rowH = 70;
  const m = { l: 116, r: 18, t: 16 };
  const x = (v: number) => m.l + (v / max) * (W - m.l - m.r);
  const ticks = which === 'tenure' ? [0, 12, 24, 36, 48, 60, 72] : [0, 2000, 4000, 6000, 8000];
  const H = m.t + rowH * 2 + 34;
  return (
    <div className="ch-box">
      <div className="ed-ctrl" role="tablist" aria-label="Variable">
        <button role="tab" aria-selected={which === 'tenure'} className={which === 'tenure' ? 'is-on' : ''} onClick={() => setWhich('tenure')}>
          Ancienneté (mois)
        </button>
        <button role="tab" aria-selected={which === 'charges'} className={which === 'charges' ? 'is-on' : ''} onClick={() => setWhich('charges')}>
          TotalCharges
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ch-svg" role="img" aria-label={`Boîtes à moustaches de ${which === 'tenure' ? 'l’ancienneté' : 'TotalCharges'} selon le churn`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={m.t - 4} y2={m.t + rowH * 2} className="grid" />
            <text x={x(v)} y={m.t + rowH * 2 + 18} textAnchor="middle" className="tick">
              {fmt(v)}
            </text>
          </g>
        ))}
        {b.groups.map((g, i) => {
          const cy = m.t + rowH * i + rowH / 2;
          const yes = i === 1;
          return (
            <g key={g} className={yes ? 'yes' : 'no'}>
              <text x={m.l - 12} y={cy - 2} textAnchor="end" className="grp">
                {yes ? 'Churn = Yes' : 'Churn = No'}
              </text>
              <text x={m.l - 12} y={cy + 13} textAnchor="end" className="tick">
                {yes ? 'résiliation' : 'encore abonné'}
              </text>
              <line x1={x(b.whisker_low[i])} x2={x(b.whisker_high[i])} y1={cy} y2={cy} className="wh" />
              <line x1={x(b.whisker_low[i])} x2={x(b.whisker_low[i])} y1={cy - 8} y2={cy + 8} className="wh" />
              <line x1={x(b.whisker_high[i])} x2={x(b.whisker_high[i])} y1={cy - 8} y2={cy + 8} className="wh" />
              <rect x={x(b.q1[i])} y={cy - 17} width={x(b.q3[i]) - x(b.q1[i])} height={34} rx={3} className="bx" />
              <line x1={x(b.median[i])} x2={x(b.median[i])} y1={cy - 17} y2={cy + 17} className="md" />
              <text x={x(b.median[i])} y={cy - 22} textAnchor="middle" className="mdl">
                ≈ {fmt(b.median[i])}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ch-note">
        {which === 'tenure'
          ? 'Médiane ≈ 10 mois chez les clients partis contre ≈ 38 mois chez les clients restés.'
          : 'TotalCharges est un cumul : il s’arrête au départ du client, d’où des montants plus faibles chez les churners (unité non précisée dans le rapport).'}{' '}
        Valeurs lues sur les graphiques du rapport.
      </p>
    </div>
  );
}

/* ───────── La table de survie, mois par mois ───────── */
const QUALITY: Record<string, string> = {
  publié: 'n(t) et d(t) publiés (tableau 3)',
  reconstruit: 'reconstruit d’après les figures',
  estimé: 'n(t) estimé (±2 clients en moyenne, ±6 au plus)',
};

function LifeTable({ lt, km }: { lt: LifeTableFig; km: Curve }) {
  const [t, setT] = useState(1);
  const W = 1000;
  const H = 230;
  const m = { l: 52, r: 12, t: 14, b: 30 };
  const months = lt.x.slice(1);
  const bw = (W - m.l - m.r) / months.length;
  const ymax = 0.06;
  const y = (v: number) => m.t + (1 - Math.min(v, ymax) / ymax) * (H - m.t - m.b);
  const i = lt.x.indexOf(t);
  const n = lt.n_risk[i];
  const dd = lt.events[i];
  const cc = lt.censored[i];
  const h = dd / n;
  const sPrev = km.y[i - 1];
  const sNow = km.y[i];
  const peakAfter = useMemo(() => lt.y.slice(2).reduce((a, v) => Math.max(a, v), 0), [lt]);
  return (
    <Reveal className="ch-life">
      <div className="ch-life-head">
        <div>
          <h3>Le hasard discret, mois par mois</h3>
          <p>
            ĥ(t) = d(t)/n(t) : la part des clients encore présents au début du mois t qui résilient pendant ce mois. Cliquez une barre ou utilisez le curseur : Kaplan–Meier n’est
            que le produit des (1 − ĥ).
          </p>
        </div>
        <label className="ed-range ch-life-range">
          <span className="ed-range-top">
            <span>Mois</span>
            <b>t = {t}</b>
          </span>
          <input type="range" min={1} max={72} step={1} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="Mois de la table de survie" />
        </label>
      </div>
      <div className="ch-life-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="ch-svg ch-life-svg" role="img" aria-label="Hasard discret mensuel de 1 à 72 mois">
          {[0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="tick">
                {fmt(v, 2, v === 0 ? 0 : 2)}
              </text>
            </g>
          ))}
          {months.map((mo, k) => {
            const v = lt.y[k + 1];
            const on = mo === t;
            return (
              <g key={mo} className={`hb ${on ? 'on' : ''} ${lt.quality[k + 1] === 'publié' ? 'pub' : ''}`} onClick={() => setT(mo)} onMouseEnter={() => setT(mo)}>
                <rect x={m.l + k * bw} y={m.t} width={bw} height={H - m.t - m.b} fill="transparent" />
                <rect x={m.l + k * bw + 1.5} y={y(v)} width={Math.max(2, bw - 3)} height={y(0) - y(v)} className="bar" />
                {(mo === 1 || mo % 12 === 0) && (
                  <text x={m.l + k * bw + bw / 2} y={H - 10} textAnchor="middle" className="tick">
                    {mo}
                  </text>
                )}
              </g>
            );
          })}
          <text x={m.l + bw * 1.5 + 6} y={y(lt.y[1]) + 12} className="pk">
            pic au mois 1 : {fmt(lt.y[1], 4, 4)}
          </text>
          <line x1={m.l} x2={W - m.r} y1={y(peakAfter)} y2={y(peakAfter)} className="ref" />
        </svg>
      </div>
      <div className="ch-life-calc" aria-live="polite">
        <div className="cell">
          <span>clients à risque n({t})</span>
          <b>{fmt(n)}</b>
        </div>
        <div className="cell">
          <span>résiliations d({t})</span>
          <b className="br">{fmt(dd)}</b>
        </div>
        <div className="cell">
          <span>censures c({t})</span>
          <b>{fmt(cc)}</b>
        </div>
        <div className="cell eq">
          <span>hasard du mois</span>
          <b>
            ĥ({t}) = {fmt(dd)} / {fmt(n)} = {fmt(h, 4, 4)}
          </b>
        </div>
        <div className="cell eq">
          <span>Kaplan–Meier</span>
          <b>
            Ŝ({t}) = Ŝ({t - 1}) × (1 − ĥ({t})) = {fmt(sPrev, 4, 4)} × {fmt(1 - h, 4, 4)} ≈ {fmt(sNow, 4, 4)}
          </b>
        </div>
      </div>
      <p className="ch-note">
        Source de la ligne : {QUALITY[lt.quality[i]] ?? lt.quality[i]}. Barres foncées : mois publiés dans le tableau 3 du rapport ; autres mois reconstruits à partir des figures
        (d(t) exacts, totaux 1 869 / 5 174 retrouvés). La ligne pointillée marque le plus haut niveau atteint après le mois 1.
      </p>
    </Reveal>
  );
}
