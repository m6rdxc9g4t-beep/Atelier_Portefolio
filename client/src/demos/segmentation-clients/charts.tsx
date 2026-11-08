import { memo, useEffect, useRef, useState } from 'react';
import { RFM_SEGMENTS, type ClientRfm, type RfmFamily, type RfmSegment } from './model';
import { dec2, euros, int, pct } from './format';

/** Largeur réelle d'un conteneur : les graphiques sont dessinés en pixels, le texte n'est jamais étiré. */
export function useWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const FAMILY_OF = new Map<RfmSegment, RfmFamily>(RFM_SEGMENTS.map((s) => [s.name, s.family]));
export const familyOf = (s: RfmSegment) => FAMILY_OF.get(s)!;

/* ───────────── Matrice récence × fréquence ───────────── */

interface MatrixProps {
  matrix: number[][];
  segmentAt: (r: number, f: number) => RfmSegment;
  selected: RfmSegment | null;
  onSelect: (s: RfmSegment) => void;
}

/** Grille 5 × 5 : colonnes = score de récence (5 = le plus récent, à droite), lignes = score de fréquence (5 en haut). */
export const RfMatrix = memo(function RfMatrix({ matrix, segmentAt, selected, onSelect }: MatrixProps) {
  const max = Math.max(1, ...matrix.flat());
  const rows = [5, 4, 3, 2, 1];
  const cols = [1, 2, 3, 4, 5];
  return (
    <div className="seg-matrix" role="group" aria-label="Matrice récence × fréquence : effectif de chaque case, couleur = segment">
      <div className="seg-matrix-y" aria-hidden="true">
        Fréquence <span>↑</span>
      </div>
      <div className="seg-matrix-grid">
        {rows.map((f) => (
          <div className="seg-matrix-row" key={f}>
            <span className="seg-matrix-tick" aria-hidden="true">
              F{f}
            </span>
            {cols.map((r) => {
              const n = matrix[f - 1]![r - 1]!;
              const seg = segmentAt(r, f);
              const isSel = selected === seg;
              const strength = 10 + Math.round((n / max) * 46);
              return (
                <button
                  type="button"
                  key={r}
                  className={`seg-cell seg-fam-${familyOf(seg)}${isSel ? ' is-selected' : ''}`}
                  style={{ ['--seg-strength' as string]: `${strength}%` }}
                  aria-pressed={isSel}
                  aria-label={`Récence ${r}, fréquence ${f} : ${int(n)} client${n > 1 ? 's' : ''}, segment ${seg}`}
                  title={`${seg} · R${r} F${f} · ${int(n)} client${n > 1 ? 's' : ''}`}
                  onClick={() => onSelect(seg)}
                >
                  {n > 0 ? int(n) : ''}
                </button>
              );
            })}
          </div>
        ))}
        <div className="seg-matrix-row seg-matrix-xticks" aria-hidden="true">
          <span className="seg-matrix-tick" />
          {cols.map((r) => (
            <span key={r}>R{r}</span>
          ))}
        </div>
      </div>
      <div className="seg-matrix-x" aria-hidden="true">
        Récence → plus récent
      </div>
    </div>
  );
});

/* ───────────── Coude (inertie) ───────────── */

