import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatPeriod, periodStartDay, dayToDate, MONTHS_SHORT, type Series } from './csv';
import type { Band, Decomposition } from './model';
import { fmtNum, fmtPct, seasonTick } from './explain';

/* ───────────── Outils de tracé ───────────── */

/** Largeur réelle d'un conteneur (le SVG est dessiné à sa taille, sans mise à l'échelle du texte). */
export function useWidth<T extends HTMLElement>(initial = 720) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) * (r1 - r0)) / (d1 - d0));

/** Graduations rondes (1, 2, 5 × 10ⁿ). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Décimales communes à toutes les graduations (aucune si le pas est entier). */
const tickDigits = (ticks: number[]) => {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  return step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
};

const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
const areaPath = (xs: number[], lo: number[], hi: number[]) =>
  xs.length ? `${path(xs.map((x, i) => [x, hi[i]]))}L${[...xs].reverse().map((x, i) => `${x.toFixed(1)},${lo[lo.length - 1 - i].toFixed(1)}`).join('L')}Z` : '';

/** Repères de l'axe du temps : débuts d'année (mois, semaines) ou de mois (jours), éclaircis. */
function timeTicks(series: Series, total: number, maxTicks: number): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = [];
  for (let i = 0; i < total; i++) {
    const p = series.start + i;
    const d = dayToDate(periodStartDay(p, series.freq));
    if (series.freq === 'month' && p % 12 === 0) out.push({ i, label: String(Math.floor(p / 12)) });
    else if (series.freq === 'week' && d.getUTCMonth() === 0 && d.getUTCDate() <= 7) out.push({ i, label: String(d.getUTCFullYear()) });
    else if (series.freq === 'day' && d.getUTCDate() === 1) out.push({ i, label: d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : MONTHS_SHORT[d.getUTCMonth()] });
  }
  const step = Math.ceil(out.length / maxTicks);
  return out.filter((_, k) => k % step === 0);
}

/* ───────────── Historique et prévision ───────────── */

export interface ForecastChartProps {
  series: Series;
  band: Band;
  unit: string;
  modelName: string;
  /** Test hors échantillon superposé (dernière origine de la validation). */
  test: { origin: number; forecast: number[] } | null;
}

