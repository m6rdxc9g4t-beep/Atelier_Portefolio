import { useId, useMemo, useState } from 'react';
import {
  estimer,
  fitHedonique,
  fmtDec,
  fmtEur,
  fmtInt,
  fmtPct,
  indiceCommune,
  lecture,
  type Commune,
  type DepartementData,
  type ModeleHedonique,
} from './model';

const SURFACE_MIN = 10;
const SURFACE_MAX = 400;

/** Estimation de prix par le modèle hédonique ajusté sur l'échantillon du département, coefficients expliqués. */
export function Estimator({ dep, commune, annee }: { dep: DepartementData; commune: Commune; annee: number }) {
  const id = useId();
  const model = useMemo<ModeleHedonique | Error>(() => {
    try {
      return fitHedonique(dep);
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [dep]);
  const [type, setType] = useState<'M' | 'A'>('M');
  const [surfaceTxt, setSurfaceTxt] = useState('90');
  const [pieces, setPieces] = useState(4);
  const [an, setAn] = useState<number | null>(null);
  const anneeEst = an ?? annee;

  const surface = Number(surfaceTxt.replace(',', '.'));
  const surfaceOk = surfaceTxt.trim() !== '' && Number.isFinite(surface) && surface >= SURFACE_MIN && surface <= SURFACE_MAX;
  const lnIndice = useMemo(() => indiceCommune(commune, dep), [commune, dep]);

  if (model instanceof Error) {
    return (
      <div className="oi-state oi-state-inline" role="alert">
        <strong>Modèle non estimable pour ce département.</strong>
        <span>{model.message}.</span>
      </div>
    );
  }
  const est = surfaceOk ? estimer(model, { surface, pieces, type, annee: anneeEst, lnIndice }) : null;
  const ref = model.annees[0];
  const maxLog = est ? Math.max(0.25, ...est.facteurs.map((f) => Math.abs(Math.log(f.facteur)))) : 1;

  return (
    <div className="oi-est">
      <form className="oi-est-form" onSubmit={(e) => e.preventDefault()} aria-label="Caractéristiques du bien">
        <div className="oi-field">
          <span className="oi-label" id={`${id}-type`}>
            Type de bien
          </span>
          <div className="oi-seg" role="group" aria-labelledby={`${id}-type`}>
            <button type="button" aria-pressed={type === 'M'} onClick={() => setType('M')}>
              Maison
            </button>
            <button type="button" aria-pressed={type === 'A'} onClick={() => setType('A')}>
              Appartement
            </button>
          </div>
        </div>
        <div className="oi-field">
          <label className="oi-label" htmlFor={`${id}-s`}>
            Surface habitable
          </label>
          <div className="oi-input-unit">
            <input
              id={`${id}-s`}
              inputMode="decimal"
              value={surfaceTxt}
              onChange={(e) => setSurfaceTxt(e.target.value)}
              aria-invalid={!surfaceOk}
              aria-describedby={`${id}-s-err`}
            />
            <span aria-hidden="true">m²</span>
          </div>
          <input
            type="range"
            min={SURFACE_MIN}
            max={250}
            step={1}
            value={surfaceOk ? Math.min(250, surface) : 90}
            onChange={(e) => setSurfaceTxt(e.target.value)}
            aria-label="Surface habitable (curseur)"
          />
          <span id={`${id}-s-err`} className={surfaceOk ? 'oi-hint' : 'oi-error'}>
            {surfaceOk ? `Entre ${SURFACE_MIN} et ${SURFACE_MAX} m².` : `Saisissez une surface entre ${SURFACE_MIN} et ${SURFACE_MAX} m².`}
          </span>
        </div>
        <div className="oi-field">
          <span className="oi-label" id={`${id}-p`}>
            Pièces principales
          </span>
          <div className="oi-stepper" role="group" aria-labelledby={`${id}-p`}>
            <button
              type="button"
              onClick={() => setPieces((p) => Math.max(1, p - 1))}
              disabled={pieces <= 1}
              aria-label="Une pièce de moins"
            >
              <StepIcon plus={false} />
            </button>
            <output aria-live="polite">{pieces}</output>
            <button
              type="button"
              onClick={() => setPieces((p) => Math.min(10, p + 1))}
              disabled={pieces >= 10}
              aria-label="Une pièce de plus"
            >
              <StepIcon plus />
            </button>
          </div>
        </div>
        <div className="oi-field">
          <label className="oi-label" htmlFor={`${id}-a`}>
            Année de la vente
          </label>
          <select id={`${id}-a`} className="oi-select" value={anneeEst} onChange={(e) => setAn(Number(e.target.value))}>
            {model.annees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="oi-field">
          <span className="oi-label">Commune</span>
          <span className="oi-commune-fixed">
            <b>{commune.n}</b>
            <span className="oi-meta">
              indice {fmtPct(Math.exp(lnIndice) - 1, true)} par rapport au département · à changer sur la carte
            </span>
          </span>
        </div>
      </form>

      <div className="oi-est-result" aria-live="polite">
        {est ? (
          <>
            <p className="oi-est-label">Prix estimé</p>
            <p className="oi-est-price">{fmtEur(est.prix)}</p>
            <p className="oi-est-sub">
              soit {fmtInt(Math.round(est.prixM2 / 10) * 10)} €/m² · intervalle à 80 % : {fmtEur(est.bas)} à {fmtEur(est.haut)}
            </p>
            <ol className="oi-factors" aria-label="Décomposition du prix">
              <li className="oi-factor-ref">
                <span>Bien de référence</span>
                <span className="oi-factor-note">maison, 100 m², 4 pièces, commune au niveau du département, {ref}</span>
                <b>{fmtEur(est.reference)}</b>
              </li>
              {est.facteurs.map((f) => {
                const l = Math.log(f.facteur);
                const w = (Math.abs(l) / maxLog) * 50;
                return (
                  <li key={f.key}>
                    <span>{f.label}</span>
                    <span className="oi-factor-bar" aria-hidden="true">
                      <span className="oi-factor-axis" />
                      <span
                        className={`oi-factor-fill ${l < 0 ? 'neg' : ''}`}
                        style={{ width: `${w}%`, left: l < 0 ? `${50 - w}%` : '50%' }}
                      />
                    </span>
                    <b>
                      × {fmtDec(f.facteur, 2)} <small>{fmtPct(f.facteur - 1, true)}</small>
                    </b>
                  </li>
                );
              })}
              <li className="oi-factor-total">
                <span>Prix estimé</span>
                <b>{fmtEur(est.prix)}</b>
              </li>
            </ol>
          </>
        ) : (
          <p className="oi-empty-note">Indiquez une surface valide pour obtenir une estimation.</p>
        )}
      </div>

      <div className="oi-coefs">
        <div className="oi-block-head">
          <h4>Coefficients estimés</h4>
          <span className="oi-meta">variable expliquée : ln(prix) · écarts-types robustes (White, HC1)</span>
        </div>
        <div className="oi-scroll">
          <table className="oi-table oi-table-coefs">
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col" className="oi-num">
                  Coefficient
                </th>
                <th scope="col" className="oi-num">
                  Écart-type
                </th>
                <th scope="col" className="oi-num">
                  t
                </th>
                <th scope="col">Lecture</th>
              </tr>
            </thead>
            <tbody>
              {model.coefs.map((c) => (
                <tr key={c.key}>
                  <th scope="row">{c.label}</th>
                  <td className="oi-num" data-label="coef.">
                    {fmtDec(c.beta, 3)}
                  </td>
                  <td className="oi-num" data-label="é.-t.">
                    {fmtDec(c.se, 3)}
                  </td>
                  <td className="oi-num" data-label="t">
                    {fmtDec(c.t, 1)}
                  </td>
                  <td className="oi-lecture">{lecture(c, ref)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="oi-fit">
          <div>
            <dt>Ventes utilisées</dt>
            <dd>{fmtInt(model.n)}</dd>
          </div>
          <div>
            <dt>R²</dt>
            <dd>{fmtDec(model.r2, 2)}</dd>
          </div>
          <div>
            <dt>Écart-type des résidus (log)</dt>
            <dd>{fmtDec(model.sigma, 2)}</dd>
          </div>
          <div>
            <dt>Erreur médiane hors échantillon</dt>
            <dd>{fmtPct(model.validation.erreurMediane)}</dd>
          </div>
          <div>
            <dt>Couverture de l’intervalle à 80 %</dt>
            <dd>{fmtPct(model.validation.couverture80)}</dd>
          </div>
        </dl>
        <p className="oi-caption">
          Validation : le modèle est réestimé sans une vente sur cinq ({fmtInt(model.validation.n)} ventes), puis on mesure son erreur sur
          ces ventes mises de côté. Une couverture proche de 80 % indique un intervalle honnête.
        </p>
      </div>
    </div>
  );
}

/** Signe moins / plus dessiné (trait 1,75, comme les icônes du site). */
function StepIcon({ plus }: { plus: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={plus ? 'M5 12h14M12 5v14' : 'M5 12h14'} />
    </svg>
  );
}
