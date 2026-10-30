import { useState } from 'react';

export interface Table {
  name: string;
  key?: string;
  columns: string[];
  role?: string;
}

/**
 * Schéma en étoile interactif : la table de faits au centre, les dimensions autour.
 * Survoler (ou toucher) une dimension surligne sa clé dans la table de faits.
 */
export function StarSchema({ fact, dimensions }: { fact: Table; dimensions: Table[] }) {
  const [active, setActive] = useState<string | null>(null);
  const activeDim = dimensions.find((d) => d.name === active);
  const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right'];

  return (
    <div className="star" onMouseLeave={() => setActive(null)}>
      <svg className="star-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {dimensions.map((d, i) => {
          const pos = positions[i % positions.length];
          const x = pos.includes('left') ? 18 : 82;
          const y = pos.startsWith('top') ? 18 : pos.startsWith('bottom') ? 82 : 50;
          return <line key={d.name} x1={50} y1={50} x2={x} y2={y} className={active === d.name ? 'on' : ''} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      {dimensions.map((d, i) => (
        <button
          key={d.name}
          className={`star-table star-dim star-${positions[i % positions.length]} ${active === d.name ? 'on' : ''}`}
          onMouseEnter={() => setActive(d.name)}
          onFocus={() => setActive(d.name)}
          onClick={() => setActive(active === d.name ? null : d.name)}
          aria-pressed={active === d.name}
        >
          <span className="star-name">{d.name}</span>
          {d.role && <span className="star-role">{d.role}</span>}
          <ul>
            {d.columns.map((c) => (
              <li key={c} className={c === d.key ? 'pk' : ''}>
                {c === d.key && <i title="clé primaire">🔑</i>}
                {c}
              </li>
            ))}
          </ul>
        </button>
      ))}
      <div className="star-table star-fact">
        <span className="star-name">{fact.name}</span>
        {fact.role && <span className="star-role">{fact.role}</span>}
        <ul>
          {fact.columns.map((c) => (
            <li key={c} className={activeDim && c === activeDim.key ? 'fk on' : dimensions.some((d) => d.key === c) ? 'fk' : ''}>
              {dimensions.some((d) => d.key === c) && <i title="clé étrangère">↗</i>}
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
