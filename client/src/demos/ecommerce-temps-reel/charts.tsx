import { memo, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { area as d3area, line as d3line } from 'd3-shape';
import {
  BASKET,
  HISTORY_MIN,
  INCIDENTS,
  compoundPoissonBand,
  cumulative,
  expectedOrdersCum,
  landing,
  type MonitorDef,
  type MonitorState,
  type SimState,
} from './model';
import { dayName, hhmm, keuros, sigma } from './format';

/* ───────────── Outils ───────────── */

/** Largeur réelle d'un conteneur (les graphiques sont dessinés en pixels, le texte n'est jamais étiré). */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

function niceStep(span: number, count: number) {
  const s0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(s0));
  const n = s0 / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

/* ───────────── CA cumulé vs attendu ───────────── */

interface Readout {
  minute: number;
  today: number | null;
  expected: { mean: number; lo: number; hi: number };
  yesterday: number | null;
  projection: { mean: number; lo: number; hi: number } | null;
}

/** Courbe du CA cumulé du jour, attendu a priori (bande à 95 %), veille, et projection jusqu'à minuit. */
export const RevenuePanel = memo(function RevenuePanel({ sim, compact }: { sim: SimState; compact: boolean }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const day = sim.today.day;
  const now = sim.today.revenue.length;
  const expCum = useMemo(() => expectedOrdersCum(day), [day]);
  const cumToday = useMemo(() => cumulative(sim.today.revenue), [sim.today.revenue]);
  const cumYest = useMemo(() => (sim.yesterday ? cumulative(sim.yesterday.revenue) : null), [sim.yesterday]);

  const observed = cumToday[now]!;
  const land = landing(observed, expCum, now);
  const prior = (m: number) => compoundPoissonBand(expCum[m]!);
  const proj = (m: number) => {
    const b = compoundPoissonBand(expCum[m]! - expCum[now]!, BASKET);
    return { mean: observed + b.mean, lo: observed + b.mean - 1.96 * b.sd, hi: observed + b.hi };
  };

  const height = compact ? 196 : 244;
  const M = { top: 10, right: 12, bottom: 24, left: compact ? 44 : 52 };
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const yMax = Math.max(prior(1440).hi, land.hi, cumYest ? cumYest[1440] ?? 0 : 0) * 1.04;
  const x = lin(0, 1440, 0, iw);
  const y = lin(0, yMax, ih, 0);
  const step = niceStep(yMax, compact ? 3 : 4);
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += step) yTicks.push(v);
  const xTicks = compact ? [0, 360, 720, 1080, 1440] : [0, 180, 360, 540, 720, 900, 1080, 1260, 1440];

  const grid = (from: number, to: number, by = 10) => {
    const out: number[] = [];
    for (let m = from; m < to; m += by) out.push(m);
    out.push(to);
    return out;
  };
  const priorMinutes = grid(0, 1440);
  const bandPath =
    d3area<number>()
      .x((m) => x(m))
      .y0((m) => y(prior(m).lo))
      .y1((m) => y(prior(m).hi))(priorMinutes) ?? '';
  const meanPath = d3line<number>().x((m) => x(m)).y((m) => y(prior(m).mean))(priorMinutes) ?? '';
  const todayPath = d3line<number>().x((m) => x(m)).y((m) => y(cumToday[m]!))(grid(0, now, 2)) ?? '';
  const yestPath = cumYest ? d3line<number>().x((m) => x(m)).y((m) => y(cumYest[m]!))(grid(0, 1440, 5)) ?? '' : '';
  const projMinutes = now < 1440 ? grid(now, 1440) : [];
  const projBand = projMinutes.length
    ? d3area<number>()
        .x((m) => x(m))
        .y0((m) => y(proj(m).lo))
        .y1((m) => y(proj(m).hi))(projMinutes) ?? ''
    : '';
  const projPath = projMinutes.length ? d3line<number>().x((m) => x(m)).y((m) => y(proj(m).mean))(projMinutes) ?? '' : '';

  const dayStart = day * 1440;
  const incidents = sim.incidents
    .filter((i) => i.end > dayStart && i.start < dayStart + 1440)
    .map((i) => ({ ...i, a: Math.max(0, i.start - dayStart), b: Math.min(now, i.end - dayStart) }))
    .filter((i) => i.b > i.a);

  const at = hover ?? now;
  const readout: Readout = {
    minute: at,
    today: at <= now ? cumToday[at]! : null,
    expected: prior(at),
    yesterday: cumYest ? cumYest[at]! : null,
    projection: at > now ? proj(at) : null,
  };

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const m = Math.round(((e.clientX - box.left) / box.width) * 1440);
    setHover(Math.max(0, Math.min(1440, m)));
  };

  const priorNow = prior(now);
  const zNow = priorNow.sd > 0 ? (observed - priorNow.mean) / priorNow.sd : 0;
  const summary = `CA cumulé à ${hhmm(now)} : ${keuros(observed)}, attendu ${keuros(priorNow.mean)} (bande à 95 % de ${keuros(priorNow.lo)} à ${keuros(priorNow.hi)}). Atterrissage prévu à minuit : ${keuros(land.mean)}.`;

  return (
    <div className="ecr-rev" ref={wrapRef}>
      <dl className="ecr-readout" aria-hidden="true">
        <div>
          <dt>{hover === null ? `Maintenant, ${hhmm(now)}` : `${dayName(dayStart)} ${hhmm(at)}`}</dt>
        </div>
        <div>
          <dt>
            <i className="ecr-key ecr-key-today" /> Aujourd’hui
          </dt>
          <dd>{readout.today === null ? '—' : keuros(readout.today)}</dd>
        </div>
        <div>
          <dt>
            <i className="ecr-key ecr-key-exp" /> Attendu
          </dt>
          <dd>
            {keuros(readout.expected.mean)}
            <small>
              {' '}
              {keuros(readout.expected.lo)} à {keuros(readout.expected.hi)}
            </small>
          </dd>
        </div>
        <div>
          <dt>
            <i className="ecr-key ecr-key-yest" /> Hier
          </dt>
          <dd>{readout.yesterday === null ? '—' : keuros(readout.yesterday)}</dd>
        </div>
        {readout.projection && (
          <div>
            <dt>
              <i className="ecr-key ecr-key-proj" /> Projection
            </dt>
            <dd>
              {keuros(readout.projection.mean)}
              <small>
                {' '}
                {keuros(readout.projection.lo)} à {keuros(readout.projection.hi)}
              </small>
            </dd>
          </div>
        )}
      </dl>
      <svg className="ecr-svg" width={width} height={height} role="img" aria-label={summary}>
        <defs>
          <clipPath id={`${clipId}-c`}>
            <rect x={0} y={-2} width={iw} height={ih + 4} />
          </clipPath>
        </defs>
        <g transform={`translate(${M.left},${M.top})`}>
          <g className="ecr-axis">
            {yTicks.map((v) => (
              <g key={v} transform={`translate(0,${y(v)})`}>
                <line x1={0} x2={iw} />
                <text x={-8} dy="0.32em" textAnchor="end">
                  {v === 0 ? '0' : keuros(v).replace(',0', '')}
                </text>
              </g>
            ))}
            {xTicks.map((m) => (
              <text key={m} x={x(m)} y={ih + 17} textAnchor={m === 0 ? 'start' : m === 1440 ? 'end' : 'middle'}>
                {m === 1440 ? '24 h' : `${m / 60} h`}
              </text>
            ))}
          </g>
          <g clipPath={`url(#${clipId}-c)`}>
            {incidents.map((i) => (
              <rect key={i.id} className="ecr-incident-span" x={x(i.a)} y={0} width={Math.max(1, x(i.b) - x(i.a))} height={ih} />
            ))}
            <path className="ecr-band" d={bandPath} />
            <path className="ecr-line-exp" d={meanPath} />
            {yestPath && <path className="ecr-line-yest" d={yestPath} />}
            {projBand && <path className="ecr-proj-band" d={projBand} />}
            {projPath && <path className="ecr-line-proj" d={projPath} />}
            <path className="ecr-line-today" d={todayPath} />
          </g>
          <line className="ecr-now" x1={x(now)} x2={x(now)} y1={0} y2={ih} />
          <circle className="ecr-now-dot" cx={x(now)} cy={y(observed)} r={3} />
          {hover !== null && <line className="ecr-cursor" x1={x(hover)} x2={x(hover)} y1={0} y2={ih} />}
          <rect
            className="ecr-hit"
            x={0}
            y={0}
            width={iw}
            height={ih}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </g>
      </svg>
      <p className="ecr-rev-foot">
        <span>
          Atterrissage prévu à minuit : <b>{keuros(land.mean)}</b>{' '}
          <span className="ecr-muted">
            ({keuros(land.lo)} à {keuros(land.hi)}, 95 %)
          </span>
        </span>
        <span className={Math.abs(zNow) > 1.96 ? (zNow < 0 ? 'ecr-tone-down' : 'ecr-tone-warn') : 'ecr-muted'}>
          {Math.abs(zNow) > 1.96
            ? `${zNow < 0 ? 'Sous' : 'Au-dessus de'} la bande attendue (${sigma(zNow)})`
            : `Dans la bande attendue (${sigma(zNow)})`}
        </span>
      </p>
    </div>
  );
});

