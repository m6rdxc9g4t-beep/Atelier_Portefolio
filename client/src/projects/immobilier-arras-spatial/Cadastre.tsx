import { useMemo } from 'react';

type Pt = [number, number];

/** Découpe d'un polygone convexe par le demi-plan f(x, y) ≤ 0 (Sutherland–Hodgman). */
function clip(poly: Pt[], f: (x: number, y: number) => number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const fa = f(a[0], a[1]);
    const fb = f(b[0], b[1]);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** Enveloppe convexe (chaîne monotone d'Andrew). */
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Décor « plan cadastral » du bandeau : une tessellation de Voronoï construite sur les points
 * intérieurs des sections d'Arras (positions lues sur la carte du rapport), découpée par leur enveloppe
 * légèrement dilatée. Purement décoratif : aucune valeur n'y est représentée.
 */
export function CadastreDeco({ points }: { points: Pt[] }) {
  const cells = useMemo(() => {
    if (points.length < 3) return [];
    const h = hull(points);
    const cx = h.reduce((a, p) => a + p[0], 0) / h.length;
    const cy = h.reduce((a, p) => a + p[1], 0) / h.length;
    const grown = h.map(([x, y]) => [cx + (x - cx) * 1.18, cy + (y - cy) * 1.18] as Pt);
    const box: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 70],
      [0, 70],
    ];
    return points.map((p, i) => {
      let poly = box;
      points.forEach((q, j) => {
        if (i === j) return;
        const mx = (p[0] + q[0]) / 2;
        const my = (p[1] + q[1]) / 2;
        const nx = q[0] - p[0];
        const ny = q[1] - p[1];
        poly = clip(poly, (x, y) => (x - mx) * nx + (y - my) * ny);
      });
      // découpe par l'enveloppe (sens trigonométrique : intérieur à gauche de chaque arête)
      for (let k = 0; k < grown.length; k++) {
        const a = grown[k];
        const b = grown[(k + 1) % grown.length];
        poly = clip(poly, (x, y) => -((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])));
      }
      return poly;
    });
  }, [points]);

  return (
    <svg className="ar-cadastre" viewBox="4 2 86 66" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {cells.map((c, i) =>
        c.length > 2 ? <polygon key={i} points={c.map((p) => p.join(',')).join(' ')} style={{ animationDelay: `${(i % 14) * 70}ms` }} /> : null,
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={0.45} />
      ))}
    </svg>
  );
}
