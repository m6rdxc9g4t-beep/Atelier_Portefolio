import { useMemo, useState, type ReactNode } from 'react';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/dm-serif-display/400-italic.css';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import { arch1MomentCondition, fmt, fmtSci, type Block, type Section } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { BlockView, SectionBody, findSection } from '../../components/Blocks';
import { LineChart } from '../../components/charts';
import { useScrollSpy } from '../editorial/Editorial';
import { GarchLab, type GarchPreset } from './GarchLab';
import './style.css';

/* ───────── Séries numérisées de la fiche ───────── */
interface Series {
  x: string[];
  y: number[];
  description?: string;
  approx?: boolean;
  derived?: boolean;
}
interface Acf {
  x: number[];
  y: number[];
  band: number;
}
interface Hint {
  id: string;
  label: string;
  a0: number;
  a1: number;
  omega: number;
  alpha: number;
  beta: number;
}

const NAV = [
  { id: 'donnees', label: 'Données' },
  { id: 'faits', label: 'Faits stylisés' },
  { id: 'arch', label: 'ARCH(1)' },
  { id: 'moments', label: 'Moments' },
  { id: 'garch', label: 'GARCH' },
  { id: 'simulateur', label: 'Simulateur' },
  { id: 'diagnostic', label: 'Diagnostic' },
];

/** "2008-10-09" → 2008,77 */
const decYear = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return y + (m - 1) / 12 + (day - 1) / 365;
};
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const frDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};
const pct = (v: number, d = 1) => `${fmt(v * 100, d, d)} %`;

