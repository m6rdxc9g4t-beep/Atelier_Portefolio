import { useMemo, useState } from 'react';
import { fmt } from '@atelier/shared';
import { Reveal } from '../../components/Reveal';
import { LineChart } from '../../components/charts';

/* ───────── Pays ───────── */
export interface Pays {
  x: string[];
  iso2: string[];
  repondants: number[];
  consultants_gp: number[];
  migrants: number[];
  part_migrants: number[];
  taux_recours_gp: number[];
  log_gp_moyen: number[];
  total: { repondants: number; consultants_gp: number; migrants: number; part_migrants: number; taux_recours_gp: number; log_gp_moyen: number };
}

type Metric = 'recours' | 'migrants' | 'intensite' | 'repondants';
const METRICS: { id: Metric; label: string; short: string; note: string }[] = [
  { id: 'recours', label: 'Recours au généraliste', short: 'recours GP', note: 'Part des répondants ayant consulté au moins une fois.' },
  { id: 'migrants', label: 'Part de migrants', short: 'migrants', note: 'Part des migrants parmi les répondants.' },
  { id: 'intensite', label: 'Intensité du recours', short: 'log(#GP)', note: 'Moyenne du log du nombre de consultations, chez les consultants.' },
  { id: 'repondants', label: 'Répondants', short: 'répondants', note: 'Effectif par pays, calculé à partir du tableau 1.' },
];

/** Grille schématique de l'Europe (colonne, ligne). */
const TILE: Record<string, [number, number]> = {
  SE: [4, 0], DK: [3, 1], NL: [2, 2], DE: [3, 2], BE: [2, 3], CH: [3, 3], AT: [4, 3], FR: [2, 4], IT: [3, 4], ES: [1, 5], GR: [5, 5],
};

const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

