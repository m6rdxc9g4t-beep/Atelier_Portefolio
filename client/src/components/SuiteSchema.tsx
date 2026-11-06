import { useId } from 'react';
import { AppTile, type AtelierAppId } from './Icon';

/**
 * Schéma de la Suite Atelier (accueil, page IA & dev) : les fichiers passent par Convert vers Tab,
 * Tab alimente Projets et Viz, Nexus orchestre l'ensemble. Dessiné aux couleurs du thème courant,
 * chaque app identifiée par son icône carrée (couleur signature + glyphe). Sous 760 px : liste empilée.
 */
type Node = { app?: AtelierAppId; name: string; role: string[]; x: number; y: number; w: number; h: number };

const NODES: Node[] = [
  { name: 'Vos fichiers', role: ['PDF · CSV · Excel'], x: 0, y: 118, w: 150, h: 64 },
  { app: 'convert', name: 'Convert', role: ['lecture et nettoyage'], x: 200, y: 118, w: 182, h: 64 },
  { app: 'tab', name: 'Tab', role: ['tables et formules'], x: 430, y: 118, w: 182, h: 64 },
  { app: 'projets', name: 'Projets', role: ['planning et suivi'], x: 668, y: 38, w: 190, h: 64 },
  { app: 'viz', name: 'Viz', role: ['rapports et KPI'], x: 668, y: 198, w: 190, h: 64 },
  { app: 'nexus', name: 'Nexus', role: ['agents + orchestrateur', 'validation humaine'], x: 908, y: 104, w: 192, h: 92 },
  { app: 'tresorerie', name: 'Trésorerie', role: [], x: 934, y: 248, w: 140, h: 44 },
];

const GLYPHS: Partial<Record<AtelierAppId, string>> = {
  convert: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  tab: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18M3 9h18M3 15h18"/>',
  projets: '<path d="M6 5v11M12 5v6M18 5v14"/>',
  viz: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  nexus: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  tresorerie: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'
};

const FLOW = ['M150,150 H196', 'M382,150 H426', 'M612,138 C640,138 640,70 664,70', 'M612,162 C640,162 640,230 664,230'];
const ORCHESTRATION = ['M908,128 C884,128 884,70 858,70', 'M908,172 C884,172 884,230 858,230', 'M1040,104 V14 H521 V118', 'M1004,196 V248'];

const ALT = "Schéma de la Suite Atelier : Convert lit les fichiers, Tab les structure, Projets et Viz les exploitent, Nexus orchestre les agents IA";

export function SuiteSchema() {
  const uid = useId().replace(/:/g, '');
  return (
    <figure className="suite-schema">
      <svg className="suite-svg" viewBox="0 0 1100 316" role="img" aria-label={ALT}>
        <defs>
          <marker id={`ar-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="ss-head" />
          </marker>
          {NODES.filter((n) => n.app).map((n) => (
            <linearGradient key={n.app} id={`g-${n.app}-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: `color-mix(in oklab, var(--atelier-sig-${n.app}) 78%, #fff)` }} />
              <stop offset="1" style={{ stopColor: `var(--atelier-sig-${n.app})` }} />
            </linearGradient>
          ))}
        </defs>
        <g className="ss-flow" markerEnd={`url(#ar-${uid})`}>
          {FLOW.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g className="ss-orch">
          {ORCHESTRATION.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {NODES.map((n) => {
          const small = n.h < 50;
          const t = small ? 20 : 24;
          const tx = n.x + 14;
          const ty = n.y + (n.h - t) / 2;
          const textX = n.app ? tx + t + 10 : n.x + n.w / 2;
          const anchor = n.app ? 'start' : 'middle';
          const lines = n.role.length;
          const nameY = n.y + n.h / 2 + (lines ? -((lines - 1) * 9) - 3 : 5);
          return (
            <g key={n.name} className={`ss-node ${n.app ? '' : 'ss-node--source'}`}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} className="ss-box" />
              {n.app && (
                <>
                  <rect x={tx} y={ty} width={t} height={t} rx={t * 0.24} fill={`url(#g-${n.app}-${uid})`} className="ss-tile" />
                  <svg x={tx + t * 0.19} y={ty + t * 0.19} width={t * 0.62} height={t * 0.62} viewBox="0 0 24 24" className="ss-glyph" dangerouslySetInnerHTML={{ __html: GLYPHS[n.app] ?? '' }} />
                </>
              )}
              <text x={textX} y={nameY} textAnchor={anchor} className={small ? 'ss-name ss-name--sm' : 'ss-name'}>
                {n.name}
              </text>
              {n.role.map((r, i) => (
                <text key={r} x={textX} y={nameY + 19 + i * 17} textAnchor={anchor} className="ss-role">
                  {r}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <ol className="suite-flow" aria-label={ALT}>
        {NODES.map((n) => (
          <li key={n.name}>
            {n.app ? <AppTile app={n.app} size="sm" /> : <span className="suite-flow-src" aria-hidden />}
            <span className="suite-flow-name">{n.name}</span>
            {n.role.length > 0 && <span className="suite-flow-role">{n.role.join(', ')}</span>}
          </li>
        ))}
      </ol>
      <figcaption>Orchestration des agents : lecture, analyse, actions validées.</figcaption>
    </figure>
  );
}
