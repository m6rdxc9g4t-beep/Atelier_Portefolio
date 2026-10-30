import { useMemo, useState } from 'react';
import { fmt, fmtSci } from '@atelier/shared';
import { LineChart } from '../../components/charts';

/** Espace fine insécable → insécable classique (les polices d'affichage n'ont pas toujours U+202F). */
export const nb = (t: string) => t.replace(/\u202f/g, '\u00a0');

/* ════════════════════════ Carte des sections (image du rapport + repères) ════════════════════════ */

export interface SectionItem {
  id: string;
  mean_price_m2: number | null;
  has_sales: boolean;
  x_pct: number;
  y_pct: number;
}

export function SectionMap({ items, src, mean, median }: { items: SectionItem[]; src: string; mean: number; median: number }) {
  const ranked = useMemo(
    () =>
      items
        .filter((s) => s.has_sales && s.mean_price_m2 !== null)
        .sort((a, b) => (b.mean_price_m2 ?? 0) - (a.mean_price_m2 ?? 0))
        .map((s, i) => ({ ...s, rank: i + 1 })),
    [items],
  );
  const rankOf = new Map(ranked.map((s) => [s.id, s.rank]));
  const [active, setActive] = useState<string | null>(ranked[0]?.id ?? null);
  const max = Math.max(...ranked.map((s) => s.mean_price_m2 ?? 0));
  const cur = items.find((s) => s.id === active);
  const curRank = cur ? rankOf.get(cur.id) : undefined;

  return (
    <div className="ar-map-wrap">
      <figure className="ar-map">
        <div className="ar-map-frame">
          <img src={src} alt="Prix moyen au m² par section cadastrale d’Arras (figure 2 du rapport)" loading="lazy" />
          {items.map((s) => (
            <button
              key={s.id}
              className={`ar-pin ${s.has_sales ? '' : 'is-empty'} ${active === s.id ? 'is-on' : ''}`}
              style={{ left: `${s.x_pct}%`, top: `${s.y_pct}%` }}
              onMouseEnter={() => setActive(s.id)}
              onFocus={() => setActive(s.id)}
              onClick={() => setActive(s.id)}
              aria-label={
                s.has_sales ? `Section ${rankOf.get(s.id)} : environ ${fmt(s.mean_price_m2 ?? 0)} euros le mètre carré` : 'Section sans vente retenue'
              }
            />
          ))}
          {cur && (
            <div className={`ar-tip ${cur.x_pct > 62 ? 'left' : ''}`} style={{ left: `${cur.x_pct}%`, top: `${cur.y_pct}%` }} aria-hidden>
              {cur.has_sales ? (
                <>
                  <b>≈ {nb(fmt(cur.mean_price_m2 ?? 0))} €/m²</b>
                  <span>
                    {curRank === 1 ? 'la plus chère' : curRank === ranked.length ? 'la moins chère' : `${curRank}ᵉ sur ${ranked.length}`}
                  </span>
                </>
              ) : (
                <span>aucune vente retenue</span>
              )}
            </div>
          )}
        </div>
        <figcaption>
          Carte du rapport (prix moyen par section, sections grises sans vente retenue). Repères : valeurs lues sur la légende de la carte, à ± 30 €/m² près ;
          numérotation propre à cette page.
        </figcaption>
      </figure>

      <div className="ar-rank" role="list" aria-label="Sections classées par prix moyen">
        <div className="ar-rank-head">
          <span>{ranked.length} sections avec ventes</span>
          <span>
            <i className="m" /> moyenne {fmt(mean)} · <i className="d" /> médiane {fmt(median)}
          </span>
        </div>
        {ranked.map((s) => (
          <button
            key={s.id}
            role="listitem"
            className={`ar-rank-row ${active === s.id ? 'is-on' : ''}`}
            onMouseEnter={() => setActive(s.id)}
            onFocus={() => setActive(s.id)}
            onClick={() => setActive(s.id)}
          >
            <span className="n">{s.rank}</span>
            <span className="bar">
              <i style={{ width: `${((s.mean_price_m2 ?? 0) / max) * 100}%` }} />
              <em className="m" style={{ left: `${(mean / max) * 100}%` }} />
              <em className="d" style={{ left: `${(median / max) * 100}%` }} />
            </span>
            <span className="v">≈ {fmt(s.mean_price_m2 ?? 0)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════ Tests de dépendance spatiale (échelle log) ════════════════════════ */

interface TestStat {
  statistic: number;
  p_value: number | null;
  p_value_upper: number | null;
  significant_5pct: boolean;
}
export interface SpatialTest {
  id: string;
  label: string;
  knn: TestStat;
  sections: TestStat;
}

const CHI2_5 = 3.841;

export function TestDuel({ tests }: { tests: SpatialTest[] }) {
  const [w, setW] = useState<'knn' | 'sections'>('knn');
  const moran = tests.find((t) => t.id === 'moran');
  const rao = tests.filter((t) => t.id !== 'moran');
  const W = 980;
  const rowH = 50;
  const m = { l: 170, r: 120, t: 34, b: 28 };
  const H = m.t + m.b + rao.length * rowH;
  const lo = Math.log10(0.05);
  const hi = Math.log10(5000);
  const x = (v: number) => m.l + ((Math.log10(Math.max(v, 0.05)) - lo) / (hi - lo)) * (W - m.l - m.r);
  const ticks = [0.1, 1, 10, 100, 1000];
  const pText = (s: TestStat) => (s.p_value !== null ? `p = ${fmt(s.p_value, 4)}` : `p < ${fmtSci(s.p_value_upper ?? 0, 1)}`);

  return (
    <div className="ar-tests">
      <div className="ar-tests-top">
        <div className="ed-ctrl" role="tablist" aria-label="Matrice de poids">
          <button role="tab" aria-selected={w === 'knn'} className={w === 'knn' ? 'is-on' : ''} onClick={() => setW('knn')}>
            W kNN (k = 8)
          </button>
          <button role="tab" aria-selected={w === 'sections'} className={w === 'sections' ? 'is-on' : ''} onClick={() => setW('sections')}>
            W sections
          </button>
        </div>
        {moran && (
          <div className="ar-moran">
            <span>I de Moran des résidus OLS</span>
            <strong>{nb(fmt(moran[w].statistic, 3, 3))}</strong>
            <small>p &lt; 2,2 × 10⁻¹⁶</small>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ar-tests-svg" role="img" aria-label="Statistiques des tests de Rao, échelle logarithmique">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t - 8} y2={H - m.b} className="grid" />
            <text x={x(t)} y={H - 8} textAnchor="middle" className="tick">
              {fmt(t, t < 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        <line x1={x(CHI2_5)} x2={x(CHI2_5)} y1={m.t - 14} y2={H - m.b} className="crit" />
        <text x={x(CHI2_5) + 5} y={m.t - 16} className="crit-t">
          seuil χ²(1) à 5 % = 3,84
        </text>
        {rao.map((t, i) => {
          const s = t[w];
          const y = m.t + i * rowH + rowH / 2;
          const robust = t.id.includes('robust');
          const lag = t.id.includes('lag');
          return (
            <g key={t.id} className={`${s.significant_5pct ? 'sig' : 'ns'} ${lag ? 'lag' : 'err'}`}>
              <text x={m.l - 12} y={y + 4} textAnchor="end" className="lab">
                {robust ? 'Robuste ' : 'Simple '}
                {lag ? 'Lag' : 'Error'}
              </text>
              <rect x={m.l} y={y - 9} width={Math.max(2, x(s.statistic) - m.l)} height={18} rx={2} className="bar" />
              <text x={x(s.statistic) + 6} y={y + 4} className="val">
                {fmt(s.statistic, s.statistic < 10 ? 3 : 1)}
              </text>
              <text x={W - 4} y={y + 4} textAnchor="end" className="p">
                {s.significant_5pct ? '★' : 'n.s.'}
              </text>
              <title>{`${t.label} : ${fmt(s.statistic, 3)} (${pText(s)})`}</title>
            </g>
          );
        })}
      </svg>
      <p className="ar-note">
        Statistiques des tests de Rao (multiplicateur de Lagrange) sur les résidus OLS, échelle logarithmique. Seul le test <b>robuste Lag</b> passe sous le seuil : la dépendance
        passe par l’<b>erreur</b>.
      </p>
    </div>
  );
}

/* ════════════════════════ AIC : diagramme en points ════════════════════════ */

export function AicDots({ models, knn, sections }: { models: string[]; knn: number[]; sections: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 980;
  const rowH = 52;
  const m = { l: 90, r: 30, t: 30, b: 36 };
  const H = m.t + m.b + models.length * rowH;
  const lo = 1950;
  const hi = 3050;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const minK = Math.min(...knn);
  const minS = Math.min(...sections);
  return (
    <figure className="ar-aic">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="AIC des quatre modèles sous les deux matrices de poids" onMouseLeave={() => setHover(null)}>
        {[2000, 2250, 2500, 2750, 3000].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t - 6} y2={H - m.b} className="grid" />
            <text x={x(t)} y={H - 12} textAnchor="middle" className="tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        {models.map((name, i) => {
          const y = m.t + i * rowH + rowH / 2;
          const k = knn[i];
          const s = sections[i];
          return (
            <g key={name} className={hover === i ? 'is-on' : ''} onMouseEnter={() => setHover(i)}>
              <rect x={0} y={y - rowH / 2} width={W} height={rowH} className="row" />
              <text x={m.l - 14} y={y + 5} textAnchor="end" className="lab">
                {name}
              </text>
              <line x1={x(Math.min(k, s))} x2={x(Math.max(k, s))} y1={y} y2={y} className="link" />
              <circle cx={x(s)} cy={y} r={k === s ? 0 : 9} className={`ar-dot-sec ${s === minS ? 'best' : ''}`} />
              <circle cx={x(k)} cy={y} r={9} className={`ar-dot-knn ${k === minK ? 'best' : ''}`} />
              {(hover === i || k === minK) && (
                <text x={x(k)} y={y - 15} textAnchor="middle" className="val knn-t">
                  {fmt(k, 1, 1)}
                </text>
              )}
              {k !== s && (hover === i || s === minS) && (
                <text x={x(s)} y={y - 15} textAnchor="middle" className="val sec-t">
                  {fmt(s, 1, 1)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span>
          <i className="ar-k-knn" /> W kNN (k = 8)
        </span>
        <span>
          <i className="ar-k-sec" /> W sections
        </span>
        <span>Plus l’AIC est bas, meilleur est le compromis ajustement / parcimonie. Contour : minimum par matrice.</span>
      </figcaption>
    </figure>
  );
}

/* ════════════════════════ Coefficients et intervalles ════════════════════════ */

export interface CoefPlotData {
  labels: string[];
  ols: { estimate: (number | null)[]; se: (number | null)[] };
  sdem_sections: { estimate: (number | null)[]; se: (number | null)[] };
}

export function CoefPlot({ data }: { data: CoefPlotData }) {
  const W = 980;
  const rowH = 60;
  const m = { l: 250, r: 30, t: 18, b: 38 };
  const H = m.t + m.b + data.labels.length * rowH;
  const lo = -1.0;
  const hi = 0.6;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const series = [
    { key: 'ols' as const, cls: 'ar-s-ols', name: 'OLS', dy: -10 },
    { key: 'sdem_sections' as const, cls: 'ar-s-sdem', name: 'SDEM (W sections)', dy: 10 },
  ];
  return (
    <figure className="ar-coef">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Coefficients et intervalles à 95 % de l’OLS et du SDEM">
        {[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t - 4} y2={H - m.b} className={t === 0 ? 'zero' : 'grid'} />
            <text x={x(t)} y={H - 14} textAnchor="middle" className="tick">
              {fmt(t, 2, t % 0.5 === 0 ? 1 : 2)}
            </text>
          </g>
        ))}
        {data.labels.map((label, i) => {
          const y = m.t + i * rowH + rowH / 2;
          return (
            <g key={label}>
              <text x={m.l - 14} y={y + 4} textAnchor="end" className="lab">
                {label}
              </text>
              {series.map((s) => {
                const est = data[s.key].estimate[i];
                const se = data[s.key].se[i];
                if (est === null || se === null) return null;
                const a = est - 1.96 * se;
                const b = est + 1.96 * se;
                const sig = a > 0 || b < 0;
                return (
                  <g key={s.key} className={`${s.cls} ${sig ? 'sig' : 'ns'}`}>
                    <line x1={x(Math.max(lo, a))} x2={x(Math.min(hi, b))} y1={y + s.dy} y2={y + s.dy} className="ar-ci" />
                    <circle cx={x(est)} cy={y + s.dy} r={5.5} className="pt" />
                    <title>{`${s.name} — ${label} : ${fmt(est, 3, 3)} [${fmt(a, 3, 3)} ; ${fmt(b, 3, 3)}]`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span>
          <i className="ar-k-ols" /> OLS
        </span>
        <span>
          <i className="ar-k-sdem" /> SDEM (W sections)
        </span>
        <span>Estimation ± 1,96 × écart-type publié (calcul). Point évidé : intervalle qui contient 0.</span>
      </figcaption>
    </figure>
  );
}

/* ════════════════════════ Effet de taille : lecture des coefficients ════════════════════════ */

interface PredCoefs {
  intercept: number;
  lsurf: number;
  pieces: number;
  w_lsurf?: number;
  w_pieces?: number;
}

export function SizeSimulator({ ols, sdem }: { ols: PredCoefs; sdem: PredCoefs }) {
  const [s, setS] = useState(50);
  const [p, setP] = useState(2);
  const [same, setSame] = useState(true);
  const [ns, setNs] = useState(50);
  const [np, setNp] = useState(2);
  const nbS = same ? s : ns;
  const nbP = same ? p : np;
  const yOls = (surf: number, pc: number) => ols.intercept + ols.lsurf * Math.log(surf) + ols.pieces * pc;
  const ySdem = (surf: number, pc: number, nsurf: number, npc: number) =>
    sdem.intercept + sdem.lsurf * Math.log(surf) + sdem.pieces * pc + (sdem.w_lsurf ?? 0) * Math.log(nsurf) + (sdem.w_pieces ?? 0) * npc;
  const pOls = Math.exp(yOls(s, p));
  const pSdem = Math.exp(ySdem(s, p, nbS, nbP));
  const grid = Array.from({ length: 60 }, (_, i) => 15 + (i * (140 - 15)) / 59);
  const curveOls = grid.map((g) => [g, Math.exp(yOls(g, p))] as [number, number]);
  const curveSdem = grid.map((g) => [g, Math.exp(ySdem(g, p, same ? g : ns, same ? p : np))] as [number, number]);
  const ymax = Math.max(...curveOls.map((c) => c[1]), ...curveSdem.map((c) => c[1])) * 1.08;

  return (
    <div className="ar-sim">
      <div className="ar-sim-ctrl">
        <label className="ed-range">
          <span className="ed-range-top">
            Surface du logement <b>{s} m²</b>
          </span>
          <input type="range" min={15} max={140} step={1} value={s} onChange={(e) => setS(Number(e.target.value))} />
        </label>
        <label className="ed-range">
          <span className="ed-range-top">
            Pièces principales <b>{p}</b>
          </span>
          <input type="range" min={1} max={6} step={1} value={p} onChange={(e) => setP(Number(e.target.value))} />
        </label>
        <div className="ar-sim-nb">
          <div className="ed-ctrl" role="radiogroup" aria-label="Voisinage">
            <button role="radio" aria-checked={same} className={same ? 'is-on' : ''} onClick={() => setSame(true)}>
              Voisins semblables au bien
            </button>
            <button role="radio" aria-checked={!same} className={!same ? 'is-on' : ''} onClick={() => setSame(false)}>
              Voisinage personnalisé
            </button>
          </div>
          {!same && (
            <>
              <label className="ed-range">
                <span className="ed-range-top">
                  Surface moyenne des voisins <b>{ns} m²</b>
                </span>
                <input type="range" min={15} max={140} step={1} value={ns} onChange={(e) => setNs(Number(e.target.value))} />
              </label>
              <label className="ed-range">
                <span className="ed-range-top">
                  Pièces des voisins <b>{np}</b>
                </span>
                <input type="range" min={1} max={6} step={1} value={np} onChange={(e) => setNp(Number(e.target.value))} />
              </label>
            </>
          )}
        </div>
        <div className="ar-sim-out">
          <div>
            <span>OLS</span>
            <strong>{nb(fmt(pOls))} €/m²</strong>
            <small>≈ {nb(fmt(Math.round((pOls * s) / 1000) * 1000))} € au total</small>
          </div>
          <div className="sdem">
            <span>SDEM (W sections)</span>
            <strong>{nb(fmt(pSdem))} €/m²</strong>
            <small>≈ {nb(fmt(Math.round((pSdem * s) / 1000) * 1000))} € au total</small>
          </div>
        </div>
      </div>
      <div className="ar-sim-chart">
        <div className="ar-chart-cap">Prix au m² ajusté selon la surface ({p} pièce{p > 1 ? 's' : ''})</div>
        <LineChart
          ariaLabel="Prix au m² ajusté selon la surface, OLS et SDEM"
          xDomain={[15, 140]}
          yDomain={[0, ymax]}
          height={300}
          width={600}
          margin={{ top: 12, right: 14, bottom: 40, left: 62 }}
          xFormat={(v) => `${v}`}
          yFormat={(v) => fmt(v)}
          xLabel="surface (m²)"
          vlines={[{ x: s, color: 'var(--ed-ink)', dash: '3 4' }]}
          hlines={[{ y: 2766, label: 'médiane observée 2 766 €/m²', color: 'var(--ed-muted)', dash: '2 5' }]}
          series={[
            { id: 'ols', points: curveOls, color: 'var(--ed-gold)', width: 2.4 },
            { id: 'sdem', points: curveSdem, color: 'var(--ed-accent)', width: 2.8 },
          ]}
          markers={[
            { x: s, y: pOls, r: 5, color: 'var(--ed-gold)' },
            { x: s, y: pSdem, r: 6, color: 'var(--ed-accent)' },
          ]}
        />
        <p className="ar-note">
          Calcul : exp(ŷ) avec les coefficients publiés (ordre de grandeur « médian », sans correction de retransformation). λ n’entre pas dans la prédiction moyenne.
          Les termes de voisinage (θ) ne sont pas significatifs à 5 %.
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════ Série de Neumann ════════════════════════ */

export function NeumannBars({ lambdaHat }: { lambdaHat: number }) {
  const [lambda, setLambda] = useState(lambdaHat);
  const orders = Array.from({ length: 9 }, (_, r) => r);
  const w = orders.map((r) => Math.pow(lambda, r));
  const total = 1 / (1 - lambda);
  const shown = w.reduce((a, b) => a + b, 0);
  return (
    <div className="ar-neumann">
      <div className="ar-neumann-ctrl">
        <label className="ed-range">
          <span className="ed-range-top">
            λ <b>{fmt(lambda, 3, 3)}</b>
          </span>
          <input type="range" min={0} max={0.95} step={0.001} value={lambda} onChange={(e) => setLambda(Number(e.target.value))} />
        </label>
        <div className="ed-ctrl">
          <button className={Math.abs(lambda - lambdaHat) < 1e-9 ? 'is-on' : ''} onClick={() => setLambda(lambdaHat)}>
            λ̂ du SDEM = {fmt(lambdaHat, 3, 3)}
          </button>
        </div>
        <p>
          Multiplicateur total d’un choc, 1 / (1 − λ) : <b>{fmt(total, 2, 2)}</b>
          <br />
          <small>W normalisée en lignes ; les 9 premiers ordres en représentent {fmt((shown / total) * 100, 0)} %.</small>
        </p>
      </div>
      <div className="ar-neumann-bars" role="img" aria-label="Poids des ordres de voisinage dans la série de Neumann">
        {orders.map((r, i) => (
          <div key={r} className="ar-nb">
            <span className="v">{fmt(w[i], 3, i === 0 ? 0 : 3)}</span>
            <span className="b">
              <i style={{ height: `${w[i] * 100}%` }} />
            </span>
            <span className="k">{r === 0 ? 'I' : r === 1 ? 'λW' : `λ${toSup(r)}W${toSup(r)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const toSup = (n: number) =>
  String(n)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');

/* ════════════════════════ Matrice d'impacts sur un voisinage fictif ════════════════════════ */

export function ImpactRing({ beta, theta, label }: { beta: number; theta: number; label: string }) {
  const n = 8;
  const [j, setJ] = useState(0);
  const R = 92;
  const cx = 130;
  const cy = 120;
  const pos = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number];
  });
  // anneau : chaque bien a deux voisins, poids 1/2 (W normalisée en lignes)
  const effect = (i: number) => (i === j ? beta : (i - j + n) % n === 1 || (j - i + n) % n === 1 ? theta / 2 : 0);
  const maxAbs = Math.max(Math.abs(beta), Math.abs(theta / 2));
  return (
    <div className="ar-ring">
      <svg viewBox="0 0 260 240" role="img" aria-label={`Effets d’une hausse de ${label} du bien sélectionné sur les biens voisins`}>
        {pos.map((p, i) => {
          const q = pos[(i + 1) % n];
          return <line key={`l${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className="edge" />;
        })}
        {pos.map((p, i) => {
          const e = effect(i);
          const r = 10 + (Math.abs(e) / maxAbs) * 16;
          return (
            <g key={i} className={`node ${i === j ? 'is-src' : e !== 0 ? 'is-hit' : ''}`} onClick={() => setJ(i)} onMouseEnter={() => setJ(i)} style={{ cursor: 'pointer' }}>
              <circle cx={p[0]} cy={p[1]} r={r} />
              <text x={p[0]} y={p[1] + 4} textAnchor="middle">
                {e === 0 ? '0' : fmt(e, 2, 2)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ar-note">
        Voisinage fictif en anneau (deux voisins de poids ½). Une hausse de {label} du bien survolé change son log(prix/m²) de β = {fmt(beta, 3, 3)} et celui de chacun
        de ses voisins de θ × ½ = {fmt(theta / 2, 3, 3)} (calcul à partir des coefficients du SDEM).
      </p>
    </div>
  );
}
