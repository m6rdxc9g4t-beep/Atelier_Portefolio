import { useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { fmtInt, searchCommunes, type Commune } from './model';

/** Recherche de commune (combobox ARIA) : saisie, flèches, Entrée, Échap. */
export function CommuneSearch({ communes, onSelect }: { communes: Commune[]; onSelect: (code: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const results = useMemo(() => searchCommunes(communes, q, 8), [communes, q]);
  const show = open && q.trim().length > 0;

  const pick = (c: Commune | undefined) => {
    if (!c) return;
    onSelect(c.c);
    setQ('');
    setOpen(false);
  };

  return (
    <div className="oi-search">
      <label htmlFor={`${id}-in`} className="oi-sr">
        Rechercher une commune
      </label>
      <Icon name="search" size={15} className="oi-search-ic" />
      <input
        id={`${id}-in`}
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={show && results[active] ? `${id}-o${active}` : undefined}
        placeholder="Rechercher une commune"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {show && (
        <ul id={`${id}-list`} role="listbox" className="oi-search-list" aria-label="Communes trouvées">
          {results.length === 0 && <li className="oi-search-none">Aucune commune de ce département ne correspond.</li>}
          {results.map((c, i) => (
            <li
              key={c.c}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{c.n}</span>
              <span className="oi-search-meta">
                {c.c} · {fmtInt(c.v)} ventes
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
