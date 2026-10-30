import { useState } from 'react';
import { cohortRemaining, fmt, interpolate, stepAt } from '@atelier/shared';
import { LineChart } from '../../components/charts';
import './survival-lab.css';

export interface SurvivalData {
  /** Temps (mois) et Ŝ(t) de Kaplan–Meier. */
  times: number[];
  surv: number[];
  survLow?: number[];
  survHigh?: number[];
  /** Hasard cumulé de Nelson–Aalen (mêmes temps ou propres temps). */
  hazTimes?: number[];
  cumHaz?: number[];
  atRiskTimes?: number[];
  atRisk?: number[];
  /** Les valeurs ne sont publiées qu'à quelques horizons : interpolation linéaire entre eux. */
  sparse?: boolean;
  approx?: boolean;
}

/** Courbe de survie interactive : un curseur sur le temps, une cohorte de 100 abonnés qui se vide. */
export function SurvivalLab({ data, maxT = 72, initial = 12 }: { data: SurvivalData; maxT?: number; initial?: number }) {
  const [t, setT] = useState(initial);
  const S = (x: number) => (data.sparse ? interpolate([0, ...data.times], [1, ...data.surv], x) : stepAt(data.times, data.surv, x, 1));
  const H = (x: number) =>
    data.cumHaz && data.hazTimes ? (data.sparse ? interpolate([0, ...data.hazTimes], [0, ...data.cumHaz], x) : stepAt(data.hazTimes, data.cumHaz, x, 0)) : -Math.log(S(x));
  const n = data.atRisk && data.atRiskTimes ? stepAt(data.atRiskTimes, data.atRisk, t, data.atRisk[0]) : null;
  const s = S(t);
  const remaining = cohortRemaining(s, 100);
  /** Risque de résilier dans les 12 mois suivants, sachant que l'abonné est resté t mois : 1 − Ŝ(t+12)/Ŝ(t). */
  const next12 = t + 12 <= maxT ? 1 - S(t + 12) / s : null;
  const pts = (ys: number[]) => data.times.map((x, i) => [x, ys[i]] as [number, number]).filter(([, y]) => y !== null && y !== undefined && Number.isFinite(y));
  const survPts: [number, number][] = data.times[0] === 0 ? pts(data.surv) : [[0, 1], ...pts(data.surv)];
  const hazPts: [number, number][] | null =
    data.cumHaz && data.hazTimes ? data.hazTimes.map((x, i) => [x, data.cumHaz![i]] as [number, number]).filter(([, y]) => y !== null && Number.isFinite(y)) : null;

  return (
    <div className="slab-surv">
      <div className="sv-top">
        <label className="ed-range sv-range">
          <span className="ed-range-top">
            <span>Ancienneté de l’abonnement</span>
            <b>{t} mois</b>
          </span>
          <input type="range" min={0} max={maxT} step={1} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="Ancienneté en mois" />
          <span className="sv-presets">
            {[1, 6, 12, 24, 48, 72].map((m) => (
              <button key={m} className={t === m ? 'is-on' : ''} onClick={() => setT(m)}>
                {m} mois
              </button>
            ))}
          </span>
        </label>
        <div className="sv-figures" aria-live="polite">
          <div>
            <strong>{fmt(s * 100, 1, 1)} %</strong>
            <span>encore abonnés — Ŝ({t})</span>
          </div>
          <div>
            <strong>{fmt(H(t), 3, 3)}</strong>
            <span>hasard cumulé — Ĥ({t})</span>
          </div>
          {n !== null && (
            <div>
              <strong>{fmt(n)}</strong>
              <span>clients encore à risque</span>
            </div>
          )}
        </div>
      </div>

      <div className="sv-grid">
        <div className="sv-chart">
          <LineChart
            ariaLabel="Courbe de survie de Kaplan–Meier et hasard cumulé de Nelson–Aalen"
            series={[
              ...(data.survLow && data.survHigh
                ? [
                    {
                      id: 'lo',
                      points: pts(data.survLow),
                      color: 'var(--ed-accent)',
                      width: 1,
                      dash: '3 4',
                      step: !data.sparse,
                    },
                    {
                      id: 'hi',
                      points: pts(data.survHigh),
                      color: 'var(--ed-accent)',
                      width: 1,
                      dash: '3 4',
                      step: !data.sparse,
                    },
                  ]
                : []),
              {
                id: 'km',
                points: survPts,
                color: 'var(--ed-accent)',
                width: 2.6,
                step: !data.sparse,
                area: true,
                areaOpacity: 0.1,
                dots: data.sparse,
              },
              ...(hazPts
                ? [
                    {
                      id: 'na',
                      points: hazPts,
                      color: 'var(--ed-brick)',
                      width: 2,
                      step: !data.sparse,
                      dash: '7 5',
                    },
                  ]
                : []),
            ]}
            xDomain={[0, maxT]}
            yDomain={[0, 1]}
            xTicks={[0, 12, 24, 36, 48, 60, 72].filter((v) => v <= maxT)}
            yTicks={[0, 0.25, 0.5, 0.75, 1]}
            yFormat={(v) => fmt(v, 2)}
            xLabel="Ancienneté (mois)"
            cursorX={t}
            onHoverX={(x) => x !== null && setT(Math.round(x))}
            hlines={[{ y: 0.5, color: 'var(--ed-muted)', dash: '2 4' }]}
            markers={[{ x: t, y: s, color: 'var(--ed-accent)', r: 6 }, ...(hazPts ? [{ x: t, y: H(t), color: 'var(--ed-brick)', r: 4.5 }] : [])]}
            height={340}
          />
          <div className="sv-legend">
            <span>
              <i className="sv-km" /> Ŝ(t) Kaplan–Meier
            </span>
            {hazPts && (
              <span>
                <i className="sv-na" /> Ĥ(t) Nelson–Aalen
              </span>
            )}
            {data.survLow && (
              <span>
                <i className="sv-ci" /> intervalle de confiance à 95 %
              </span>
            )}
            <span>
              <i className="sv-med" /> Ŝ = 0,5 : médiane non atteinte sur 72 mois
            </span>
            {data.sparse && <span className="sv-sparse">points publiés reliés (interpolation entre les horizons)</span>}
          </div>
        </div>
        <div className="sv-cohort" aria-label={`${remaining} abonnés sur 100 encore présents`}>
          <div className="sv-cohort-t">Une cohorte de 100 abonnés</div>
          <div className="sv-dots">
            {Array.from({ length: 100 }, (_, i) => (
              <i key={i} className={i < remaining ? 'in' : 'out'} />
            ))}
          </div>
          <div className="sv-cohort-n">
            <b>{remaining}</b> restent · <b>{100 - remaining}</b> ont résilié
          </div>
          {next12 !== null && (
            <div className="sv-next">
              <span>Parmi ceux qui sont restés {t} mois, part qui résilie dans l’année suivante</span>
              <b>{fmt(next12 * 100, 1, 1)} %</b>
              <small>
                calculé : 1 − Ŝ({t + 12}) / Ŝ({t})
              </small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