export function CountryExplorer({ pays }: { pays: Pays }) {
  const [metric, setMetric] = useState<Metric>('recours');
  const [sel, setSel] = useState<number>(pays.x.indexOf('France'));
  const value = (i: number) =>
    metric === 'recours' ? pays.taux_recours_gp[i] : metric === 'migrants' ? pays.part_migrants[i] : metric === 'intensite' ? pays.log_gp_moyen[i] : pays.repondants[i];
  const total =
    metric === 'recours' ? pays.total.taux_recours_gp : metric === 'migrants' ? pays.total.part_migrants : metric === 'intensite' ? pays.total.log_gp_moyen : null;
  const show = (v: number) => (metric === 'intensite' ? fmt(v, 3, 3) : metric === 'repondants' ? fmt(v) : `${fmt(v * 100, 1, 1)} %`);
  const vals = pays.x.map((_, i) => value(i));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const order = useMemo(() => pays.x.map((_, i) => i).sort((a, b) => value(b) - value(a)), [metric, pays]); // eslint-disable-line react-hooks/exhaustive-deps
  const S = 74;
  const geo = Math.exp(pays.log_gp_moyen[sel]);
  return (
    <Reveal className="rs-card rs-countries">
      <div className="rs-card-h">
        <div>
          <div className="ct">Onze pays, onze façons de consulter</div>
          <div className="cs">{METRICS.find((m) => m.id === metric)!.note}</div>
        </div>
        <div className="ed-ctrl" role="tablist" aria-label="Indicateur affiché">
          {METRICS.map((m) => (
            <button key={m.id} role="tab" aria-selected={metric === m.id} className={metric === m.id ? 'is-on' : ''} onClick={() => setMetric(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rs-countries-grid">
        <svg viewBox={`0 0 ${S * 6 + 8} ${S * 6 + 8}`} className="rs-tiles" role="img" aria-label={`Carte schématique des 11 pays : ${METRICS.find((m) => m.id === metric)!.label}`}>
          {pays.iso2.map((iso, i) => {
            const [c, r] = TILE[iso] ?? [0, 0];
            const t = max > min ? (value(i) - min) / (max - min) : 0.5;
            const fill = mix('#e3ece4', '#0f6b62', 0.12 + t * 0.88);
            const dark = t > 0.45;
            return (
              <g
                key={iso}
                transform={`translate(${c * S + 4},${r * S + 4})`}
                className={`tile ${sel === i ? 'is-on' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => setSel(i)}
                onFocus={() => setSel(i)}
                tabIndex={0}
                role="button"
                aria-label={`${pays.x[i]} : ${show(value(i))}`}
              >
                <rect width={S - 6} height={S - 6} rx={10} style={{ fill }} />
                <text x={(S - 6) / 2} y={28} textAnchor="middle" className={`iso ${dark ? 'on-dark' : ''}`}>
                  {iso}
                </text>
                <text x={(S - 6) / 2} y={48} textAnchor="middle" className={`val ${dark ? 'on-dark' : ''}`}>
                  {metric === 'repondants' ? fmt(value(i)) : metric === 'intensite' ? fmt(value(i), 2, 2) : `${fmt(value(i) * 100, 0)} %`}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="rs-country-side">
          <div className="rs-country-card" aria-live="polite">
            <div className="nm">{pays.x[sel]}</div>
            <dl>
              <dt>Répondants (calculé)</dt>
              <dd>{fmt(pays.repondants[sel])}</dd>
              <dt>Consultants du généraliste</dt>
              <dd>{fmt(pays.consultants_gp[sel])}</dd>
              <dt>Recours au généraliste</dt>
              <dd>{fmt(pays.taux_recours_gp[sel] * 100, 1, 1)} %</dd>
              <dt>Migrants</dt>
              <dd>
                {fmt(pays.migrants[sel])} · {fmt(pays.part_migrants[sel] * 100, 1, 1)} %
              </dd>
              <dt>log(#GP) moyen</dt>
              <dd>
                {fmt(pays.log_gp_moyen[sel], 3, 3)} <small>≈ {fmt(geo, 1, 1)} consultations (moyenne géométrique, calculé)</small>
              </dd>
            </dl>
          </div>
          <ul className="rs-rank" aria-label="Classement des pays">
            {order.map((i, k) => (
              <li key={pays.iso2[i]} className={sel === i ? 'is-on' : ''} onMouseEnter={() => setSel(i)}>
                <span className="k">{k + 1}</span>
                <span className="n">{pays.x[i]}</span>
                <span className="bar">
                  <i style={{ width: `${(value(i) / max) * 100}%` }} />
                  {total !== null && <em style={{ left: `${(total / max) * 100}%` }} title="Ensemble des 11 pays" />}
                </span>
                <span className="v">{show(value(i))}</span>
              </li>
            ))}
          </ul>
          {total !== null && <p className="rs-note">Trait vertical : ensemble des 11 pays ({show(total)}).</p>}
        </div>
      </div>
    </Reveal>
  );
}

/* ───────── Profils : consultants / non-consultants ───────── */
interface ProfilRow {
  variable: string;
  type: 'part' | 'moyenne';
  ensemble: number;
  gp0: number;
  gp1: number;
  ecart_type?: { ensemble: number; gp0: number; gp1: number };
}

export function ProfileDumbbell({ rows }: { rows: ProfilRow[] }) {
  const parts = rows.filter((r) => r.type === 'part');
  const age = rows.find((r) => r.type === 'moyenne');
  const x = (v: number) => `${(v / 0.8) * 100}%`;
  return (
    <Reveal className="rs-card rs-profile">
      <div className="rs-card-h">
        <div>
          <div className="ct">Consultants et non-consultants</div>
          <div className="cs">Tableau 2 · parts dans chaque groupe</div>
        </div>
        <div className="rs-legend">
          <span>
            <i className="g0" /> sans consultation (5 742)
          </span>
          <span>
            <i className="g1" /> consultants (21 504)
          </span>
        </div>
      </div>
      <div className="rs-profile-grid">
        <div className="rs-dumbs" role="list" aria-label="Parts dans chaque groupe">
          <div className="rs-dumb head" aria-hidden>
            <span />
            <span className="axis">
              {[0, 20, 40, 60, 80].map((v) => (
                <em key={v} style={{ left: x(v / 100) }}>
                  {v} %
                </em>
              ))}
            </span>
            <span className="d">écart</span>
          </div>
          {parts.map((r) => {
            const d = (r.gp1 - r.gp0) * 100;
            return (
              <div key={r.variable} className="rs-dumb" role="listitem" aria-label={`${r.variable} : ${fmt(r.gp0 * 100, 1, 1)} % sans consultation, ${fmt(r.gp1 * 100, 1, 1)} % chez les consultants`}>
                <span className="lab">{r.variable}</span>
                <span className="track">
                  {[0, 20, 40, 60, 80].map((v) => (
                    <b key={v} style={{ left: x(v / 100) }} />
                  ))}
                  <i className="link" style={{ left: x(Math.min(r.gp0, r.gp1)), width: `calc(${x(Math.abs(r.gp1 - r.gp0))})` }} />
                  <i className="dot g0" style={{ left: x(r.gp0) }} title={`Sans consultation : ${fmt(r.gp0 * 100, 1, 1)} %`} />
                  <i className="dot g1" style={{ left: x(r.gp1) }} title={`Consultants : ${fmt(r.gp1 * 100, 1, 1)} %`} />
                </span>
                <span className={`d ${Math.abs(d) >= 5 ? 'big' : ''}`}>
                  {d > 0 ? '+' : '−'}
                  {fmt(Math.abs(d), 1, 1)}
                </span>
              </div>
            );
          })}
        </div>
        {age && (
          <div className="rs-age">
            <div className="lab">Âge moyen</div>
            <div className="pair">
              <div>
                <b className="g0">{fmt(age.gp0, 1, 1)}</b>
                <span>ans · sans consultation</span>
                {age.ecart_type && <small>écart-type {fmt(age.ecart_type.gp0, 1, 1)}</small>}
              </div>
              <div>
                <b className="g1">{fmt(age.gp1, 1, 1)}</b>
                <span>ans · consultants</span>
                {age.ecart_type && <small>écart-type {fmt(age.ecart_type.gp1, 1, 1)}</small>}
              </div>
            </div>
            <p className="rs-note">Écarts en points de pourcentage : calculés à partir des parts du tableau 2.</p>
          </div>
        )}
      </div>
    </Reveal>
  );
}

/* ───────── Modèles emboîtés M1 → M4 (accès) ───────── */
interface Term {
  term: string;
  label: string;
  reference: string | null;
  group: string;
  coef: (number | null)[];
  t_abs: (number | null)[];
  p: (number | null)[];
}
interface Acces {
  models: string[];
  terms: Term[];
  fit: { N: number[]; R2: number[]; logLik: number[] };
}

const stars = (p: number | null) => (p === null ? '' : p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : p < 0.1 ? '.' : '');
const pTxt = (p: number | null) => (p === null ? '—' : p < 0.001 ? '< 0,001' : fmt(p, 3, 3));
const PROPER = ['Autriche'];
const termLabel = (t: Term) => {
  const base = t.label.replace(" (ligne d'en-tête)", '');
  if (!t.reference) return base;
  const ref = PROPER.includes(t.reference) ? t.reference : t.reference.charAt(0).toLowerCase() + t.reference.slice(1);
  return `${base} (réf. ${ref})`;
};

export function ModelLadder({ acces, blocks }: { acces: Acces; blocks: string[] }) {
  const [k, setK] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const terms = acces.terms.filter((t) => t.term !== 'constante');
  const cst = acces.terms.find((t) => t.term === 'constante');
  const lim = 0.08;
  const pos = (v: number) => 50 + (v / lim) * 50;
  const groups = [...new Set(terms.map((t) => t.group))];
  const h = terms.find((t) => t.term === hover);
  const fit = acces.fit;
  const r2max = Math.max(...fit.R2);
  return (
    <Reveal className="rs-card rs-ladder">
      <div className="rs-card-h">
        <div>
          <div className="ct">Quatre modèles emboîtés</div>
          <div className="cs">Accès aux soins · MCO · N = {fmt(fit.N[0])}</div>
        </div>
        <div className="rs-steps" role="tablist" aria-label="Modèle affiché">
          {acces.models.map((m, i) => (
            <button key={m} role="tab" aria-selected={k === i} className={`${k === i ? 'is-on' : ''} ${i < k ? 'is-done' : ''}`} onClick={() => setK(i)}>
              <b>{m}</b>
              <span>{blocks[i] ?? ''}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rs-ladder-grid">
        <div>
          <div className="rs-coef-head" aria-hidden>
            <span>Variable</span>
            <span className="axis">
              <em>−0,08</em>
              <em>0</em>
              <em>+0,08</em>
            </span>
            <span>Coef.</span>
            <span>p</span>
          </div>
          {groups.map((g) => (
            <div key={g} className="rs-coef-group">
              <div className="g">{g}</div>
              {terms
                .filter((t) => t.group === g)
                .map((t) => {
                  const v = t.coef[k];
                  const p = t.p[k];
                  const sub = t.label.startsWith('Santé ') || t.label.startsWith('Éducation ') || ['chomeur_inactif', 'retraite'].includes(t.term);
                  return (
                    <div
                      key={t.term}
                      className={`rs-coef ${v === null ? 'off' : ''} ${hover === t.term ? 'is-on' : ''} ${sub && !t.term.endsWith('_entete') ? 'sub' : ''}`}
                      onMouseEnter={() => setHover(t.term)}
                      onMouseLeave={() => setHover(null)}
                      tabIndex={0}
                      onFocus={() => setHover(t.term)}
                      onBlur={() => setHover(null)}
                    >
                      <span className="lab">{termLabel(t)}</span>
                      <span className="track">
                        <span className="zero" />
                        {v !== null && (
                          <i
                            className={`${v < 0 ? 'neg' : 'pos'} ${p !== null && p < 0.05 ? 'sig' : p === null ? 'nop' : ''}`}
                            style={{ left: `${Math.min(pos(0), pos(Math.max(-lim, Math.min(lim, v))))}%`, width: `${Math.abs(pos(Math.max(-lim, Math.min(lim, v))) - pos(0))}%` }}
                          />
                        )}
                      </span>
                      <span className="num">{v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 4, 4)}`}</span>
                      <span className="num p">
                        {v === null ? '' : pTxt(p)} <b>{stars(p)}</b>
                      </span>
                    </div>
                  );
                })}
            </div>
          ))}
          <p className="rs-note" aria-live="polite">
            {h
              ? `${termLabel(h)} — ${h.coef.map((c, i) => `${acces.models[i]} : ${c === null ? '—' : fmt(c, 4, 4)}`).join(' · ')}`
              : `Constante ${acces.models[k]} : ${cst?.coef[k] !== null && cst?.coef[k] !== undefined ? fmt(cst.coef[k] as number, 4, 4) : '—'}. Barres pleines : p < 0,05 ; claires : non significatif à 5 % ; M4 : coefficients seuls.`}
          </p>
        </div>
        <aside className="rs-fit">
          <div className="ct">Ajustement</div>
          <div className="rs-fit-row">
            <span>R²</span>
            <div className="bars">
              {fit.R2.map((r, i) => (
                <button key={i} className={k === i ? 'is-on' : ''} onClick={() => setK(i)} aria-label={`${acces.models[i]} : R² ${fmt(r, 4, 4)}`}>
                  <i style={{ height: `${Math.max(3, (r / r2max) * 100)}%` }} />
                  <em>{acces.models[i]}</em>
                </button>
              ))}
            </div>
            <b>{fmt(fit.R2[k], 4, 4)}</b>
          </div>
          <div className="rs-fit-row">
            <span>Log-vraisemblance</span>
            <svg viewBox="0 0 200 92" className="ll" role="img" aria-label={`Log-vraisemblance : ${fit.logLik.map((l, i) => `${acces.models[i]} ${fmt(l, 1, 1)}`).join(', ')}`}>
              {(() => {
                const lo = -1000;
                const hi = -350;
                const px = (i: number) => 22 + i * 52;
                const py = (v: number) => 8 + ((hi - v) / (hi - lo)) * 64;
                return (
                  <>
                    <polyline points={fit.logLik.map((l, i) => `${px(i)},${py(l)}`).join(' ')} className="line" />
                    {fit.logLik.map((l, i) => (
                      <g key={i} onClick={() => setK(i)} style={{ cursor: 'pointer' }}>
                        <circle cx={px(i)} cy={py(l)} r={k === i ? 6 : 4} className={k === i ? 'on' : ''} />
                        <text x={px(i)} y={88} textAnchor="middle">
                          {acces.models[i]}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
            <b>{fmt(fit.logLik[k], 1, 1)}</b>
          </div>
          <p className="rs-note">La log-vraisemblance augmente (moins négative) à chaque bloc ajouté : M4 offre le meilleur ajustement.</p>
        </aside>
      </div>
    </Reveal>
  );
}

/* ───────── Âge et intensité (régression locale) ───────── */
export function LoessReader({ data }: { data: { x: number[]; y: number[] } }) {
  const [hover, setHover] = useState<number | null>(null);
  const i = hover === null ? null : data.x.reduce((best, v, j) => (Math.abs(v - hover) < Math.abs(data.x[best] - hover) ? j : best), 0);
  return (
    <Reveal className="rs-card rs-loess">
      <div className="rs-card-h">
        <div>
          <div className="ct">L’intensité du recours selon l’âge</div>
          <div className="cs">Régression locale de log(#GP), consultants · courbe lue sur la figure du rapport</div>
        </div>
      </div>
      <div className="rs-readout" aria-live="polite">
        {i !== null ? (
          <>
            <b>{data.x[i]} ans</b> : log(#GP) ≈ {fmt(data.y[i], 2, 2)} <span>≈ {fmt(Math.exp(data.y[i]), 1, 1)} consultations (calculé)</span>
          </>
        ) : (
          <span>Survolez la courbe : elle monte d’environ 1,0 à 50 ans jusqu’à 1,6 vers 80–85 ans, puis redescend.</span>
        )}
      </div>
      <LineChart
        ariaLabel="Régression locale du log du nombre de consultations selon l'âge"
        xDomain={[50, 104]}
        yDomain={[0.8, 1.8]}
        width={520}
        height={250}
        margin={{ top: 12, right: 12, bottom: 30, left: 40 }}
        xTicks={[50, 60, 70, 80, 90, 100]}
        xFormat={(v) => `${v} ans`}
        yFormat={(v) => fmt(v, 1, 1)}
        cursorX={hover}
        onHoverX={setHover}
        series={[{ id: 'loess', points: data.x.map((x, j) => [x, data.y[j]] as [number, number]), color: 'var(--ed-brick)', width: 3, smooth: true, area: true, areaOpacity: 0.08 }]}
        markers={i !== null ? [{ x: data.x[i], y: data.y[i], r: 6, color: 'var(--ed-accent)' }] : []}
      />
    </Reveal>
  );
}

/* ───────── Migrants / non-migrants : boîtes à moustaches ───────── */
interface Box {
  x: string[];
  lowerWhisker: number[];
  q1: number[];
  median: number[];
  q3: number[];
  upperWhisker: number[];
  en_consultations: { q1: number[]; median: number[]; q3: number[]; upperWhisker: number[] };
}

export function BoxCompare({ box }: { box: Box }) {
  const W = 560;
  const H = 170;
  const m = { l: 120, r: 20, t: 18, b: 34 };
  const x = (v: number) => m.l + (v / 4) * (W - m.l - m.r);
  const ticks = [1, 2, 4, 7, 15, 30, 50];
  return (
    <Reveal className="rs-card rs-box">
      <div className="rs-card-h">
        <div>
          <div className="ct">Migrants et non-migrants, une fois chez le médecin</div>
          <div className="cs">Distribution du nombre de consultations · valeurs lues sur le graphique</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Boîtes à moustaches du nombre de consultations selon le statut migratoire">
        {ticks.map((c) => (
          <g key={c}>
            <line x1={x(Math.log(c))} x2={x(Math.log(c))} y1={m.t} y2={H - m.b} className="grid" />
            <text x={x(Math.log(c))} y={H - 12} textAnchor="middle" className="tick">
              {c}
            </text>
          </g>
        ))}
        {box.x.map((label, i) => {
          const y = m.t + 26 + i * 58;
          return (
            <g key={label} className={i === 1 ? 'mig' : 'nat'}>
              <text x={m.l - 12} y={y + 4} textAnchor="end" className="lab">
                {label.replace(/ \(\d\)$/, '')}
              </text>
              <line x1={x(box.lowerWhisker[i])} x2={x(box.upperWhisker[i])} y1={y} y2={y} className="wh" />
              <line x1={x(box.upperWhisker[i])} x2={x(box.upperWhisker[i])} y1={y - 9} y2={y + 9} className="wh" />
              <rect x={x(box.q1[i])} y={y - 15} width={x(box.q3[i]) - x(box.q1[i])} height={30} rx={3} className="bx" />
              <line x1={x(box.median[i])} x2={x(box.median[i])} y1={y - 15} y2={y + 15} className="md" />
              <text x={x(box.q3[i]) + 6} y={y - 18} className="q">
                Q3 ≈ {box.en_consultations.q3[i]}
              </text>
            </g>
          );
        })}
        <text x={W - m.r} y={H - 0} textAnchor="end" className="tick">
          consultations (échelle log)
        </text>
      </svg>
      <p className="rs-note">
        Médiane ≈ {box.en_consultations.median[0]} consultations et premier quartile ≈ {box.en_consultations.q1[0]} dans les deux groupes ; troisième quartile ≈ {box.en_consultations.q3[0]} chez
        les non-migrants et ≈ {box.en_consultations.q3[1]} chez les migrants (conversion exp(log), calculée).
      </p>
    </Reveal>
  );
}

/* ───────── Blocs des modèles ───────── */
export function ModelBlocks({ items }: { items: string[] }) {
  const widths = [6, 34, 67, 100];
  return (
    <div className="rs-models">
      {items.map((it, i) => {
        const m = it.match(/^\*\*(M\d)\*\*\s*:\s*(.*)$/);
        return (
          <Reveal key={i} className="rs-mcard" delay={i * 70}>
            <div className="tag">{m ? m[1] : `M${i + 1}`}</div>
            <p>{m ? m[2] : it}</p>
            <div className="bar">
              <i style={{ width: `${widths[i] ?? 100}%` }} />
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
