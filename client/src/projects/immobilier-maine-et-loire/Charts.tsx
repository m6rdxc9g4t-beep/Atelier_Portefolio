import { useEffect, useState } from 'react';
import { fmt } from '@atelier/shared';

/** Vrai sous `max` px de large : les graphiques SVG passent à une géométrie « mobile » (texte à taille lisible). */
export function useNarrow(max = 640) {
  const query = `(max-width: ${max}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return narrow;
}

const nb = (t: string) => t.replace(/ /g, ' ');

/* ═══════════ Anneaux autour d'Angers : intensité des transactions selon la distance ═══════════ */
export function DistanceRings({ x, y }: { x: number[]; y: number[] }) {
  const max = Math.max(...y);
  const R = 150;
  const r = (km: number) => (km / 20) * R;
  const [hover, setHover] = useState<number | null>(null);
  const cur = hover === null ? null : { km: x[hover], v: y[hover] };
  return (
    <figure className="ml-rings">
      <svg viewBox="-170 -170 340 340" role="img" aria-label="Nombre de transactions par commune selon la distance à Angers">
        {x.map((km, i) => {
          const inner = i === 0 ? km - (x[1] - km) / 2 : (x[i - 1] + km) / 2;
          const outer = i === x.length - 1 ? km : (km + x[i + 1]) / 2;
          return (
            <circle
              key={km}
              r={(r(inner) + r(outer)) / 2}
              strokeWidth={Math.max(0.5, r(outer) - r(inner))}
              className={`ring ${hover === i ? 'is-on' : ''}`}
              style={{ opacity: 0.08 + 0.85 * (y[i] / max) }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {[5, 10, 15, 20].map((km) => (
          <g key={km} className="grid">
            <circle r={r(km)} />
            <text x={4} y={-r(km) - 4}>
              {km} km
            </text>
          </g>
        ))}
        <circle r={7} className="core" />
        <text y={24} textAnchor="middle" className="core-t">
          Angers
        </text>
        <text y={38} textAnchor="middle" className="core-s">
          {nb(fmt(14431))} transactions
        </text>
      </svg>
      <figcaption aria-live="polite">
        {cur ? (
          <>
            à ≈ <b>{fmt(cur.km, 1)} km</b> : ≈ <b>{nb(fmt(cur.v))}</b> transactions par commune
          </>
        ) : (
          <>Intensité : transactions par commune selon la distance moyenne à Angers (courbe lissée du rapport, ≈). Survolez les anneaux.</>
        )}
      </figcaption>
    </figure>
  );
}

const ABBR: Record<string, string> = {
  Janvier: 'janv.',
  Février: 'févr.',
  Mars: 'mars',
  Avril: 'avr.',
  Mai: 'mai',
  Juin: 'juin',
  Juillet: 'juil.',
  Août: 'août',
  Septembre: 'sept.',
  Octobre: 'oct.',
  Novembre: 'nov.',
  Décembre: 'déc.',
};

/* ═══════════ Calendrier radial : saisonnalité (indice base 100) ═══════════ */
export function MonthClock({ months, index }: { months: string[]; index: number[] }) {
  const [hover, setHover] = useState<number | null>(6);
  const R0 = 46;
  const scale = (v: number) => R0 + (v / 150) * 104;
  const n = months.length;
  const arc = (i: number, rad: number) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.03;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - 0.03;
    const p = (a: number, rr: number) => `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
    return `M${p(a0, R0)} L${p(a0, rad)} A${rad},${rad} 0 0 1 ${p(a1, rad)} L${p(a1, R0)} A${R0},${R0} 0 0 0 ${p(a0, R0)} Z`;
  };
  return (
    <figure className="ml-clock">
      <svg viewBox="-170 -170 340 340" role="img" aria-label="Saisonnalité mensuelle des transactions, indice base 100">
        <circle r={scale(100)} className="base" />
        {months.map((m, i) => (
          <g key={m} onMouseEnter={() => setHover(i)} className={`${hover === i ? 'is-on' : ''} ${index[i] >= 110 ? 'hi' : index[i] <= 85 ? 'lo' : ''}`}>
            <path d={arc(i, scale(index[i]))} />
            <text
              x={Math.cos(((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2) * 160}
              y={Math.sin(((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2) * 160 + 4}
              textAnchor="middle"
              className="m"
            >
              {ABBR[m] ?? m.slice(0, 4)}
            </text>
          </g>
        ))}
        <text y={-4} textAnchor="middle" className="c1">
          {hover !== null ? months[hover] : ''}
        </text>
        <text y={18} textAnchor="middle" className="c2">
          {hover !== null ? `indice ${index[hover]}` : ''}
        </text>
      </svg>
      <figcaption>Cercle pointillé : moyenne des 12 mois (indice 100). Moyennes mensuelles 2014–2017, lues sur le graphique du rapport.</figcaption>
    </figure>
  );
}

/* ═══════════ Barres groupées simples ═══════════ */
export function GroupedBars({
  labels,
  series,
  yMax,
  format = (v) => nb(fmt(v)),
  ariaLabel,
  hatch,
}: {
  labels: string[];
  series: { name: string; values: number[]; cls: string }[];
  yMax: number;
  format?: (v: number) => string;
  ariaLabel: string;
  hatch?: (i: number) => boolean;
}) {
  const narrow = useNarrow();
  const W = narrow ? 340 : 640;
  const H = narrow ? 240 : 280;
  const m = narrow ? { l: 50, r: 4, t: 22, b: 30 } : { l: 56, r: 10, t: 22, b: 34 };
  const band = (W - m.l - m.r) / labels.length;
  const bw = Math.min(46, (band * (narrow ? 0.82 : 0.72)) / series.length);
  const y = (v: number) => H - m.b - (v / yMax) * (H - m.t - m.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * yMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`ml-gbars ${narrow ? 'is-narrow' : ''}`} role="img" aria-label={ariaLabel}>
      <defs>
        <pattern id="ml-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="hb" />
          <line x1="0" y1="0" x2="0" y2="6" className="hl" />
        </pattern>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
            {format(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) => {
        const cx = m.l + band * i + band / 2;
        const x0 = cx - (bw * series.length) / 2;
        return (
          <g key={l}>
            {series.map((s, k) => (
              <g key={s.name}>
                <rect x={x0 + k * bw + 2} y={y(s.values[i])} width={bw - 4} height={y(0) - y(s.values[i])} rx={3} className={`${s.cls} ${hatch?.(i) ? 'hatched' : ''}`} fill={hatch?.(i) ? 'url(#ml-hatch)' : undefined}>
                  <title>{`${l} — ${s.name} : ${format(s.values[i])}`}</title>
                </rect>
                <text x={x0 + k * bw + bw / 2} y={y(s.values[i]) - 6} textAnchor="middle" className="val">
                  {format(s.values[i])}
                </text>
              </g>
            ))}
            <text x={cx} y={H - (narrow ? 9 : 12)} textAnchor="middle" className="lab">
              {l}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
