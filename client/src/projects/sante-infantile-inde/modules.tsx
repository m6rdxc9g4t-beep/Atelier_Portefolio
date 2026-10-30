import { useMemo, useState } from 'react';
import { fmt, normCdf } from '@atelier/shared';
import { Reveal } from '../../components/Reveal';

/* ───────── Indicateurs ───────── */
export type IndKey = 'stunting' | 'underweight' | 'wasting';
export const IND: { key: IndKey; label: string; short: string; color: string; index: string; z: string }[] = [
  { key: 'stunting', label: 'Retard de croissance', short: 'Stunting', color: '#7c5fc0', index: 'Taille-pour-âge', z: 'HAZ' },
  { key: 'underweight', label: 'Insuffisance pondérale', short: 'Underweight', color: '#d9772b', index: 'Poids-pour-âge', z: 'WAZ' },
  { key: 'wasting', label: 'Émaciation', short: 'Wasting', color: '#2f8f83', index: 'Poids-pour-taille', z: 'WHZ' },
];
const indOf = (k: IndKey) => IND.find((i) => i.key === k)!;
const sign = (v: number, d = 3) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), d, d)}`;

export function IndTabs({ value, onChange, label = 'Indicateur affiché' }: { value: IndKey; onChange: (k: IndKey) => void; label?: string }) {
  return (
    <div className="si-tabs" role="tablist" aria-label={label}>
      {IND.map((i) => (
        <button
          key={i.key}
          role="tab"
          aria-selected={value === i.key}
          className={value === i.key ? 'is-on' : ''}
          style={{ ['--ic' as string]: i.color }}
          onClick={() => onChange(i.key)}
        >
          <i aria-hidden /> {i.label}
        </button>
      ))}
    </div>
  );
}

/* ───────── Schéma de couverture : courbes de croissance et seuils Z ───────── */
export function GrowthSchematic() {
  const W = 440;
  const H = 300;
  const x = (t: number) => 40 + (t / 59) * (W - 70);
  // courbe schématique : niveau croissant et concave, décalée selon z (illustration sans valeurs réelles)
  const h = (t: number, z: number) => H - 40 - (46 + 150 * Math.log(1 + t / 9) / Math.log(1 + 59 / 9) + z * (10 + t * 0.32));
  const path = (z: number) =>
    Array.from({ length: 60 }, (_, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${h(t, z).toFixed(1)}`).join('');
  const band = `${path(-2)}${Array.from({ length: 60 }, (_, i) => 59 - i)
    .map((t) => `L${x(t).toFixed(1)},${h(t, -3.4).toFixed(1)}`)
    .join('')}Z`;
  // trajectoire d'un enfant qui décroche sous −2
  const kid = (t: number) => h(t, 0.3 - 2.8 * (1 - Math.exp(-t / 24)));
  const kidPath = Array.from({ length: 60 }, (_, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${kid(t).toFixed(1)}`).join('');
  return (
    <figure className="si-growth" aria-label="Schéma : courbes de croissance de référence et seuils des scores Z">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden>
        <path d={band} className="zone" />
        {[2, 0, -2, -3].map((z) => (
          <g key={z}>
            <path d={path(z)} className={`curve z${z}`} />
            <text x={x(59) + 6} y={h(59, z) + 4} className="zl">
              {z > 0 ? `+${z}` : z === 0 ? '0' : `−${-z}`} σ
            </text>
          </g>
        ))}
        <path d={kidPath} className="kid" />
        <circle cx={x(59)} cy={kid(59)} r={5} className="kid-dot" />
        <line x1={x(24)} x2={x(24)} y1={h(24, -2.6)} y2={h(24, -3.4) + 22} className="lead" />
        <text x={x(24) + 4} y={h(24, -3.4) + 32} className="zone-t">
          zone de retard de croissance (Z &lt; −2)
        </text>
        <line x1={40} x2={W - 30} y1={H - 30} y2={H - 30} className="ax" />
        <line x1={40} x2={40} y1={22} y2={H - 30} className="ax" />
        <text x={W - 30} y={H - 12} textAnchor="end" className="axl">
          âge (6–59 mois) →
        </text>
        <text x={46} y={30} className="axl">
          ↑ taille
        </text>
      </svg>
      <figcaption>Schéma de lecture : courbes de référence de l’OMS et seuils des scores Z (illustration, sans données).</figcaption>
    </figure>
  );
}

/* ───────── Organigramme de sélection ───────── */
export function SampleFunnel({ flow, criteria }: { flow: { x: string[]; y: number[]; excluded: (number | null)[] }; criteria: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = flow.y[0];
  return (
    <Reveal className="si-card si-funnel">
      <div className="si-card-h">
        <h4>De 232 920 à 163 135 enfants</h4>
        <span>Organigramme de sélection (annexe B)</span>
      </div>
      <ol>
        {flow.x.map((label, i) => (
          <li key={label} className={hover === i ? 'is-on' : ''} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <span className="st">{i + 1}</span>
            <div className="body">
              <div className="top">
                <b>{label}</b>
                <span className="n">{fmt(flow.y[i])}</span>
              </div>
              <div className="bar">
                <i style={{ width: `${(flow.y[i] / max) * 100}%` }} />
                {flow.excluded[i] ? <em style={{ width: `${((flow.excluded[i] as number) / max) * 100}%` }} /> : null}
              </div>
              <div className="crit">
                {criteria[i]}
                {flow.excluded[i] ? <span className="ex"> · {fmt(flow.excluded[i] as number)} exclus</span> : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="si-note">
        Au total, {fmt(max - flow.y[flow.y.length - 1])} enfants écartés ({fmt(((max - flow.y[flow.y.length - 1]) / max) * 100, 1, 1)} % de la base brute, calculé).
      </p>
    </Reveal>
  );
}

/* ───────── Lire un score Z ───────── */
const Z_ZONES = [
  { from: -5, to: -3, label: 'Malnutrition sévère', cls: 'sev' },
  { from: -3, to: -2, label: 'Malnutrition modérée', cls: 'mod' },
  { from: -2, to: 0, label: 'Légère insuffisance ou retard non sévère', cls: 'light' },
  { from: 0, to: 2, label: 'Croissance dans la moyenne de référence', cls: 'ok' },
  { from: 2, to: 5, label: 'Surpoids ou croissance excessive', cls: 'over' },
];

export function ZScoreReader({ prevalence }: { prevalence: Record<IndKey, number> }) {
  const [z, setZ] = useState(-2.4);
  const W = 640;
  const H = 210;
  const m = { l: 18, r: 18, t: 16, b: 36 };
  const x = (v: number) => m.l + ((v + 4) / 8) * (W - m.l - m.r);
  const pdf = (v: number) => Math.exp(-(v * v) / 2) / Math.sqrt(2 * Math.PI);
  const y = (d: number) => H - m.b - (d / 0.42) * (H - m.t - m.b);
  const pts = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05);
  const area = (a: number, b: number) => {
    const seg = pts.filter((v) => v >= a - 1e-9 && v <= b + 1e-9);
    if (!seg.length) return '';
    return `M${x(seg[0])},${y(0)}${seg.map((v) => `L${x(v).toFixed(1)},${y(pdf(v)).toFixed(1)}`).join('')}L${x(seg[seg.length - 1])},${y(0)}Z`;
  };
  const zone = Z_ZONES.find((r) => z >= r.from && z < r.to) ?? Z_ZONES[3];
  const below = normCdf(z);
  const expected = normCdf(-2);
  return (
    <Reveal className="si-card si-zreader">
      <div className="si-card-h">
        <h4>Lire un score Z</h4>
        <span>Normes OMS · distribution de référence</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score Z ${fmt(z, 1, 1)} : ${zone.label}`}>
        {Z_ZONES.map((r) => (
          <path key={r.cls} d={area(Math.max(-4, r.from), Math.min(4, r.to))} className={`zz ${r.cls} ${r === zone ? 'is-on' : ''}`} />
        ))}
        <path d={`M${pts.map((v) => `${x(v).toFixed(1)},${y(pdf(v)).toFixed(1)}`).join('L')}`} className="zcurve" />
        <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} className="zaxis" />
        {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={y(0)} y2={y(0) + 5} className="zaxis" />
            <text x={x(v)} y={y(0) + 19} textAnchor="middle" className="ztick">
              {v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'}
            </text>
          </g>
        ))}
        <line x1={x(-2)} x2={x(-2)} y1={m.t} y2={y(0)} className="zthr" />
        <text x={x(-2) + 6} y={m.t + 10} className="zthr-t">
          seuil −2
        </text>
        <g transform={`translate(${x(z)},0)`} className="zmark">
          <line x1={0} x2={0} y1={m.t - 4} y2={y(0)} />
          <circle cx={0} cy={y(pdf(z))} r={6} />
        </g>
      </svg>
      <label className="si-range">
        <span>
          Score Z de l’enfant <b>{z > 0 ? '+' : z < 0 ? '−' : ''}{fmt(Math.abs(z), 1, 1)}</b>
        </span>
        <input type="range" min={-4} max={3.5} step={0.1} value={z} onChange={(e) => setZ(Number(e.target.value))} aria-label="Score Z" />
      </label>
      <div className="si-zout" aria-live="polite">
        <span className={`chip ${zone.cls}`}>{zone.label}</span>
        <span>
          Dans la population de référence, ≈ <b>{fmt(below * 100, 1, 1)} %</b> des enfants ont un score inférieur (calculé, loi normale).
        </span>
      </div>
      <div className="si-zcompare">
        <div className="lab">Sous le seuil −2</div>
        <div className="row ref">
          <span>Référence OMS</span>
          <span className="bar">
            <i style={{ width: `${expected * 100 * 2}%` }} />
          </span>
          <b>≈ {fmt(expected * 100, 1, 1)} %</b>
        </div>
        {IND.map((i) => (
          <div key={i.key} className="row" style={{ ['--ic' as string]: i.color }}>
            <span>
              {i.label} <small>({i.index})</small>
            </span>
            <span className="bar">
              <i style={{ width: `${prevalence[i.key] * 2}%` }} />
            </span>
            <b>{fmt(prevalence[i.key], 1, 1)} %</b>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ───────── Gradient social : prévalences par groupe ───────── */
function GroupBars({ title, labels, sub, values, national, color }: { title: string; labels: string[]; sub?: string[]; values: number[]; national: number; color: string }) {
  const W = 400;
  const H = 250;
  const m = { l: 34, r: 12, t: 24, b: 48 };
  const max = 50;
  const band = (W - m.l - m.r) / labels.length;
  const bw = band * 0.62;
  const y = (v: number) => m.t + (1 - v / max) * (H - m.t - m.b);
  const gap = values[0] - values[values.length - 1];
  return (
    <figure className="si-gb">
      <figcaption>
        <b>{title}</b>
        <span>écart entre extrêmes : ≈ {fmt(gap, 1, 1)} points</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} : ${labels.map((l, i) => `${l} ≈ ${fmt(values[i], 1, 1)} %`).join(', ')}`}>
        {[0, 10, 20, 30, 40, 50].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="tick">
              {v}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const cx = m.l + band * i + band / 2;
          return (
            <g key={labels[i]}>
              <rect x={cx - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} rx={3} fill={color} opacity={0.35 + (0.65 * (values.length - i)) / values.length} />
              <text x={cx} y={y(v) - 6} textAnchor="middle" className="val">
                ≈ {fmt(v, 1, 1)}
              </text>
              <text x={cx} y={H - m.b + 16} textAnchor="middle" className="lab">
                {labels[i]}
              </text>
              {sub?.[i] && (
                <text x={cx} y={H - m.b + 30} textAnchor="middle" className="sub">
                  {sub[i]}
                </text>
              )}
            </g>
          );
        })}
        <line x1={m.l} x2={W - m.r} y1={y(national)} y2={y(national)} className="nat" />
        <text x={W - m.r} y={y(national) - 5} textAnchor="end" className="nat-t">
          Inde : {fmt(national, 1, 1)} %
        </text>
      </svg>
    </figure>
  );
}

export function InequalityExplorer({ f, ind, setInd }: { f: Record<string, any>; ind: IndKey; setInd: (k: IndKey) => void }) {
  const info = indOf(ind);
  const nat = (f.prevalence_overall.y as number[])[(f.prevalence_overall.keys as string[]).indexOf(ind)];
  const w = f.prevalence_by_wealth_quintile;
  const e = f.prevalence_by_mother_education;
  return (
    <Reveal className="si-card si-ineq">
      <div className="si-card-h">
        <h4>Le gradient social de la malnutrition</h4>
        <IndTabs value={ind} onChange={setInd} />
      </div>
      <div className="si-ineq-grid">
        <GroupBars
          title="Selon la richesse du ménage"
          labels={['Q1', 'Q2', 'Q3', 'Q4', 'Q5']}
          sub={['plus pauvres', '', '', '', 'plus riches']}
          values={w.series[ind]}
          national={nat}
          color={info.color}
        />
        <GroupBars
          title="Selon l’instruction de la mère"
          labels={['Aucune', 'Primaire', 'Secondaire', 'Supérieur']}
          values={e.series[ind]}
          national={nat}
          color={info.color}
        />
      </div>
      <p className="si-note">Prévalences en % des enfants de 6 à 59 mois, lues sur les figures 5 et 6 du mémoire (≈ ±0,1 point). Trait pointillé : prévalence nationale.</p>
    </Reveal>
  );
}

/* ───────── Indices de concentration ───────── */
export function ConcentrationExplorer({ f, ind, setInd }: { f: Record<string, any>; ind: IndKey; setInd: (k: IndKey) => void }) {
  const ci = f.concentration_indices;
  const keys: IndKey[] = ['stunting', 'underweight', 'wasting'];
  const k = keys.indexOf(ind);
  const C = ci.series.wagstaff[k] as number;
  const a = (1 + C) / (1 - C);
  const S = 260;
  const p = (v: number) => 30 + v * (S - 46);
  const q = (v: number) => S - 30 - v * (S - 46);
  const curve = Array.from({ length: 51 }, (_, i) => i / 50)
    .map((t, i) => `${i ? 'L' : 'M'}${p(t).toFixed(1)},${q(Math.pow(t, a)).toFixed(1)}`)
    .join('');
  const fill = `${curve}L${p(1)},${q(1)}L${p(0)},${q(0)}Z`;
  // axe des indices
  const W = 420;
  const xs = (v: number) => 24 + ((v + 0.25) / 0.25) * (W - 48);
  return (
    <Reveal className="si-card si-conc">
      <div className="si-card-h">
        <h4>Où se concentre la malnutrition ?</h4>
        <IndTabs value={ind} onChange={setInd} />
      </div>
      <div className="si-conc-grid">
        <figure>
          <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`Courbe de concentration illustrative pour un indice de ${fmt(C, 3, 3)}`}>
            <rect x={p(0)} y={q(1)} width={p(1) - p(0)} height={q(0) - q(1)} className="frame" />
            <path d={fill} className="gap" style={{ fill: indOf(ind).color }} />
            <line x1={p(0)} y1={q(0)} x2={p(1)} y2={q(1)} className="diag" />
            <path d={curve} className="cc" style={{ stroke: indOf(ind).color }} />
            <text x={p(0.5)} y={S - 8} textAnchor="middle" className="axl">
              enfants classés du plus pauvre au plus riche →
            </text>
            <text transform={`translate(12 ${q(0.5)}) rotate(-90)`} textAnchor="middle" className="axl">
              part cumulée des cas →
            </text>
            <text x={p(0.62)} y={q(0.5)} className="diag-t">
              égalité parfaite
            </text>
          </svg>
          <figcaption>Illustration (calculée) : courbe de forme pᵃ dont l’indice vaut le C de Wagstaff publié. Au-dessus de la diagonale, les cas sont concentrés chez les plus pauvres.</figcaption>
        </figure>
        <div>
          <svg viewBox={`0 0 ${W} 230`} className="si-lolli" role="img" aria-label="Indices de Wagstaff et d’Erreygers par indicateur">
            {[-0.25, -0.2, -0.15, -0.1, -0.05, 0].map((v) => (
              <g key={v}>
                <line x1={xs(v)} x2={xs(v)} y1={20} y2={196} className={v === 0 ? 'zero' : 'grid'} />
                <text x={xs(v)} y={214} textAnchor="middle" className="tick">
                  {v === 0 ? '0' : `−${fmt(-v, 2, 2)}`}
                </text>
              </g>
            ))}
            {keys.map((key, i) => {
              const y0 = 46 + i * 60;
              const cw = ci.series.wagstaff[i] as number;
              const ce = ci.series.erreygers[i] as number;
              const on = key === ind;
              return (
                <g key={key} className={`row ${on ? 'is-on' : ''}`} onClick={() => setInd(key)} style={{ cursor: 'pointer' }}>
                  <text x={24} y={y0 - 16} className="rl">
                    {indOf(key).label}
                  </text>
                  <line x1={xs(Math.min(cw, ce))} x2={xs(0)} y1={y0} y2={y0} className="stem" style={{ stroke: indOf(key).color }} />
                  <circle cx={xs(cw)} cy={y0} r={7} style={{ fill: indOf(key).color }} />
                  <rect x={xs(ce) - 6} y={y0 - 6} width={12} height={12} transform={`rotate(45 ${xs(ce)} ${y0})`} className="ce" style={{ stroke: indOf(key).color }} />
                  <text x={xs(cw)} y={y0 + 22} textAnchor="middle" className="v">
                    {sign(cw)}
                  </text>
                  <text x={xs(ce)} y={y0 - 12} textAnchor="middle" className="v ce-t">
                    {sign(ce)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="si-legend">
            <span>
              <i className="dot" /> Wagstaff (CW)
            </span>
            <span>
              <i className="dia" /> Erreygers (CE)
            </span>
          </div>
          <p className="si-conc-read" aria-live="polite">
            <b>{indOf(ind).label}</b> : CW = {sign(ci.series.wagstaff[k])}, CE = {sign(ci.series.erreygers[k])} — {String(ci.interpretation[k]).toLowerCase()}.
          </p>
        </div>
      </div>
    </Reveal>
  );
}

/* ───────── Décomposition de l'indice de Wagstaff ───────── */
export function Decomposition({ f, ind, setInd }: { f: Record<string, any>; ind: IndKey; setInd: (k: IndKey) => void }) {
  const dec = f.wagstaff_decomposition;
  const labels = dec.x as string[];
  const contrib = dec.contribution[ind] as (number | null)[];
  const elas = dec.elasticity[ind] as (number | null)[];
  const ck = dec.ci_k as (number | null)[];
  const rows = labels.map((l, i) => ({ l, c: contrib[i], e: elas[i], k: ck[i], resid: dec.keys[i] === 'residuel' }));
  const min = -0.12;
  const max = 0.02;
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? rows[hover] : null;
  return (
    <Reveal className="si-card si-dec">
      <div className="si-card-h">
        <h4>Ce qui fabrique l’inégalité</h4>
        <IndTabs value={ind} onChange={setInd} />
      </div>
      <div className="si-dec-head" aria-hidden>
        <span>Facteur</span>
        <span>Contribution à l’indice</span>
        <span>Élasticité</span>
        <span>C_k</span>
      </div>
      <ul className="si-dec-rows">
        {rows.map((r, i) => (
          <li
            key={r.l}
            className={`${r.resid ? 'resid' : ''} ${hover === i ? 'is-on' : ''}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            tabIndex={0}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <span className="f">{r.l}</span>
            <span className="track">
              <span className="zero" style={{ left: `${x(0)}%` }} />
              {r.c !== null && (
                <i
                  style={{
                    left: `${x(Math.min(0, r.c))}%`,
                    width: `${Math.max(0.6, Math.abs(x(r.c) - x(0)))}%`,
                    background: r.resid ? undefined : indOf(ind).color,
                  }}
                />
              )}
              <b style={{ left: `${r.c !== null && r.c < 0 ? x(r.c) : x(0)}%` }}>{r.c === null ? 'hors modèle' : sign(r.c)}</b>
            </span>
            <span className="num">{r.e === null || r.e === undefined ? '—' : sign(r.e)}</span>
            <span className="num">{r.k === null || r.k === undefined ? '—' : sign(r.k)}</span>
          </li>
        ))}
      </ul>
      <div className="si-dec-foot">
        <span>
          Indice de Wagstaff total : <b>{sign(dec.total[ind])}</b>
        </span>
        <span className="si-note" aria-live="polite">
          {h
            ? h.resid
              ? 'Part de l’indice que les facteurs du modèle n’expliquent pas.'
              : h.c === null
                ? `${h.l} : non retenu dans ce modèle de décomposition.`
                : `${h.l} : contribution ${sign(h.c)} = élasticité × concentration du facteur (C_k = ${h.k === null ? '—' : sign(h.k)}).`
            : 'Survolez ou touchez un facteur. Contribution = élasticité η_k × indice de concentration C_k du facteur (tableaux 5 à 7 du mémoire).'}
        </span>
      </div>
    </Reveal>
  );
}