const dropBlocks = (s: Section | undefined, drop: (b: Block) => boolean): Section | undefined => s && { ...s, blocks: s.blocks.filter((b) => !drop(b)) };

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, unknown>;
  const active = useScrollSpy(NAV.map((n) => n.id));
  const model = c.model as {
    ar1_garch11_sp500?: { params: Record<string, { symbol: string; role?: string; estimate: number }> };
    simulator_hints?: { presets: Hint[] };
  };

  const returns = f.returns as Series;
  const sigma = f.conditional_volatility as Series;
  const eps = f.std_residuals as Series;
  const logp = f.log_price as Series;

  const presets: GarchPreset[] = (model.simulator_hints?.presets ?? [])
    .filter((h) => h.id !== 'figure-8')
    .map((h) => ({
      id: h.id,
      label: h.label.replace(' (garchFit)', ''),
      note: `ω = ${fmtSci(h.omega, 2)}, α = ${fmt(h.alpha, 3)}, β = ${fmt(h.beta, 3)}`,
      params: { a0: h.a0, a1: h.a1, omega: h.omega, alpha: h.alpha, beta: h.beta },
    }));

  const sec = (id: string) => findSection(c.sections, id);
  const noFig = (id: string) => dropBlocks(sec(id), (b) => b.type === 'figure');
  const figures = c.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'figure')) as Extract<Block, { type: 'figure' }>[];
  const params = model.ar1_garch11_sp500?.params;

  return (
    <div className="gv">
      <header className="gv-top">
        <div className="gv-logo">
          ARCH · GARCH <span>/</span> S&amp;P 500
        </div>
        <nav className="gv-nav" aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'is-on' : ''}>
              {n.label}
            </a>
          ))}
        </nav>
        <BackToPortfolio />
      </header>

      <section className="gv-hero">
        <div>
          <div className="gv-label">Devoir maison — {c.course.replace('M2 Économie appliquée — ', '')} · Master EA · Université de Lille</div>
          <h1>
            Volatilité
            <br />
            <em>conditionnelle</em>
            <br />& S&amp;P 500
          </h1>
        </div>
        <div className="gv-hero-meta">
          <p className="gv-desc">{c.subtitle}.</p>
          <div className="gv-stats">
            {c.kpis.slice(0, 6).map((k) => (
              <div key={k.label} className="gv-stat" title={k.note}>
                <span className="v">
                  <CountUp value={k.value} />
                </span>
                <Md className="l" text={k.label} />
              </div>
            ))}
          </div>
          <div className="gv-byline">
            {c.authors.map((a) => a.toUpperCase().replace(/^(\S+)\s(\S+)$/, '$1 $2')).join('  ·  ')} · {c.date}
          </div>
        </div>
      </section>

      <Tape returns={returns} />

      {/* 01 — données */}
      <Sec id="donnees" no="01" title="Les rendements, semaine après semaine">
        <ReturnsExplorer returns={returns} sigma={sigma} eps={eps} logp={logp} />
        <div className="gv-cols">
          <Reveal className="gv-prose">{noFig('contexte') && <SectionBody section={noFig('contexte')!} />}</Reveal>
          <Reveal className="gv-prose">{noFig('donnees') && <SectionBody section={noFig('donnees')!} />}</Reveal>
        </div>
      </Sec>

      {/* 02 — faits stylisés */}
      <Sec id="faits" no="02" title="Quatre faits stylisés">
        <FactCards />
        <AcfExplorer f={f} initial="r2" />
        <Reveal className="gv-prose gv-mt">
          {sec('faits-stylises') && <SectionBody section={dropBlocks(sec('faits-stylises'), (b) => b.type === 'figure' || b.type === 'table')!} />}
        </Reveal>
      </Sec>

      {/* 03 — ARCH(1) */}
      <Sec id="arch" no="03" title="Le modèle ARCH(1)">
        <Reveal className="gv-prose gv-formulas">{sec('arch1') && <SectionBody section={sec('arch1')!} />}</Reveal>
      </Sec>

      {/* 04 — moments */}
      <Sec id="moments" no="04" title="Jusqu’où les moments existent-ils ?">
        <MomentExplorer alphaHat={0.288233} />
        <Reveal className="gv-prose gv-mt gv-formulas">{sec('moments') && <SectionBody section={sec('moments')!} />}</Reveal>
      </Sec>

      {/* 05 — GARCH */}
      <Sec id="garch" no="05" title="AR(1)–GARCH(1,1) : estimation">
        {params && (
          <Reveal className="gv-results">
            {Object.entries(params).map(([k, p]) => (
              <div key={k} className={`gv-result ${k === 'alpha2' ? 'hl' : ''}`}>
                <Md as="div" className="k" text={p.symbol} />
                <div className="v">{Math.abs(p.estimate) < 0.001 ? fmtSci(p.estimate, 3) : fmt(p.estimate, 7, 0)}</div>
                <div className="s">{p.role}</div>
              </div>
            ))}
            <div className="gv-result hl">
              <Md as="div" className="k" text="Persistance α̂₁ + α̂₂" />
              <div className="v">0,946</div>
              <div className="s">très proche de 1 : forte mémoire</div>
            </div>
          </Reveal>
        )}
        <div className="gv-cols gv-mt">
          <Reveal className="gv-prose gv-formulas">{sec('garch-theorie') && <SectionBody section={sec('garch-theorie')!} />}</Reveal>
          <Reveal className="gv-prose">{sec('estimation') && <SectionBody section={sec('estimation')!} />}</Reveal>
        </div>
      </Sec>

      {/* 06 — simulateur */}
      <Sec id="simulateur" no="06" title="Simuler un AR(1)–GARCH(1,1)">
        <Reveal className="gv-prose">{noFig('simulation') && <SectionBody section={noFig('simulation')!} />}</Reveal>
        <p className="gv-lede gv-mt">
          À vous : réglez ω, α et β et observez le regroupement de la volatilité. Le préréglage « S&amp;P 500 » reprend les estimations du devoir ; la trajectoire est simulée dans le
          navigateur avec le même code que l’API.
        </p>
        <Reveal>{presets.length > 0 && <GarchLab presets={presets} />}</Reveal>
      </Sec>

      {/* 07 — diagnostic */}
      <Sec id="diagnostic" no="07" title="Diagnostic : les résidus standardisés">
        <div className="gv-cols">
          <Reveal className="gv-prose">{noFig('diagnostic') && <SectionBody section={dropBlocks(sec('diagnostic'), (b) => b.type === 'figure' || b.type === 'callout')!} />}</Reveal>
          <AcfExplorer f={f} initial="eps2" compact />
        </div>
      </Sec>

      {figures.length > 0 && (
        <section className="gv-sec gv-figs-sec" aria-label="Figures originales du rapport">
          <div className="gv-sec-head">
            <span className="gv-num">Annexe</span>
            <h2 className="gv-title">Les figures du rapport</h2>
          </div>
          <div className="gv-figs">
            {figures.map((b) => (
              <BlockView key={b.src} block={b} />
            ))}
          </div>
        </section>
      )}

      <div className="gv-conclusion">
        <div>
          <h2>
            Le modèle
            <br />
            AR(1)–<em>GARCH(1,1)</em>
            <br />
            capture bien
            <br />
            les données.
          </h2>
        </div>
        <div className="gv-conclusion-body">
          {c.conclusions.map((t, i) => (
            <Md key={i} as="p" text={t} />
          ))}
          <div className="gv-final">
            <div>
              <b>p = 0,8232</b>
              <span>Ljung–Box ε̂ₜ</span>
            </div>
            <div>
              <b>p = 0,9667</b>
              <span>Ljung–Box ε̂ₜ²</span>
            </div>
            <div>
              <b>0,946</b>
              <span>Persistance GARCH</span>
            </div>
            <div>
              <b>6,35 × 10⁻⁴</b>
              <span>Variance de long terme de rₜ</span>
            </div>
          </div>
        </div>
      </div>

      <ProjectEnd project={project} />
    </div>
  );
}