export const ElbowChart = memo(function ElbowChart({ points, k }: { points: { k: number; value: number }[]; k: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const H = 170;
  const L = 44;
  const R = 12;
  const T = 12;
  const B = 26;
  const max = Math.max(...points.map((p) => p.value));
  const x = (kk: number) => L + ((kk - 1) / (points.length - 1)) * (width - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.k).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const ticks = [0, 0.5, 1].map((f) => f * max);
  return (
    <div ref={ref} className="seg-chart">
      <svg width={width} height={H} role="img" aria-label={`Inertie intra-groupes selon k, de ${int(points[0]!.value)} pour k = 1 à ${int(points[points.length - 1]!.value)} pour k = ${points[points.length - 1]!.k}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={width - R} y1={y(v)} y2={y(v)} className="seg-grid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="seg-axis">
              {int(v)}
            </text>
          </g>
        ))}
        <path d={d} className="seg-line" />
        {points.map((p) => (
          <g key={p.k}>
            <circle cx={x(p.k)} cy={y(p.value)} r={p.k === k ? 5 : 3} className={p.k === k ? 'seg-pt is-on' : 'seg-pt'}>
              <title>{`k = ${p.k} : inertie ${int(p.value)}`}</title>
            </circle>
            <text x={x(p.k)} y={H - 8} textAnchor="middle" className={p.k === k ? 'seg-axis is-on' : 'seg-axis'}>
              {p.k}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
});

/* ───────────── Silhouette ───────────── */

export const SilhouetteChart = memo(function SilhouetteChart({ points, k, bestK }: { points: { k: number; value: number }[]; k: number; bestK: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const H = 170;
  const L = 12;
  const R = 12;
  const T = 18;
  const B = 26;
  const max = Math.max(0.6, ...points.map((p) => p.value));
  const slot = (width - L - R) / points.length;
  const bw = Math.min(34, slot * 0.62);
  const y = (v: number) => T + (1 - Math.max(0, v) / max) * (H - T - B);
  return (
    <div ref={ref} className="seg-chart">
      <svg width={width} height={H} role="img" aria-label={`Silhouette moyenne selon k ; la meilleure est k = ${bestK}`}>
        <line x1={L} x2={width - R} y1={y(0)} y2={y(0)} className="seg-grid" />
        {points.map((p, i) => {
          const cx = L + slot * (i + 0.5);
          const on = p.k === k;
          return (
            <g key={p.k}>
              <rect x={cx - bw / 2} y={y(p.value)} width={bw} height={y(0) - y(p.value)} rx={3} className={on ? 'seg-bar is-on' : 'seg-bar'}>
                <title>{`k = ${p.k} : silhouette ${dec2(p.value)}`}</title>
              </rect>
              <text x={cx} y={y(p.value) - 5} textAnchor="middle" className={on ? 'seg-val is-on' : 'seg-val'}>
                {dec2(p.value)}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" className={on ? 'seg-axis is-on' : 'seg-axis'}>
                {p.k}
                {p.k === bestK ? ' ★' : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

/* ───────────── Nuage de points (plan de l'ACP) ───────────── */

interface ScatterProps {
  coords: [number, number][];
  labels: number[];
  clients: ClientRfm[];
  centroids: [number, number][];
  explained: number[];
  /** Points mis en avant (les autres sont estompés) ; null = tous. */
  highlight: Set<number> | null;
}

export const Scatter = memo(function Scatter({ coords, labels, clients, centroids, explained, highlight }: ScatterProps) {
  const [ref, width] = useWidth<HTMLDivElement>(620);
  const H = Math.round(Math.min(420, Math.max(280, width * 0.62)));
  const P = 34;
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const pad = (lo: number, hi: number) => [lo - (hi - lo) * 0.06, hi + (hi - lo) * 0.06] as const;
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const sx = (v: number) => P + ((v - x0) / (x1 - x0)) * (width - P - 12);
  const sy = (v: number) => 10 + (1 - (v - y0) / (y1 - y0)) * (H - 10 - P);
  return (
    <div ref={ref} className="seg-chart seg-scatter">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Clients projetés sur les deux premières composantes de l’ACP (${pct(explained[0]! + explained[1]!)} de la variance), colorés par groupe`}
      >
        <line x1={P} x2={width - 12} y1={sy(0)} y2={sy(0)} className="seg-grid" />
        <line x1={sx(0)} x2={sx(0)} y1={10} y2={H - P} className="seg-grid" />
        {coords.map((c, i) => {
          const dim = highlight !== null && !highlight.has(i);
          const cl = clients[i]!;
          return (
            <circle key={cl.id} cx={sx(c[0])} cy={sy(c[1])} r={dim ? 2.6 : 3.6} className={`seg-dot seg-c${labels[i]}${dim ? ' is-dim' : ''}`}>
              <title>{`${cl.nom} · groupe ${labels[i]! + 1} · ${cl.frequence} commande${cl.frequence > 1 ? 's' : ''}, ${euros(cl.montant)}, dernière il y a ${int(cl.recence)} j`}</title>
            </circle>
          );
        })}
        {centroids.map((c, g) => (
          <g key={g} className="seg-centroid">
            <circle cx={sx(c[0])} cy={sy(c[1])} r={11} className={`seg-centroid-dot seg-c${g}`} />
            <text x={sx(c[0])} y={sy(c[1]) + 4} textAnchor="middle" className="seg-centroid-label">
              {g + 1}
            </text>
          </g>
        ))}
        <text x={width - 12} y={H - 10} textAnchor="end" className="seg-axis">
          Composante 1 ({pct(explained[0]!)} de la variance) →
        </text>
        <text x={14} y={H - P} className="seg-axis" transform={`rotate(-90 14 ${H - P})`}>
          Composante 2 ({pct(explained[1]!)}) →
        </text>
      </svg>
    </div>
  );
});
