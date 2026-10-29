import { useRef, useState, type ReactNode } from 'react';
import { area as d3area, curveMonotoneX, curveStepAfter, line as d3line } from 'd3-shape';
import './charts.css';

/* ───────────── Échelles ───────────── */

export interface Scale {
  (v: number): number;
  invert: (p: number) => number;
  domain: [number, number];
  range: [number, number];
}

export function scaleLinear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.invert = (p: number) => (k === 0 ? d0 : d0 + (p - r0) / k);
  f.domain = domain;
  f.range = range;
  return f;
}

/** Graduations « rondes » (1, 2, 5 × 10ⁿ). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/* ───────────── Courbes ───────────── */

export interface LineSeries {
  id: string;
  points: [number, number][];
  color: string;
  width?: number;
  dash?: string;
  step?: boolean;
  smooth?: boolean;
  area?: boolean;
  areaOpacity?: number;
  label?: string;
  dots?: boolean;
}

export interface LineChartProps {
  series: LineSeries[];
  xDomain: [number, number];
  yDomain: [number, number];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  xTicks?: number[];
  yTicks?: number[];
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  /** Position x du curseur contrôlé (ex. curseur de temps). */
  cursorX?: number | null;
  onHoverX?: (x: number | null) => void;
  vlines?: { x: number; label?: string; color?: string; dash?: string }[];
  hlines?: { y: number; label?: string; color?: string; dash?: string }[];
  markers?: { x: number; y: number; color?: string; r?: number; label?: string }[];
  className?: string;
  ariaLabel: string;
  children?: (s: { x: Scale; y: Scale }) => ReactNode;
}

export function LineChart({
  series,
  xDomain,
  yDomain,
  width = 720,
  height = 340,
  margin = { top: 16, right: 18, bottom: 42, left: 54 },
  xTicks,
  yTicks,
  xFormat = (v) => String(v),
  yFormat = (v) => String(v),
  xLabel,
  yLabel,
  cursorX,
  onHoverX,
  vlines = [],
  hlines = [],
  markers = [],
  className = '',
  ariaLabel,
  children,
}: LineChartProps) {
  const ref = useRef<SVGSVGElement>(null);
  const x = scaleLinear(xDomain, [margin.left, width - margin.right]);
  const y = scaleLinear(yDomain, [height - margin.bottom, margin.top]);
  const xt = xTicks ?? niceTicks(xDomain[0], xDomain[1], 6);
  const yt = yTicks ?? niceTicks(yDomain[0], yDomain[1], 5);

  const handleMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!onHoverX || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    const v = x.invert(px);
    onHoverX(Math.min(xDomain[1], Math.max(xDomain[0], v)));
  };

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} className={`chart ${className}`} role="img" aria-label={ariaLabel}>
      <g className="chart-grid">
        {yt.map((v) => (
          <line key={`gy${v}`} x1={margin.left} x2={width - margin.right} y1={y(v)} y2={y(v)} />
        ))}
      </g>
      <g className="chart-axis">
        <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        {xt.map((v) => (
          <text key={`tx${v}`} x={x(v)} y={height - margin.bottom + 18} textAnchor="middle">
            {xFormat(v)}
          </text>
        ))}
        {yt.map((v) => (
          <text key={`ty${v}`} x={margin.left - 8} y={y(v) + 4} textAnchor="end">
            {yFormat(v)}
          </text>
        ))}
        {xLabel && (
          <text className="chart-label" x={(margin.left + width - margin.right) / 2} y={height - 6} textAnchor="middle">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text className="chart-label" transform={`translate(14 ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`} textAnchor="middle">
            {yLabel}
          </text>
        )}
      </g>
      {hlines.map((h, i) => (
        <g key={`h${i}`} className="chart-ref">
          <line x1={margin.left} x2={width - margin.right} y1={y(h.y)} y2={y(h.y)} stroke={h.color} strokeDasharray={h.dash ?? '4 4'} />
          {h.label && (
            <text x={width - margin.right - 4} y={y(h.y) - 6} textAnchor="end" fill={h.color}>
              {h.label}
            </text>
          )}
        </g>
      ))}
      {vlines.map((v, i) => (
        <g key={`v${i}`} className="chart-ref">
          <line x1={x(v.x)} x2={x(v.x)} y1={margin.top} y2={height - margin.bottom} stroke={v.color} strokeDasharray={v.dash ?? '4 4'} />
          {v.label && (
            <text x={x(v.x) + 5} y={margin.top + 12} fill={v.color}>
              {v.label}
            </text>
          )}
        </g>
      ))}
      {series.map((s) => {
        const curve = s.step ? curveStepAfter : s.smooth ? curveMonotoneX : undefined;
        const lg = d3line<[number, number]>()
          .x((p) => x(p[0]))
          .y((p) => y(p[1]));
        const ag = d3area<[number, number]>()
          .x((p) => x(p[0]))
          .y0(y(Math.max(yDomain[0], 0)))
          .y1((p) => y(p[1]));
        if (curve) {
          lg.curve(curve);
          ag.curve(curve);
        }
        return (
          <g key={s.id}>
            {s.area && <path d={ag(s.points) ?? ''} fill={s.color} opacity={s.areaOpacity ?? 0.14} />}
            <path d={lg(s.points) ?? ''} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
            {s.dots && s.points.map((p, i) => <circle key={i} cx={x(p[0])} cy={y(p[1])} r={3.2} fill={s.color} />)}
          </g>
        );
      })}
      {children?.({ x, y })}
      {markers.map((m, i) => (
        <g key={`m${i}`} className="chart-marker">
          <circle cx={x(m.x)} cy={y(m.y)} r={m.r ?? 5} fill={m.color ?? 'currentColor'} />
          {m.label && (
            <text x={x(m.x) + 9} y={y(m.y) - 9} fill={m.color}>
              {m.label}
            </text>
          )}
        </g>
      ))}
      {cursorX !== undefined && cursorX !== null && (
        <line className="chart-cursor" x1={x(cursorX)} x2={x(cursorX)} y1={margin.top} y2={height - margin.bottom} />
      )}
      {onHoverX && (
        <rect
          x={margin.left}
          y={margin.top}
          width={width - margin.left - margin.right}
          height={height - margin.top - margin.bottom}
          fill="transparent"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerMove={handleMove}
          onPointerDown={handleMove}
          onPointerLeave={() => onHoverX(null)}
        />
      )}
    </svg>
  );
}