function Sec({ id, no, title, children }: { id: string; no: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="gv-sec">
      <Reveal className="gv-sec-head">
        <span className="gv-num">{no}</span>
        <h2 className="gv-title">{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}

/* ───────── Bandeau : les 1 761 rendements réels, comme un ruban de cotation ───────── */
function Tape({ returns }: { returns: Series }) {
  const n = returns.y.length;
  const H = 70;
  const max = 0.17;
  const years = [1990, 2000, 2008, 2020];
  const idxOf = (yr: number) => returns.x.findIndex((d) => Number(d.slice(0, 4)) >= yr);
  return (
    <div className="gv-tape" aria-hidden>
      <svg viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none">
        {returns.y.map((r, i) => {
          const h = Math.max(0.6, (Math.abs(r) / max) * (H - 6));
          return <rect key={i} x={i} y={H / 2 - h / 2} width={1} height={h} className={Math.abs(r) > 0.06 ? 'hot' : r < 0 ? 'neg' : 'pos'} />;
        })}
      </svg>
      <div className="gv-tape-years">
        {years.map((y) => (
          <span key={y} style={{ left: `${(idxOf(y) / n) * 100}%` }}>
            {y}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────── Explorateur de séries ───────── */
type View = 'r' | 'r2' | 'sigma' | 'eps' | 'price';
const VIEWS: { id: View; label: string; note: string }[] = [
  { id: 'r', label: 'Rendements rₜ', note: 'Rendements logarithmiques hebdomadaires, avec la bande ±2σ̂ₜ du GARCH estimé.' },
  { id: 'r2', label: 'Carrés rₜ²', note: 'Les pics se regroupent : c’est le clustering de volatilité.' },
  { id: 'sigma', label: 'Volatilité σ̂ₜ', note: 'Volatilité conditionnelle recalculée à partir des estimations du devoir (non tracée dans le rapport).' },
  { id: 'eps', label: 'Résidus ε̂ₜ', note: 'Résidus standardisés : une fois la volatilité modélisée, l’amplitude devient à peu près constante.' },
  { id: 'price', label: 'Log-prix', note: 'Le log-prix suit une tendance de long terme : non stationnaire.' },
];
const PERIODS: { id: string; label: string; from: number; to: number }[] = [
  { id: 'all', label: '1987–2020', from: 1987, to: 2020.8 },
  { id: '87', label: 'Krach 1987', from: 1987, to: 1989 },
  { id: '08', label: 'Crise 2008', from: 2007.3, to: 2010 },
  { id: '20', label: 'Covid 2020', from: 2019.6, to: 2020.8 },
];

function ReturnsExplorer({ returns, sigma, eps, logp }: { returns: Series; sigma: Series; eps: Series; logp: Series }) {
  const [view, setView] = useState<View>('r');
  const [period, setPeriod] = useState('all');
  const [hover, setHover] = useState<number | null>(null);
  const per = PERIODS.find((p) => p.id === period)!;

  const data = useMemo(() => {
    const t = returns.x.map(decYear);
    const map: Record<View, { t: number[]; y: number[]; x: string[] }> = {
      r: { t, y: returns.y, x: returns.x },
      r2: { t, y: returns.y.map((v) => v * v), x: returns.x },
      sigma: { t: sigma.x.map(decYear), y: sigma.y, x: sigma.x },
      eps: { t: eps.x.map(decYear), y: eps.y, x: eps.x },
      price: { t: logp.x.map(decYear), y: logp.y, x: logp.x },
    };
    return map;
  }, [returns, sigma, eps, logp]);

  /** Plus forte baisse de chaque crise, lue sur la série numérisée. */
  const crashes = useMemo(() => {
    const pick = (from: number, to: number) => {
      let best = -1;
      data.r.t.forEach((t, i) => {
        if (t >= from && t < to && (best < 0 || returns.y[i] < returns.y[best])) best = i;
      });
      return best;
    };
    return [pick(1987, 1988), pick(2008, 2009), pick(2020, 2021)].filter((i) => i >= 0);
  }, [data, returns]);

  const d = data[view];
  const idx = d.t.map((t, i) => [t, i] as const).filter(([t]) => t >= per.from && t <= per.to);
  const ys = idx.map(([, i]) => d.y[i]);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (view === 'r') {
    const s = idx.map(([, i]) => sigma.y[i] ?? 0);
    hi = Math.max(hi, 2 * Math.max(...s));
    lo = Math.min(lo, -2 * Math.max(...s));
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    [lo, hi] = [-m, m];
  }
  if (view === 'eps') [lo, hi] = [-Math.max(Math.abs(lo), hi), Math.max(Math.abs(lo), hi)];
  if (view === 'r2' || view === 'sigma') lo = 0;
  const pad = (hi - lo) * 0.06;
  const yDomain: [number, number] = [lo - (view === 'r2' || view === 'sigma' ? 0 : pad), hi + pad];

  const hi_ = hover === null ? null : idx.reduce((best, [t, i]) => (Math.abs(t - hover) < Math.abs(d.t[best] - hover) ? i : best), idx[0][1]);
  const fmtY = (v: number) => (view === 'price' ? fmt(v, 2, 2) : view === 'eps' ? fmt(v, 2, 2) : view === 'r2' ? fmtSci(v, 2) : pct(v, 2));
  const yTick = (v: number) => (view === 'price' ? fmt(v, 1) : view === 'eps' ? fmt(v, 0) : view === 'r2' ? fmt(v * 1000, 0) + '‰' : `${fmt(v * 100, 0)} %`);
  const vnote = VIEWS.find((v) => v.id === view)!.note;
  const span = per.to - per.from;

  return (
    <Reveal className="gv-explorer">
      <div className="gv-explorer-bar">
        <div className="gv-tabs" role="tablist" aria-label="Série affichée">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'is-on' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="gv-periods" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button key={p.id} className={period === p.id ? 'is-on' : ''} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gv-readout" aria-live="polite">
        {hi_ !== null ? (
          <>
            <span>{frDate(d.x[hi_])}</span>
            <b>{fmtY(d.y[hi_])}</b>
            {view === 'r' && sigma.y[hi_] !== undefined && <span>σ̂ₜ = {pct(sigma.y[hi_], 2)}</span>}
          </>
        ) : (
          <span className="dim">{vnote}</span>
        )}
      </div>
      <LineChart
        ariaLabel={`${VIEWS.find((v) => v.id === view)!.label}, ${per.label}`}
        xDomain={[per.from, per.to]}
        yDomain={yDomain}
        height={330}
        width={1000}
        margin={{ top: 12, right: 14, bottom: 30, left: 58 }}
        xTicks={span > 10 ? [1990, 1995, 2000, 2005, 2010, 2015, 2020] : undefined}
        xFormat={(v) => (span > 4 ? String(Math.round(v)) : `${MONTHS[Math.min(11, Math.floor((v % 1) * 12 + 1e-6))]} ${Math.floor(v)}`)}
        yFormat={yTick}
        cursorX={hover}
        onHoverX={setHover}
        hlines={view === 'eps' ? [{ y: 2, dash: '3 4', color: 'var(--gv-muted)' }, { y: -2, dash: '3 4', color: 'var(--gv-muted)' }] : []}
        vlines={
          view === 'r' || view === 'r2' || view === 'sigma'
            ? crashes
                .filter((i) => d.t[i] >= per.from && d.t[i] <= per.to)
                .map((i) => ({
                  x: d.t[i],
                  label: `${MONTHS[Number(returns.x[i].slice(5, 7)) - 1]} ${returns.x[i].slice(0, 4)} · ${pct(returns.y[i], 1)}`,
                  color: 'var(--gv-red)',
                  dash: '2 3',
                  anchor: (d.t[i] - per.from) / span > 0.7 ? ('end' as const) : ('start' as const),
                }))
            : []
        }
        series={[
          {
            id: 'main',
            points: idx.map(([t, i]) => [t, d.y[i]] as [number, number]),
            color: view === 'sigma' ? 'var(--gv-red)' : 'var(--gv-ink)',
            width: view === 'price' || view === 'sigma' ? 1.6 : 0.9,
            area: view === 'sigma' || view === 'r2',
            areaOpacity: 0.12,
          },
        ]}
      >
        {view === 'r'
          ? ({ x, y }) => {
              const pts = idx.filter(([, i]) => sigma.y[i] !== undefined);
              if (!pts.length) return null;
              const up = pts.map(([t, i]) => `${x(t).toFixed(1)},${y(2 * sigma.y[i]).toFixed(1)}`);
              const dn = pts.map(([t, i]) => `${x(t).toFixed(1)},${y(-2 * sigma.y[i]).toFixed(1)}`).reverse();
              return <path d={`M${up.join('L')}L${dn.join('L')}Z`} className="gv-band" />;
            }
          : undefined}
      </LineChart>
      <p className="gv-note">
        Séries numérisées à partir des figures vectorielles du rapport (précision ≈ 10⁻⁵).
        {view === 'r' && ' Bande grise : ±2σ̂ₜ, volatilité conditionnelle du GARCH estimé.'}
      </p>
    </Reveal>
  );
}

/* ───────── Les quatre faits stylisés ───────── */
function FactCards() {
  const cards = [
    { icon: '〜', t: 'Stationnarité', b: 'Test ADF sur les rendements rₜ : la racine unitaire est rejetée.', r: 'ADF = −16,557 · p = 1,92 × 10⁻²⁹' },
    { icon: '◌', t: 'Bruit blanc en moyenne', b: 'Ljung–Box (h = 12) sur rₜ : pas d’autocorrélation linéaire au seuil de 5 %.', r: 'p = 0,0788' },
    { icon: '◆', t: 'Carrés autocorrélés', b: 'Ljung–Box sur rₜ² : la volatilité se regroupe dans le temps.', r: 'p < 2,2 × 10⁻¹⁶' },
    { icon: '|·|', t: 'Valeurs absolues', b: 'Même verdict pour |rₜ| : la dépendance passe par l’amplitude des chocs.', r: 'p < 2,2 × 10⁻¹⁶' },
  ];
  return (
    <Reveal className="gv-cards">
      {cards.map((c) => (
        <div key={c.t} className="gv-card">
          <div className="gv-card-icon">{c.icon}</div>
          <div className="gv-card-title">{c.t}</div>
          <div className="gv-card-body">{c.b}</div>
          <div className="gv-card-result">{c.r}</div>
        </div>
      ))}
    </Reveal>
  );
}

/* ───────── Autocorrélations ───────── */
const ACFS: { id: string; key: string; label: string; p: string }[] = [
  { id: 'r', key: 'acf_returns', label: 'rₜ', p: 'Ljung–Box (h = 12) : p = 0,0788' },
  { id: 'r2', key: 'acf_squared_returns', label: 'rₜ²', p: 'Ljung–Box (h = 12) : p < 2,2 × 10⁻¹⁶' },
  { id: 'abs', key: 'acf_abs_returns', label: '|rₜ|', p: 'Ljung–Box (h = 12) : p < 2,2 × 10⁻¹⁶' },
  { id: 'eps', key: 'acf_std_residuals', label: 'ε̂ₜ', p: 'Ljung–Box (h = 12) : p = 0,8232' },
  { id: 'eps2', key: 'acf_std_residuals_squared', label: 'ε̂ₜ²', p: 'Ljung–Box (h = 12) : p = 0,9667' },
];

function AcfExplorer({ f, initial, compact = false }: { f: Record<string, unknown>; initial: string; compact?: boolean }) {
  const [id, setId] = useState(initial);
  const cur = ACFS.find((a) => a.id === id)!;
  const acf = f[cur.key] as Acf | undefined;
  if (!acf) return null;
  const W = compact ? 520 : 1000;
  const H = 230;
  const m = { l: 44, r: 12, t: 14, b: 30 };
  const lags = acf.x.slice(1);
  const vals = acf.y.slice(1);
  const ymax = 0.3;
  const x = (k: number) => m.l + ((k - 0.5) / lags.length) * (W - m.l - m.r);
  const y = (v: number) => m.t + ((ymax - v) / (ymax + 0.1)) * (H - m.t - m.b);
  const sig = vals.filter((v) => Math.abs(v) > acf.band).length;
  return (
    <Reveal className={`gv-acf ${compact ? 'is-compact' : ''}`}>
      <div className="gv-acf-head">
        <div className="gv-tabs" role="tablist" aria-label="Série de l’ACF">
          {ACFS.map((a) => (
            <button key={a.id} role="tab" aria-selected={a.id === id} className={a.id === id ? 'is-on' : ''} onClick={() => setId(a.id)}>
              ACF {a.label}
            </button>
          ))}
        </div>
        <div className="gv-acf-p">
          {cur.p} · <b>{sig}</b> retard{sig > 1 ? 's' : ''} sur {lags.length} hors bande
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="gv-acf-svg" role="img" aria-label={`Autocorrélations de ${cur.label}, retards 1 à ${lags.length}`}>
        <rect x={m.l} y={y(acf.band)} width={W - m.l - m.r} height={y(-acf.band) - y(acf.band)} className="band" />
        {[0.3, 0.2, 0.1, 0, -0.1].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : 'grid'} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="tick">
              {fmt(v, 1, v === 0 ? 0 : 1)}
            </text>
          </g>
        ))}
        {lags.map((k, i) => {
          const v = vals[i];
          const out = Math.abs(v) > acf.band;
          return (
            <g key={k} className={out ? 'out' : ''}>
              <line x1={x(k)} x2={x(k)} y1={y(0)} y2={y(v)} className="stem" />
              <circle cx={x(k)} cy={y(v)} r={compact ? 3.4 : 3.8} className="dot">
                <title>{`retard ${k} : ${fmt(v, 3, 3)}`}</title>
              </circle>
              {(k % 5 === 0 || k === 1) && (
                <text x={x(k)} y={H - 10} textAnchor="middle" className="tick">
                  {k}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="gv-note">Bande : ±1,96/√T = ±{fmt(acf.band, 4, 4)}. ACF numérisées depuis les figures du rapport.</p>
    </Reveal>
  );
}

/* ───────── Moments de l'ARCH(1) ───────── */
function MomentExplorer({ alphaHat }: { alphaHat: number }) {
  const [a, setA] = useState(alphaHat);
  const orders = [1, 2, 3, 4, 5, 6];
  const cap = 2.5;
  const critical = (r: number) => Math.pow(1 / arch1MomentCondition(1, r), 1 / r);
  const maxOrder = orders.filter((r) => arch1MomentCondition(a, r) < 1).pop();
  const W = 640;
  const H = 260;
  const m = { l: 40, r: 10, t: 16, b: 50 };
  const bw = (W - m.l - m.r) / orders.length;
  const y = (v: number) => m.t + (1 - Math.min(v, cap) / cap) * (H - m.t - m.b);
  return (
    <Reveal className="gv-moments">
      <div className="gv-moments-ctrl">
        <label>
          <span>
            α₁ (effet ARCH) <b>{fmt(a, 3, 3)}</b>
          </span>
          <input type="range" min={0.05} max={0.6} step={0.001} value={a} onChange={(e) => setA(Number(e.target.value))} />
        </label>
        <button onClick={() => setA(alphaHat)} className={Math.abs(a - alphaHat) < 1e-9 ? 'is-on' : ''}>
          α̂₁ du devoir = 0,288233
        </button>
        <p>
          Avec α₁ = {fmt(a, 3, 3)}, les moments existent jusqu’à l’ordre <b>{maxOrder ? 2 * maxOrder : '—'}</b>
          {maxOrder && maxOrder < 6 ? ` ; celui d’ordre ${2 * (maxOrder + 1)} n’est plus défini.` : '.'}
        </p>
        <p className="gv-note">
          Moment d’ordre 2r fini si (2r − 1)!! · α₁ʳ &lt; 1. Plus α₁ est élevé, plus les queues de distribution sont épaisses et plus les moments élevés disparaissent tôt.
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="gv-moments-svg" role="img" aria-label="Condition d’existence des moments selon leur ordre">
        <line x1={m.l} x2={W - m.r} y1={y(1)} y2={y(1)} className="thr" />
        <text x={m.l + 6} y={y(1) - 6} className="thr-t">
          seuil = 1
        </text>
        {[0, 0.5, 1, 1.5, 2, 2.5].map((v) => (
          <text key={v} x={m.l - 8} y={y(v) + 4} textAnchor="end" className="tick">
            {fmt(v, 1, v % 1 ? 1 : 0)}
          </text>
        ))}
        {orders.map((r, i) => {
          const v = arch1MomentCondition(a, r);
          const ok = v < 1;
          const cx = m.l + bw * i + bw / 2;
          return (
            <g key={r} className={ok ? 'ok' : 'ko'}>
              <rect x={cx - bw * 0.32} y={y(v)} width={bw * 0.64} height={y(0) - y(v)} />
              {v > cap && <path d={`M${cx - 8} ${m.t + 12} l8 -8 l8 8`} className="over" />}
              <text x={cx} y={v > cap ? m.t + 32 : y(v) - 7} textAnchor="middle" className={`val ${v > cap ? 'in' : ''}`}>
                {v > 99 ? fmt(v, 0) : fmt(v, 3, 3)}
              </text>
              <text x={cx} y={H - 30} textAnchor="middle" className="lab">
                E(x{['²', '⁴', '⁶', '⁸', '¹⁰', '¹²'][i]})
              </text>
              <text x={cx} y={H - 12} textAnchor="middle" className="sub">
                α₁ &lt; {fmt(critical(r), 3, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </Reveal>
  );
}
