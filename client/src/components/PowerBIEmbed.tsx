import { useState } from 'react';
import type { PowerBIPage } from '@atelier/shared';

/**
 * Tableaux Power BI « publiés sur le web ».
 * L'iframe (service tiers) n'est chargée qu'à la demande : page plus rapide et visiteur informé.
 */
export function PowerBIEmbed({ pages, title, className = '' }: { pages: PowerBIPage[]; title: string; className?: string }) {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const page = pages[active];
  return (
    <div className={`pbi ${className}`}>
      <div className="pbi-tabs" role="tablist" aria-label={`Pages du rapport ${title}`}>
        {pages.map((p, i) => (
          <button key={p.label} role="tab" aria-selected={i === active} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)}>
            {p.label}
          </button>
        ))}
        <a className="pbi-ext" href={page.url} target="_blank" rel="noopener noreferrer">
          Ouvrir dans Power BI ↗
        </a>
      </div>
      <div className="pbi-frame">
        {loaded ? (
          <iframe key={page.url} title={`${title} — ${page.label}`} src={page.url} allowFullScreen loading="lazy" />
        ) : (
          <div className="pbi-placeholder">
            <p>Rapport interactif hébergé par Microsoft Power BI.</p>
            <button type="button" onClick={() => setLoaded(true)}>
              Charger le tableau de bord « {page.label} »
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
