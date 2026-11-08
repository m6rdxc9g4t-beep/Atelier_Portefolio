import { useState, type MouseEvent } from 'react';
import type { Decile, GainPoint, Point } from './model';
import { eur, int, pct } from './format';

/* Petits graphiques SVG dessinés à la main, sans bibliothèque, aux couleurs de la démo. */

const W = 360;
const H = 270;
const M = { l: 58, r: 14, t: 12, b: 38 };
const IW = W - M.l - M.r;
const IH = H - M.t - M.b;
const sx = (x: number) => M.l + x * IW;
const sy = (y: number) => M.t + IH - y * IH;
const TICKS = [0, 0.25, 0.5, 0.75, 1];

function Frame({ xLabel, yLabel }: { xLabel: string; yLabel: string }) {
  return (
    <g>
      {TICKS.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} className="chn-grid" />
          <text x={M.l - 6} y={sy(t) + 3.5} textAnchor="end" className="chn-axis">
            {pct(t, 0)}
          </text>
          <text x={sx(t)} y={H - M.b + 15} textAnchor="middle" className="chn-axis">
            {pct(t, 0)}
          </text>
        </g>
      ))}
      <text x={M.l + IW / 2} y={H - 4} textAnchor="middle" className="chn-axis-title">
        {xLabel}
      </text>
      <text transform={`translate(12 ${M.t + IH / 2}) rotate(-90)`} textAnchor="middle" className="chn-axis-title">
        {yLabel}
      </text>
    </g>
  );
}

