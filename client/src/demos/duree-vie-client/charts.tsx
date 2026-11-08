import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { HORIZON } from './model';
import { int, num, pct } from './format';

/* Graphiques SVG dessinés à la main : courbes de survie (escalier ou continues), nombre à risque, forêt de rapports de risques. */

export interface CurvePoint {
  t: number;
  s: number;
  lo?: number;
  hi?: number;
}
export interface Series {
  label: string;
  /** Index de couleur dans la palette de la démo (0 à 4). */
  color: number;
  points: CurvePoint[];
  /** Dernière date suivie : la courbe s'arrête là. */
  end: number;
  /** true : fonction en escalier (Kaplan-Meier) ; false : courbe échantillonnée (modèle). */
  step: boolean;
  censors?: number[];
  dashed?: boolean;
}

const W = 760;
const M = { l: 52, r: 18, t: 14, b: 34 };
const PLOT_H = 280;
const IW = W - M.l - M.r;
const TICKS_T = [0, 6, 12, 18, 24, 30, 36];
const TICKS_S = [0, 0.25, 0.5, 0.75, 1];
const ROW_H = 18;

const sx = (t: number) => M.l + (Math.min(t, HORIZON) / HORIZON) * IW;
const sy = (s: number) => M.t + PLOT_H - s * PLOT_H;

/** Sommets d'une fonction en escalier (valeur `key`) jusqu'à `end`. */
function stepVertices(pts: readonly CurvePoint[], key: 's' | 'lo' | 'hi', end: number): [number, number][] {
  const v = (p: CurvePoint) => (key === 's' ? p.s : (p[key] ?? p.s));
  const out: [number, number][] = [[pts[0]!.t, v(pts[0]!)]];
  for (let i = 1; i < pts.length; i++) {
    out.push([pts[i]!.t, v(pts[i - 1]!)], [pts[i]!.t, v(pts[i]!)]);
  }
  out.push([Math.max(end, pts[pts.length - 1]!.t), v(pts[pts.length - 1]!)]);
  return out;
}
const lineVertices = (pts: readonly CurvePoint[], key: 's' | 'lo' | 'hi'): [number, number][] =>
  pts.map((p) => [p.t, key === 's' ? p.s : (p[key] ?? p.s)]);
