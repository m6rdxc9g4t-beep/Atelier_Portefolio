import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { COHORT_HORIZON, monthLong, monthShort, type BreakdownRow, type CohortRow } from './model';
import { axisEuros, euros, int, pct, signedPct } from './format';

/* ───────────── Outils ───────────── */

/** Largeur réelle d'un conteneur : les graphiques sont dessinés en pixels, le texte n'est jamais étiré. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(220, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceStep(span: number, count: number) {
  const s0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(s0 || 1));
  const n = s0 / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

/* ───────────── Mini-courbe des cartes d'indicateurs ───────────── */

export const Sparkline = memo(function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const W = 120;
  const H = 30;
  const pts = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null && Number.isFinite(p.v));
  if (pts.length < 2) return <span className="tdb-spark tdb-spark-empty" aria-hidden="true" />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => 2 + (i / Math.max(1, values.length - 1)) * (W - 4);
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts[pts.length - 1]!;
  const area = `${d}L${x(last.i).toFixed(1)},${H}L${x(pts[0]!.i).toFixed(1)},${H}Z`;
  return (
    <svg className="tdb-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={area} className="tdb-spark-area" />
      <path d={d} className="tdb-spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

/* ───────────── CA mensuel, avec l'année précédente ───────────── */

interface MonthlyProps {
  months: number[];
  current: number[];
  previous: number[] | null;
  compact: boolean;
}

/** Barres du CA livré par mois ; trait : même mois un an plus tôt (périmètre identique). */
export const MonthlyChart = memo(function MonthlyChart({ months, current, previous, compact }: MonthlyProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = months.length;
  const height = compact ? 200 : 236;
  const M = { top: 12, right: 8, bottom: 26, left: compact ? 42 : 48 };
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const max = Math.max(1, ...current, ...(previous ?? [0]));
  const step = niceStep(max, compact ? 3 : 4);
  const yMax = Math.ceil(max / step) * step;
  const y = (v: number) => ih - (v / yMax) * ih;
  const band = iw / Math.max(1, n);
  const bw = Math.max(2, Math.min(38, band * 0.62));
  const cx = (i: number) => band * i + band / 2;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(iw / (compact ? 52 : 58))));
  const prevPath = previous
    ? previous.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
    : null;

  const pick = (e: ReactPointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * n);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
    else return;
    e.preventDefault();
  };
  const hi = hover ?? n - 1;
  const cur = current[hi] ?? 0;
  const prev = previous?.[hi] ?? null;

  return (
    <div className="tdb-monthly">
      <dl className="tdb-readout" aria-live="polite">
        <div>
          <dt>{months[hi] !== undefined ? monthLong(months[hi]!) : ''}</dt>
          <dd>{euros(cur)}</dd>
        </div>
        {previous && (
          <div>
            <dt>
              <span className="tdb-key tdb-key-prev" aria-hidden="true" />
              Un an plus tôt
            </dt>
            <dd>
              {prev === null ? '—' : euros(prev)}
              {prev ? <small> · {signedPct(cur / prev - 1)}</small> : null}
            </dd>
          </div>
        )}
      </dl>
      <div ref={wrapRef}>
        <svg
          className="tdb-svg"
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          onKeyDown={onKey}
          aria-label={`CA livré par mois, ${monthLong(months[0] ?? 0)} à ${monthLong(months[n - 1] ?? 0)}${previous ? ', comparé à l’année précédente' : ''}. Flèches gauche et droite pour lire chaque mois.`}
        >
          <g transform={`translate(${M.left},${M.top})`}>
            <g className="tdb-axis">
              {ticks.map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x1={0} x2={iw} />
                  <text x={-8} dy="0.32em" textAnchor="end">
                    {axisEuros(t)}
                  </text>
                </g>
              ))}
              {months.map((m, i) =>
                i % labelEvery === 0 ? (
                  <text key={m} x={cx(i)} y={ih + 17} textAnchor="middle">
                    {monthShort(m)}
                  </text>
                ) : null,
              )}
            </g>
            {current.map((v, i) => (
              <rect
                key={months[i]}
                className={`tdb-bar${i === hi ? ' is-hi' : ''}`}
                x={cx(i) - bw / 2}
                y={y(v)}
                width={bw}
                height={Math.max(0, ih - y(v))}
                rx={Math.min(3, bw / 4)}
              />
            ))}
            {prevPath && <path d={prevPath} className="tdb-line-prev" />}
            {previous?.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={i === hi ? 3.5 : 2} className="tdb-dot-prev" />)}
            <rect
              className="tdb-hit"
              x={0}
              y={0}
              width={iw}
              height={ih}
              onPointerMove={pick}
              onPointerDown={pick}
              onPointerLeave={() => setHover(null)}
            />
          </g>
        </svg>
      </div>
    </div>
  );
});

/* ───────────── Barres horizontales cliquables (répartitions) ───────────── */

interface BarListProps {
  rows: BreakdownRow[];
  selected: readonly string[];
  onToggle: (key: string) => void;
  /** Couleur de chaque valeur (palette catégorielle) ; sinon couleur de série unique. */
  colorOf?: (key: string) => string;
  label: string;
}

