import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Formula } from '../../components/Formula';
import { simulateDid } from './model';
import { num, pEq, signed } from './format';
import { RangeField, Readout } from './ui';
import { DidChart } from './charts';

const DEFAULTS = { effect: 3, trend: 0.4, gap: 6, noise: 2, violation: 0 };
const k = (v: number, d = 1) => `${signed(v, d)} k€`;

/** Onglet 3 : différence de différences sur un panel simulé (signalé comme tel). */
export default function DidTab() {
  const [p, setP] = useState(DEFAULTS);
  const [seed, setSeed] = useState(2026);
  const set = (key: keyof typeof DEFAULTS) => (v: number) => setP((s) => ({ ...s, [key]: v }));
  const r = useMemo(() => simulateDid({ ...p, seed }), [p, seed]);
  const covered = r.didLow <= p.effect && p.effect <= r.didHigh;
  const preWarn = r.preTrend.pValue < 0.05;
  const rows = [
    {
      name: 'Différence de différences',
      what: 'Variation des traités moins variation des témoins',
      est: r.did,
      main: true,
    },
    {
      name: 'Avant / après, traités seuls',
      what: 'Mélange l’effet et la tendance commune',
      est: r.naiveBeforeAfter,
      main: false,
    },
    {
      name: 'Traités contre témoins, après',
      what: 'Mélange l’effet et l’écart de niveau entre groupes',
      est: r.naivePostGap,
      main: false,
    },
  ];

  return (
    <div className="lab-body">
      <form className="lab-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Paramètres de la simulation">
        <div className="lab-sim">
          <span className="lab-tag lab-tag--sim">
            <Icon name="flask" size={13} /> Données simulées
          </span>
          <p>
            {r.units} magasins reçoivent une nouvelle mise en rayon à la semaine {r.pre + 1}, {r.units} autres servent de témoins. On suit leurs ventes
            hebdomadaires pendant {r.pre} semaines avant et {r.post} après.
          </p>
        </div>
        <RangeField label="Effet réel de la mesure" value={p.effect} onChange={set('effect')} min={-4} max={8} step={0.5} format={(v) => k(v)} />
        <RangeField label="Tendance commune" value={p.trend} onChange={set('trend')} min={-1} max={1} step={0.1} format={(v) => `${k(v)} / sem.`} />
        <RangeField label="Écart de niveau des traités" value={p.gap} onChange={set('gap')} min={-10} max={10} step={1} format={(v) => k(v, 0)} />
        <RangeField label="Bruit hebdomadaire (écart-type)" value={p.noise} onChange={set('noise')} min={0} max={6} step={0.5} format={(v) => `${num(v, 1)} k€`} />
        <div className="lab-violate">
          <RangeField
            label="Violer les tendances parallèles"
            value={p.violation}
            onChange={set('violation')}
            min={-0.6}
            max={0.6}
            step={0.05}
            format={(v) => (v === 0 ? 'non' : `${k(v, 2)} / sem.`)}
            hint="Tendance propre aux magasins traités, qui existait déjà avant la mesure."
          />
        </div>
        <div className="lab-actions">
          <button type="button" className="btn" onClick={() => setSeed((s) => s + 1)}>
            <Icon name="play" size={14} /> Nouveau tirage
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setP(DEFAULTS);
              setSeed(2026);
            }}
          >
            Réinitialiser
          </button>
        </div>
      </form>

      <div className="lab-results">
        <p className="lab-headline" aria-live="polite">
          La différence de différences estime l’effet à <strong>{k(r.did)}</strong> (IC 95 % [{num(r.didLow, 1)} ; {num(r.didHigh, 1)}]) pour un effet
          réel de {k(p.effect)}.{' '}
          {p.violation !== 0
            ? `Les tendances ne sont plus parallèles : biais attendu de ${k(r.didBias)}.`
            : covered
              ? 'L’intervalle contient la vraie valeur.'
              : 'Ce tirage tombe hors de l’intervalle, ce qui arrive environ une fois sur vingt.'}
        </p>

        <div className="lab-block">
          <h3 className="lab-h">Ventes hebdomadaires moyennes par magasin</h3>
          <DidChart weeks={r.weeks} pre={r.pre} control={r.control} treated={r.treated} counterfactual={r.counterfactual} />
          <details className="lab-details">
            <summary>Voir les données du graphique</summary>
            <div className="lab-scroll">
              <table className="lab-table lab-table--tight">
                <thead>
                  <tr>
                    <th scope="col">Semaine</th>
                    <th scope="col" className="num">Témoins</th>
                    <th scope="col" className="num">Traités</th>
                    <th scope="col" className="num">Contrefactuel</th>
                  </tr>
                </thead>
                <tbody>
                  {r.weeks.map((w, i) => (
                    <tr key={w}>
                      <td>
                        S{w} {i < r.pre ? '(avant)' : '(après)'}
                      </td>
                      <td className="num">{num(r.control[i], 2)}</td>
                      <td className="num">{num(r.treated[i], 2)}</td>
                      <td className="num">{i >= r.pre ? num(r.counterfactual[i] ?? NaN, 2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="lab-block">
          <h3 className="lab-h">Trois façons d’estimer l’effet</h3>
          <table className="lab-table">
            <thead>
              <tr>
                <th scope="col">Estimateur</th>
                <th scope="col" className="num">Estimation</th>
                <th scope="col" className="num">Écart à l’effet réel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className={row.main ? 'is-current' : undefined}>
                  <td>
                    <span className="lab-est-name">{row.name}</span>
                    <span className="lab-est-what">{row.what}</span>
                  </td>
                  <td className="num">{k(row.est, 2)}</td>
                  <td className={`num ${!row.main && Math.abs(row.est - p.effect) > 1 ? 'is-off' : ''}`}>{k(row.est - p.effect, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lab-readouts lab-readouts--3">
          <Readout label="Erreur type de la DiD" value={`${num(r.didSe, 2)} k€`} sub={`Welch sur les variations par magasin, ${num(r.didDf, 0)} ddl`} />
          <Readout label="Biais théorique" value={k(r.didBias, 2)} sub="tendance propre × 10 semaines d’écart moyen" />
          <Readout
            label="Écart de pente avant la mesure"
            value={`${signed(r.preTrend.slope, 3)} k€ / sem.`}
            sub={`${pEq(r.preTrend.pValue)} (${r.pre - 2} ddl)`}
          />
        </div>
        <p className={`lab-pretrend ${preWarn ? 'is-warn' : ''}`}>
          <Icon name={preWarn ? 'circle-alert' : 'check'} size={15} />
          <span>
            {preWarn
              ? 'Les deux groupes divergeaient déjà avant la mesure : l’hypothèse de tendances parallèles est rejetée, l’estimation DiD est biaisée.'
              : 'Avant la mesure, rien ne contredit des tendances parallèles. Un test non significatif ne les prouve pas pour autant : il manque peut-être de puissance.'}
          </span>
        </p>

        <div className="lab-formula lab-formula--compact">
          <Formula
            tex={`\\begin{aligned}\\hat\\tau_{\\text{DiD}}&=\\big(\\bar Y_{T,\\text{après}}-\\bar Y_{T,\\text{avant}}\\big)\\\\&\\quad-\\big(\\bar Y_{C,\\text{après}}-\\bar Y_{C,\\text{avant}}\\big)\\\\&=${num(r.did, 2).replace(',', '{,}').replace('−', '-')}\\end{aligned}`}
          />
        </div>
      </div>
    </div>
  );
}
