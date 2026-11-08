import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  BOX_W,
  HEAD_H,
  ROW_H,
  boxHeight,
  canvasSize,
  colById,
  rowCenterY,
  tableById,
  type Column,
  type Model,
  type Severity,
  type TableDef,
} from './model';

interface Props {
  model: Model;
  selectedId: string | null;
  severityByTable: Map<string, Severity>;
  onSelect: (id: string) => void;
  /** Début d'un déplacement : l'appelant mémorise l'état pour « Annuler ». */
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
}

const SNAP = 4;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Pattes de corbeau côté enfant (plusieurs), barre (un), rond (zéro). `dir` : sens du lien en partant de la boîte. */
function childEnd(x: number, y: number, dir: number, unique: boolean) {
  const circle = { cx: x + dir * 19, cy: y };
  const d = unique ? `M${x + dir * 9},${y - 6}V${y + 6}` : `M${x},${y - 7}L${x + dir * 12},${y}M${x},${y}H${x + dir * 12}M${x},${y + 7}L${x + dir * 12},${y}`;
  return { d, circle };
}
function parentEnd(x: number, y: number, dir: number, mandatory: boolean) {
  const d = mandatory ? `M${x + dir * 7},${y - 6}V${y + 6}M${x + dir * 12},${y - 6}V${y + 6}` : `M${x + dir * 7},${y - 6}V${y + 6}`;
  return { d, circle: mandatory ? null : { cx: x + dir * 16, cy: y } };
}

interface Link {
  key: string;
  path: string;
  child: ReturnType<typeof childEnd>;
  parent: ReturnType<typeof parentEnd>;
  active: boolean;
  label: string;
}

function buildLinks(m: Model, selectedId: string | null): Link[] {
  const links: Link[] = [];
  for (const t of m.tables) {
    t.columns.forEach((c, ci) => {
      if (!c.fk) return;
      const p = tableById(m, c.fk.tableId);
      const pc = colById(p, c.fk.columnId);
      if (!p || !pc) return;
      const pi = p.columns.indexOf(pc);
      const sy = rowCenterY(t, ci);
      const ey = rowCenterY(p, pi);
      let sx: number, ex: number, sdir: number, edir: number, path: string;
      if (p.id === t.id) {
        sx = ex = t.x + BOX_W;
        sdir = edir = 1;
        const bulge = sx + 44;
        path = `M${sx},${sy}C${bulge},${sy} ${bulge},${ey} ${ex},${ey}`;
      } else if (t.x >= p.x + BOX_W + 28) {
        sx = t.x;
        ex = p.x + BOX_W;
        sdir = -1;
        edir = 1;
        const k = Math.max(36, (sx - ex) / 2);
        path = `M${sx},${sy}C${sx - k},${sy} ${ex + k},${ey} ${ex},${ey}`;
      } else if (t.x + BOX_W + 28 <= p.x) {
        sx = t.x + BOX_W;
        ex = p.x;
        sdir = 1;
        edir = -1;
        const k = Math.max(36, (ex - sx) / 2);
        path = `M${sx},${sy}C${sx + k},${sy} ${ex - k},${ey} ${ex},${ey}`;
      } else {
        sx = t.x + BOX_W;
        ex = p.x + BOX_W;
        sdir = edir = 1;
        const far = Math.max(sx, ex) + 48;
        path = `M${sx},${sy}C${far},${sy} ${far},${ey} ${ex},${ey}`;
      }
      links.push({
        key: `${t.id}:${c.id}`,
        path,
        child: childEnd(sx, sy, sdir, c.unique || (c.pk && t.columns.filter((x) => x.pk).length === 1)),
        parent: parentEnd(ex, ey, edir, c.notNull),
        active: selectedId === t.id || selectedId === p.id,
        label: `${t.name}.${c.name} référence ${p.name}.${pc.name}`,
      });
    });
  }
  // Les liens de la table sélectionnée passent au premier plan.
  return links.sort((a, b) => Number(a.active) - Number(b.active));
}