/* ───────────── Barres horizontales (HTML, faciles à styler par thème) ───────────── */

export interface BarDatum {
  label: string;
  value: number;
  display?: string;
  color?: string;
  note?: string;
}

export function HBars({
  data,
  max,
  format = (v) => v.toLocaleString('fr-FR'),
  className = '',
  highlight,
  onSelect,
}: {
  data: BarDatum[];
  max?: number;
  format?: (v: number) => string;
  className?: string;
  highlight?: string | null;
  onSelect?: (label: string) => void;
}) {
  const m = max ?? Math.max(...data.map((d) => Math.abs(d.value)), 1e-9);
  return (
    <ul className={`hbars ${className}`}>
      {data.map((d) => (
        <li
          key={d.label}
          className={highlight === d.label ? 'is-active' : ''}
          onMouseEnter={onSelect ? () => onSelect(d.label) : undefined}
          onFocus={onSelect ? () => onSelect(d.label) : undefined}
          tabIndex={onSelect ? 0 : undefined}
        >
          <span className="hbars-label">{d.label}</span>
          <span className="hbars-track">
            <span className="hbars-fill" style={{ width: `${(Math.abs(d.value) / m) * 100}%`, background: d.color }} />
          </span>
          <span className="hbars-value">{d.display ?? format(d.value)}</span>
          {d.note && <span className="hbars-note">{d.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Barres verticales (SVG) ───────────── */

export function VBars({
  data,
  width = 720,
  height = 300,
  margin = { top: 18, right: 12, bottom: 48, left: 52 },
  yMax,
  yFormat = (v) => v.toLocaleString('fr-FR'),
  showValues = true,
  ariaLabel,
  className = '',
  rotateLabels = false,
}: {
  data: BarDatum[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  yMax?: number;
  yFormat?: (v: number) => string;
  showValues?: boolean;
  ariaLabel: string;
  className?: string;
  rotateLabels?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = yMax ?? Math.max(...data.map((d) => d.value)) * 1.08;
  const y = scaleLinear([0, max], [height - margin.bottom, margin.top]);
  const band = (width - margin.left - margin.right) / data.length;
  const bw = Math.max(4, band * 0.68);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`chart ${className}`} role="img" aria-label={ariaLabel}>
      <g className="chart-grid">
        {niceTicks(0, max, 4).map((v) => (
          <line key={v} x1={margin.left} x2={width - margin.right} y1={y(v)} y2={y(v)} />
        ))}
      </g>
      <g className="chart-axis">
        {niceTicks(0, max, 4).map((v) => (
          <text key={v} x={margin.left - 8} y={y(v) + 4} textAnchor="end">
            {yFormat(v)}
          </text>
        ))}
      </g>
      {data.map((d, i) => {
        const cx = margin.left + band * i + band / 2;
        return (
          <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="vbar">
            <rect x={cx - bw / 2} y={y(d.value)} width={bw} height={y(0) - y(d.value)} fill={d.color ?? 'currentColor'} rx={2} opacity={hover === null || hover === i ? 1 : 0.45} />
            {showValues && (hover === i || data.length <= 12) && (
              <text className="vbar-value" x={cx} y={y(d.value) - 6} textAnchor="middle">
                {d.display ?? yFormat(d.value)}
              </text>
            )}
            <text
              className="vbar-label"
              x={cx}
              y={height - margin.bottom + 16}
              textAnchor={rotateLabels ? 'end' : 'middle'}
              transform={rotateLabels ? `rotate(-35 ${cx} ${height - margin.bottom + 16})` : undefined}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
