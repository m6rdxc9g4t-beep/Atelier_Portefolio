import { useId, useMemo, useState } from 'react';
import {
  bestThreshold,
  calibrationDeciles,
  confusion,
  gainByThreshold,
  gainCurve,
  netGain,
  prCurve,
  rocCurve,
  runModel,
  simulateAbonnes,
  theoreticalThreshold,
  topReasons,
  type Economics,
} from './model';
import { CalibrationChart, GainByThresholdChart, gainAt, OddsRow, UnitCurve } from './charts';
import { eur, eur2, int, num, pct } from './format';

const LAMBDAS = [0, 10, 100, 1000, 5000];
const DEFAULT_ECO: Economics = { valeur: 360, coutOffre: 25, succes: 0.3 };

/** Cote multipliée par… : « × 1,43 » ou « ÷ 2,10 » pour rester lisible quand l'effet protège. */
function orText(or: number) {
  return or >= 1 ? `× ${num(or)}` : `÷ ${num(1 / or)}`;
}

export default function Tool() {
  const abonnes = useMemo(() => simulateAbonnes(), []);
  const [lambdaIdx, setLambdaIdx] = useState(1);
  const [withLog, setWithLog] = useState(true);
  const [eco, setEco] = useState<Economics>(DEFAULT_ECO);
  const [threshold, setThreshold] = useState<number | null>(null);
  const ids = { lambda: useId(), log: useId(), v: useId(), c: useId(), s: useId(), t: useId() };

  const lambda = LAMBDAS[lambdaIdx]!;
  const run = useMemo(() => runModel(abonnes, { lambda, withLog }), [abonnes, lambda, withLog]);
  const { testScores: scores, testLabels: labels } = run;

  const evals = useMemo(() => {
    const roc = rocCurve(scores, labels);
    const pr = prCurve(scores, labels);
    return { roc, pr, deciles: calibrationDeciles(scores, labels), gain: gainCurve(scores, labels, 20) };
  }, [scores, labels]);

  const curve = useMemo(() => gainByThreshold(scores, labels, eco), [scores, labels, eco]);
  const best = useMemo(() => bestThreshold(scores, labels, eco), [scores, labels, eco]);
  const t = threshold ?? Math.round(best.threshold * 100) / 100;
  const conf = confusion(scores, labels, t);
  const gainNow = netGain(conf, eco);
  const contacted = conf.tp + conf.fp;
  const positives = conf.tp + conf.fn;
  const theo = theoreticalThreshold(eco);

  const coefRows = run.features.map((f, j) => {
    const b = run.fit.betaRaw[j + 1]!;
    const se = run.fit.seRaw[j]!;
    return {
      f,
      or: Math.exp(b * f.unit),
      lo: Math.exp((b - 1.96 * se) * f.unit),
      hi: Math.exp((b + 1.96 * se) * f.unit),
      truth: f.truth === null ? null : Math.exp(f.truth * f.unit),
    };
  });
  // Les trois effets les plus forts, en phrases.
  const strongest = [...coefRows].sort((a, b) => Math.abs(Math.log(b.or)) - Math.abs(Math.log(a.or))).slice(0, 3);

  const atRisk = useMemo(
    () =>
      run.test
        .map((a, i) => ({ a, p: scores[i]! }))
        .sort((x, y) => y.p - x.p)
        .slice(0, 20)
        .map((r) => ({ ...r, reasons: topReasons(run, r.a) })),
    [run, scores],
  );

  const gain10 = evals.gain[2]!.y;
  const gain20 = evals.gain[4]!.y;

  return (
    <div className="chn-tool">
      {/* ── Modèle ── */}
      <section className="chn-panel chn-toolbar" aria-label="Réglages du modèle">
        <div className="chn-tb-group">
          <span id={ids.lambda} className="chn-tb-label">
            Régularisation L2 (λ)
          </span>
          <div className="chn-seg" role="group" aria-labelledby={ids.lambda}>
            {LAMBDAS.map((l, i) => (
              <button key={l} type="button" aria-pressed={i === lambdaIdx} className={i === lambdaIdx ? 'is-on' : ''} onClick={() => setLambdaIdx(i)}>
                {int(l)}
              </button>
            ))}
          </div>
        </div>
        <label className="chn-check" htmlFor={ids.log}>
          <input id={ids.log} type="checkbox" checked={withLog} onChange={(e) => setWithLog(e.target.checked)} />
          Ajouter log(1 + ancienneté) pour capter le risque des premiers mois
        </label>
        <p className="chn-tb-meta">
          Appris sur {int(run.train.length)} abonnés, évalué sur {int(run.test.length)} jamais vus · {run.fit.iterations} itérations de Newton
        </p>
      </section>

      {/* ── Indicateurs ── */}
      <div className="chn-kpis">
        <div className="chn-kpi">
          <span className="chn-kpi-label">Taux de résiliation</span>
          <span className="chn-kpi-value">{pct(run.churnRate)}</span>
          <span className="chn-kpi-sub">sur le mois suivant, {int(abonnes.length)} abonnés</span>
        </div>
        <div className="chn-kpi">
          <span className="chn-kpi-label">AUC sur le test</span>
          <span className="chn-kpi-value">{num(run.auc, 3)}</span>
          <span className="chn-kpi-sub">plafond du vrai modèle : {num(run.aucOracle, 3)}</span>
        </div>
        <div className="chn-kpi">
          <span className="chn-kpi-label">Précision moyenne</span>
          <span className="chn-kpi-value">{num(run.averagePrecision, 3)}</span>
          <span className="chn-kpi-sub">au hasard : {num(positivesRate(labels), 3)}</span>
        </div>
        <div className="chn-kpi">
          <span className="chn-kpi-label">Gain net au seuil de {pct(t, 0)}</span>
          <span className={`chn-kpi-value ${gainNow >= 0 ? 'is-good' : 'is-bad'}`}>{eur(gainNow)}</span>
          <span className="chn-kpi-sub">
            {int(contacted)} abonnés contactés sur {int(labels.length)}
          </span>
        </div>
      </div>

      {/* ── Coefficients ── */}
      <section className="chn-panel" aria-labelledby="chn-coef-title">
        <div className="chn-head">
          <h2 id="chn-coef-title">Ce qui fait partir les abonnés</h2>
          <span className="chn-legend">
            <i className="chn-key chn-key-up" /> augmente le risque <i className="chn-key chn-key-down" /> le réduit <i className="chn-key chn-key-truth" /> valeur
            simulée
          </span>
        </div>
        <ul className="chn-sentences">
          {strongest.map((r) => (
            <li key={r.f.key}>
              <strong>{r.f.label}</strong> ({r.f.unitLabel}) : la cote de résiliation est {r.or >= 1 ? 'multipliée' : 'divisée'} par{' '}
              <strong>{num(r.or >= 1 ? r.or : 1 / r.or)}</strong>.
            </li>
          ))}
        </ul>
        <div className="chn-table-wrap">
          <table className="chn-coefs">
            <caption className="chn-sr">Odds ratios estimés, intervalle à 95 % approché et valeur simulée</caption>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Unité</th>
                <th scope="col" className="chn-or-col">
                  <span className="chn-or-scale" aria-hidden="true">
                    <span>÷ 10</span>
                    <span>1</span>
                    <span>× 10</span>
                  </span>
                  <span className="chn-sr">Effet sur une échelle logarithmique</span>
                </th>
                <th scope="col" className="is-num">
                  Effet estimé
                </th>
                <th scope="col" className="is-num">
                  IC 95 %
                </th>
                <th scope="col" className="is-num">
                  Simulé
                </th>
              </tr>
            </thead>
            <tbody>
              {coefRows.map((r) => (
                <tr key={r.f.key}>
                  <th scope="row">{r.f.label}</th>
                  <td className="chn-unit">{r.f.unitLabel}</td>
                  <td className="chn-or-col">
                    <OddsRow or={r.or} lo={r.lo} hi={r.hi} truth={r.truth} />
                  </td>
                  <td className="is-num">{orText(r.or)}</td>
                  <td className="is-num chn-ci">
                    {num(r.lo)} – {num(r.hi)}
                  </td>
                  <td className="is-num chn-truth">{r.truth === null ? 'non linéaire' : orText(r.truth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Évaluation ── */}
      <section className="chn-panel" aria-labelledby="chn-eval-title">
        <div className="chn-head">
          <h2 id="chn-eval-title">Le score sépare-t-il bien les départs ?</h2>
          <span className="chn-head-meta">sur les {int(labels.length)} abonnés du test</span>
        </div>
        <div className="chn-charts">
          <figure className="chn-fig">
            <figcaption>
              <strong>Courbe ROC</strong> · AUC {num(run.auc, 3)}
            </figcaption>
            <UnitCurve
              points={evals.roc}
              reference={[
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ]}
              referenceLabel="hasard"
              xLabel="Taux de faux positifs"
              yLabel="Taux de vrais positifs"
              label={`Courbe ROC, aire sous la courbe ${num(run.auc, 3)}`}
              readout={(p) => `${pct(p.y, 0)} des départs pour ${pct(p.x, 0)} des fidèles`}
              fill
            />
          </figure>
          <figure className="chn-fig">
            <figcaption>
              <strong>Précision et rappel</strong> · précision moyenne {num(run.averagePrecision, 3)}
            </figcaption>
            <UnitCurve
              points={evals.pr.points.filter((p) => p.x > 0)}
              reference={[
                { x: 0, y: positivesRate(labels) },
                { x: 1, y: positivesRate(labels) },
              ]}
              referenceLabel="hasard"
              xLabel="Rappel (départs repérés)"
              yLabel="Précision (contacts justes)"
              label={`Courbe précision rappel, précision moyenne ${num(run.averagePrecision, 3)}`}
              readout={(p) => `rappel ${pct(p.x, 0)}, précision ${pct(p.y, 0)}`}
            />
          </figure>
          <figure className="chn-fig">
            <figcaption>
              <strong>Calibration</strong> · par décile de score
            </figcaption>
            <CalibrationChart deciles={evals.deciles} />
          </figure>
          <figure className="chn-fig">
            <figcaption>
              <strong>Gain cumulé</strong> · 10 % des contacts captent {pct(gain10, 0)} des départs (lift {num(gain10 / 0.1, 1)})
            </figcaption>
            <UnitCurve
              points={evals.gain}
              reference={[
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ]}
              referenceLabel="hasard"
              xLabel="Part des abonnés contactés (les plus à risque d’abord)"
              yLabel="Part des départs captés"
              label={`Gain cumulé : 20 % des contacts captent ${pct(gain20, 0)} des départs`}
              readout={(p) => `${pct(p.x, 0)} contactés → ${pct(p.y, 0)} des départs (lift ${p.x > 0 ? num(p.y / p.x, 1) : '–'})`}
              fill
            />
          </figure>
        </div>
      </section>

      {/* ── Décision ── */}
      <section className="chn-panel" aria-labelledby="chn-dec-title">
        <div className="chn-head">
          <h2 id="chn-dec-title">Qui contacter ? Le seuil se choisit en euros</h2>
          <button type="button" className="btn" onClick={() => setThreshold(null)} disabled={threshold === null}>
            Revenir au meilleur seuil
          </button>
        </div>
        <div className="chn-decision">
          <div className="chn-sliders">
            <Slider
              id={ids.v}
              label="Valeur d’un abonné conservé"
              value={eco.valeur}
              min={100}
              max={1200}
              step={10}
              display={eur(eco.valeur)}
              onChange={(v) => setEco({ ...eco, valeur: v })}
            />
            <Slider
              id={ids.c}
              label="Coût d’une offre de rétention"
              value={eco.coutOffre}
              min={5}
              max={150}
              step={5}
              display={eur(eco.coutOffre)}
              onChange={(v) => setEco({ ...eco, coutOffre: v })}
            />
            <Slider
              id={ids.s}
              label="Part des partants que l’offre retient"
              value={Math.round(eco.succes * 100)}
              min={5}
              max={80}
              step={5}
              display={pct(eco.succes, 0)}
              onChange={(v) => setEco({ ...eco, succes: v / 100 })}
            />
            <Slider
              id={ids.t}
              label="Seuil de contact"
              value={Math.round(t * 100)}
              min={1}
              max={99}
              step={1}
              display={pct(t, 0)}
              onChange={(v) => setThreshold(v / 100)}
            />
            <p className="chn-note">
              Contacter n’est rentable que si p × {pct(eco.succes, 0)} × {eur(eco.valeur)} ≥ {eur(eco.coutOffre)}, soit un score d’au moins{' '}
              <strong>{pct(theo, 1)}</strong> pour un score parfaitement calibré. Le meilleur seuil observé sur le test est{' '}
              <strong>{pct(best.threshold, 1)}</strong>.
            </p>
          </div>

          <div className="chn-decision-main">
            <GainByThresholdChart curve={curve} threshold={t} best={best} onPick={setThreshold} />
            <p className="chn-summary">
              Au seuil de <strong>{pct(t, 0)}</strong>, on contacte <strong>{int(contacted)}</strong> abonnés sur {int(labels.length)} (
              {pct(contacted / labels.length, 0)}) et l’on touche <strong>{int(conf.tp)}</strong> des {int(positives)} départs (
              {pct(positives ? conf.tp / positives : 0, 0)}). Gain net estimé : <strong className={gainNow >= 0 ? 'is-good' : 'is-bad'}>{eur(gainNow)}</strong>
              {contacted > 0 && <>, soit {eur2(gainNow / contacted)} par contact</>}. Au meilleur seuil : {eur(gainAt(curve, best.threshold).gain)}.
            </p>
            <table className="chn-confusion">
              <caption className="chn-sr">Matrice de confusion au seuil choisi</caption>
              <thead>
                <tr>
                  <td />
                  <th scope="col">A résilié</th>
                  <th scope="col">Est resté</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Contacté</th>
                  <td className="is-tp">
                    <strong>{int(conf.tp)}</strong>
                    <span>départs ciblés : {pct(eco.succes, 0)} retenus</span>
                  </td>
                  <td className="is-fp">
                    <strong>{int(conf.fp)}</strong>
                    <span>offres envoyées pour rien</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Pas contacté</th>
                  <td className="is-fn">
                    <strong>{int(conf.fn)}</strong>
                    <span>départs manqués</span>
                  </td>
                  <td className="is-tn">
                    <strong>{int(conf.tn)}</strong>
                    <span>laissés tranquilles</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Liste d'action ── */}
      <section className="chn-panel" aria-labelledby="chn-risk-title">
        <div className="chn-head">
          <h2 id="chn-risk-title">Les 20 abonnés les plus à risque</h2>
          <span className="chn-head-meta">avec ce qui pèse le plus dans leur score</span>
        </div>
        <div className="chn-table-wrap">
          <table className="chn-risk">
            <thead>
              <tr>
                <th scope="col" className="is-num">
                  Rang
                </th>
                <th scope="col">Abonné</th>
                <th scope="col" className="is-num">
                  Score
                </th>
                <th scope="col">Principaux facteurs</th>
                <th scope="col">Mois suivant</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.map((r, i) => (
                <tr key={r.a.id}>
                  <td className="is-num">{i + 1}</td>
                  <td className="chn-id">n° {String(r.a.id).padStart(4, '0')}</td>
                  <td className="is-num">
                    <span className="chn-score">
                      <span className="chn-score-bar" style={{ width: `${Math.round(r.p * 100)}%` }} />
                      {pct(r.p, 0)}
                    </span>
                  </td>
                  <td>
                    <ul className="chn-reasons">
                      {r.reasons.map((x) => (
                        <li key={x.text}>{x.text}</li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <span className={`chn-outcome ${r.a.churn ? 'is-gone' : 'is-stay'}`}>{r.a.churn ? 'a résilié' : 'est resté'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="chn-foot">
          Les facteurs sont les contributions au score par rapport à un abonné moyen (coefficient × écart à la moyenne). La dernière colonne
          n’était pas connue du modèle : c’est ce qui s’est passé ensuite.
        </p>
      </section>
    </div>
  );
}

function positivesRate(labels: readonly number[]) {
  return labels.reduce((s, v) => s + v, 0) / labels.length;
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="chn-slider">
      <div className="chn-slider-top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