const path = (pts: readonly Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');

/** Courbe dans le carré unité (ROC, précision/rappel, gain cumulé), avec référence et lecture au survol. */
export function UnitCurve({
  points,
  reference,
  referenceLabel,
  xLabel,
  yLabel,
  label,
  readout,
  fill = false,
}: {
  points: readonly Point[];
  /** Ligne de référence (modèle au hasard). */
  reference: readonly Point[];
  referenceLabel: string;
  xLabel: string;
  yLabel: string;
  label: string;
  readout: (p: Point) => string;
  fill?: boolean;
}) {
  const [hover, setHover] = useState<Point | null>(null);
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const xd = (x - M.l) / IW;
    if (xd < -0.02 || xd > 1.02) return setHover(null);
    let best = points[0]!;
    for (const p of points) if (Math.abs(p.x - xd) < Math.abs(best.x - xd)) best = p;
    setHover(best);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chn-svg" role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <Frame xLabel={xLabel} yLabel={yLabel} />
      {fill && <path d={`${path(points)}L${sx(points[points.length - 1]!.x)},${sy(0)}L${sx(points[0]!.x)},${sy(0)}Z`} className="chn-area" />}
      <path d={path(reference)} className="chn-ref" />
      <path d={path(points)} className="chn-curve" />
      <text x={W - M.r - 4} y={sy(reference[reference.length - 1]!.y) - 6} textAnchor="end" className="chn-ref-label">
        {referenceLabel}
      </text>
      {hover && (
        <g className="chn-hover" aria-hidden="true">
          <line x1={sx(hover.x)} x2={sx(hover.x)} y1={M.t} y2={M.t + IH} />
          <circle cx={sx(hover.x)} cy={sy(hover.y)} r={4} />
          <text x={hover.x > 0.6 ? sx(hover.x) - 8 : sx(hover.x) + 8} y={M.t + 14} textAnchor={hover.x > 0.6 ? 'end' : 'start'}>
            {readout(hover)}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Calibration : probabilité moyenne prédite vs taux observé, décile par décile. */
export function CalibrationChart({ deciles }: { deciles: readonly Decile[] }) {
  const max = Math.min(1, Math.ceil(Math.max(...deciles.map((d) => Math.max(d.predicted, d.observed))) * 10 + 0.5) / 10);
  const cx = (v: number) => M.l + (v / max) * IW;
  const cy = (v: number) => M.t + IH - (v / max) * IH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chn-svg" role="img" aria-label="Calibration : taux de résiliation prédit et observé par décile de score">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={cy(t)} y2={cy(t)} className="chn-grid" />
          <text x={M.l - 6} y={cy(t) + 3.5} textAnchor="end" className="chn-axis">
            {pct(t, 0)}
          </text>
          <text x={cx(t)} y={H - M.b + 15} textAnchor="middle" className="chn-axis">
            {pct(t, 0)}
          </text>
        </g>
      ))}
      <text x={M.l + IW / 2} y={H - 4} textAnchor="middle" className="chn-axis-title">
        Probabilité moyenne prédite
      </text>
      <text transform={`translate(11 ${M.t + IH / 2}) rotate(-90)`} textAnchor="middle" className="chn-axis-title">
        Taux observé
      </text>
      <line x1={cx(0)} y1={cy(0)} x2={cx(max)} y2={cy(max)} className="chn-ref" />
      <text x={cx(max) - 4} y={cy(max) + 14} textAnchor="end" className="chn-ref-label">
        calibration parfaite
      </text>
      <polyline points={deciles.map((d) => `${cx(d.predicted)},${cy(d.observed)}`).join(' ')} className="chn-curve chn-curve-thin" />
      {deciles.map((d, i) => (
        <circle key={i} cx={cx(d.predicted)} cy={cy(d.observed)} r={4.5} className="chn-dot">
          <title>{`Décile ${i + 1} (${int(d.n)} abonnés) : prédit ${pct(d.predicted)}, observé ${pct(d.observed)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Gain net (en euros) selon le seuil de contact, avec le seuil choisi et le meilleur seuil. */
export function GainByThresholdChart({ curve, threshold, best, onPick }: { curve: readonly GainPoint[]; threshold: number; best: GainPoint; onPick: (t: number) => void }) {
  const GW = 720;
  const GH = 250;
  const g = { l: 64, r: 16, t: 14, b: 38 };
  const iw = GW - g.l - g.r;
  const ih = GH - g.t - g.b;
  const pts = curve.filter((c) => c.threshold <= 1);
  const ys = pts.map((c) => c.gain);
  const hi = Math.max(0, ...ys);
  const lo = Math.min(0, ...ys);
  const step = niceStep((hi - lo) / 4);
  const yMax = Math.ceil(hi / step) * step || step;
  const yMin = Math.floor(lo / step) * step;
  const x = (t: number) => g.l + t * iw;
  const y = (v: number) => g.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push(v);
  // Courbe en escalier : le gain change à chaque score distinct.
  const sorted = [...pts].sort((a, b) => a.threshold - b.threshold);
  const d = sorted.map((c, i) => `${i ? 'L' : 'M'}${x(c.threshold).toFixed(1)},${y(c.gain).toFixed(1)}`).join('');
  const current = gainAt(curve, threshold);
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = (((e.clientX - box.left) / box.width) * GW - g.l) / iw;
    if (t >= 0 && t <= 1) onPick(Math.round(t * 100) / 100);
  };
  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} className="chn-svg chn-svg-wide" role="img" aria-label="Gain net en euros selon le seuil de contact" onClick={onClick}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={g.l} x2={GW - g.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'chn-zero' : 'chn-grid'} />
          <text x={g.l - 6} y={y(v) + 3.5} textAnchor="end" className="chn-axis">
            {eur(v)}
          </text>
        </g>
      ))}
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => (
        <text key={t} x={x(t)} y={GH - g.b + 15} textAnchor="middle" className="chn-axis">
          {pct(t, 0)}
        </text>
      ))}
      <text x={g.l + iw / 2} y={GH - 4} textAnchor="middle" className="chn-axis-title">
        Seuil de contact (score minimal pour recevoir l’offre)
      </text>
      <path d={d} className="chn-curve" />
      <line x1={x(best.threshold)} x2={x(best.threshold)} y1={g.t} y2={g.t + ih} className="chn-best" />
      <text x={x(best.threshold) + (best.threshold > 0.7 ? -6 : 6)} y={g.t + 12} textAnchor={best.threshold > 0.7 ? 'end' : 'start'} className="chn-best-label">
        meilleur seuil {pct(best.threshold, 0)} · {eur(best.gain)}
      </text>
      <line x1={x(threshold)} x2={x(threshold)} y1={g.t} y2={g.t + ih} className="chn-cursor" />
      <circle cx={x(threshold)} cy={y(current.gain)} r={5} className="chn-cursor-dot" />
    </svg>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Point de la courbe de gain correspondant à un seuil (on contacte les scores ≥ seuil). */
export function gainAt(curve: readonly GainPoint[], threshold: number): GainPoint {
  let out = curve[0]!;
  for (const c of curve) if (c.threshold >= threshold && c.contacted >= out.contacted) out = c;
  return out;
}

/** Odds ratios sur échelle logarithmique, avec intervalle approché et valeur vraie de la simulation. */
export function OddsRow({ or, lo, hi, truth }: { or: number; lo: number; hi: number; truth: number | null }) {
  const OW = 220;
  const OH = 22;
  const min = Math.log(0.1);
  const max = Math.log(10);
  const x = (v: number) => 6 + ((Math.log(Math.min(10, Math.max(0.1, v))) - min) / (max - min)) * (OW - 12);
  const up = or >= 1;
  return (
    <svg viewBox={`0 0 ${OW} ${OH}`} className="chn-or" aria-hidden="true">
      <line x1={x(1)} x2={x(1)} y1={2} y2={OH - 2} className="chn-or-one" />
      <line x1={x(lo)} x2={x(hi)} y1={OH / 2} y2={OH / 2} className="chn-or-ci" />
      <rect x={Math.min(x(1), x(or))} y={OH / 2 - 4} width={Math.max(1.5, Math.abs(x(or) - x(1)))} height={8} rx={2} className={up ? 'chn-or-bar is-up' : 'chn-or-bar is-down'} />
      {truth !== null && <line x1={x(truth)} x2={x(truth)} y1={3} y2={OH - 3} className="chn-or-truth" />}
    </svg>
  );
}
