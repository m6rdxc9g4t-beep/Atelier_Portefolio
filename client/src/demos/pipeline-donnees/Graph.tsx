import type { KeyboardEvent } from 'react';
import { LAYER_LABEL, layerOf, type Edge, type Layer, type ModelDef, type NodeState } from './model';

export interface NodeInfo {
  state: NodeState;
  rows?: number;
  testsOk: number;
  testsTotal: number;
}

/** Placement : colonne = profondeur dans le DAG, ligne fixée pour limiter les croisements. */
const LAYOUT: Record<string, { col: number; row: number }> = {
  raw_commandes: { col: 0, row: 0 },
  raw_lignes: { col: 0, row: 1 },
  raw_produits: { col: 0, row: 2 },
  raw_clients: { col: 0, row: 3 },
  stg_commandes: { col: 1, row: 0 },
  stg_lignes: { col: 1, row: 1 },
  stg_produits: { col: 1, row: 2 },
  stg_clients: { col: 1, row: 3 },
  int_lignes_enrichies: { col: 2, row: 1 },
  fct_ventes: { col: 3, row: 1.5 },
  mart_ca_mensuel: { col: 4, row: 0.5 },
  dim_clients: { col: 4, row: 2.75 },
};

const NODE_W = 172;
const NODE_H = 48;
const COL_GAP = 40;
const ROW_H = 66;
const TOP = 34;
const LEFT = 8;
export const GRAPH_W = LEFT * 2 + 5 * NODE_W + 4 * COL_GAP;
export const GRAPH_H = TOP + 4 * ROW_H - (ROW_H - NODE_H) + 8;

const pos = (name: string) => {
  const p = LAYOUT[name] ?? { col: 0, row: 0 };
  return { x: LEFT + p.col * (NODE_W + COL_GAP), y: TOP + p.row * ROW_H };
};

const LAYER_HEADERS: { layer: Layer; col: number }[] = [
  { layer: 'source', col: 0 },
  { layer: 'staging', col: 1 },
  { layer: 'intermediate', col: 2 },
  { layer: 'mart', col: 3 },
];

const STATE_TEXT: Record<NodeState, string> = {
  idle: 'jamais construit',
  stale: 'à reconstruire',
  running: 'en cours…',
  ok: 'construit',
  error: 'erreur SQL',
  skipped: 'ignoré (amont en échec)',
};

const nf = new Intl.NumberFormat('fr-FR');

export function nodeSummary(name: string, info: NodeInfo | undefined): string {
  if (!info) return '';
  if (info.state === 'stale') return info.rows !== undefined ? `à reconstruire · ${nf.format(info.rows)} lignes` : STATE_TEXT.stale;
  if (info.state === 'ok') {
    const rows = info.rows !== undefined ? `${nf.format(info.rows)} lignes` : '';
    const failed = info.testsTotal - info.testsOk;
    const tests = info.testsTotal ? (failed ? `${failed} test${failed > 1 ? 's' : ''} en échec` : `${info.testsOk}/${info.testsTotal} tests`) : '';
    return [rows, tests].filter(Boolean).join(' · ');
  }
  return STATE_TEXT[info.state];
}

interface Props {
  nodes: string[];
  edges: Edge[];
  models: ModelDef[];
  info: Record<string, NodeInfo>;
  selected: string;
  related: Set<string>;
  lineage: Set<string> | null;
  onSelect: (name: string) => void;
}

export default function Graph({ nodes, edges, models, info, selected, related, lineage, onSelect }: Props) {
  const onKey = (e: KeyboardEvent<SVGGElement>, name: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(name);
    }
  };

  return (
    <svg className="pl-graph" viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} role="group" aria-label="Graphe de lignage du pipeline">
      <defs>
        <marker id="pl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="pl-arrowhead" />
        </marker>
      </defs>

      {LAYER_HEADERS.map(({ layer, col }) => (
        <text key={layer} x={LEFT + col * (NODE_W + COL_GAP)} y={16} className="pl-layer-label">
          {LAYER_LABEL[layer]}
        </text>
      ))}

      {edges.map((e) => {
        if (!LAYOUT[e.from] || !LAYOUT[e.to]) return null;
        const a = pos(e.from);
        const b = pos(e.to);
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x - 2;
        const y2 = b.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        const onPath = (related.has(e.from) || e.from === selected) && (related.has(e.to) || e.to === selected);
        const inLineage = lineage?.has(e.from) && lineage.has(e.to);
        return (
          <path
            key={`${e.from}-${e.to}`}
            d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
            className={`pl-edge${onPath ? ' is-on' : ''}${inLineage ? ' is-lineage' : ''}`}
            markerEnd="url(#pl-arrow)"
          />
        );
      })}

      {nodes.map((name) => {
        const { x, y } = pos(name);
        const nodeInfo = info[name];
        const layer = layerOf(name, models);
        const failed = nodeInfo ? nodeInfo.testsTotal - nodeInfo.testsOk : 0;
        const tone =
          nodeInfo?.state === 'error'
            ? 'bad'
            : nodeInfo?.state === 'stale'
              ? 'stale'
              : nodeInfo?.state === 'running'
                ? 'running'
                : nodeInfo?.state === 'skipped' || nodeInfo?.state === 'idle'
                  ? 'idle'
                  : failed > 0
                    ? 'bad'
                    : 'good';
        const isSel = name === selected;
        const summary = layer === 'source' ? (nodeInfo?.rows !== undefined ? `${nf.format(nodeInfo.rows)} lignes brutes` : '') : nodeSummary(name, nodeInfo);
        return (
          <g
            key={name}
            transform={`translate(${x},${y})`}
            className={`pl-node pl-node--${layer} pl-tone-${tone}${isSel ? ' is-selected' : ''}${related.has(name) ? ' is-related' : ''}${lineage?.has(name) ? ' is-lineage' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            aria-label={`${name}, ${LAYER_LABEL[layer]}${summary ? `, ${summary}` : ''}`}
            onClick={() => onSelect(name)}
            onKeyDown={(e) => onKey(e, name)}
          >
            <rect width={NODE_W} height={NODE_H} rx={8} className="pl-node-box" />
            {tone === 'running' && <rect width={NODE_W} height={NODE_H} rx={8} className="pl-node-pulse" />}
            <circle cx={14} cy={17} r={4} className="pl-node-dot" />
            <text x={26} y={21} className="pl-node-name">
              {name}
            </text>
            <text x={14} y={38} className="pl-node-meta">
              {summary}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