const toPath = (v: readonly [number, number][]) => v.map(([t, s], i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(s).toFixed(1)}`).join('');

/** Valeur d'une série à la date t (null après la fin du suivi). */
export function valueAt(se: Series, t: number): CurvePoint | null {
  if (t > se.end + 1e-9) return null;
  let cur = se.points[0]!;
  for (const p of se.points) {
    if (p.t > t) break;
    cur = p;
  }
  return cur;
}

/**
 * Courbes de survie avec intervalles de confiance, marques de censure, lecture au survol (ou aux flèches du clavier)
 * et, en option, le tableau du nombre de sujets à risque aligné sous l'axe du temps.
 */
export function SurvivalChart({
  series,
  showCI,
  riskTable,
  label,
  marker,
}: {
  series: readonly Series[];
  showCI: boolean;
  /** Une ligne par série : effectif à risque à chaque graduation de TICKS_T. */
  riskTable?: { label: string; color: number; counts: number[] }[];
  label: string;
  /** Repère vertical facultatif (ex. fin d'engagement à 12 mois). */
  marker?: { t: number; text: string };
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const rows = riskTable?.length ?? 0;
  const tableTop = M.t + PLOT_H + M.b + 10;
  const H = tableTop + (rows ? 20 + rows * ROW_H : 0) + 4;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const t = ((x - M.l) / IW) * HORIZON;
    setCursor(t < 0 || t > HORIZON ? null : Math.round(t * 4) / 4);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setCursor((c) => Math.max(0, Math.min(HORIZON, Math.round(c ?? 12) + d)));
    } else if (e.key === 'Escape') setCursor(null);
  };

  const readout =
    cursor === null
      ? []
      : series.map((se) => ({ se, p: valueAt(se, cursor) })).filter((r): r is { se: Series; p: CurvePoint } => r.p !== null);
  const boxW = 210;
  const boxX = cursor !== null && sx(cursor) + boxW + 14 > W - M.r ? sx(cursor) - boxW - 10 : (cursor !== null ? sx(cursor) + 10 : 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="sv-svg sv-svg-wide"
      role="img"
      aria-label={label}
      tabIndex={0}
      onMouseMove={onMove}
      onMouseLeave={() => setCursor(null)}
      onKeyDown={onKey}
      onBlur={() => setCursor(null)}
    >
      {TICKS_S.map((s) => (
        <g key={s}>
          <line x1={M.l} x2={W - M.r} y1={sy(s)} y2={sy(s)} className="sv-grid" />
          <text x={M.l - 8} y={sy(s) + 3.5} textAnchor="end" className="sv-axis">
            {pct(s, 0)}
          </text>
        </g>
      ))}
      {TICKS_T.map((t) => (
        <text key={t} x={sx(t)} y={M.t + PLOT_H + 16} textAnchor="middle" className="sv-axis">
          {t}
        </text>
      ))}
      <text x={M.l + IW / 2} y={M.t + PLOT_H + 30} textAnchor="middle" className="sv-axis-title">
        Ancienneté (mois)
      </text>
      <text transform={`translate(13 ${M.t + PLOT_H / 2}) rotate(-90)`} textAnchor="middle" className="sv-axis-title">
        Part encore abonnée
      </text>
      {marker && (
        <g>
          <line x1={sx(marker.t)} x2={sx(marker.t)} y1={M.t} y2={M.t + PLOT_H} className="sv-marker" />
          <text x={sx(marker.t) + 5} y={M.t + 11} className="sv-marker-label">
            {marker.text}
          </text>
        </g>
      )}

      {showCI &&
        series.map((se, i) => {
          if (se.points[0]?.lo === undefined) return null;
          const up = se.step ? stepVertices(se.points, 'hi', se.end) : lineVertices(se.points, 'hi');
          const lo = se.step ? stepVertices(se.points, 'lo', se.end) : lineVertices(se.points, 'lo');
          return <path key={`b${i}`} d={`${toPath(up)}${toPath([...lo].reverse()).replace(/^M/, 'L')}Z`} className={`sv-band sv-c${se.color}`} />;
        })}
      {series.map((se, i) => (
        <path
          key={`l${i}`}
          d={toPath(se.step ? stepVertices(se.points, 's', se.end) : lineVertices(se.points, 's'))}
          className={`sv-line sv-c${se.color}${se.dashed ? ' is-dashed' : ''}`}
        />
      ))}
      {series.map((se, i) =>
        se.censors && se.censors.length ? (
          <path
            key={`c${i}`}
            className={`sv-censor sv-c${se.color}`}
            d={se.censors
              .filter((t) => t <= HORIZON)
              .map((t) => `M${sx(t).toFixed(1)},${(sy(valueAt(se, t)?.s ?? 0) - 3.5).toFixed(1)}v7`)
              .join('')}
          />
        ) : null,
      )}

      {cursor !== null && readout.length > 0 && (
        <g className="sv-hover" aria-hidden="true">
          <line x1={sx(cursor)} x2={sx(cursor)} y1={M.t} y2={M.t + PLOT_H} />
          {readout.map(({ se, p }, i) => (
            <circle key={i} cx={sx(cursor)} cy={sy(p.s)} r={3.5} className={`sv-c${se.color}`} />
          ))}
          <rect x={boxX} y={M.t + 4} width={boxW} height={22 + readout.length * 16} rx={6} className="sv-tip" />
          <text x={boxX + 10} y={M.t + 20} className="sv-tip-title">
            À {num(cursor, cursor % 1 ? 2 : 0)} mois
          </text>
          {readout.map(({ se, p }, i) => (
            <text key={i} x={boxX + 10} y={M.t + 37 + i * 16} className="sv-tip-row">
              <tspan className={`sv-tip-dot sv-c${se.color}`}>●</tspan> {se.label.length > 20 ? `${se.label.slice(0, 19)}…` : se.label} :{' '}
              <tspan fontWeight={600}>{pct(p.s)}</tspan>
            </text>
          ))}
        </g>
      )}

      {riskTable && rows > 0 && (
        <g>
          <text x={M.l - 8} y={tableTop + 6} textAnchor="end" className="sv-axis-title">
            À risque
          </text>
          {riskTable.map((r, i) => (
            <g key={i}>
              <circle cx={10} cy={tableTop + 20 + i * ROW_H - 4} r={3.5} className={`sv-dot sv-c${r.color}`} />
              {TICKS_T.map((t, k) => (
                <text key={t} x={sx(t)} y={tableTop + 20 + i * ROW_H} textAnchor="middle" className="sv-risk">
                  {int(r.counts[k] ?? 0)}
                </text>
              ))}
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/** Barre de forêt : rapport de risques et son IC sur une échelle logarithmique de 1/4 à 4, avec la valeur simulée. */
export function HazardBar({ hr, lo, hi, truth, significant }: { hr: number; lo: number; hi: number; truth: number; significant: boolean }) {
  const w = 200;
  const h = 22;
  const min = Math.log(0.25);
  const span = Math.log(4) - min;
  const clamp = (v: number) => Math.min(4, Math.max(0.25, v));
  const x = (v: number) => 6 + ((Math.log(clamp(v)) - min) / span) * (w - 12);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sv-hr" aria-hidden="true">
      <line x1={x(1)} x2={x(1)} y1={2} y2={h - 2} className="sv-hr-one" />
      <line x1={x(lo)} x2={x(hi)} y1={h / 2} y2={h / 2} className="sv-hr-ci" />
      <circle cx={x(hr)} cy={h / 2} r={4.5} className={`sv-hr-dot ${significant ? (hr >= 1 ? 'is-up' : 'is-down') : ''}`} />
      <line x1={x(truth)} x2={x(truth)} y1={4} y2={h - 4} className="sv-hr-truth" />
    </svg>
  );
}
