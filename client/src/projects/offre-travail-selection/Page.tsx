import { useState, type ReactNode } from 'react';
import { fmt, type Section } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { BlockView, SectionBody, findSection } from '../../components/Blocks';
import { HBars, LineChart, VBars } from '../../components/charts';
import { useScrollSpy } from '../editorial/Editorial';
import { SelectionLab } from './SelectionLab';
import './style.css';

/* ───────── Types des séries de la fiche ───────── */
interface CountFig {
  x: string[];
  y: number[];
  labels?: Record<string, string>;
  approx?: boolean;
  note?: string;
}
interface FamilyFig {
  x: string[];
  series: { name: string; y: number[]; note?: string }[];
  tests?: string;
}
interface ProbitStep {
  model: string;
  formula: string;
  df: number | null;
  aic: number | null;
  note?: string;
}
interface ComparisonFig {
  columns: string[];
  rows: string[][];
}

const NAV = [
  { id: 'probleme', label: 'Le problème' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'probit', label: 'Probit' },
  { id: 'mco', label: 'MCO' },
  { id: 'tobit', label: 'Tobit 2' },
  { id: 'labo', label: 'Labo' },
  { id: 'bilan', label: 'Bilan' },
];

/** « Q1 · Analyse univariée » → ["Q1", "Analyse univariée"] */
const splitQ = (title: string) => {
  const m = title.match(/^(Q\d)\s*·\s*(.*)$/);
  return m ? [m[1], m[2]] : ['', title];
};