function keyLabel(c: Column) {
  if (c.pk && c.fk) return 'PK FK';
  if (c.pk) return 'PK';
  if (c.fk) return 'FK';
  if (c.unique) return 'UQ';
  return '';
}

export default function Diagram({ model, selectedId, severityByTable, onSelect, onMoveStart, onMove }: Props) {
  const size = canvasSize(model);
  const w = Math.max(size.w, 640);
  const h = Math.max(size.h, 420);
  const links = buildLinks(model, selectedId);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const down = (e: PointerEvent<SVGGElement>, t: TableDef) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: t.id, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, moved: false };
  };
  const move = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      onMoveStart();
    }
    onMove(d.id, Math.max(0, Math.round((d.ox + dx) / SNAP) * SNAP), Math.max(0, Math.round((d.oy + dy) / SNAP) * SNAP));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onSelect(d.id);
  };
  const key = (e: KeyboardEvent<SVGGElement>, t: TableDef) => {
    const step = e.shiftKey ? 40 : 8;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (delta[e.key]) {
      e.preventDefault();
      const [dx, dy] = delta[e.key]!;
      onMoveStart();
      onMove(t.id, Math.max(0, t.x + dx), Math.max(0, t.y + dy));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(t.id);
    }
  };

  return (
    <svg className="md-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Diagramme du modèle : tables et relations">
      <g aria-hidden="true">
        {links.map((l) => (
          <g key={l.key} className={`md-link${l.active ? ' is-active' : ''}`}>
            <title>{l.label}</title>
            <path d={l.path} className="md-link-line" />
            <path d={l.child.d} className="md-link-mark" />
            <circle cx={l.child.circle.cx} cy={l.child.circle.cy} r={3.6} className="md-link-zero" />
            <path d={l.parent.d} className="md-link-mark" />
            {l.parent.circle && <circle cx={l.parent.circle.cx} cy={l.parent.circle.cy} r={3.6} className="md-link-zero" />}
          </g>
        ))}
      </g>

      {model.tables.map((t) => {
        const hgt = boxHeight(t);
        const sev = severityByTable.get(t.id);
        const selected = t.id === selectedId;
        return (
          <g
            key={t.id}
            className={`md-table${selected ? ' is-selected' : ''}`}
            transform={`translate(${t.x},${t.y})`}
            tabIndex={0}
            role="button"
            aria-pressed={selected}
            aria-label={`Table ${t.name || 'sans nom'}, ${t.columns.length} colonne${t.columns.length > 1 ? 's' : ''}${
              sev ? `, ${sev === 'error' ? 'problème bloquant' : sev === 'warning' ? 'point à corriger' : 'conseil'}` : ''
            }. Flèches pour déplacer, Entrée pour modifier.`}
            onPointerDown={(e) => down(e, t)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => key(e, t)}
          >
            <rect className="md-box" width={BOX_W} height={hgt} rx={8} />
            <path className="md-head" d={`M0,8 a8,8 0 0 1 8,-8 H${BOX_W - 8} a8,8 0 0 1 8,8 V${HEAD_H} H0 Z`} />
            <line x1={0} x2={BOX_W} y1={HEAD_H} y2={HEAD_H} className="md-sep" />
            <text x={12} y={21} className="md-tname">
              {clip(t.name || '(sans nom)', 24)}
            </text>
            {sev && <circle cx={BOX_W - 14} cy={16} r={4.5} className={`md-sev md-sev--${sev}`} />}
            {t.columns.map((c, i) => {
              const y = HEAD_H + 2 + i * ROW_H;
              const k = keyLabel(c);
              return (
                <g key={c.id} transform={`translate(0,${y})`}>
                  {k && (
                    <text x={10} y={15} className={`md-key${c.pk ? ' is-pk' : ''}`}>
                      {k}
                    </text>
                  )}
                  <text x={50} y={15} className={`md-cname${c.notNull ? ' is-nn' : ''}`}>
                    {clip(c.name || '?', 20)}
                  </text>
                  <text x={BOX_W - 10} y={15} textAnchor="end" className="md-ctype">
                    {c.type}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
