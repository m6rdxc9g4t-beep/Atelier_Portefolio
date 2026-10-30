import { useMemo, useState } from 'react';
import { fmt } from '@atelier/shared';

export interface Coef {
  term: string;
  label: string;
  estimate: number;
  se: number;
  p: number;
  signif: string;
}
interface Equation {
  r2: number;
  coefficients: Coef[];
}
export interface HedonicModel {
  natureCulture: { levels: Record<string, string>; levelsInApartmentModel: number[]; levelsInHouseModel: number[] };
  equations: { maison: Equation; appartement: Equation };
  ranges: {
    maison: { prix: { q1Deduced: number; q3Deduced: number; max: number } };
    appartement: { prix: { q1Deduced: number; q3Deduced: number; max: number } };
  };
}

type Kind = 'maison' | 'appartement';

const nb = (t: string) => t.replace(/ /g, ' ');
const euro = (v: number) => `${nb(fmt(Math.round(v)))} €`;

const LAND: { term: string; label: string; short: string }[] = [
  { term: 'st_tnat', label: 'Terrain naturel', short: 'naturel' },
  { term: 'st_tab', label: 'Terrain à bâtir', short: 'à bâtir' },
  { term: 'st_tag', label: 'Terrain agricole', short: 'agricole' },
  { term: 'st_tvi', label: 'Terrain viticole', short: 'viticole' },
  { term: 'st_tart', label: 'Terrain artificiel', short: 'artificiel' },
];

const DEFAULTS: Record<Kind, { surface: number; pieces: number }> = {
  maison: { surface: 100, pieces: 4 },
  appartement: { surface: 45, pieces: 2 },
};

/**
 * Estimateur hédonique : reproduit le modèle 1 du rapport (MCO en niveau, une équation par type de bien),
 * avec ses coefficients publiés. Ce n'est pas une estimation de marché : aucune variable de localisation ni de date.
 */
