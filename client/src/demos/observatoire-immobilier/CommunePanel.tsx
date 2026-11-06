import { useMemo, useState } from 'react';
import { Histogram, SeriesLegend, TrendChart } from './Charts';
import {
  MIN_VENTES,
  evolution,
  fmtInt,
  fmtM2,
  fmtPct,
  medianeOf,
  ventesOf,
  type Commune,
  type DepartementData,
  type TypeCode,
} from './model';

const TYPE_SHORT: Record<TypeCode, string> = { T: 'tous biens', M: 'maisons', A: 'appartements' };

/** Panneau de la commune choisie : indicateurs de l'année, évolution annuelle, distribution des prix. */
export function CommunePanel({ dep, commune, annee, type }: { dep: DepartementData; commune: Commune; annee: number; type: TypeCode }) {
  const med = medianeOf(commune.s, annee, type);
  const n = ventesOf(commune.s, annee, type);
  const medDep = medianeOf(dep.departement.s, annee, type);
  const ecart = med !== null && medDep ? med / medDep - 1 : null;
  const evo = evolution(commune.s, annee, type);
  const first = dep.annees[0];
  const last = dep.annees[dep.annees.length - 1];

  return (
    <article className="oi-panel" aria-labelledby="oi-commune-title">
      <header className="oi-panel-head">
        <h3 id="oi-commune-title">{commune.n}</h3>
        <p className="oi-meta">
          {commune.c} · {dep.nom} · {fmtInt(commune.v)} ventes de {first} à {last}
        </p>
      </header>
      <dl className="oi-stats" aria-live="polite">
        <div>
          <dt>
            Prix médian {annee}, {TYPE_SHORT[type]}
          </dt>
          <dd className="oi-stat-main">{fmtM2(med)}</dd>
        </div>
        <div>
          <dt>Ventes {annee}</dt>
          <dd>{fmtInt(n)}</dd>
        </div>
        <div>
          <dt>Sur un an</dt>
          <dd>{fmtPct(evo, true)}</dd>
        </div>
        <div>
          <dt>Écart au département</dt>
          <dd>{fmtPct(ecart, true)}</dd>
        </div>
      </dl>
      {med === null && (
        <p className="oi-empty-note">
          {n === 0 ? 'Aucune vente' : `${n} vente${n > 1 ? 's' : ''} seulement`} en {annee} pour ce type de bien : la médiane n’est publiée
          qu’à partir de {MIN_VENTES} ventes.
        </p>
      )}

      <section className="oi-panel-block" aria-label="Évolution annuelle">
        <div className="oi-block-head">
          <h4>Prix médian au m² par année</h4>
          <SeriesLegend />
        </div>
        <TrendChart commune={commune} annees={dep.annees} annee={annee} />
        <p className="oi-caption">Ligne : médiane. Bande : de 1er au 3e quartile (la moitié centrale des ventes).</p>
      </section>

      <section className="oi-panel-block" aria-label="Distribution des prix">
        <div className="oi-block-head">
          <h4>
            Distribution, {first}–{last}
          </h4>
          <span className="oi-meta">ventes par tranche de {fmtInt(dep.histogramme.largeur)} €/m²</span>
        </div>
        <Histogram commune={commune} dep={dep} mediane={med} />
        {med !== null && (
          <p className="oi-caption">
            Trait vertical : médiane {annee} ({TYPE_SHORT[type]}).
          </p>
        )}
      </section>
    </article>
  );
}

type Tri = 'ventes' | 'cher' | 'abordable';

/** Tableau des communes (alternative accessible à la carte) : trié par ventes ou par prix médian. */
export function CommuneTable({
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
  const [tri, setTri] = useState<Tri>('ventes');
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const list = dep.communes
      .map((c) => ({ c, n: ventesOf(c.s, annee, type), med: medianeOf(c.s, annee, type), evo: evolution(c.s, annee, type) }))
      .filter((r) => r.med !== null);
    if (tri === 'ventes') list.sort((a, b) => b.n - a.n);
    else if (tri === 'cher') list.sort((a, b) => (b.med ?? 0) - (a.med ?? 0));
    else list.sort((a, b) => (a.med ?? 0) - (b.med ?? 0));
    return list;
  }, [dep, annee, type, tri]);
  const shown = all ? rows.slice(0, 60) : rows.slice(0, 8);

  return (
    <section className="oi-table-wrap" aria-label="Communes">
      <div className="oi-block-head">
        <h4>Communes, {annee}</h4>
        <div className="oi-seg oi-seg-sm" role="group" aria-label="Trier les communes">
          {(
            [
              ['ventes', 'Plus de ventes'],
              ['cher', 'Plus chères'],
              ['abordable', 'Moins chères'],
            ] as [Tri, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={tri === k} onClick={() => setTri(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="oi-empty-note">
          Aucune commune n’atteint {MIN_VENTES} ventes pour ce type de bien en {annee}.
        </p>
      ) : (
        <table className="oi-table">
          <thead>
            <tr>
              <th scope="col">Commune</th>
              <th scope="col" className="oi-num">
                Ventes
              </th>
              <th scope="col" className="oi-num">
                Médiane
              </th>
              <th scope="col" className="oi-num">
                Sur un an
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.c.c} aria-selected={r.c.c === selected} onClick={() => onSelect(r.c.c)}>
                <td>
                  <button type="button" className="oi-linkbtn" onClick={(e) => (e.stopPropagation(), onSelect(r.c.c))}>
                    {r.c.n}
                  </button>
                </td>
                <td className="oi-num">{fmtInt(r.n)}</td>
                <td className="oi-num">{fmtM2(r.med)}</td>
                <td className="oi-num">{fmtPct(r.evo, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 8 && (
        <button type="button" className="btn btn-ghost oi-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all
            ? 'Afficher moins'
            : rows.length <= 60
              ? `Afficher les ${fmtInt(rows.length)} communes publiées`
              : `Afficher 60 communes sur ${fmtInt(rows.length)}`}
        </button>
      )}
    </section>
  );
}