/** Une ligne par valeur : nom, barre proportionnelle au CA, montant et part. Clic = filtrer sur cette valeur. */
export function BarList({ rows, selected, onToggle, colorOf, label }: BarListProps) {
  const max = Math.max(1, ...rows.map((r) => r.ca));
  const anySel = selected.length > 0;
  return (
    <ul className="tdb-bars" aria-label={label}>
      {rows.map((r) => {
        const on = selected.includes(r.key);
        return (
          <li key={r.key}>
            <button
              type="button"
              className={`tdb-barrow${anySel && !on ? ' is-out' : ''}${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(r.key)}
              title={`${r.key} : ${euros(r.ca)} · ${pct(r.share)} du CA · ${int(r.commandes)} commandes. Cliquer pour ${on ? 'retirer ce filtre' : 'filtrer'}.`}
            >
              <span className="tdb-barrow-name">{r.key}</span>
              <span className="tdb-barrow-track" aria-hidden="true">
                <span className="tdb-barrow-fill" style={{ width: `${(r.ca / max) * 100}%`, background: colorOf?.(r.key) }} />
              </span>
              <span className="tdb-barrow-val">
                {euros(r.ca)}
                <small>{pct(r.share)}</small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────── Matrice de cohortes ───────────── */

export function CohortHeatmap({ rows }: { rows: CohortRow[] }) {
  const [focus, setFocus] = useState<{ r: number; k: number } | null>(null);
  if (!rows.length) return <p className="tdb-empty">Aucun nouveau client sur ce périmètre.</p>;
  const ks = Array.from({ length: COHORT_HORIZON }, (_, k) => k);
  // Intensité : on étire l'échelle sur les mois k ≥ 1 (k = 0 vaut toujours 100 %).
  const maxRate = Math.max(0.05, ...rows.flatMap((r) => r.rates.slice(1).filter((v): v is number => v !== null)));
  const cell = focus ? rows[focus.r] : null;
  const fc = cell && focus ? { rate: cell.rates[focus.k], count: cell.counts[focus.k] } : null;
  return (
    <div className="tdb-cohort">
      <p className="tdb-cohort-read" aria-live="polite">
        {cell && focus && fc?.rate != null ? (
          <>
            Cohorte de <b>{monthLong(cell.month)}</b> ({int(cell.size)} nouveaux clients) :{' '}
            {focus.k === 0 ? (
              'mois de la première commande'
            ) : (
              <>
                <b>{pct(fc.rate)}</b> ({int(fc.count ?? 0)}) ont de nouveau commandé {focus.k} mois après
              </>
            )}
          </>
        ) : (
          'Survolez une case pour lire la part exacte de clients revenus.'
        )}
      </p>
      <div
        className="tdb-cohort-scroll"
        tabIndex={0}
        aria-label="Matrice de cohortes : flèches pour parcourir les cases"
        onKeyDown={(e) => {
          const d: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
          const mv = d[e.key];
          if (!mv) return;
          e.preventDefault();
          setFocus((f) => {
            const cur = f ?? { r: 0, k: 0 };
            const r = Math.max(0, Math.min(rows.length - 1, cur.r + mv[0]));
            let k = Math.max(0, Math.min(COHORT_HORIZON - 1, cur.k + mv[1]));
            while (k > 0 && rows[r]!.rates[k] == null) k--;
            return { r, k };
          });
        }}
      >
        <table className="tdb-cohort-table">
          <caption className="tdb-sr">Part des nouveaux clients de chaque mois qui commandent à nouveau k mois plus tard</caption>
          <thead>
            <tr>
              <th scope="col">Cohorte</th>
              <th scope="col" className="tdb-num">
                Clients
              </th>
              {ks.map((k) => (
                <th key={k} scope="col" className="tdb-num">
                  {k === 0 ? 'M0' : `+${k}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.month}>
                <th scope="row">{monthShort(r.month)}</th>
                <td className="tdb-num tdb-cohort-size">{int(r.size)}</td>
                {ks.map((k) => {
                  const v = r.rates[k];
                  if (v === null || v === undefined) return <td key={k} className="tdb-cell is-na" aria-label="hors données" />;
                  const t = k === 0 ? 1 : Math.min(1, v / maxRate);
                  return (
                    <td
                      key={k}
                      className={`tdb-cell${k === 0 ? ' is-m0' : ''}${focus?.r === ri && focus.k === k ? ' is-focus' : ''}`}
                      style={{ ['--t' as string]: (0.08 + 0.92 * t).toFixed(3) }}
                      onPointerEnter={() => setFocus({ r: ri, k })}
                      onPointerLeave={() => setFocus(null)}
                      title={`${monthLong(r.month)}, ${k === 0 ? 'M0' : `+${k} mois`} : ${pct(v)} (${int(r.counts[k] ?? 0)} / ${int(r.size)})`}
                    >
                      {k === 0 ? '' : Math.round(v * 100)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