export function Estimator({ model }: { model: HedonicModel }) {
  const [kind, setKind] = useState<Kind>('maison');
  const [surface, setSurface] = useState(DEFAULTS.maison.surface);
  const [pieces, setPieces] = useState(DEFAULTS.maison.pieces);
  const [nature, setNature] = useState(1);
  const [land, setLand] = useState<Record<string, number>>({});
  const [openLand, setOpenLand] = useState(false);

  const eq = model.equations[kind];
  const coef = useMemo(() => Object.fromEntries(eq.coefficients.map((c) => [c.term, c])), [eq]);
  const levels = kind === 'maison' ? model.natureCulture.levelsInHouseModel : model.natureCulture.levelsInApartmentModel;
  const landMax = kind === 'maison' ? 3000 : 200;
  const landStep = kind === 'maison' ? 50 : 5;
  const sMin = kind === 'maison' ? 15 : 10;
  const sMax = kind === 'maison' ? 183 : 115;

  const switchKind = (k: Kind) => {
    setKind(k);
    setSurface(DEFAULTS[k].surface);
    setPieces(DEFAULTS[k].pieces);
    setNature(1);
    setLand({});
  };

  const parts = [
    { key: 'const', label: 'Constante (réf. : jardins)', value: coef['(Intercept)']?.estimate ?? 0, c: coef['(Intercept)'] },
    { key: 'surface', label: `Surface : ${surface} m² × ${nb(fmt(coef.surface_reelle_bati?.estimate ?? 0, 1, 0))} €`, value: surface * (coef.surface_reelle_bati?.estimate ?? 0), c: coef.surface_reelle_bati },
    { key: 'pieces', label: `Pièces : ${pieces} × ${nb(fmt(coef.n_piece?.estimate ?? 0, 0))} €`, value: pieces * (coef.n_piece?.estimate ?? 0), c: coef.n_piece },
    ...(nature !== 1
      ? [{ key: 'nature', label: `Nature : ${model.natureCulture.levels[String(nature)]}`, value: coef[`nature_culture${nature}`]?.estimate ?? 0, c: coef[`nature_culture${nature}`] }]
      : []),
    ...LAND.filter((l) => (land[l.term] ?? 0) > 0).map((l) => ({
      key: l.term,
      label: `${l.label} : ${land[l.term]} m² × ${nb(fmt(coef[l.term]?.estimate ?? 0, 2, 0))} €`,
      value: (land[l.term] ?? 0) * (coef[l.term]?.estimate ?? 0),
      c: coef[l.term],
    })),
  ];
  const total = parts.reduce((a, p) => a + p.value, 0);
  const range = model.ranges[kind].prix;
  const scaleMax = Math.max(range.max, total * 1.05, 1);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;
  const inIqr = total >= range.q1Deduced && total <= range.q3Deduced;

  // cascade : position cumulée de chaque contribution
  let acc = 0;
  const steps = parts.map((p) => {
    const from = acc;
    acc += p.value;
    return { ...p, from, to: acc };
  });
  const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
  const hi = Math.max(...steps.map((s) => Math.max(s.from, s.to)), 1);
  const wx = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <div className="ml-est">
      <div className="ml-est-form">
        <div className="ml-seg" role="tablist" aria-label="Type de bien">
          <button role="tab" aria-selected={kind === 'maison'} className={kind === 'maison' ? 'is-on' : ''} onClick={() => switchKind('maison')}>
            Maison
          </button>
          <button role="tab" aria-selected={kind === 'appartement'} className={kind === 'appartement' ? 'is-on' : ''} onClick={() => switchKind('appartement')}>
            Appartement
          </button>
        </div>
        <label className="ml-range">
          <span>
            Surface bâtie <b>{surface} m²</b>
          </span>
          <input type="range" min={sMin} max={sMax} step={1} value={surface} onChange={(e) => setSurface(Number(e.target.value))} />
          <small>
            Plage conservée après filtrage : {sMin === 15 ? '15' : '0'}–{sMax} m²
          </small>
        </label>
        <label className="ml-range">
          <span>
            Pièces principales <b>{pieces}</b>
          </span>
          <input type="range" min={1} max={kind === 'maison' ? 10 : 6} step={1} value={pieces} onChange={(e) => setPieces(Number(e.target.value))} />
        </label>
        <label className="ml-select">
          <span>Nature du terrain</span>
          <select value={nature} onChange={(e) => setNature(Number(e.target.value))}>
            {levels.map((l) => (
              <option key={l} value={l}>
                {model.natureCulture.levels[String(l)]}
                {l === 1 ? ' (référence)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="ml-land-toggle" aria-expanded={openLand} onClick={() => setOpenLand((o) => !o)}>
          {openLand ? '−' : '+'} Surfaces de terrain par usage
        </button>
        {openLand && (
          <div className="ml-land">
            {LAND.map((l) => {
              const c = coef[l.term];
              return (
                <label key={l.term} className="ml-range sm">
                  <span>
                    {l.label} <b>{land[l.term] ?? 0} m²</b>
                  </span>
                  <input type="range" min={0} max={landMax} step={landStep} value={land[l.term] ?? 0} onChange={(e) => setLand((o) => ({ ...o, [l.term]: Number(e.target.value) }))} />
                  <small className={c?.signif ? '' : 'ns'}>
                    {nb(fmt(c?.estimate ?? 0, 2, 0))} € par m² {c?.signif ? `(${c.signif})` : '(non significatif)'}
                  </small>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="ml-est-out">
        <div className="ml-tag">
          <span>Prix ajusté par le modèle 1</span>
          <strong>{euro(total)}</strong>
          <small>
            soit ≈ {nb(fmt(total / surface))} €/m² · R² = {fmt(eq.r2, 4, 3)}
          </small>
        </div>

        <div className="ml-iqr" aria-label="Position par rapport aux prix observés">
          <div className="ml-iqr-bar">
            <i className="iqr" style={{ left: pct(range.q1Deduced), width: `calc(${pct(range.q3Deduced)} - ${pct(range.q1Deduced)})` }} />
            <i className={`pt ${inIqr ? '' : 'out'}`} style={{ left: pct(total) }} />
          </div>
          <div className="ml-iqr-legend">
            <span>0 €</span>
            <span>
              Moitié centrale des prix : {euro(range.q1Deduced)} – {euro(range.q3Deduced)}
            </span>
            <span>{euro(scaleMax)}</span>
          </div>
        </div>

        <div className="ml-cascade" role="list" aria-label="Contribution de chaque variable">
          {steps.map((s) => (
            <div key={s.key} role="listitem" className={`ml-step ${s.value < 0 ? 'neg' : 'pos'} ${s.c?.signif ? '' : 'ns'}`}>
              <span className="l">{s.label}</span>
              <span className="track">
                <i style={{ left: `${Math.min(wx(s.from), wx(s.to))}%`, width: `${Math.max(0.6, Math.abs(wx(s.to) - wx(s.from)))}%` }} />
              </span>
              <span className="v">
                {s.value >= 0 ? '+' : '−'}
                {euro(Math.abs(s.value))}
                {s.c && !s.c.signif && <em>n.s.</em>}
              </span>
            </div>
          ))}
          <div className="ml-step total">
            <span className="l">Prix ajusté</span>
            <span className="track">
              <i style={{ left: `${Math.min(wx(0), wx(total))}%`, width: `${Math.abs(wx(total) - wx(0))}%` }} />
            </span>
            <span className="v">{euro(total)}</span>
          </div>
        </div>

        <p className="ml-caveat">
          Lecture des coefficients publiés du modèle 1 (MCO en niveau, une équation par type de bien). Modèle descriptif : ni localisation, ni date — le même bien obtient le
          même prix partout dans le département. « n.s. » : coefficient non significatif à 10 %. Moitié centrale des prix : écart interquartile déduit des bornes de
          filtrage publiées.
        </p>
      </div>
    </div>
  );
}