/* ───────────── Carte de contrôle d'un indicateur ───────────── */

/** Statistique Z de l'indicateur sur les trois dernières heures simulées, avec ses limites ±L. */
export const ControlChart = memo(function ControlChart({
  def,
  state,
  L,
  sim,
  width,
  axis,
}: {
  def: MonitorDef;
  state: MonitorState;
  L: number;
  sim: SimState;
  width: number;
  axis: boolean;
}) {
  const clipId = useId();
  const height = axis ? 70 : 52;
  const ih = 50;
  const end = sim.minute - 1;
  const start = end - HISTORY_MIN + 1;
  const YMAX = 6;
  const x = lin(start, end, 0, width);
  const y = lin(-YMAX, YMAX, ih - 2, 2);
  const clampZ = (z: number) => Math.max(-YMAX, Math.min(YMAX, z));
  const active = state.history.filter((p) => p.t >= start);
  const linePath =
    d3line<(typeof active)[number]>()
      .defined((p) => p.active)
      .x((p) => x(p.t))
      .y((p) => y(clampZ(p.z)))(active) ?? '';
  const idlePath =
    d3line<(typeof active)[number]>()
      .defined((p) => !p.active)
      .x((p) => x(p.t))
      .y(() => y(0))(active) ?? '';
  const both = def.sides === 'both';
  const upY = y(L);
  const downY = y(-L);
  const incidents = sim.incidents
    .filter((i) => i.end > start && i.start <= end)
    .map((i) => ({ id: i.id, a: x(Math.max(start, i.start)), b: x(Math.min(end, i.end)) }));
  const ticks: number[] = [];
  for (let t = Math.ceil(start / 60) * 60; t <= end; t += 60) ticks.push(t);

  return (
    <svg className="ecr-svg ecr-cc" width={width} height={height} aria-hidden="true">
      <defs>
        <clipPath id={`${clipId}-down`}>
          <rect x={-2} y={downY} width={width + 4} height={ih - downY + 2} />
        </clipPath>
        <clipPath id={`${clipId}-up`}>
          <rect x={-2} y={-2} width={width + 4} height={upY + 2} />
        </clipPath>
      </defs>
      {incidents.map((i) => (
        <rect key={i.id} className="ecr-incident-span" x={i.a} y={0} width={Math.max(1, i.b - i.a)} height={ih} />
      ))}
      <line className="ecr-cc-zero" x1={0} x2={width} y1={y(0)} y2={y(0)} />
      {both && <line className="ecr-cc-limit" x1={0} x2={width} y1={upY} y2={upY} />}
      <line className="ecr-cc-limit" x1={0} x2={width} y1={downY} y2={downY} />
      {idlePath && <path className="ecr-cc-idle" d={idlePath} />}
      <path className="ecr-cc-line" d={linePath} />
      <path className="ecr-cc-line ecr-cc-line-down" d={linePath} clipPath={`url(#${clipId}-down)`} />
      {both && <path className="ecr-cc-line ecr-cc-line-up" d={linePath} clipPath={`url(#${clipId}-up)`} />}
      {axis && (
        <g className="ecr-axis">
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={ih + 15} textAnchor={x(t) < 18 ? 'start' : x(t) > width - 18 ? 'end' : 'middle'}>
              {hhmm(t)}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
});

/** Libellés des incidents, pour la légende des zones grisées. */
export const INCIDENT_LABELS = Object.fromEntries(INCIDENTS.map((d) => [d.kind, d.label]));
