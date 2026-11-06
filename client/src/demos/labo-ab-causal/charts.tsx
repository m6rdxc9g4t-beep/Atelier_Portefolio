import { useMemo, useState, type PointerEvent } from 'react';
import { line as d3line, area as d3area, curveMonotoneX } from 'd3-shape';
import { betaPdf } from './stats';
import { powerCurve, powerTwoProportions, type Sides } from './model';
import { int, num, pct, plural, signed } from './format';
import { Legend, Tip, lin, ticks, useWidth } from './ui';

const M = { top: 14, right: 18, bottom: 38, left: 46 };

function useHover() {
  const [hx, setHx] = useState<number | null>(null);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHx(e.clientX - r.left);
  };
  return { hx, onMove, onLeave: () => setHx(null) };
}

/* ───────────── Courbe de puissance ───────────── */

export function PowerChart({
  pA,
  pB,
  alpha,
  sides,
  w,
  nStar,
  target,
  daily,
}: {
  pA: number;
  pB: number;
  alpha: number;
  sides: Sides;
  w: number;
  nStar: number;
  target: number;
  daily: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 520 ? 220 : 270;
  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const xTicks = ticks(0, nStar * 2.2, width < 520 ? 3 : 5);
  const xMax = Math.max(nStar * 2.2, xTicks[xTicks.length - 1] ?? 1);
  const x = lin(0, xMax, 0, iw);
  const y = lin(0, 1, ih, 0);
  const pts_ = useMemo(() => powerCurve(pA, pB, alpha, sides, w, xMax, 200), [pA, pB, alpha, sides, w, xMax]);
  const path = d3line<[number, number]>()
    .x((d) => x(d[0]))
    .y((d) => y(d[1]))(pts_);
  const { hx, onMove, onLeave } = useHover();
  const hN = hx === null ? null : Math.max(0, Math.min(xMax, x.invert(hx)));
  const hP = hN === null ? 0 : hN === 0 ? alpha : powerTwoProportions(pA, pB, hN * (1 - w), hN * w, alpha, sides);
  const kfmt = (v: number) => (v === 0 ? '0' : xMax >= 20000 ? `${num(v / 1000, 0)} k` : int(v));
  return (
    <figure className="lab-chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Puissance du test en fonction du nombre total de visiteurs : elle atteint ${pct(target, 0)} à ${int(nStar)} visiteurs.`}
      >
        <g transform={`translate(${M.left},${M.top})`}>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={iw} className="lab-grid" />
              <text x={-8} dy="0.32em" className="lab-tick" textAnchor="end">
                {num(t * 100, 0)} %
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={ih + 18} className="lab-tick" textAnchor="middle">
              {kfmt(t)}
            </text>
          ))}
          <text x={iw} y={ih + 34} className="lab-axis-title" textAnchor="end">
            Visiteurs au total (A + B)
          </text>
          <line x1={0} x2={iw} y1={y(target)} y2={y(target)} className="lab-ref" />
          <line x1={x(nStar)} x2={x(nStar)} y1={ih} y2={y(target)} className="lab-ref" />
          <path d={path ?? ''} className="lab-line lab-s1" />
          <circle cx={x(nStar)} cy={y(target)} r={4.5} className="lab-dot lab-s1" />
          <text
            x={x(nStar) > iw * 0.55 ? x(nStar) - 8 : x(nStar) + 8}
            y={y(target) + 18}
            className="lab-annot"
            textAnchor={x(nStar) > iw * 0.55 ? 'end' : 'start'}
          >
            {int(nStar)} visiteurs → {pct(target, 0)}
          </text>
          {hN !== null && hx !== null && (
            <g pointerEvents="none">
              <line x1={x(hN)} x2={x(hN)} y1={0} y2={ih} className="lab-cross" />
              <circle cx={x(hN)} cy={y(hP)} r={4} className="lab-dot lab-s1" />
            </g>
          )}
          <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onMove} />
        </g>
      </svg>
      {hN !== null && hx !== null && (
        <Tip x={M.left + x(hN)} y={M.top + y(hP)} width={width}>
          <strong>{int(hN)} visiteurs</strong>
          <span>Puissance {pct(hP, 1)}</span>
          <span>{plural(Math.ceil(hN / daily), 'jour', 'jours')} de trafic</span>
        </Tip>
      )}
    </figure>
  );
}

/* ───────────── Intervalle de confiance ───────────── */