export function ForecastChart({ series, band, unit, modelName, test }: ForecastChartProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [cursor, setCursor] = useState<number | null>(null);
  const y = series.values;
  const n = y.length;
  const H = band.mean.length;
  const total = n + H;
  const narrow = width < 560;
  const height = narrow ? 250 : 340;
  const m = { top: 14, right: narrow ? 10 : 16, bottom: 28, left: narrow ? 44 : 58 };

  const { x, yS, yTicks, xTicks } = useMemo(() => {
    const vals = [...y, ...band.lo95, ...band.hi95, ...(test?.forecast ?? [])].filter(Number.isFinite);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (lo >= 0 && lo < 0.25 * hi) lo = 0;
    const pad = (hi - lo) * 0.06;
    hi += pad;
    if (lo !== 0) lo -= pad;
    const ticks = niceTicks(lo, hi, 5);
    return {
      x: lin(0, total - 1, m.left, width - m.right),
      yS: lin(lo, hi, height - m.bottom, m.top),
      yTicks: ticks,
      xTicks: timeTicks(series, total, narrow ? 4 : 9),
    };
  }, [y, band, test, total, width, height, narrow, m.left, m.right, m.top, m.bottom, series]);

  const fcX = band.mean.map((_, k) => x(n + k));
  const hist = path(y.map((v, i) => [x(i), yS(v)]));
  // La prévision part de la dernière observation pour que les deux tracés se raccordent.
  const fc = path([[x(n - 1), yS(y[n - 1])], ...band.mean.map((v, k): [number, number] => [fcX[k], yS(v)])]);
  const a95 = areaPath(fcX, band.lo95.map(yS), band.hi95.map(yS));
  const a80 = areaPath(fcX, band.lo80.map(yS), band.hi80.map(yS));
  const testPath = test ? path(test.forecast.map((v, k) => [x(test.origin + k), yS(v)])) : '';

  const move = (e: PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - m.left) / (width - m.left - m.right)) * (total - 1));
    setCursor(Math.max(0, Math.min(total - 1, i)));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(total - 1, (c ?? n - 1) + (e.key === 'ArrowRight' ? step : -step))));
    } else if (e.key === 'Escape') setCursor(null);
    else if (e.key === 'End') setCursor(total - 1);
    else if (e.key === 'Home') setCursor(0);
  };

  const tip = cursor === null ? null : tooltip(cursor);
  function tooltip(i: number) {
    const k = i - n;
    const rows: { label: string; value: string; cls: string }[] = [];
    if (i < n) rows.push({ label: series.imputed.includes(i) ? 'Observé (interpolé)' : 'Observé', value: fmtNum(y[i]), cls: 'hist' });
    if (test && i >= test.origin && i < test.origin + test.forecast.length) rows.push({ label: 'Prévu en test', value: fmtNum(test.forecast[i - test.origin]), cls: 'test' });
    if (k >= 0) {
      rows.push({ label: 'Prévision', value: fmtNum(band.mean[k]), cls: 'fc' });
      rows.push({ label: 'Intervalle 80 %', value: `${fmtNum(band.lo80[k])} – ${fmtNum(band.hi80[k])}`, cls: 'band' });
      rows.push({ label: 'Intervalle 95 %', value: `${fmtNum(band.lo95[k])} – ${fmtNum(band.hi95[k])}`, cls: 'band' });
    }
    return { i, title: formatPeriod(series.start + i, series.freq, 'long'), rows };
  }
  const tipLeft = tip ? x(tip.i) : 0;
  const tipFlip = tipLeft > width * 0.6;

  return (
    <div
      className="pv-chart"
      ref={box}
      tabIndex={0}
      role="group"
      aria-roledescription="graphique"
      onKeyDown={key}
      onBlur={() => setCursor(null)}
      aria-label={`Graphique : ${n} périodes observées puis ${H} prévues par ${modelName}, avec intervalles à 80 et 95 %. Flèches gauche et droite pour lire les valeurs.`}
    >
      <svg width={width} height={height} aria-hidden="true">
        <g className="pv-grid">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={yS(t)} y2={yS(t)} />
              <text x={m.left - 8} y={yS(t) + 4} textAnchor="end">
                {fmtNum(t, tickDigits(yTicks))}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.i} x={x(t.i)} y={height - 8} textAnchor="middle">
              {t.label}
            </text>
          ))}
          {unit && !narrow && (
            <text x={m.left - 8} y={m.top - 2} textAnchor="end" className="pv-unit">
              {unit}
            </text>
          )}
        </g>
        {test && (
          <rect className="pv-test-zone" x={x(test.origin) - 0.5} y={m.top} width={x(test.origin + test.forecast.length - 1) - x(test.origin) + 1} height={height - m.top - m.bottom} />
        )}
        <line className="pv-split" x1={x(n - 0.5)} x2={x(n - 0.5)} y1={m.top} y2={height - m.bottom} />
        <path className="pv-a95" d={a95} />
        <path className="pv-a80" d={a80} />
        <path className="pv-hist" d={hist} />
        {test && <path className="pv-testline" d={testPath} />}
        <path className="pv-fc" d={fc} />
        {series.imputed.map((i) => (
          <circle key={i} className="pv-imputed" cx={x(i)} cy={yS(y[i])} r={3} />
        ))}
        {tip && (
          <g className="pv-cursor">
            <line x1={x(tip.i)} x2={x(tip.i)} y1={m.top} y2={height - m.bottom} />
            {tip.i < n && <circle className="hist" cx={x(tip.i)} cy={yS(y[tip.i])} r={3.5} />}
            {tip.i >= n && <circle className="fc" cx={x(tip.i)} cy={yS(band.mean[tip.i - n])} r={3.5} />}
          </g>
        )}
        <rect x={m.left} y={m.top} width={width - m.left - m.right} height={height - m.top - m.bottom} fill="transparent" onPointerMove={move} onPointerDown={move} onPointerLeave={(e) => e.pointerType === 'mouse' && setCursor(null)} />
      </svg>
      {tip && (
        <div
          className={`pv-tip${narrow ? ' docked' : tipFlip ? ' flip' : ''}`}
          style={narrow ? (tipLeft > width / 2 ? { left: 0 } : { right: 0 }) : { left: tipLeft }}
          role="status"
        >
          <strong>{tip.title}</strong>
          {tip.rows.map((r) => (
            <span key={r.label} className={`pv-tip-row ${r.cls}`}>
              <i aria-hidden="true" />
              {r.label}
              <b>{r.value}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── Décomposition ───────────── */

export function TrendChart({ series, d }: { series: Series; d: Decomposition }) {
  const [box, width] = useWidth<HTMLDivElement>(320);
  const height = 150;
  const m = { top: 10, right: 8, bottom: 22, left: 8 };
  const y = series.values;
  const lo = Math.min(...y);
  const hi = Math.max(...y);
  const x = lin(0, y.length - 1, m.left, width - m.right);
  const yS = lin(lo, hi, height - m.bottom, m.top);
  const trend = d.trend.map((v, i) => [i, v] as const).filter(([, v]) => Number.isFinite(v));
  const ticks = timeTicks(series, y.length, 4);
  return (
    <div ref={box} className="pv-mini">
      <svg width={width} height={height} role="img" aria-label="Série observée et sa tendance (moyenne mobile centrée)">
        <path className="pv-hist faint" d={path(y.map((v, i) => [x(i), yS(v)]))} />
        <path className="pv-trend" d={path(trend.map(([i, v]) => [x(i), yS(v)]))} />
        <g className="pv-grid">
          {ticks.map((t) => (
            <text key={t.i} x={x(t.i)} y={height - 6} textAnchor="middle">
              {t.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Profil saisonnier : écart de chaque position au niveau de tendance, en %. */
export function SeasonProfile({ series, d, m }: { series: Series; d: Decomposition; m: number }) {
  const [box, width] = useWidth<HTMLDivElement>(320);
  const height = 150;
  const mg = { top: 14, right: 6, bottom: 22, left: 6 };
  const level = d.trend.filter(Number.isFinite).reduce((s, v, _, a) => s + v / a.length, 0);
  const rel = d.figure.map((f) => (d.kind === 'mul' ? 100 * (f - 1) : (100 * f) / level));
  const lim = Math.max(5, ...rel.map(Math.abs)) * 1.15;
  const yS = lin(-lim, lim, height - mg.bottom, mg.top);
  const slot = (width - mg.left - mg.right) / m;
  const bw = Math.max(1.5, slot * (m > 20 ? 0.7 : 0.62));
  const hi = rel.indexOf(Math.max(...rel));
  const lo = rel.indexOf(Math.min(...rel));
  return (
    <div ref={box} className="pv-mini">
      <svg width={width} height={height} role="img" aria-label={`Profil saisonnier : maximum ${fmtPct(rel[hi], 0, true)}, minimum ${fmtPct(rel[lo], 0, true)}`}>
        <line className="pv-zero" x1={mg.left} x2={width - mg.right} y1={yS(0)} y2={yS(0)} />
        {rel.map((v, j) => {
          const cx = mg.left + slot * (j + 0.5);
          const top = Math.min(yS(v), yS(0));
          return (
            <rect key={j} className={`pv-sbar${j === hi || j === lo ? ' mark' : ''}`} x={cx - bw / 2} y={top} width={bw} height={Math.max(1, Math.abs(yS(v) - yS(0)))} rx={Math.min(2, bw / 3)}>
              <title>{`${seasonTick(series, m, j) || `position ${j + 1}`} : ${fmtPct(v, 1, true)}`}</title>
            </rect>
          );
        })}
        <g className="pv-grid">
          {rel.map((_, j) => {
            const t = seasonTick(series, m, j);
            const every = m <= 12 ? Math.ceil(30 / slot) : 1;
            if (!t || j % every) return null;
            return (
              <text key={j} x={mg.left + slot * (j + 0.5)} y={height - 6} textAnchor="middle">
                {t}
              </text>
            );
          })}
          {[hi, lo].map((j) => (
            <text key={`v${j}`} className="pv-sval" x={Math.min(width - 24, Math.max(24, mg.left + slot * (j + 0.5)))} y={rel[j] >= 0 ? yS(rel[j]) - 4 : yS(rel[j]) + 11} textAnchor="middle">
              {fmtPct(rel[j], 0, true)}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

export function SharesBar({ d }: { d: Decomposition }) {
  const parts = [
    { key: 'trend', label: 'Tendance', v: d.shares.trend },
    { key: 'season', label: 'Saisonnalité', v: d.shares.seasonal },
    { key: 'rest', label: 'Irrégulier', v: d.shares.remainder },
  ];
  return (
    <div className="pv-shares">
      <div className="pv-shares-bar" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round(100 * p.v)} %`).join(', ')}>
        {parts.map((p) => (
          <span key={p.key} className={`pv-sh-${p.key}`} style={{ flexGrow: Math.max(p.v, 0.002) }} />
        ))}
      </div>
      <dl>
        {parts.map((p) => (
          <div key={p.key}>
            <dt>
              <i className={`pv-sh-${p.key}`} aria-hidden="true" />
              {p.label}
            </dt>
            <dd>{fmtNum(100 * p.v, 0)} %</dd>
          </div>
        ))}
      </dl>
      <p className="pv-small">
        Force saisonnière <b>{fmtNum(d.seasonalStrength, 2)}</b> · force de tendance <b>{fmtNum(d.trendStrength, 2)}</b> (0 = absente, 1 = dominante)
      </p>
    </div>
  );
}
