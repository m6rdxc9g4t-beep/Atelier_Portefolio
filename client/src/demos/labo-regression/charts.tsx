import type { Fit } from './model';

const MAX_POINTS = 2500;

/** Indices à dessiner : tous jusqu'à MAX_POINTS, sinon un sous-échantillon régulier (les points signalés sont toujours gardés). */
function sampleIdx(n: number, keep: number[] = []): number[] {
  if (n <= MAX_POINTS) return Array.from({ length: n }, (_, i) => i);
  const step = n / MAX_POINTS;
  const set = new Set<number>(keep);
  for (let k = 0; k < MAX_POINTS; k++) set.add(Math.floor(k * step));
  return [...set].sort((a, b) => a - b);
}

function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

const W = 420;
const H = 260;
const M = { l: 52, r: 14, t: 12, b: 34 };

/** Étiquette de graduation : juste assez de décimales pour distinguer deux graduations voisines. */
function fmtTick(v: number, ticks: number[]): string {
  const step = ticks.length > 1 ? Math.abs(ticks[1]! - ticks[0]!) : Math.abs(v) || 1;
  const d = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

interface Frame {
  x: (v: number) => number;
  y: (v: number) => number;
  xt: number[];
  yt: number[];
}
function frame(xs: number[], ys: number[], pad = 0.05): Frame {
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (x1 === x0) { x0 -= 1; x1 += 1; }
  if (y1 === y0) { y0 -= 1; y1 += 1; }
  const dx = (x1 - x0) * pad;
  const dy = (y1 - y0) * pad;
  x0 -= dx; x1 += dx; y0 -= dy; y1 += dy;
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  return {
    x: (v) => M.l + ((v - x0) / (x1 - x0)) * iw,
    y: (v) => M.t + ih - ((v - y0) / (y1 - y0)) * ih,
    xt: niceTicks(x0, x1),
    yt: niceTicks(y0, y1),
  };
}

function Axes({ f, xLabel, yLabel }: { f: Frame; xLabel: string; yLabel: string }) {
  return (
    <g className="rg-axes">
      {f.yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={M.l} x2={W - M.r} y1={f.y(v)} y2={f.y(v)} className="rg-grid" />
          <text x={M.l - 6} y={f.y(v) + 3.5} textAnchor="end">{fmtTick(v, f.yt)}</text>
        </g>
      ))}
      {f.xt.map((v) => (
        <text key={`x${v}`} x={f.x(v)} y={H - M.b + 15} textAnchor="middle">{fmtTick(v, f.xt)}</text>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" className="rg-axis-title">{xLabel}</text>
      <text x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`} className="rg-axis-title">
        {yLabel}
      </text>
    </g>
  );
}

/** Résidus contre valeurs ajustées, avec la moyenne et la dispersion des résidus par tranche (l'évasement trahit l'hétéroscédasticité). */
export function ResidualPlot({ fit, flagged }: { fit: Fit; flagged: Set<number> }) {
  const idx = sampleIdx(fit.n, [...flagged]);
  const xs = idx.map((i) => fit.fitted[i]!);
  const ys = idx.map((i) => fit.resid[i]!);
  const f = frame(xs, ys);
  // Tranches de valeurs ajustées : écart-type des résidus de part et d'autre de 0.
  const order = fit.fitted.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const nb = Math.min(12, Math.max(4, Math.floor(fit.n / 40)));
  const band: { x: number; sd: number }[] = [];
  for (let b = 0; b < nb; b++) {
    const part = order.slice(Math.floor((b * fit.n) / nb), Math.floor(((b + 1) * fit.n) / nb));
    if (part.length < 3) continue;
    const e = part.map(([, i]) => fit.resid[i]!);
    const sd = Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
    band.push({ x: part.reduce((s, [v]) => s + v, 0) / part.length, sd });
  }
  const up = band.map((p) => `${f.x(p.x).toFixed(1)},${f.y(p.sd).toFixed(1)}`).join(' ');
  const down = band.map((p) => `${f.x(p.x).toFixed(1)},${f.y(-p.sd).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Nuage des résidus en fonction des valeurs ajustées">
      <Axes f={f} xLabel="Valeur ajustée" yLabel="Résidu" />
      <line x1={M.l} x2={W - M.r} y1={f.y(0)} y2={f.y(0)} className="rg-zero" />
      {idx.map((i) => (
        <circle key={i} cx={f.x(fit.fitted[i]!)} cy={f.y(fit.resid[i]!)} r={flagged.has(i) ? 3.2 : 2.1} className={flagged.has(i) ? 'rg-pt rg-pt-flag' : 'rg-pt'} />
      ))}
      {band.length > 1 && (
        <>
          <polyline points={up} className="rg-band" />
          <polyline points={down} className="rg-band" />
        </>
      )}
    </svg>
  );
}

/** Diagramme quantile-quantile des résidus standardisés contre la loi normale. */
export function QQPlot({ qq }: { qq: { theo: number; obs: number }[] }) {
  const step = Math.max(1, Math.ceil(qq.length / MAX_POINTS));
  const pts = qq.filter((_, i) => i % step === 0 || i === qq.length - 1);
  const lim = Math.max(...pts.map((p) => Math.abs(p.theo)), ...pts.map((p) => Math.abs(p.obs)), 2.5);
  const f = frame([-lim, lim], [-lim, lim], 0.02);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Diagramme quantile-quantile des résidus">
      <Axes f={f} xLabel="Quantile théorique (loi normale)" yLabel="Résidu standardisé" />
      <line x1={f.x(-lim)} y1={f.y(-lim)} x2={f.x(lim)} y2={f.y(lim)} className="rg-ref" />
      {pts.map((p, i) => (
        <circle key={i} cx={f.x(p.theo)} cy={f.y(p.obs)} r={2.1} className="rg-pt" />
      ))}
    </svg>
  );
}

/** Distance de Cook de chaque observation, seuil 4/n. */
export function CooksPlot({ cooks, threshold, labelOf }: { cooks: number[]; threshold: number; labelOf: (i: number) => string }) {
  const n = cooks.length;
  const top = cooks.map((d, i) => [d, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i);
  const idx = sampleIdx(n, top);
  const finite = cooks.filter(Number.isFinite);
  const max = Math.max(threshold * 1.6, ...finite);
  const f = frame([0, n - 1], [0, max], 0.03);
  const base = f.y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distance de Cook par observation">
      <Axes f={f} xLabel="Observation (ordre du fichier)" yLabel="Distance de Cook" />
      {idx.map((i) => {
        const d = Math.min(cooks[i]!, max);
        const over = cooks[i]! > threshold;
        return <line key={i} x1={f.x(i)} x2={f.x(i)} y1={base} y2={f.y(d)} className={over ? 'rg-stick rg-stick-flag' : 'rg-stick'} />;
      })}
      <line x1={M.l} x2={W - M.r} y1={f.y(threshold)} y2={f.y(threshold)} className="rg-threshold" />
      <text x={W - M.r - 4} y={f.y(threshold) - 5} textAnchor="end" className="rg-threshold-label">4/n</text>
      {top.filter((i) => cooks[i]! > threshold).map((i) => (
        <text key={`t${i}`} x={f.x(i)} y={f.y(Math.min(cooks[i]!, max)) - 5} textAnchor="middle" className="rg-pt-label">
          {labelOf(i)}
        </text>
      ))}
    </svg>
  );
}