const without = (s: Section | undefined, drop: (b: Section['blocks'][number]) => boolean): Section | undefined =>
  s && { ...s, blocks: s.blocks.filter((b) => !drop(b)) };

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, unknown>;
  const active = useScrollSpy(NAV.map((n) => n.id));
  const employment = f.employment as CountFig;
  const model = c.model as { models?: { id: string; steps?: ProbitStep[] }[] } | undefined;
  const steps = model?.models?.find((m) => m.id === 'probit_sequence')?.steps ?? [];

  const data = { source: '', unit: '', n: '', period: '', variables: [], cleaning: [], ...c.data };
  const cadre = findSection(c.sections, 'q1-cadre');
  const portrait = ['q1-variables', 'q1-univarie', 'q1-bivarie'].map((id) => findSection(c.sections, id)).filter(Boolean) as Section[];
  const probit = findSection(c.sections, 'q2-probit');
  const probitText = without(probit, (b) => b.type === 'table');
  const probitList = probit?.blocks.find((b) => b.type === 'list');
  const mco = without(findSection(c.sections, 'q3-mco'), (b) => b.type === 'table' && b.columns[0] === 'Min');
  const tobit = findSection(c.sections, 'q4-tobit2');
  const results = without(findSection(c.sections, 'q5-resultats'), (b) => b.type === 'table');

  return (
    <div className="ots">
      <nav className="ots-nav" aria-label="Sections du projet">
        <div className="ots-wrap ots-nav-in">
          <span className="ots-brand">
            <i aria-hidden>🧮</i> Offre de travail <b>&</b> sélection
          </span>
          <div className="ots-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'is-on' : ''}>
                {n.label}
              </a>
            ))}
          </div>
          <BackToPortfolio />
        </div>
      </nav>

      <header className="ots-hero">
        <div className="ots-wrap ots-hero-grid">
          <div>
            <div className="ots-kicker">
              {c.course.replace(' — ', ' · ')}
            </div>
            <h1>
              Travail des femmes
              <br />
              et <em>biais de sélection</em>
            </h1>
            <p className="ots-lede">{c.subtitle}.</p>
            <div className="ots-question">
              <small>Problématique</small>
              <Md as="p" text={c.question} />
            </div>
            <div className="ots-authors">
              {c.authors.map((a) => (
                <span key={a}>{a}</span>
              ))}
              <span className="ots-tools">{c.tools.join(' · ')}</span>
            </div>
          </div>
          <Waterline employed={employment.y[1]} notEmployed={employment.y[0]} />
        </div>
      </header>

      <div className="ots-wrap">
        <Reveal className="ots-kpis">
          {c.kpis.slice(0, 5).map((k) => (
            <div key={k.label} title={k.note}>
              <strong>
                <CountUp value={k.value} />
              </strong>
              <span>{k.label}</span>
              {k.note && <em>{k.note}</em>}
            </div>
          ))}
        </Reveal>
      </div>

      {/* 01 — le problème */}
      <Block id="probleme" no="01" title="Un salaire qu’on ne voit pas" tag="Q1">
        <div className="ots-two">
          <Reveal>{cadre && <SectionBody section={cadre} />}</Reveal>
          <Reveal as="aside" className="ots-card ots-data" delay={100}>
            <h4>La base</h4>
            <dl>
              <dt>Source</dt>
              <dd>{data.source}</dd>
              <dt>Unité</dt>
              <dd>{data.unit}</dd>
              <dt>Effectif</dt>
              <dd>{data.n}</dd>
              <dt>Période</dt>
              <dd>{data.period}</dd>
            </dl>
            <h4>Les variables clés</h4>
            <ul className="ots-vars">
              {(data.variables ?? []).slice(0, 9).map((v) => (
                <li key={v.name}>
                  <code>{v.name}</code>
                  <span>{v.label}</span>
                </li>
              ))}
            </ul>
            <details>
              <summary>Préparation des données ({data.cleaning?.length ?? 0} étapes)</summary>
              <ol>
                {(data.cleaning ?? []).map((s, i) => (
                  <Md key={i} as="li" text={s} />
                ))}
              </ol>
            </details>
          </Reveal>
        </div>
      </Block>

      {/* 02 — portrait */}
      <Block id="portrait" no="02" title="Qui sont-elles ?" tag="Q1" sub="Analyses univariée et bivariée, avant toute modélisation.">
        <Portrait f={f} />
        <div className="ots-dossiers">
          {portrait.map((s) => {
            const [q, t] = splitQ(s.title);
            const figs = s.blocks.filter((b) => b.type === 'figure');
            return (
              <Reveal key={s.id} className={`ots-dossier ${figs.length ? 'has-figs' : ''}`}>
                <h3>
                  {q && <span>{q}</span>} {t}
                </h3>
                <div className="ots-dossier-grid">
                  <SectionBody section={{ ...s, blocks: s.blocks.filter((b) => b.type !== 'figure') }} />
                  {figs.length > 0 && (
                    <div className="ots-figs">
                      {figs.map((b, i) => (
                        <BlockView key={i} block={b} />
                      ))}
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </Block>

      {/* 03 — probit */}
      <Block id="probit" no="03" title="Participer : un probit construit pas à pas" tag="Q2">
        {steps.length > 0 && <ProbitBuilder steps={steps} explain={probitList?.type === 'list' ? probitList.items : []} />}
        <Reveal className="ots-prose">{probitText && <SectionBody section={probitText} />}</Reveal>
      </Block>

      {/* 04 — MCO */}
      <Block id="mco" no="04" title="Le piège des MCO" tag="Q3">
        <div className="ots-two">
          <Reveal>{mco && <SectionBody section={mco} />}</Reveal>
          <Reveal className="ots-card" delay={100}>
            <h4>Résidus du MCO sur toutes les femmes</h4>
            <ResidualRuler />
            <p className="ots-small">
              Quantiles rapportés dans le devoir (wage ~ âge + âge² + zone + diplôme, zéros compris). La moitié centrale des résidus tient dans un intervalle étroit ; la queue
              droite s’étire jusqu’à 187 754 : le modèle linéaire décrit mal un salaire qui vaut 0 pour plus d’un tiers de l’échantillon.
            </p>
          </Reveal>
        </div>
      </Block>

      {/* 05 — Tobit 2 */}
      <Block id="tobit" no="05" title="Tobit 2 : deux équations, une corrélation" tag="Q4 · Q5">
        <div className="ots-two">
          <Reveal>{tobit && <SectionBody section={tobit} />}</Reveal>
          <Reveal className="ots-card ots-rho" delay={100}>
            <h4>Corrélation des erreurs estimée</h4>
            <RhoGauge rho={-0.15} />
            <p>
              <b>ρ ≈ −0,15</b>, significatif : des facteurs non observés jouent à la fois sur l’emploi et sur le salaire. Les MCO sur les seules employées sont donc biaisés —
              d’où le Tobit 2, estimé par maximum de vraisemblance (<code>sampleSelection</code>, <code>method = "ml"</code>).
            </p>
          </Reveal>
        </div>
        <SignMatrix fig={f.model_comparison as ComparisonFig} />
        <Reveal className="ots-prose">{results && <SectionBody section={results} />}</Reveal>
      </Block>

      {/* 06 — laboratoire */}
      <Block
        id="labo"
        no="06"
        title="Laboratoire : rendre le biais visible"
        sub="Le devoir ne publie pas ses coefficients : ce module simule des données avec la même structure (ρ, taux d’emploi) pour montrer ce que corrige un modèle de sélection."
      >
        <Reveal className="ots-card ots-lab">
          <SelectionLab paperRho={-0.15} paperRate={0.64} />
        </Reveal>
      </Block>

      {/* 07 — bilan */}
      <Block id="bilan" no="07" title="Ce qu’il faut retenir">
        <ol className="ots-concl">
          {c.conclusions.map((t, i) => (
            <Reveal as="li" key={i} delay={i * 60}>
              <Md text={t} />
            </Reveal>
          ))}
        </ol>
      </Block>

      <ProjectEnd project={project} />
    </div>
  );
}

/* ───────── Mise en page des sections ───────── */
function Block({ id, no, title, tag, sub, children }: { id: string; no: string; title: string; tag?: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="ots-sec">
      <div className="ots-wrap">
        <Reveal className="ots-head">
          <span className="ots-no">{no}</span>
          <h2>{title}</h2>
          {tag && <span className="ots-tag">{tag}</span>}
        </Reveal>
        {sub && <p className="ots-sub">{sub}</p>}
        {children}
      </div>
    </section>
  );
}

/* ───────── La ligne de flottaison : 400 points ≈ 19 461 femmes ───────── */
function Waterline({ employed, notEmployed }: { employed: number; notEmployed: number }) {
  const [naive, setNaive] = useState(false);
  const total = employed + notEmployed;
  const cols = 20;
  const rows = 20;
  const n = cols * rows;
  const lit = Math.round((n * employed) / total);
  const cell = 16;
  const W = cols * cell;
  const H = rows * cell;
  const full = Math.floor(lit / cols);
  const rem = lit % cols;
  const yA = (full + (rem ? 1 : 0)) * cell;
  const yB = full * cell;
  const path = rem ? `M-6 ${yA} H${rem * cell} V${yB} H${W + 6}` : `M-6 ${yB} H${W + 6}`;

  return (
    <figure className={`ots-water ${naive ? 'is-naive' : ''}`}>
      <div className="ots-water-plot">
        <svg viewBox={`-8 -6 ${W + 16} ${H + 12}`} role="img" aria-label={`${fmt(employed)} femmes en emploi (salaire observé) et ${fmt(notEmployed)} sans emploi (salaire non observé)`}>
          {Array.from({ length: n }, (_, i) => {
            const r = Math.floor(i / cols);
            const col = i % cols;
            const on = i < lit;
            return (
              <circle
                key={i}
                cx={col * cell + cell / 2}
                cy={r * cell + cell / 2}
                r={on ? 5.2 : 4.4}
                className={on ? 'on' : 'off'}
                style={{ animationDelay: `${r * 45 + col * 6}ms` }}
              />
            );
          })}
          <path d={path} className="ots-waterline" />
        </svg>
        <div className="ots-water-lab top">
          <b>{fmt(employed)}</b> en emploi
          <span>salaire observé</span>
        </div>
        <div className="ots-water-lab bottom">
          <b>{fmt(notEmployed)}</b> sans emploi
          <span>{naive ? 'salaire = 0 dans la base' : 'salaire non observé'}</span>
        </div>
      </div>
      <div className="ots-water-toggle" role="group" aria-label="Lecture des salaires nuls">
        <button className={!naive ? 'is-on' : ''} onClick={() => setNaive(false)}>
          Non observé
        </button>
        <button className={naive ? 'is-on' : ''} onClick={() => setNaive(true)}>
          Lecture naïve : 0
        </button>
      </div>
      <figcaption>
        {naive ? (
          <>
            Compter ces {fmt(notEmployed)} zéros comme des salaires mélange deux décisions — travailler, puis être payée — et introduit un biais.
          </>
        ) : (
          <>
            1 point ≈ {fmt(total / n)} femmes. Sous la ligne, le salaire existe mais n’est pas observé : c’est une sélection, pas une donnée manquante au hasard.
          </>
        )}
      </figcaption>
    </figure>
  );
}

/* ───────── Portrait de l'échantillon ───────── */
function Portrait({ f }: { f: Record<string, unknown> }) {
  const tabs = [
    { id: 'age', label: 'Âge' },
    { id: 'diplome', label: 'Diplôme' },
    { id: 'zone', label: 'Zone' },
    { id: 'famille', label: 'Famille × emploi' },
  ] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('age');
  const count = (key: string, highlight?: string[]) => {
    const fig = f[key] as CountFig;
    return {
      fig,
      data: fig.x.map((x, i) => ({
        label: x,
        value: fig.y[i],
        display: `≈ ${fmt(fig.y[i])}`,
        color: highlight?.includes(x) || fig.labels?.[x] ? 'var(--lav)' : 'var(--steel)',
      })),
    };
  };

  let body: ReactNode = null;
  let note = '';
  if (tab === 'famille') {
    const fam = f.family_by_work as FamilyFig;
    body = (
      <HBars
        className="ots-hbars"
        max={1}
        data={fam.series.flatMap((s) =>
          fam.x.map((st, j) => ({
            label: `${s.name} · ${st.toLowerCase()}`,
            value: s.y[j],
            display: `${s.note ? '≈ ' : ''}${fmt(s.y[j] * 100, s.y[j] * 100 % 1 ? 1 : 0)} %`,
            color: j === 0 ? 'var(--steel)' : 'var(--lav)',
          })),
        )}
      />
    );
    note = `Part au sein de chaque statut. ${fam.tests ?? ''}.`;
  } else {
    const key = tab === 'age' ? 'age_hist' : tab === 'diplome' ? 'diploma_counts' : 'zone_counts';
    const { fig, data } = count(key);
    body = <VBars data={data} ariaLabel={`Effectifs par ${tab}`} height={280} yFormat={(v) => fmt(v)} showValues={false} />;
    const named = fig.labels ? Object.entries(fig.labels).map(([k, v]) => `${k} = ${v}`).join(' · ') : '';
    note = [named && `Modalités nommées dans le rapport : ${named}.`, fig.approx && 'Effectifs lus sur les graphiques du rapport (valeurs approchées).']
      .filter(Boolean)
      .join(' ');
    if (tab === 'age') note = 'Classes de 5 ans, 16 à 65 ans ; âge moyen ≈ 41 ans. ' + note;
  }

  return (
    <Reveal className="ots-card ots-portrait">
      <div className="ots-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ots-portrait-body">{body}</div>
      <p className="ots-small">{note}</p>
    </Reveal>
  );
}

/* ───────── Le probit, étape par étape ───────── */
const SHORT = ['Vide', '+ âge', '+ âge²', '+ couple', '+ enfant', '+ zone', '+ diplôme'];

function ProbitBuilder({ steps, explain }: { steps: ProbitStep[]; explain: string[] }) {
  const [k, setK] = useState(0);
  const known = steps.map((s, i) => ({ ...s, i })).filter((s) => s.aic !== null) as (ProbitStep & { i: number; aic: number })[];
  const cur = steps[k];
  const prevKnown = [...known].reverse().find((s) => s.i < k);
  const delta = cur.aic !== null && prevKnown ? cur.aic - prevKnown.aic : null;
  const gain = cur.aic !== null ? known[0].aic - cur.aic : null;
  const text =
    k === 0
      ? 'Constante seule : le probit reproduit le taux d’emploi moyen (≈ 64 %). C’est la référence pour juger chaque ajout.'
      : k <= 2
        ? explain[0]
        : k <= 4
          ? explain[1]
          : k === 5
            ? (explain[3] ?? '')
            : (explain[2] ?? '');
  const visible = known.filter((s) => s.i <= k);

  return (
    <Reveal className="ots-card ots-probit">
      <div className="ots-probit-steps" role="tablist" aria-label="Étapes du probit">
        {steps.map((s, i) => (
          <button key={s.model} role="tab" aria-selected={i === k} className={`${i === k ? 'is-on' : ''} ${i < k ? 'is-done' : ''}`} onClick={() => setK(i)}>
            <span>{i}</span>
            {SHORT[i] ?? s.model}
          </button>
        ))}
      </div>
      <div className="ots-probit-grid">
        <div className="ots-probit-chart">
          <div className="ots-chart-cap">AIC — plus bas = meilleur</div>
          <LineChart
            ariaLabel="AIC des probits emboîtés"
            xDomain={[-0.3, steps.length - 0.7]}
            yDomain={[21800, 25600]}
            width={600}
            height={320}
            margin={{ top: 14, right: 14, bottom: 36, left: 62 }}
            xTicks={steps.map((_, i) => i)}
            xFormat={(v) => SHORT[v] ?? ''}
            yFormat={(v) => fmt(v)}
            series={[
              { id: 'all', points: known.map((s) => [s.i, s.aic]), color: 'var(--steel)', width: 1.4, dash: '4 5' },
              { id: 'cur', points: visible.map((s) => [s.i, s.aic]), color: 'var(--lav)', width: 2.8, dots: true },
            ]}
            markers={cur.aic !== null ? [{ x: k, y: cur.aic, r: 7, color: 'var(--green)' }] : []}
            vlines={cur.aic === null ? [{ x: k, label: 'AIC non reporté', color: 'var(--amber)' }] : []}
          />
        </div>
        <div className="ots-probit-card">
          <code className="ots-formula">{cur.formula.replace('nag2', 'nag²')}</code>
          <div className="ots-probit-nums">
            <div>
              <small>Paramètres</small>
              <b>{cur.df ?? '—'}</b>
            </div>
            <div>
              <small>AIC</small>
              <b>{cur.aic !== null ? fmt(cur.aic, 2, 2) : 'en baisse'}</b>
            </div>
            <div>
              <small>Δ étape</small>
              <b className={delta !== null && delta < 0 ? 'down' : ''}>{delta !== null ? fmt(delta, 2, 2) : '—'}</b>
            </div>
            <div>
              <small>Gain total</small>
              <b>{gain !== null ? fmt(gain, 2, 2) : '—'}</b>
            </div>
          </div>
          {cur.note && <p className="ots-small">{cur.note}</p>}
          <Md as="p" className="ots-probit-text" text={text} />
          <button className="ots-next" onClick={() => setK((k + 1) % steps.length)}>
            {k < steps.length - 1 ? `Ajouter ${SHORT[k + 1]?.replace('+ ', '') ?? ''} →` : '↺ Recommencer'}
          </button>
        </div>
      </div>
    </Reveal>
  );
}

/* ───────── Résidus : une règle étirée ───────── */
function ResidualRuler() {
  const q = { min: -21980, q1: -5680, med: -341, q3: 5231, max: 187754 };
  const W = 460;
  const H = 150;
  const x = (v: number) => 24 + ((v + 30000) / 225000) * (W - 48);
  const y = 74;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ots-ruler" role="img" aria-label="Quantiles des résidus : minimum −21 980, quartiles −5 680 et 5 231, médiane −341, maximum 187 754">
      <line x1={x(-30000)} x2={x(195000)} y1={y + 32} y2={y + 32} className="axis" />
      {[0, 50000, 100000, 150000].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={y + 28} y2={y + 36} className="axis" />
          <text x={x(v)} y={y + 52} textAnchor="middle" className="tick">
            {v === 0 ? '0' : `${fmt(v / 1000)} k`}
          </text>
        </g>
      ))}
      <line x1={x(q.min)} x2={x(q.max)} y1={y} y2={y} className="whisk" />
      <line x1={x(q.min)} x2={x(q.min)} y1={y - 9} y2={y + 9} className="whisk" />
      <line x1={x(q.max)} x2={x(q.max)} y1={y - 9} y2={y + 9} className="whisk" />
      <rect x={x(q.q1)} y={y - 14} width={x(q.q3) - x(q.q1)} height={28} rx={3} className="box" />
      <line x1={x(q.med)} x2={x(q.med)} y1={y - 14} y2={y + 14} className="med" />
      <path d={`M${x(q.q1)} ${y - 22} V${y - 28} H${x(q.q3)} V${y - 22}`} className="bracket" />
      <text x={x(q.q1) - 4} y={y - 36} className="lab">
        50 % entre {fmt(q.q1)} et {fmt(q.q3)}
      </text>
      <text x={x(q.q1) - 4} y={y - 52} className="lab dim">
        médiane {fmt(q.med)}
      </text>
      <text x={x(q.min) - 2} y={y + 22} textAnchor="end" className="lab dim">
        min {fmt(q.min)}
      </text>
      <text x={x(q.max)} y={y - 16} textAnchor="end" className="lab hot">
        max {fmt(q.max)}
      </text>
    </svg>
  );
}

/* ───────── Jauge de ρ ───────── */
function RhoGauge({ rho }: { rho: number }) {
  const x = (v: number) => 20 + ((v + 1) / 2) * 400;
  return (
    <svg viewBox="0 0 440 92" className="ots-gauge" role="img" aria-label={`ρ estimé : ${fmt(rho, 2, 2)}`}>
      <defs>
        <linearGradient id="ots-g" x1="0" x2="1">
          <stop offset="0" stopColor="#f27a93" />
          <stop offset="0.5" stopColor="#1e3a5f" />
          <stop offset="1" stopColor="#2ee6a0" />
        </linearGradient>
      </defs>
      <rect x={20} y={36} width={400} height={10} rx={5} fill="url(#ots-g)" />
      {[-1, -0.5, 0, 0.5, 1].map((v) => (
        <text key={v} x={x(v)} y={66} textAnchor="middle" className="tick">
          {fmt(v, 1, v % 1 ? 1 : 0)}
        </text>
      ))}
      <line x1={x(0)} x2={x(0)} y1={30} y2={52} className="zero" />
      <g className="needle" style={{ ['--to' as string]: `${x(rho) - x(0)}px` }}>
        <path d={`M${x(0)} 30 l-7 -12 h14 z`} />
        <text x={x(0)} y={13} textAnchor="middle">
          ρ ≈ {fmt(rho, 2, 2)}
        </text>
      </g>
      <text x={20} y={86} className="tick">
        sélection négative
      </text>
      <text x={420} y={86} textAnchor="end" className="tick">
        sélection positive
      </text>
    </svg>
  );
}

/* ───────── Matrice des signes ───────── */
const COL_NOTES: Record<string, string> = {
  'Probit (Q2)': 'Participation : P(work = 1) = Φ(Xβ), 21 paramètres, AIC 22 103,24.',
  'Logit (Q2)': 'Même spécification avec une loi logistique : signes et significativités très proches du probit.',
  'MCO toutes femmes (Q3)': 'Salaire sur les 19 461 femmes, zéros compris : mélange la décision de travailler et le niveau du salaire.',
  'MCO employées (Q3)': 'Salaire sur les seules femmes en emploi : ignore qu’elles ne sont pas tirées au hasard.',
  'Tobit 2 – sélection (Q5)': 'Équation de participation, estimée conjointement avec le salaire par maximum de vraisemblance.',
  'Tobit 2 – salaire (Q5)': 'Équation de salaire (en milliers), corrigée de la sélection ; couple et enfant en sont exclus.',
};

function tone(cell: string) {
  const s = cell.trim();
  if (s.startsWith('ρ')) return 'rho';
  if (s.startsWith('+')) return 'pos';
  if (s.startsWith('−') || s.startsWith('-')) return 'neg';
  if (s.startsWith('≈')) return 'same';
  if (/exclu|non inclus|ignorée|non commenté|^—$/.test(s)) return 'off';
  return 'mix';
}

function SignMatrix({ fig }: { fig: ComparisonFig | undefined }) {
  const [col, setCol] = useState<number | null>(null);
  const [row, setRow] = useState<number | null>(null);
  if (!fig) return null;
  const models = fig.columns.slice(1);
  return (
    <Reveal className="ots-card ots-matrix">
      <h4>Les mêmes variables, six modèles</h4>
      <p className="ots-small">Signes et significativité tels que décrits dans le rapport — aucun coefficient n’y est publié. Survolez une colonne pour lire ce que fait le modèle.</p>
      <div className="ots-matrix-scroll">
        <table onMouseLeave={() => (setCol(null), setRow(null))}>
          <thead>
            <tr>
              <th />
              {models.map((m, j) => (
                <th key={m} scope="col" className={col === j ? 'is-col' : ''} onMouseEnter={() => setCol(j)} tabIndex={0} onFocus={() => setCol(j)}>
                  {m.replace(/\s*\((Q\d)\)/, '')}
                  <small>{m.match(/\((Q\d)\)/)?.[1]}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fig.rows.map((r, i) => (
              <tr key={r[0]} className={row === i ? 'is-row' : ''} onMouseEnter={() => setRow(i)}>
                <th scope="row">{r[0]}</th>
                {r.slice(1).map((cell, j) => (
                  <td key={j} className={`t-${tone(cell)} ${col === j ? 'is-col' : ''}`} onMouseEnter={() => setCol(j)}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ots-matrix-note" aria-live="polite">
        {col !== null ? (
          <>
            <b>{models[col]}</b> — {COL_NOTES[models[col]] ?? ''}
          </>
        ) : (
          <span className="ots-legend">
            <i className="t-pos">+</i> effet positif <i className="t-neg">−</i> effet négatif <i className="t-same">≈</i> comme le probit <i className="t-off">·</i> absent / exclu{' '}
            <i className="t-rho">ρ</i> sélection
          </span>
        )}
      </p>
    </Reveal>
  );
}
