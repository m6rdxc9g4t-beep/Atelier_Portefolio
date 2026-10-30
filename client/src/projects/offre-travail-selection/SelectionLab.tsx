import { useMemo, useState } from 'react';
import { fmt, normCdf, simulateSelection } from '@atelier/shared';
import { LineChart } from '../../components/charts';
import './selection-lab.css';

/** Décalage de la constante de participation donnant un taux d'emploi cible (indice de variance 0,8² + 0,9² + 1). */
const shiftForRate = (rate: number) => {
  // inversion numérique de Φ((0,2 + s) / 1,565) = rate
  let lo = -3;
  let hi = 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (normCdf((0.2 + mid) / Math.sqrt(2.45)) < rate) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/**
 * Pourquoi corriger la sélection ? Données simulées : le salaire n'est observé que pour les femmes en emploi ;
 * quand la décision de travailler est corrélée aux inobservables du salaire (ρ ≠ 0), la droite des MCO
 * estimée sur les seules employées est biaisée ; un modèle de sélection la redresse.
 * Le devoir estime ce modèle (Tobit 2) par maximum de vraisemblance ; la simulation utilise la version
 * en deux étapes de Heckman, plus rapide à recalculer à chaque mouvement de curseur.
 */
export function SelectionLab({ paperRho = -0.15, paperRate = 0.64 }: { paperRho?: number; paperRate?: number }) {
  const paperShift = useMemo(() => shiftForRate(paperRate), [paperRate]);
  const [rho, setRho] = useState(paperRho);
  const [shift, setShift] = useState(paperShift);
  const [showHidden, setShowHidden] = useState(true);
  const res = useMemo(() => simulateSelection({ rho, participationShift: shift, n: 700, seed: 19461 }), [rho, shift]);

  const line = (f: { intercept: number; slope: number }) =>
    [
      [-2.6, f.intercept + f.slope * -2.6],
      [2.6, f.intercept + f.slope * 2.6],
    ] as [number, number][];

  const bias = (s: number) => (100 * (s - res.truth.slope)) / res.truth.slope;
  const pct = (v: number) => `${Math.abs(v) < 0.5 ? '0' : fmt(v, 0)} %`;
  const presets = [
    { label: `ρ du devoir (${fmt(paperRho, 2, 2)})`, rho: paperRho, shift: paperShift },
    { label: 'Pas de sélection (ρ = 0)', rho: 0, shift: paperShift },
    { label: 'Sélection forte (ρ = 0,7, 40 % d’emploi)', rho: 0.7, shift: shiftForRate(0.4) },
  ];

  return (
    <div className="slab">
      <div className="slab-controls">
        <div className="slab-presets" role="group" aria-label="Scénarios">
          {presets.map((p) => (
            <button
              key={p.label}
              className={Math.abs(rho - p.rho) < 1e-9 && Math.abs(shift - p.shift) < 1e-9 ? 'is-on' : ''}
              onClick={() => {
                setRho(p.rho);
                setShift(p.shift);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label>
          <span>
            Corrélation des inobservables ρ <b>{fmt(rho, 2, 2)}</b>
          </span>
          <input type="range" min={-0.9} max={0.9} step={0.05} value={rho} onChange={(e) => setRho(Number(e.target.value))} />
          <i className="slab-tick" style={{ left: `${((paperRho + 0.9) / 1.8) * 100}%` }} title="Valeur estimée dans le devoir" />
          <small>
            Trait vert : la valeur du devoir. ρ &lt; 0 : les facteurs non observés qui poussent à travailler vont de pair avec des salaires potentiels un peu plus bas.
          </small>
        </label>
        <label>
          <span>
            Taux d’emploi simulé <b>{fmt(res.shareSelected * 100, 0)} %</b>
          </span>
          <input type="range" min={-1.5} max={1.5} step={0.01} value={shift} onChange={(e) => setShift(Number(e.target.value))} />
          <small>≈ 64 % dans l’échantillon du devoir. Moins de participation = sélection plus forte.</small>
        </label>
        <label className="slab-check">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Montrer les salaires que la base ne voit pas
        </label>
        <table className="slab-table">
          <thead>
            <tr>
              <th>Pente du salaire</th>
              <th>β̂</th>
              <th>Écart</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <i className="k-truth" /> Vraie valeur
              </td>
              <td>{fmt(res.truth.slope, 3, 3)}</td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <i className="k-ols" /> MCO sur les employées
              </td>
              <td>{fmt(res.olsSelected.slope, 3, 3)}</td>
              <td className={Math.abs(bias(res.olsSelected.slope)) > 10 ? 'bad' : ''}>{pct(bias(res.olsSelected.slope))}</td>
            </tr>
            <tr>
              <td>
                <i className="k-heck" /> Corrigée de la sélection
              </td>
              <td>{fmt(res.heckman.slope, 3, 3)}</td>
              <td>{pct(bias(res.heckman.slope))}</td>
            </tr>
          </tbody>
        </table>
        <p className="slab-lambda">
          Ici, la correction suit la méthode en deux étapes de Heckman (probit, puis ratio de Mills ajouté au MCO ; λ̂ = <b>{fmt(res.heckman.lambda, 3, 3)}</b>,
          qui estime ρσ). Le devoir estime le même modèle d’un seul tenant, par <b>maximum de vraisemblance</b> (Tobit 2, <code>sampleSelection</code>) : il rapporte ρ
          directement, pas de λ.
        </p>
      </div>
      <div className="slab-chart">
        <LineChart
          ariaLabel="Salaire selon une caractéristique observée : employées, non-employées et droites estimées"
          series={[
            { id: 'truth', points: line(res.truth), color: 'var(--sl-truth)', width: 2, dash: '6 5' },
            { id: 'ols', points: line(res.olsSelected), color: 'var(--sl-ols)', width: 2.6 },
            { id: 'heck', points: line(res.heckman), color: 'var(--sl-heck)', width: 2.6 },
          ]}
          markers={res.points
            .filter((p) => p.selected || showHidden)
            .map((p) => ({ x: Math.max(-2.6, Math.min(2.6, p.x)), y: p.y, r: p.selected ? 2.6 : 2, color: p.selected ? 'var(--sl-dot)' : 'var(--sl-hidden)' }))}
          xDomain={[-2.6, 2.6]}
          yDomain={[0.6, 4]}
          xLabel="Caractéristique observée x (ex. diplôme, centrée-réduite)"
          yLabel="log salaire (simulé)"
          height={420}
          markersFirst
          xFormat={(v) => fmt(v, 0)}
          yFormat={(v) => fmt(v, 1)}
        />
        <div className="slab-legend">
          <span>
            <i className="dot-on" /> employée : salaire observé
          </span>
          <span>
            <i className="dot-off" /> sans emploi : salaire latent, invisible dans la base
          </span>
        </div>
        <p className="slab-note">
          Simulation pédagogique (700 individus, graine fixe), pas les données du devoir. Une variable z joue le rôle de couple / enfant : elle pèse sur l’emploi mais est exclue
          de l’équation de salaire, comme dans le Tobit 2 du devoir. Mêmes calculs que l’API <code>/api/models/selection</code>.
        </p>
      </div>
    </div>
  );
}
