import { useMemo, useState } from 'react';
import {
  MIN_VENTES,
  classOf,
  evolution,
  fitProjection,
  fmtInt,
  fmtM2,
  fmtPct,
  medianeOf,
  quantileBreaks,
  quantileSorted,
  radius,
  ventesOf,
  type Commune,
  type DepartementData,
  type TypeCode,
} from './model';
import { useWidth } from './hooks';

const TYPE_LABEL: Record<TypeCode, string> = { T: 'maisons et appartements', M: 'maisons', A: 'appartements' };

interface Point {
  c: Commune;
  x: number;
  y: number;
  r: number;
  n: number;
  med: number | null;
  cls: number;
}

/**
 * Carte des communes sans fond de carte : projection équirectangulaire locale en SVG,
 * aire du point ∝ nombre de ventes, couleur = classe de prix médian au m² (quantiles).
 */
export function MapView({
  dep,
  annee,
  type,
  selected,
  onSelect,
}: {
  dep: DepartementData;
  annee: number;
  type: TypeCode;
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<string | null>(null);

  const geo = useMemo(() => dep.communes.filter((c) => c.x !== null && c.y !== null), [dep]);
  const proj = useMemo(
    () =>
      fitProjection(
        geo.map((c) => [c.x as number, c.y as number]),
        width,
        18,
        width < 560 ? width * 1.15 : 600,
      ),
    [geo, width],
  );

  const { points, breaks } = useMemo(() => {
    const meds = geo.map((c) => medianeOf(c.s, annee, type)).filter((m): m is number => m !== null);
    const br = quantileBreaks(meds, 5, 50);
    const counts = geo.map((c) => ventesOf(c.s, annee, type)).sort((a, b) => a - b);
    const nRef = Math.max(1, quantileSorted(counts, 0.98));
    const rMax = Math.max(7, Math.min(15, width / 44));
    const pts: Point[] = geo.map((c) => {
      const [x, y] = proj(c.x as number, c.y as number);
      const n = ventesOf(c.s, annee, type);
      const med = medianeOf(c.s, annee, type);
      return { c, x, y, n, med, r: med === null ? 1.8 : radius(n, nRef, 2.2, rMax), cls: med === null ? -1 : classOf(med, br) };
    });
    pts.sort((a, b) => b.r - a.r);
    return { points: pts, breaks: br };
  }, [geo, proj, annee, type, width]);

  const byCode = useMemo(() => new Map(points.map((p) => [p.c.c, p])), [points]);
  const labelled = useMemo(() => {
    const top = [...points]
      .filter((p) => p.med !== null)
      .sort((a, b) => b.n - a.n)
      .slice(0, width < 560 ? 3 : 5);
    return top.filter((p) => p.c.c !== selected);
  }, [points, selected, width]);
  const sel = selected ? byCode.get(selected) : undefined;
  const hov = hover ? byCode.get(hover) : undefined;
  const nonPublie = points.filter((p) => p.med === null).length;

  return (
    <div className="oi-map" ref={ref}>
      <svg
        width={proj.width}
        height={proj.height}
        viewBox={`0 0 ${proj.width} ${proj.height}`}
        role="img"
        aria-label={`Carte des ${geo.length} communes du département ${dep.nom} : prix médian au m² des ${TYPE_LABEL[type]} en ${annee}. Le tableau sous la carte donne les mêmes valeurs.`}
        onMouseLeave={() => setHover(null)}
      >
        {points.map((p) => (
          <circle
            key={p.c.c}
            cx={p.x}
            cy={p.y}
            r={p.r}
            className={p.cls < 0 ? 'oi-dot oi-dot-na' : `oi-dot oi-seq-${p.cls}`}
            onMouseEnter={() => setHover(p.c.c)}
            onClick={() => onSelect(p.c.c)}
          />
        ))}
        {labelled.map((p) => (
          <text key={p.c.c} {...labelPos(p, proj.width, 3)} className="oi-map-label">
            {p.c.n}
          </text>
        ))}
        {sel && (
          <g className="oi-map-selected" aria-hidden="true">
            <circle cx={sel.x} cy={sel.y} r={sel.r + 3.5} />
            <text {...labelPos(sel, proj.width, 6)} className="oi-map-label oi-map-label-strong">
              {sel.c.n}
            </text>
          </g>
        )}
      </svg>
      {hov && (
        <div
          className="oi-tip"
          style={{
            left: hov.x > proj.width - 200 ? undefined : hov.x + hov.r + 10,
            right: hov.x > proj.width - 200 ? proj.width - hov.x + hov.r + 10 : undefined,
            top: Math.max(4, Math.min(proj.height - 92, hov.y - 30)),
          }}
          aria-hidden="true"
        >
          <strong>{hov.c.n}</strong>
          <span className="oi-tip-row">
            <span>Médiane {annee}</span>
            <b>{hov.med === null ? 'non publiée' : fmtM2(hov.med)}</b>
          </span>
          <span className="oi-tip-row">
            <span>Ventes</span>
            <b>{fmtInt(hov.n)}</b>
          </span>
          {hov.med !== null && (
            <span className="oi-tip-row">
              <span>Sur un an</span>
              <b>{fmtPct(evolution(hov.c.s, annee, type), true)}</b>
            </span>
          )}
        </div>
      )}
      <Legend breaks={breaks} nonPublie={nonPublie} />
    </div>
  );
}

/** Étiquette à droite du point, ou à gauche près du bord droit (jamais hors du cadre). */
function labelPos(p: Point, width: number, gap: number) {
  const left = p.x > width - 7 * p.c.n.length - 24;
  return { x: left ? p.x - p.r - gap : p.x + p.r + gap, y: p.y + 4, textAnchor: left ? ('end' as const) : ('start' as const) };
}

function Legend({ breaks, nonPublie }: { breaks: number[]; nonPublie: number }) {
  const labels: string[] = [];
  for (let i = 0; i <= breaks.length; i++) {
    if (i === 0) labels.push(`moins de ${fmtInt(breaks[0] ?? 0)}`);
    else if (i === breaks.length) labels.push(`${fmtInt(breaks[i - 1])} et plus`);
    else labels.push(`${fmtInt(breaks[i - 1])} à ${fmtInt(breaks[i])}`);
  }
  return (
    <div className="oi-legend">
      <span className="oi-legend-title">Prix médian, €/m²</span>
      {breaks.length > 0 ? (
        <ul className="oi-legend-scale">
          {labels.map((l, i) => (
            <li key={l}>
              <span className={`oi-swatch oi-seq-${i}`} aria-hidden="true" />
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <span className="oi-legend-note">Trop peu de communes publiées pour une échelle.</span>
      )}
      <span className="oi-legend-note">
        <span className="oi-swatch oi-swatch-na" aria-hidden="true" />
        moins de {MIN_VENTES} ventes ({fmtInt(nonPublie)} communes) · taille du point = nombre de ventes
      </span>
    </div>
  );
}