export function IntervalChart({
  est,
  low,
  high,
  format,
  label,
}: {
  est: number;
  low: number;
  high: number;
  format: (v: number) => string;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 74;
  const span = Math.max(Math.abs(low), Math.abs(high), 1e-12);
  const pad = span * 0.25;
  const lo = Math.min(0, low) - pad;
  const hi = Math.max(0, high) + pad;
  const x = lin(lo, hi, 18, width - 18);
  const cy = 30;
  const zeroInside = low <= 0 && high >= 0;
  return (
    <figure className="lab-chart lab-chart--ci" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`${label} : ${format(est)}, intervalle de ${format(low)} à ${format(high)}.`}>
        <line x1={x(0)} x2={x(0)} y1={8} y2={height - 22} className="lab-zero" />
        <text x={x(0)} y={height - 6} className="lab-tick" textAnchor="middle">
          0 (aucun effet)
        </text>
        <line x1={x(low)} x2={x(high)} y1={cy} y2={cy} className={`lab-ci ${zeroInside ? 'is-null' : ''}`} />
        <line x1={x(low)} x2={x(low)} y1={cy - 7} y2={cy + 7} className={`lab-ci ${zeroInside ? 'is-null' : ''}`} />
        <line x1={x(high)} x2={x(high)} y1={cy - 7} y2={cy + 7} className={`lab-ci ${zeroInside ? 'is-null' : ''}`} />
        <circle cx={x(est)} cy={cy} r={5} className="lab-dot lab-s2" />
        <text x={x(low)} y={cy - 12} className="lab-tick" textAnchor={x(low) < 60 ? 'start' : 'middle'}>
          {format(low)}
        </text>
        <text x={x(high)} y={cy - 12} className="lab-tick" textAnchor={x(high) > width - 60 ? 'end' : 'middle'}>
          {format(high)}
        </text>
      </svg>
    </figure>
  );
}

/* ───────────── Lois a posteriori ───────────── */

export function PosteriorChart({ aA, bA, aB, bB, lo, hi }: { aA: number; bA: number; aB: number; bB: number; lo: number; hi: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 520 ? 190 : 210;
  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const N = 220;
  const data = useMemo(() => {
    const out: { x: number; a: number; b: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const v = lo + ((hi - lo) * i) / N;
      out.push({ x: v, a: betaPdf(v, aA, bA), b: betaPdf(v, aB, bB) });
    }
    return out;
  }, [aA, bA, aB, bB, lo, hi]);
  const yMax = Math.max(...data.map((d) => Math.max(d.a, d.b))) * 1.08 || 1;
  const x = lin(lo, hi, 0, iw);
  const y = lin(0, yMax, ih, 0);
  const curve = (k: 'a' | 'b') => d3line<{ x: number; a: number; b: number }>().x((d) => x(d.x)).y((d) => y(d[k])).curve(curveMonotoneX)(data) ?? '';
  const fill = (k: 'a' | 'b') =>
    d3area<{ x: number; a: number; b: number }>().x((d) => x(d.x)).y0(ih).y1((d) => y(d[k])).curve(curveMonotoneX)(data) ?? '';
  const d = Math.max(1, Math.ceil(-Math.log10(Math.max(1e-9, (hi - lo) * 100)) + 1));
  const { hx, onMove, onLeave } = useHover();
  const hv = hx === null ? null : x.invert(Math.max(0, Math.min(iw, hx)));
  const modeA = (aA - 1) / (aA + bA - 2);
  const modeB = (aB - 1) / (aB + bB - 2);
  return (
    <figure className="lab-chart" ref={ref}>
      <Legend items={[{ label: 'Taux de A', className: 'lab-s1' }, { label: 'Taux de B', className: 'lab-s2' }]} />
      <svg width={width} height={height} role="img" aria-label="Lois a posteriori des taux de conversion de A et de B.">
        <g transform={`translate(${M.left},${M.top})`}>
          <line x2={iw} y1={ih} y2={ih} className="lab-grid" />
          {ticks(lo, hi, width < 520 ? 3 : 5).map((t) => (
            <text key={t} x={x(t)} y={ih + 18} className="lab-tick" textAnchor="middle">
              {pct(t, d)}
            </text>
          ))}
          <text x={iw} y={ih + 34} className="lab-axis-title" textAnchor="end">
            Taux de conversion plausible
          </text>
          <path d={fill('a')} className="lab-area lab-s1" />
          <path d={fill('b')} className="lab-area lab-s2" />
          <path d={curve('a')} className="lab-line lab-s1" />
          <path d={curve('b')} className="lab-line lab-s2" />
          {Number.isFinite(modeA) && (
            <text x={x(modeA)} y={y(betaPdf(modeA, aA, bA)) - 8} className="lab-annot" textAnchor="middle">
              A
            </text>
          )}
          {Number.isFinite(modeB) && (
            <text x={x(modeB)} y={y(betaPdf(modeB, aB, bB)) - 8} className="lab-annot" textAnchor="middle">
              B
            </text>
          )}
          {hv !== null && <line x1={x(hv)} x2={x(hv)} y1={0} y2={ih} className="lab-cross" pointerEvents="none" />}
          <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onMove} />
        </g>
      </svg>
      {hv !== null && (
        <Tip x={M.left + x(hv)} y={M.top + 10} width={width}>
          <strong>Taux {pct(hv, d + 1)}</strong>
          <span>Densité A {num(betaPdf(hv, aA, bA), 1)}</span>
          <span>Densité B {num(betaPdf(hv, aB, bB), 1)}</span>
        </Tip>
      )}
    </figure>
  );
}

