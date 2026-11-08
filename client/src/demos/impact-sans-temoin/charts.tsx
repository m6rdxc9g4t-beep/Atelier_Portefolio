import { CONTROL_CITIES, monthLabel, TREATED_CITY, weekLabel, type Analysis, type Scenario } from './model';
import { fmtK, fmtNum, fmtPctAbs } from './format';

function niceStep(range: number, target = 4): number {
  const raw = range / target || 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
function ticks(lo: number, hi: number, target = 4): number[] {
  const step = niceStep(hi - lo, target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
const area = (top: [number, number][], bottom: [number, number][]) => `${path(top)}L${[...bottom].reverse().map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;

/** Cadre commun des séries hebdomadaires : axe des semaines, lancement, choc. */
interface Frame {
  W: number;
  H: number;
  L: number;
  R: number;
  T: number;
  B: number;
  x: (w: number) => number;
  y: (v: number) => number;
  lo: number;
  hi: number;
}
function frame(nWeeks: number, w0: number, lo: number, hi: number, H = 260, W = 1000): Frame {
  const L = 56, R = 16, T = 12, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const x = (w: number) => L + ((w - w0) / Math.max(1, nWeeks - 1)) * iw;
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
  return { W, H, L, R, T, B, x, y, lo, hi };
}

function WeekAxis({ f, w0, w1, every = 13 }: { f: Frame; w0: number; w1: number; every?: number }) {
  const out = [];
  for (let w = w0; w <= w1; w++) if ((w - w0) % every === 0) out.push(w);
  return (
    <>
      {out.map((w) => (
        <text key={w} x={f.x(w)} y={f.H - 8} textAnchor="middle" className="imp-axis">
          {monthLabel(w)}
        </text>
      ))}
    </>
  );
}
function ValueAxis({ f, fmt, target = 4 }: { f: Frame; fmt: (v: number) => string; target?: number }) {
  return (
    <>
      {ticks(f.lo, f.hi, target).map((v) => (
        <g key={v}>
          <line x1={f.L} x2={f.W - f.R} y1={f.y(v)} y2={f.y(v)} className={v === 0 ? 'imp-zero' : 'imp-grid'} />
          <text x={f.L - 8} y={f.y(v) + 4} textAnchor="end" className="imp-axis">
            {fmt(v)}
          </text>
        </g>
      ))}
    </>
  );
}
function Markers({ f, s, showShock = true }: { f: Frame; s: Scenario; showShock?: boolean }) {
  const t0 = s.params.t0;
  const half = (f.x(1) - f.x(0)) / 2;
  const sw = s.shockWeeks;
  return (
    <>
      <rect x={f.x(t0) - half} y={f.T} width={f.x(s.treated.length - 1) - f.x(t0) + 2 * half} height={f.H - f.T - f.B} className="imp-post" />
      {showShock && sw.length > 0 && (
        <>
          <rect x={f.x(sw[0]!) - half} y={f.T} width={f.x(sw.at(-1)!) - f.x(sw[0]!) + 2 * half} height={f.H - f.T - f.B} className="imp-shock" />
          <text x={f.x(sw.at(-1)!) + half + 4} y={f.T + 12} className="imp-shock-label">
            grève
          </text>
        </>
      )}
      <line x1={f.x(t0) - half} x2={f.x(t0) - half} y1={f.T} y2={f.H - f.B} className="imp-launch" />
      <text x={f.x(t0) - half - 6} y={f.T + 12} textAnchor="end" className="imp-launch-label">
        lancement
      </text>
    </>
  );
}

/* ───────────── 1. Ventes observées et jumeau synthétique ───────────── */

export function SeriesChart({ s, a, reveal }: { s: Scenario; a: Analysis; reveal: boolean }) {
  const all = [...s.treated, ...a.synth.synthetic, ...(reveal ? s.counterfactual : [])];
  const lo = Math.min(...all) * 0.94, hi = Math.max(...all) * 1.04;
  const f = frame(s.treated.length, 0, lo, hi, 280);
  const pts = (arr: number[]) => arr.map((v, w) => [f.x(w), f.y(v)] as [number, number]);
  return (
    <svg viewBox={`0 0 ${f.W} ${f.H}`} className="imp-svg" role="img"
      aria-label={`Ventes hebdomadaires de ${TREATED_CITY} et de son contrôle synthétique, lancement le ${weekLabel(s.params.t0)}`}>
      <Markers f={f} s={s} />
      <ValueAxis f={f} fmt={(v) => fmtNum(v, 0)} />
      <WeekAxis f={f} w0={0} w1={s.treated.length - 1} />
      {reveal && <path d={path(pts(s.counterfactual))} className="imp-true-line" />}
      <path d={path(pts(a.synth.synthetic))} className="imp-synth-line" />
      <path d={path(pts(s.treated))} className="imp-treated-line" />
      {s.treated.map((v, w) => (
        <rect key={w} x={f.x(w) - 4} y={f.T} width={8} height={f.H - f.T - f.B} className="imp-hit">
          <title>{`${weekLabel(w)} · ${TREATED_CITY} ${fmtK(v)} · synthétique ${fmtK(a.synth.synthetic[w]!)}${reveal ? ` · sans campagne ${fmtK(s.counterfactual[w]!)}` : ''}`}</title>
        </rect>
      ))}
      <text x={f.L - 8} y={f.T - 1} textAnchor="end" className="imp-axis-title">k€</text>
    </svg>
  );
}

/* ───────────── 2. Écart semaine par semaine, bande des placebos ───────────── */

export function GapChart({ s, a, reveal }: { s: Scenario; a: Analysis; reveal: boolean }) {
  const w0 = Math.max(0, s.params.t0 - 26);
  const T = s.treated.length;
  const idx = Array.from({ length: T - w0 }, (_, k) => w0 + k);
  const vals = [...idx.map((w) => a.synth.gap[w]!), ...idx.map((w) => a.bandLo[w]!), ...idx.map((w) => a.bandHi[w]!), ...(reveal ? idx.map((w) => s.trueEffect[w]!) : [])];
  const lo = Math.min(0, ...vals) * 1.1, hi = Math.max(0, ...vals) * 1.1;
  const f = frame(idx.length, w0, lo, hi, 300, 600);
  const p = (get: (w: number) => number) => idx.map((w) => [f.x(w), f.y(get(w))] as [number, number]);
  return (
    <svg viewBox={`0 0 ${f.W} ${f.H}`} className="imp-svg" role="img" aria-label="Écart entre les ventes observées et le contrôle synthétique, semaine par semaine, avec la plage des placebos">
      <Markers f={f} s={s} />
      <ValueAxis f={f} fmt={(v) => fmtNum(v, 0)} />
      <WeekAxis f={f} w0={w0} w1={T - 1} every={10} />
      <path d={area(p((w) => a.bandHi[w]!), p((w) => a.bandLo[w]!))} className="imp-band" />
      {reveal && <path d={path(p((w) => s.trueEffect[w]!))} className="imp-true-line" />}
      <path d={path(p((w) => a.synth.gap[w]!))} className="imp-gap-line" />
      {idx.map((w) => (
        <rect key={w} x={f.x(w) - 8} y={f.T} width={16} height={f.H - f.T - f.B} className="imp-hit">
          <title>{`${weekLabel(w)} · écart ${fmtK(a.synth.gap[w]!)} · placebos de ${fmtK(a.bandLo[w]!)} à ${fmtK(a.bandHi[w]!)}${reveal ? ` · effet vrai ${fmtK(s.trueEffect[w]!)}` : ''}`}</title>
        </rect>
      ))}
      <text x={f.L - 8} y={f.T - 1} textAnchor="end" className="imp-axis-title">k€</text>
    </svg>
  );
}

/* ───────────── 3. Effet cumulé ───────────── */

export function CumChart({ s, a, reveal }: { s: Scenario; a: Analysis; reveal: boolean }) {
  const t0 = s.params.t0;
  const n = a.synthCum.length;
  const vals = [...a.synthCum, ...(reveal ? a.trueCum : []), 0];
  const lo = Math.min(...vals) * 1.1, hi = Math.max(...vals) * 1.1 || 1;
  const f = frame(n, t0, lo, hi, 300, 600);
  const p = (arr: number[]) => arr.map((v, k) => [f.x(t0 + k), f.y(v)] as [number, number]);
  const last = a.synthCum.at(-1) ?? 0;
  return (
    <svg viewBox={`0 0 ${f.W} ${f.H}`} className="imp-svg" role="img" aria-label={`Effet cumulé estimé depuis le lancement : ${fmtK(last, 0)}`}>
      <ValueAxis f={f} fmt={(v) => fmtNum(v, 0)} />
      <WeekAxis f={f} w0={t0} w1={t0 + n - 1} every={Math.max(4, Math.ceil(n / 6))} />
      <path d={area(p(a.synthCum), p(a.synthCum.map(() => 0)))} className="imp-cum-area" />
      {reveal && <path d={path(p(a.trueCum))} className="imp-true-line" />}
      <path d={path(p(a.synthCum))} className="imp-gap-line" />
      <circle cx={f.x(t0 + n - 1)} cy={f.y(last)} r={4} className="imp-end-dot" />
      <text x={f.x(t0 + n - 1) - 8} y={f.y(last) - 9} textAnchor="end" className="imp-end-label">
        {fmtK(last, 0)}
      </text>
      <text x={f.L - 8} y={f.T - 1} textAnchor="end" className="imp-axis-title">k€</text>
    </svg>
  );
}

/* ───────────── 4. Poids des villes donneuses ───────────── */

export function WeightsChart({ s, a, reveal }: { s: Scenario; a: Analysis; reveal: boolean }) {
  const rows = CONTROL_CITIES.map((city, j) => ({ city, w: a.synth.weights[j]!, truth: s.trueWeights[j]! }))
    .filter((r) => r.w >= 0.005 || (reveal && r.truth > 0))
    .sort((x, y) => y.w - x.w);
  const W = 480, rowH = 26, L = 128, R = 52, T = 4;
  const H = T + rows.length * rowH + 4;
  const max = Math.max(0.5, ...rows.map((r) => Math.max(r.w, reveal ? r.truth : 0)));
  const x = (v: number) => L + (v / max) * (W - L - R);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="imp-svg" role="img" aria-label="Poids des villes qui composent le contrôle synthétique">
      <line x1={L} x2={L} y1={T} y2={H - 4} className="imp-grid" />
      {rows.map((r, i) => {
        const y = T + i * rowH;
        return (
          <g key={r.city}>
            <text x={L - 8} y={y + 17} textAnchor="end" className="imp-barlabel">{r.city}</text>
            <rect x={L} y={y + 6} width={Math.max(1, x(r.w) - L)} height={rowH - 12} rx={3} className="imp-weight-bar">
              <title>{`${r.city} : ${fmtPctAbs(r.w)}${reveal ? ` (vrai : ${fmtPctAbs(r.truth, 0)})` : ''}`}</title>
            </rect>
            {reveal && r.truth > 0 && <line x1={x(r.truth)} x2={x(r.truth)} y1={y + 3} y2={y + rowH - 3} className="imp-true-tick" />}
            <text x={x(r.w) + 6} y={y + 17} className="imp-axis">{fmtPctAbs(r.w, 0)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────── 5. Placebos : écarts relatifs (spaghetti) ───────────── */

export function PlaceboChart({ s, a }: { s: Scenario; a: Analysis }) {
  const T = s.treated.length;
  const treatedPct = a.synth.gap.map((g, t) => g / a.synth.synthetic[t]!);
  const kept = a.placebos.filter((p) => !p.poorFit);
  const vals = [...treatedPct, ...kept.flatMap((p) => p.gapPct)];
  const lim = Math.max(0.05, ...vals.map(Math.abs)) * 1.08;
  const f = frame(T, 0, -lim, lim, 260);
  const p = (arr: number[]) => arr.map((v, w) => [f.x(w), f.y(v)] as [number, number]);
  return (
    <svg viewBox={`0 0 ${f.W} ${f.H}`} className="imp-svg" role="img"
      aria-label={`Écarts relatifs de ${TREATED_CITY} et de ${kept.length} villes placebo à leur contrôle synthétique`}>
      <Markers f={f} s={s} showShock={false} />
      <ValueAxis f={f} fmt={(v) => `${fmtNum(v * 100, 0)} %`} />
      <WeekAxis f={f} w0={0} w1={T - 1} />
      {kept.map((pl) => (
        <path key={pl.city} d={path(p(pl.gapPct))} className="imp-placebo-line">
          <title>{`${pl.city} (placebo)`}</title>
        </path>
      ))}
      <path d={path(p(treatedPct))} className="imp-gap-line imp-gap-line--strong">
        <title>{TREATED_CITY}</title>
      </path>
    </svg>
  );
}

/* ───────────── 6. Rapport RMSPE après / avant ───────────── */

export function RatioChart({ a }: { a: Analysis }) {
  const rows = [{ city: TREATED_CITY, ratio: a.treatedRatio, treated: true }, ...a.placebos.map((p) => ({ city: p.city, ratio: p.ratio, treated: false }))].sort((x, y) => y.ratio - x.ratio);
  const W = 480, rowH = 19, L = 128, R = 44, T = 4;
  const H = T + rows.length * rowH + 4;
  const max = Math.max(...rows.map((r) => r.ratio)) * 1.05;
  const x = (v: number) => L + (v / max) * (W - L - R);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="imp-svg" role="img" aria-label={`Rapport des erreurs après et avant lancement : ${TREATED_CITY} est au rang ${a.rank} sur ${rows.length}`}>
      <line x1={L} x2={L} y1={T} y2={H - 4} className="imp-grid" />
      {rows.map((r, i) => {
        const y = T + i * rowH;
        return (
          <g key={r.city}>
            <text x={L - 8} y={y + 13.5} textAnchor="end" className={r.treated ? 'imp-barlabel imp-barlabel--strong' : 'imp-barlabel'}>
              {i + 1}. {r.city}
            </text>
            <rect x={L} y={y + 4} width={Math.max(1, x(r.ratio) - L)} height={rowH - 8} rx={2} className={r.treated ? 'imp-ratio-bar imp-ratio-bar--treated' : 'imp-ratio-bar'}>
              <title>{`${r.city} : erreur après lancement ${fmtNum(r.ratio, 2)} fois celle d’avant`}</title>
            </rect>
            <text x={x(r.ratio) + 5} y={y + 13.5} className="imp-axis">{fmtNum(r.ratio, 1)}</text>
          </g>
        );
      })}
    </svg>
  );
}

