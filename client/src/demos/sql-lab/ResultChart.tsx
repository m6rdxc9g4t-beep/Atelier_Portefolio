import type { QueryResult } from './challenges';
import { isMoneyColumn } from './challenges';

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Choisit une colonne d'étiquettes (texte) et une colonne de valeurs (nombre) ; null si le résultat ne se prête pas à un graphique. */
export function chartSpec(r: Pick<QueryResult, 'columns' | 'rows'>) {
  const n = r.rows.length;
  if (n < 2 || n > 40) return null;
  const numeric = r.columns.map((_, i) => r.rows.every((row) => row[i] === null || typeof row[i] === 'number'));
  const li = numeric.findIndex((isNum) => !isNum);
  let vi = -1;
  for (let i = r.columns.length - 1; i >= 0; i--) {
    if (numeric[i] && !/(^id$|_id$|rang|pct)/i.test(r.columns[i]!)) {
      vi = i;
      if (isMoneyColumn(r.columns[i]!)) break;
    }
  }
  if (li < 0 || vi < 0) return null;
  const labels = r.rows.map((row) => String(row[li]));
  const values = r.rows.map((row) => (typeof row[vi] === 'number' ? (row[vi] as number) : 0));
  if (values.some((v) => v < 0)) return null;
  return { labels, values, labelCol: r.columns[li]!, valueCol: r.columns[vi]!, money: isMoneyColumn(r.columns[vi]!), time: labels.every((l) => /^\d{4}-\d{2}/.test(l)) };
}

/** Graphique tracé automatiquement : courbe pour une série de mois, barres horizontales sinon. */
export function ResultChart({ result }: { result: Pick<QueryResult, 'columns' | 'rows'> }) {
  const spec = chartSpec(result);
  if (!spec) return null;
  const { labels, values, money } = spec;
  const fmt = (v: number) => `${compact.format(v)}${money ? ' €' : ''}`;
  const max = niceMax(Math.max(...values));
  const n = values.length;
  const caption = `${spec.valueCol} par ${spec.labelCol}`;

  if (spec.time) {
    const W = 720, H = 240, L = 56, R = 72, T = 14, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const x = (i: number) => L + (i * iw) / (n - 1);
    const y = (v: number) => T + ih - (v / max) * ih;
    const step = Math.ceil(n / 8);
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const lx = x(n - 1), ly = y(values[n - 1]!);
    return (
      <figure className="sl-chart">
        <figcaption>{caption}, tracé automatiquement</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Courbe de ${caption}`}>
          {[0, 1, 2, 3, 4].map((k) => {
            const gv = (max * k) / 4, gy = y(gv);
            return (
              <g key={k}>
                <line x1={L} x2={W - R} y1={gy} y2={gy} className="sl-grid" />
                <text x={L - 8} y={gy + 4} textAnchor="end" className="sl-axis">{fmt(gv)}</text>
              </g>
            );
          })}
          <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} className="sl-area" />
          <polyline points={pts} className="sl-line" />
          {values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={7} className="sl-hit">
              <title>{`${labels[i]} : ${full.format(v)}${money ? ' €' : ''}`}</title>
            </circle>
          ))}
          <circle cx={lx} cy={ly} r={4.5} className="sl-dot" />
          <text x={lx + 8} y={ly + 4} className="sl-endlabel">{fmt(values[n - 1]!)}</text>
          {labels.map((l, i) =>
            i % step === 0 || (i === n - 1 && (n - 1) % step >= step / 2) ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="sl-axis">{l.slice(0, 7)}</text>
            ) : null,
          )}
        </svg>
      </figure>
    );
  }

  const W = 720, rowH = 26, T = 6, L = 200, R = 84;
  const iw = W - L - R, H = T + n * rowH + 6;
  return (
    <figure className="sl-chart">
      <figcaption>{caption}, tracé automatiquement</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Barres de ${caption}`}>
        <line x1={L} x2={L} y1={T} y2={H - 6} className="sl-grid" />
        {values.map((v, i) => {
          const yy = T + i * rowH;
          const w = Math.max(1, (v / max) * iw);
          const lab = labels[i]!.length > 27 ? `${labels[i]!.slice(0, 26)}…` : labels[i]!;
          return (
            <g key={i}>
              <text x={L - 10} y={yy + 17} textAnchor="end" className="sl-barlabel">{lab}</text>
              <rect x={L} y={yy + 5} width={w} height={rowH - 10} rx={3} className={i === 0 ? 'sl-bar sl-bar-top' : 'sl-bar'}>
                <title>{`${labels[i]} : ${full.format(v)}${money ? ' €' : ''}`}</title>
              </rect>
              <text x={L + w + 6} y={yy + 17} className="sl-axis">{fmt(v)}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