/* ───────────── Différence de différences ───────────── */

export function DidChart({
  weeks,
  pre,
  control,
  treated,
  counterfactual,
}: {
  weeks: number[];
  pre: number;
  control: number[];
  treated: number[];
  counterfactual: (number | null)[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 520 ? 250 : 300;
  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const all = [...control, ...treated, ...counterfactual.filter((v): v is number => v !== null)];
  const yMin0 = Math.min(...all);
  const yMax0 = Math.max(...all);
  const padY = Math.max(1, (yMax0 - yMin0) * 0.12);
  const yt = ticks(yMin0 - padY, yMax0 + padY, 5);
  const yMin = Math.min(yMin0 - padY, yt[0] ?? 0);
  const yMax = Math.max(yMax0 + padY, yt[yt.length - 1] ?? 1);
  const x = lin(1, weeks.length, 0, iw);
  const y = lin(yMin, yMax, ih, 0);
  const T = weeks.length;
  const mkLine = (vals: (number | null)[]) =>
    d3line<number | null>()
      .defined((v) => v !== null)
      .x((_, i) => x(i + 1))
      .y((v) => y(v ?? 0))(vals) ?? '';
  const gapArea =
    d3area<number>()
      .x((i) => x(i + 1))
      .y0((i) => y(counterfactual[i] ?? treated[i]))
      .y1((i) => y(treated[i]))(Array.from({ length: T - pre + 1 }, (_, k) => pre - 1 + k)) ?? '';
  const xInt = x(pre + 0.5);
  const { hx, onMove, onLeave } = useHover();
  const hi = hx === null ? null : Math.max(0, Math.min(T - 1, Math.round(x.invert(hx)) - 1));
  return (
    <figure className="lab-chart" ref={ref}>
      <Legend
        items={[
          { label: 'Magasins témoins', className: 'lab-s1' },
          { label: 'Magasins traités', className: 'lab-s2' },
          { label: 'Traités sans la mesure (contrefactuel)', className: 'lab-s2', dashed: true },
        ]}
      />
      <svg width={width} height={height} role="img" aria-label="Ventes hebdomadaires moyennes des deux groupes, avant et après la mesure, avec le contrefactuel du groupe traité.">
        <g transform={`translate(${M.left},${M.top})`}>
          {yt.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={iw} className="lab-grid" />
              <text x={-8} dy="0.32em" className="lab-tick" textAnchor="end">
                {num(t, 0)}
              </text>
            </g>
          ))}
          {weeks.filter((w) => w === 1 || w % (width < 520 ? 5 : 2) === 0).map((w) => (
            <text key={w} x={x(w)} y={ih + 18} className="lab-tick" textAnchor="middle">
              S{w}
            </text>
          ))}
          <text x={iw} y={ih + 34} className="lab-axis-title" textAnchor="end">
            Semaine
          </text>
          <text x={-M.left + 2} y={-4} className="lab-axis-title">
            k€
          </text>
          <rect x={xInt} y={0} width={iw - xInt} height={ih} className="lab-after" />
          <line x1={xInt} x2={xInt} y1={0} y2={ih} className="lab-ref" />
          <text x={xInt + 6} y={12} className="lab-annot">
            Mesure
          </text>
          <path d={gapArea} className="lab-gap" />
          <path d={mkLine(control)} className="lab-line lab-s1" />
          <path d={mkLine(treated)} className="lab-line lab-s2" />
          <path d={mkLine(counterfactual)} className="lab-line lab-s2 lab-dashed" />
          {control.map((v, i) => (
            <circle key={`c${i}`} cx={x(i + 1)} cy={y(v)} r={2.6} className="lab-pt lab-s1" />
          ))}
          {treated.map((v, i) => (
            <circle key={`t${i}`} cx={x(i + 1)} cy={y(v)} r={2.6} className="lab-pt lab-s2" />
          ))}
          {hi !== null && <line x1={x(hi + 1)} x2={x(hi + 1)} y1={0} y2={ih} className="lab-cross" pointerEvents="none" />}
          <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onMove} />
        </g>
      </svg>
      {hi !== null && (
        <Tip x={M.left + x(hi + 1)} y={M.top + y(treated[hi])} width={width}>
          <strong>
            Semaine {hi + 1} · {hi < pre ? 'avant' : 'après'}
          </strong>
          <span>Témoins {num(control[hi], 1)} k€</span>
          <span>Traités {num(treated[hi], 1)} k€</span>
          {counterfactual[hi] !== null && hi >= pre && (
            <span>
              Contrefactuel {num(counterfactual[hi] ?? 0, 1)} k€ ({signed(treated[hi] - (counterfactual[hi] ?? 0), 1)})
            </span>
          )}
        </Tip>
      )}
    </figure>
  );
}

