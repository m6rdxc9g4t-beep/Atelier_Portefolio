import { useMemo, useState } from 'react';
import { MIN_VENTES, fmtInt, fmtM2, niceTicks, resumeOf, type Commune, type DepartementData } from './model';
import { useWidth } from './hooks';

const SERIES = [
  { t: 'M' as const, label: 'Maisons', cls: 'oi-s-m' },
  { t: 'A' as const, label: 'Appartements', cls: 'oi-s-a' },
];

/** Légende partagée des deux séries (maisons, appartements). */
export function SeriesLegend() {
  return (
    <ul className="oi-series-legend">
      {SERIES.map((s) => (
        <li key={s.t}>
          <span className={`oi-key ${s.cls}`} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Évolution annuelle du prix médian au m² (maisons, appartements), avec l'intervalle interquartile en bande.
 * Les années de moins de MIN_VENTES ventes ne sont pas tracées.
 */
export function TrendChart({ commune, annees, annee }: { commune: Commune; annees: number[]; annee: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const [hover, setHover] = useState<number | null>(null);
  const H = 200;
  const m = { l: 52, r: 14, t: 12, b: 26 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;

  const series = useMemo(
    () =>
      SERIES.map((s) => ({
        ...s,
        pts: annees
          .map((a) => ({ a, r: resumeOf(commune.s, a, s.t) }))
          .filter((p): p is { a: number; r: [number, number, number, number] } => !!p.r && p.r[0] >= MIN_VENTES),
      })),
    [commune, annees],
  );
  const all = series.flatMap((s) => s.pts.flatMap((p) => [p.r[1], p.r[3]]));
  const ticks = all.length ? niceTicks(Math.min(...all), Math.max(...all), 4) : [0, 1000];
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const X = (a: number) => m.l + (annees.length > 1 ? ((a - annees[0]) / (annees[annees.length - 1] - annees[0])) * iw : iw / 2);
  const Y = (v: number) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const empty = series.every((s) => !s.pts.length);

  return (
    <div className="oi-chart" ref={ref}>
      {empty ? (
        <p className="oi-empty-note">Moins de {MIN_VENTES} ventes chaque année : pas d’évolution publiable pour cette commune.</p>
      ) : (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Prix médian au m² par année à ${commune.n}, maisons et appartements`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={Y(t)} y2={Y(t)} className="oi-gridline" />
              <text x={m.l - 8} y={Y(t) + 4} className="oi-axis" textAnchor="end">
                {fmtInt(t)}
              </text>
            </g>
          ))}
          {annees.map((a) => (
            <text key={a} x={X(a)} y={H - 6} className={`oi-axis ${a === annee ? 'oi-axis-strong' : ''}`} textAnchor="middle">
              {a}
            </text>
          ))}
          {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={m.t} y2={m.t + ih} className="oi-crosshair" />}
          {series.map((s) => (
            <g key={s.t} className={s.cls}>
              {s.pts.length > 1 && (
                <path
                  className="oi-band"
                  d={`M${s.pts.map((p) => `${X(p.a)},${Y(p.r[3])}`).join('L')}L${[...s.pts]
                    .reverse()
                    .map((p) => `${X(p.a)},${Y(p.r[1])}`)
                    .join('L')}Z`}
                />
              )}
              {s.pts.length > 1 && <path className="oi-line" d={`M${s.pts.map((p) => `${X(p.a)},${Y(p.r[2])}`).join('L')}`} />}
              {s.pts.map((p) => (
                <circle key={p.a} className="oi-mark" cx={X(p.a)} cy={Y(p.r[2])} r={p.a === annee || p.a === hover ? 4.5 : 3} />
              ))}
            </g>
          ))}
          {annees.map((a) => {
            const w = annees.length > 1 ? iw / (annees.length - 1) : iw;
            return (
              <rect
                key={a}
                x={X(a) - w / 2}
                y={m.t}
                width={w}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(a)}
                onClick={() => setHover(a)}
              />
            );
          })}
        </svg>
      )}
      {hover !== null && !empty && (
        <div
          className="oi-tip"
          style={{
            left: X(hover) > width - 210 ? undefined : X(hover) + 12,
            right: X(hover) > width - 210 ? width - X(hover) + 12 : undefined,
            top: 4,
          }}
          aria-hidden="true"
        >
          <strong>{hover}</strong>
          {series.map((s) => {
            const r = resumeOf(commune.s, hover, s.t);
            return (
              <span key={s.t} className="oi-tip-block">
                <span className="oi-tip-row">
                  <span>
                    <span className={`oi-key ${s.cls}`} /> {s.label}
                  </span>
                  <b>{r && r[0] >= MIN_VENTES ? fmtM2(r[2]) : '—'}</b>
                </span>
                {r && r[0] >= MIN_VENTES && (
                  <span className="oi-tip-sub">
                    {fmtInt(r[1])} à {fmtInt(r[3])} · {fmtInt(r[0])} ventes
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Distribution du prix au m² sur toute la période (classes de 250 €), maisons et appartements empilés. */
export function Histogram({ commune, dep, mediane }: { commune: Commune; dep: DepartementData; mediane: number | null }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const [hover, setHover] = useState<number | null>(null);
  const { largeur, max } = dep.histogramme;
  const hm = commune.h.M ?? [];
  const ha = commune.h.A ?? [];
  const nb = Math.max(hm.length, ha.length, 1);
  const H = 160;
  const m = { l: 36, r: 10, t: 10, b: 26 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const totals = Array.from({ length: nb }, (_, i) => (hm[i] ?? 0) + (ha[i] ?? 0));
  const yTicks = niceTicks(0, Math.max(1, ...totals), 3);
  const yMax = yTicks[yTicks.length - 1];
  const bw = iw / nb;
  const Y = (v: number) => (v / yMax) * ih;
  const xTicks = niceTicks(0, nb * largeur, width < 380 ? 3 : 5).filter((v) => v <= nb * largeur);
  const label = (i: number) =>
    i * largeur >= max ? `${fmtInt(max)} €/m² et plus` : `${fmtInt(i * largeur)} à ${fmtInt((i + 1) * largeur)} €/m²`;
  const total = totals.reduce((s, v) => s + v, 0);

  return (
    <div className="oi-chart" ref={ref}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Distribution des prix au m² à ${commune.n}, ${fmtInt(total)} ventes`}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={m.t + ih - Y(t)} y2={m.t + ih - Y(t)} className="oi-gridline" />
            <text x={m.l - 6} y={m.t + ih - Y(t) + 4} className="oi-axis" textAnchor="end">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        {totals.map((_, i) => {
          const x = m.l + i * bw + 0.5;
          const w = Math.max(1, bw - 1);
          const vm = hm[i] ?? 0;
          const va = ha[i] ?? 0;
          return (
            <g key={i} className={hover === i ? 'oi-bar-hover' : undefined}>
              {vm > 0 && <rect className="oi-s-m oi-bar" x={x} width={w} y={m.t + ih - Y(vm)} height={Y(vm)} />}
              {va > 0 && (
                <rect
                  className="oi-s-a oi-bar"
                  x={x}
                  width={w}
                  y={m.t + ih - Y(vm) - Y(va)}
                  height={Math.max(0, Y(va) - (vm > 0 ? 1 : 0))}
                />
              )}
              <rect
                x={m.l + i * bw}
                width={bw}
                y={m.t}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          );
        })}
        {mediane !== null && (
          <g className="oi-median-rule" aria-hidden="true">
            <line x1={m.l + (mediane / largeur) * bw} x2={m.l + (mediane / largeur) * bw} y1={m.t - 2} y2={m.t + ih} />
          </g>
        )}
        {xTicks.map((t) => (
          <text key={t} x={m.l + (t / largeur) * bw} y={H - 6} className="oi-axis" textAnchor="middle">
            {fmtInt(t)}
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="oi-tip"
          style={{
            left: m.l + hover * bw > width - 200 ? undefined : m.l + (hover + 1) * bw + 8,
            right: m.l + hover * bw > width - 200 ? width - m.l - hover * bw + 8 : undefined,
            top: 4,
          }}
          aria-hidden="true"
        >
          <strong>{label(hover)}</strong>
          <span className="oi-tip-row">
            <span>
              <span className="oi-key oi-s-m" /> Maisons
            </span>
            <b>{fmtInt(hm[hover] ?? 0)}</b>
          </span>
          <span className="oi-tip-row">
            <span>
              <span className="oi-key oi-s-a" /> Appartements
            </span>
            <b>{fmtInt(ha[hover] ?? 0)}</b>
          </span>
        </div>
      )}
    </div>
  );
}