/* ───────── Tableau des logits ───────── */
interface Var {
  key: string;
  label: string;
  coding: string;
  unit: string | null;
  stunting: { beta: number; sig: string; orDerived: number | null };
  underweight: { beta: number; sig: string; orDerived: number | null };
  wasting: { beta: number; sig: string; orDerived: number | null };
}

export function LogitTable({ vars, ind, setInd }: { vars: Var[]; ind: IndKey; setInd: (k: IndKey) => void }) {
  const [mode, setMode] = useState<'beta' | 'or'>('beta');
  const [onlySig, setOnlySig] = useState(false);
  const [row, setRow] = useState<string | null>(null);
  const shown = vars.filter((v) => !onlySig || IND.some((i) => v[i.key].sig !== 'n.s.'));
  const cur = vars.find((v) => v.key === row);
  const cell = (v: Var, k: IndKey) => {
    const c = v[k];
    const sig = c.sig !== 'n.s.' && c.sig !== '.';
    const tone = v.key === 'intercept' ? 'base' : !sig ? 'ns' : c.beta < 0 ? 'prot' : 'risk';
    const txt = mode === 'beta' ? sign(c.beta, Math.abs(c.beta) < 0.01 ? 4 : 3) : c.orDerived === null ? '—' : fmt(c.orDerived, 3, 3);
    return (
      <td key={k} className={`${tone} ${ind === k ? 'is-col' : ''}`}>
        <span className="b">{txt}</span>
        {txt !== '—' && <span className="s">{c.sig}</span>}
      </td>
    );
  };
  return (
    <Reveal className="si-card si-logit">
      <div className="si-card-h">
        <h4>Trois logits, mêmes variables</h4>
        <div className="si-seg" role="group" aria-label="Échelle">
          <button className={mode === 'beta' ? 'is-on' : ''} onClick={() => setMode('beta')}>
            Log-odds (publiés)
          </button>
          <button className={mode === 'or' ? 'is-on' : ''} onClick={() => setMode('or')}>
            Odds ratios (calculés)
          </button>
        </div>
      </div>
      <label className="si-check">
        <input type="checkbox" checked={onlySig} onChange={(e) => setOnlySig(e.target.checked)} /> Masquer les variables non significatives dans les trois modèles
      </label>
      <div className="si-logit-scroll">
        <table onMouseLeave={() => setRow(null)}>
          <thead>
            <tr>
              <th scope="col">Variable</th>
              {IND.map((i) => (
                <th key={i.key} scope="col" className={ind === i.key ? 'is-col' : ''}>
                  <button onClick={() => setInd(i.key)} style={{ ['--ic' as string]: i.color }}>
                    <i aria-hidden /> {i.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.key} className={row === v.key ? 'is-row' : ''} onMouseEnter={() => setRow(v.key)} onFocus={() => setRow(v.key)} tabIndex={0}>
                <th scope="row">{v.label}</th>
                {IND.map((i) => cell(v, i.key))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="si-logit-foot" aria-live="polite">
        {cur ? (
          <>
            <b>{cur.label}</b> — {cur.coding}
            {cur.unit ? ` · effet pour « ${cur.unit} »` : ''}
          </>
        ) : (
          <span className="si-legend">
            <span>
              <i className="prot" /> protecteur (β &lt; 0, significatif)
            </span>
            <span>
              <i className="risk" /> facteur de risque (β &gt; 0, significatif)
            </span>
            <span>
              <i className="ns" /> non significatif
            </span>
          </span>
        )}
      </div>
      <p className="si-note">*** p &lt; 0,001 ; ** p &lt; 0,01 ; * p &lt; 0,05 ; . p &lt; 0,10 ; n.s. non significatif. Modèles pondérés (sweight), coefficients du tableau 3 ; odds ratio = exp(β), calculé.</p>
    </Reveal>
  );
}

/* ───────── Matrice de corrélation ───────── */
export function CorrMatrix({ data }: { data: { variables: string[]; matrix: number[][] } }) {
  const names: Record<string, string> = { age_mois: 'Âge (mois)', taille_menage: 'Taille du ménage', enfants_moins_5: 'Enfants < 5 ans', underweight: 'Insuffisance pondérale' };
  return (
    <Reveal className="si-card si-corr">
      <div className="si-card-h">
        <h4>Corrélations entre variables continues</h4>
        <span>figure 10 du mémoire</span>
      </div>
      <div className="si-corr-grid" style={{ gridTemplateColumns: `minmax(120px, 1.3fr) repeat(${data.variables.length}, 1fr)` }}>
        <span />
        {data.variables.map((v) => (
          <span key={v} className="h">
            {names[v] ?? v}
          </span>
        ))}
        {data.variables.map((r, i) => (
          <Row key={r} name={names[r] ?? r} values={data.matrix[i]} diag={i} />
        ))}
      </div>
      <p className="si-note">Plus forte corrélation : 0,35 (taille du ménage et enfants de moins de 5 ans). Toutes les VIF sont inférieures à 2.</p>
    </Reveal>
  );
}
function Row({ name, values, diag }: { name: string; values: number[]; diag: number }) {
  return (
    <>
      <span className="h r">{name}</span>
      {values.map((v, j) => (
        <span key={j} className={`c ${j === diag ? 'd' : ''}`} style={{ ['--a' as string]: j === diag ? 0 : Math.min(1, v / 0.4) }}>
          {fmt(v, 2, 2)}
        </span>
      ))}
    </>
  );
}

/* ───────── Disparités entre États (groupes cités dans le mémoire) ───────── */
const STATES: { n: string; ab: string; lon: number; lat: number }[] = [
  { n: 'Jammu-et-Cachemire', ab: 'JK', lon: 75.0, lat: 33.6 },
  { n: 'Ladakh', ab: 'LA', lon: 77.6, lat: 34.3 },
  { n: 'Himachal Pradesh', ab: 'HP', lon: 77.2, lat: 31.9 },
  { n: 'Pendjab', ab: 'PB', lon: 75.3, lat: 30.8 },
  { n: 'Uttarakhand', ab: 'UK', lon: 79.3, lat: 30.1 },
  { n: 'Haryana', ab: 'HR', lon: 76.1, lat: 29.0 },
  { n: 'Delhi', ab: 'DL', lon: 77.5, lat: 28.1 },
  { n: 'Rajasthan', ab: 'RJ', lon: 73.6, lat: 26.5 },
  { n: 'Uttar Pradesh', ab: 'UP', lon: 80.6, lat: 27.0 },
  { n: 'Bihar', ab: 'BR', lon: 85.6, lat: 25.8 },
  { n: 'Sikkim', ab: 'SK', lon: 88.5, lat: 27.6 },
  { n: 'Arunachal Pradesh', ab: 'AR', lon: 94.6, lat: 28.1 },
  { n: 'Assam', ab: 'AS', lon: 92.4, lat: 26.3 },
  { n: 'Nagaland', ab: 'NL', lon: 94.9, lat: 26.0 },
  { n: 'Meghalaya', ab: 'ML', lon: 90.8, lat: 25.0 },
  { n: 'Manipur', ab: 'MN', lon: 94.1, lat: 24.6 },
  { n: 'Tripura', ab: 'TR', lon: 91.7, lat: 23.5 },
  { n: 'Mizoram', ab: 'MZ', lon: 93.2, lat: 23.0 },
  { n: 'Bengale-Occidental', ab: 'WB', lon: 88.1, lat: 23.2 },
  { n: 'Jharkhand', ab: 'JH', lon: 85.4, lat: 23.5 },
  { n: 'Gujarat', ab: 'GJ', lon: 71.4, lat: 22.6 },
  { n: 'Madhya Pradesh', ab: 'MP', lon: 78.3, lat: 23.6 },
  { n: 'Chhattisgarh', ab: 'CG', lon: 82.0, lat: 21.4 },
  { n: 'Odisha', ab: 'OD', lon: 84.6, lat: 20.4 },
  { n: 'Maharashtra', ab: 'MH', lon: 75.6, lat: 19.5 },
  { n: 'Telangana', ab: 'TS', lon: 79.1, lat: 17.9 },
  { n: 'Andhra Pradesh', ab: 'AP', lon: 80.4, lat: 15.8 },
  { n: 'Goa', ab: 'GA', lon: 73.9, lat: 15.4 },
  { n: 'Karnataka', ab: 'KA', lon: 76.1, lat: 14.6 },
  { n: 'Tamil Nadu', ab: 'TN', lon: 78.5, lat: 11.0 },
  { n: 'Kerala', ab: 'KL', lon: 76.2, lat: 10.1 },
];
const EN_TO_FR: Record<string, string> = { Punjab: 'Pendjab', 'West Bengal': 'Bengale-Occidental', 'Jammu and Kashmir': 'Jammu-et-Cachemire' };

interface StateFE {
  aboveOne: string[];
  belowOne: string[];
  mapCommentary: {
    mostAffected: string[];
    leastAffected: string[];
    stuntingAbove40PctText: string[];
    stuntingBelow20PctText: string[];
    underweightMostAffectedText: string[];
    wastingHighText: string[];
  };
}

export function StateGroups({ fe }: { fe: StateFE }) {
  const views = useMemo(
    () => [
      { id: 'fe', label: 'Effets fixes d’État', hi: fe.aboveOne, lo: fe.belowOne, hiL: 'Odds ratio > 1 (risque supérieur)', loL: 'Odds ratio < 1 (risque inférieur)', src: 'Effets fixes d’État des modèles logit (section 6.3)' },
      { id: 'map', label: 'Commentaire des cartes', hi: fe.mapCommentary.mostAffected, lo: fe.mapCommentary.leastAffected, hiL: 'Les plus touchés', loL: 'Les moins touchés', src: 'Commentaire des cartes de prévalence' },
      { id: 'st', label: 'Retard de croissance', hi: fe.mapCommentary.stuntingAbove40PctText, lo: fe.mapCommentary.stuntingBelow20PctText, hiL: 'Les plus touchés', loL: 'Les moins touchés', src: 'Commentaire de la carte du retard de croissance (section 8.1)' },
      { id: 'uw', label: 'Insuffisance pondérale', hi: fe.mapCommentary.underweightMostAffectedText, lo: [] as string[], hiL: 'Les plus touchés', loL: '', src: 'Texte du mémoire' },
      { id: 'wa', label: 'Émaciation', hi: fe.mapCommentary.wastingHighText, lo: [] as string[], hiL: 'Niveaux relativement élevés dans des États riches de l’ouest', loL: '', src: 'Texte du mémoire' },
    ],
    [fe],
  );
  const [v, setV] = useState('fe');
  const view = views.find((x) => x.id === v)!;
  const fr = (s: string) => EN_TO_FR[s] ?? s;
  const hi = new Set(view.hi.map(fr));
  const lo = new Set(view.lo.map(fr));
  const W = 420;
  const H = 470;
  const px = (lon: number) => 26 + ((lon - 68.5) / (97.5 - 68.5)) * (W - 52);
  const py = (lat: number) => 20 + ((35.6 - lat) / (35.6 - 8.2)) * (H - 40);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <Reveal className="si-card si-states">
      <div className="si-card-h">
        <h4>Une fracture territoriale</h4>
        <span>{view.src}</span>
      </div>
      <div className="si-tabs si-tabs-plain" role="tablist" aria-label="Lecture des disparités entre États">
        {views.map((x) => (
          <button key={x.id} role="tab" aria-selected={v === x.id} className={v === x.id ? 'is-on' : ''} onClick={() => setV(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="si-states-grid">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Positions schématiques des États ; ${view.hiL} : ${[...hi].join(', ')}${lo.size ? ` ; ${view.loL} : ${[...lo].join(', ')}` : ''}`}>
          {STATES.map((s) => {
            const cls = hi.has(s.n) ? 'hi' : lo.has(s.n) ? 'lo' : '';
            return (
              <g
                key={s.ab}
                className={`st ${cls} ${hover === s.n ? 'is-on' : ''}`}
                transform={`translate(${px(s.lon)},${py(s.lat)})`}
                onMouseEnter={() => setHover(s.n)}
                onMouseLeave={() => setHover(null)}
              >
                <circle r={cls ? 17 : 13} />
                <text y={4} textAnchor="middle">
                  {s.ab}
                </text>
                <title>{s.n}</title>
              </g>
            );
          })}
        </svg>
        <div className="si-states-side">
          <div className="grp hi">
            <h5>{view.hiL}</h5>
            <ul>
              {view.hi.map((s) => (
                <li key={s} onMouseEnter={() => setHover(fr(s))} onMouseLeave={() => setHover(null)}>
                  {fr(s)}
                </li>
              ))}
            </ul>
          </div>
          {view.lo.length > 0 && (
            <div className="grp lo">
              <h5>{view.loL}</h5>
              <ul>
                {view.lo.map((s) => (
                  <li key={s} onMouseEnter={() => setHover(fr(s))} onMouseLeave={() => setHover(null)}>
                    {fr(s)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="si-note">
            Positions schématiques (centre approximatif de chaque État). Seuls les groupes cités dans le mémoire sont colorés ; aucune valeur par État n’est reproduite ici. {hover ? `· ${hover}` : ''}
          </p>
        </div>
      </div>
    </Reveal>
  );
}
