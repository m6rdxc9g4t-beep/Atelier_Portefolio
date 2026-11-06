import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { Formula } from '../../components/Formula';
import {
  bayesBetaBinomial,
  bonferroni,
  holm,
  parseNumber,
  parsePValues,
  peekingFalsePositiveRate,
  srmCheck,
  twoProportionTest,
  welchTest,
} from './model';
import { normCdf } from './stats';
import { int, num, pct, pEq, pts, pval, signed, signedPct } from './format';
import { InputError, NumField, Readout, Segmented } from './ui';
import { IntervalChart, PosteriorChart } from './charts';

type Metric = 'prop' | 'mean';

/** Une vérification (contrôle de qualité du test) ; seul un problème est coloré. */
function Check({ title, warn, children }: { title: string; warn: boolean; children: ReactNode }) {
  return (
    <li className={`lab-check ${warn ? 'is-warn' : ''}`}>
      <span className="lab-check-ic" aria-hidden="true">
        <Icon name={warn ? 'circle-alert' : 'check'} size={15} />
      </span>
      <div>
        <p className="lab-check-t">
          {title}
          {warn && <span className="lab-sr"> (à vérifier)</span>}
        </p>
        <div className="lab-check-d">{children}</div>
      </div>
    </li>
  );
}

const req = (raw: string, label: string, opts: { int?: boolean; min?: number; positive?: boolean } = {}) => {
  const v = parseNumber(raw);
  if (v === null) return { v: null, e: `${label} : saisissez un nombre.` };
  if (opts.int && !Number.isInteger(v)) return { v: null, e: `${label} : un nombre entier.` };
  if (opts.min !== undefined && v < opts.min) return { v: null, e: `${label} : au moins ${int(opts.min)}.` };
  if (opts.positive && v < 0) return { v: null, e: `${label} : une valeur positive ou nulle.` };
  return { v, e: null as string | null };
};

/** Onglet 2 : analyse d'un test terminé (fréquentiste), contrôles, et lecture bayésienne distincte. */
export default function AnalysisTab() {
  const [metric, setMetric] = useState<Metric>('prop');
  const [alpha, setAlpha] = useState(0.05);
  // Conversions
  const [nARaw, setNA] = useState('10 000');
  const [xARaw, setXA] = useState('600');
  const [nBRaw, setNB] = useState('10 050');
  const [xBRaw, setXB] = useState('680');
  // Moyennes (panier moyen)
  const [mARaw, setMA] = useState('52,30');
  const [sARaw, setSA] = useState('31,0');
  const [kARaw, setKA] = useState('1 200');
  const [mBRaw, setMB] = useState('54,80');
  const [sBRaw, setSB] = useState('33,5');
  const [kBRaw, setKB] = useState('1 180');
  // Contrôles
  const [planRaw, setPlan] = useState('50');
  const [looksRaw, setLooks] = useState('1');
  const [otherRaw, setOther] = useState('');

  const out = useMemo(() => {
    const e: Record<string, string> = {};
    const plan = req(planRaw, 'Part prévue', {});
    if (plan.e) e.plan = plan.e;
    else if (plan.v! <= 0 || plan.v! >= 100) e.plan = 'Entre 0 et 100 %, bornes exclues.';
    const looks = req(looksRaw, 'Consultations', { int: true, min: 1 });
    if (looks.e) e.looks = looks.e;
    else if (looks.v! > 20) e.looks = 'Au plus 20 consultations dans cette démo.';
    const others = parsePValues(otherRaw);
    if (others.error) e.other = others.error;

    if (metric === 'prop') {
      const nA = req(nARaw, 'Visiteurs A', { int: true, min: 1 });
      const xA = req(xARaw, 'Conversions A', { int: true, positive: true });
      const nB = req(nBRaw, 'Visiteurs B', { int: true, min: 1 });
      const xB = req(xBRaw, 'Conversions B', { int: true, positive: true });
      if (nA.e) e.nA = nA.e;
      if (xA.e) e.xA = xA.e;
      if (nB.e) e.nB = nB.e;
      if (xB.e) e.xB = xB.e;
      if (!xA.e && !nA.e && xA.v! > nA.v!) e.xA = 'Plus de conversions que de visiteurs.';
      if (!xB.e && !nB.e && xB.v! > nB.v!) e.xB = 'Plus de conversions que de visiteurs.';
      if (!e.nA && !e.nB && nA.v! + nB.v! > 5e8) e.nB = 'Au plus 500 millions de visiteurs au total.';
      if (Object.keys(e).length) return { e } as const;
      const test = twoProportionTest(nA.v!, xA.v!, nB.v!, xB.v!, alpha);
      if (!test) return { e: { global: 'Test non défini : il faut au moins une conversion et au moins un visiteur non converti.' } } as const;
      return {
        e,
        kind: 'prop' as const,
        test,
        n: [nA.v!, nB.v!] as const,
        bayes: bayesBetaBinomial(nA.v!, xA.v!, nB.v!, xB.v!),
        srm: srmCheck(nA.v!, nB.v!, plan.v! / 100),
        looks: looks.v!,
        others: others.values,
      };
    }
    const mA = req(mARaw, 'Moyenne A');
    const sA = req(sARaw, 'Écart-type A', { positive: true });
    const kA = req(kARaw, 'Effectif A', { int: true, min: 2 });
    const mB = req(mBRaw, 'Moyenne B');
    const sB = req(sBRaw, 'Écart-type B', { positive: true });
    const kB = req(kBRaw, 'Effectif B', { int: true, min: 2 });
    for (const [k, r] of Object.entries({ mA, sA, kA, mB, sB, kB })) if (r.e) e[k] = r.e;
    if (Object.keys(e).length) return { e } as const;
    const test = welchTest(mA.v!, sA.v!, kA.v!, mB.v!, sB.v!, kB.v!, alpha);
    if (!test) return { e: { global: 'Test non défini : les deux écarts-types sont nuls.' } } as const;
    return {
      e,
      kind: 'mean' as const,
      test,
      n: [kA.v!, kB.v!] as const,
      means: [mA.v!, mB.v!] as const,
      srm: srmCheck(kA.v!, kB.v!, plan.v! / 100),
      looks: looks.v!,
      others: others.values,
    };
  }, [metric, alpha, nARaw, xARaw, nBRaw, xBRaw, mARaw, sARaw, kARaw, mBRaw, sBRaw, kBRaw, planRaw, looksRaw, otherRaw]);

  const e = out.e as Record<string, string>;
  type Ok = Extract<typeof out, { kind: 'prop' | 'mean' }>;
  const res: Ok | null = 'kind' in out ? (out as Ok) : null;
  const ok = res !== null;
  const level = pct(1 - alpha, 0);
  const peek = useMemo(() => (res ? peekingFalsePositiveRate(res.looks, alpha) : NaN), [ok, res?.looks, alpha]);

  const fmtDiff = (v: number) => (res?.kind === 'prop' ? pts(v, 2) : signed(v, 2));

  return (
    <div className="lab-body">
      <form className="lab-inputs" onSubmit={(ev) => ev.preventDefault()} aria-label="Résultats observés">
        <Segmented
          label="Métrique"
          options={[
            { value: 'prop', label: 'Conversion' },
            { value: 'mean', label: 'Moyenne' },
          ]}
          value={metric}
          onChange={setMetric}
        />
        {metric === 'prop' ? (
          <>
            <fieldset className="lab-fieldset">
              <legend>
                <i className="lab-swatch lab-s1" aria-hidden="true" /> Groupe A (contrôle)
              </legend>
              <div className="lab-pair">
                <NumField label="Visiteurs" value={nARaw} onChange={setNA} inputMode="numeric" error={e.nA} />
                <NumField label="Conversions" value={xARaw} onChange={setXA} inputMode="numeric" error={e.xA} />
              </div>
            </fieldset>
            <fieldset className="lab-fieldset">
              <legend>
                <i className="lab-swatch lab-s2" aria-hidden="true" /> Groupe B (variante)
              </legend>
              <div className="lab-pair">
                <NumField label="Visiteurs" value={nBRaw} onChange={setNB} inputMode="numeric" error={e.nB} />
                <NumField label="Conversions" value={xBRaw} onChange={setXB} inputMode="numeric" error={e.xB} />
              </div>
            </fieldset>
          </>
        ) : (
          <>
            <fieldset className="lab-fieldset">
              <legend>
                <i className="lab-swatch lab-s1" aria-hidden="true" /> Groupe A (contrôle)
              </legend>
              <div className="lab-triple">
                <NumField label="Moyenne" value={mARaw} onChange={setMA} error={e.mA} />
                <NumField label="Écart-type" value={sARaw} onChange={setSA} error={e.sA} />
                <NumField label="Effectif" value={kARaw} onChange={setKA} inputMode="numeric" error={e.kA} />
              </div>
            </fieldset>
            <fieldset className="lab-fieldset">
              <legend>
                <i className="lab-swatch lab-s2" aria-hidden="true" /> Groupe B (variante)
              </legend>
              <div className="lab-triple">
                <NumField label="Moyenne" value={mBRaw} onChange={setMB} error={e.mB} />
                <NumField label="Écart-type" value={sBRaw} onChange={setSB} error={e.sB} />
                <NumField label="Effectif" value={kBRaw} onChange={setKB} inputMode="numeric" error={e.kB} />
              </div>
            </fieldset>
          </>
        )}
        <Segmented
          label="Seuil α (test bilatéral)"
          options={[
            { value: 0.01, label: '1 %' },
            { value: 0.05, label: '5 %' },
            { value: 0.1, label: '10 %' },
          ]}
          value={alpha}
          onChange={setAlpha}
        />
        <fieldset className="lab-fieldset">
          <legend>Contrôles</legend>
          <NumField label="Part du trafic prévue pour B" value={planRaw} onChange={setPlan} suffix="%" error={e.plan} />
          <NumField
            label="Nombre de consultations des résultats"
            value={looksRaw}
            onChange={setLooks}
            inputMode="numeric"
            error={e.looks}
            hint="Combien de fois le test a été regardé, avec arrêt possible dès « significatif »."
          />
          <div className="lab-field">
            <label htmlFor="lab-other">Autres p-valeurs du même test (facultatif)</label>
            <textarea
              id="lab-other"
              rows={2}
              value={otherRaw}
              onChange={(ev) => setOther(ev.target.value)}
              placeholder="0,04 ; 0,20 ; 0,51"
              aria-invalid={e.other ? 'true' : undefined}
              aria-describedby="lab-other-help"
            />
            <p id="lab-other-help" className={e.other ? 'lab-field-err' : 'lab-field-hint'}>
              {e.other ?? 'Autres métriques ou variantes comparées : elles comptent dans la correction.'}
            </p>
          </div>
        </fieldset>
      </form>

      <div className="lab-results">
        {!res ? (
          <InputError>
            <strong>{e.global ?? 'Analyse impossible avec ces valeurs.'}</strong>{' '}
            {!e.global && 'Corrigez le ou les champs signalés à gauche ; le résultat s’affichera aussitôt.'}
          </InputError>
        ) : (
          <>
            {(() => {
              const t = res.test;
              const sig = t.pValue < alpha;
              const verdict = sig ? (
                <>
                  Différence <strong>significative</strong> au seuil de {pct(alpha, 0)} ({pEq(t.pValue)}).
                </>
              ) : (
                <>
                  Différence <strong>non significative</strong> au seuil de {pct(alpha, 0)} ({pEq(t.pValue)}) : l’intervalle contient zéro, les données
                  sont compatibles avec une absence d’effet.
                </>
              );
              return res.kind === 'prop' ? (
                <p className="lab-headline" aria-live="polite">
                  B convertit à <strong>{pct(res.test.pB, 2)}</strong> contre {pct(res.test.pA, 2)} pour A, soit {pts(res.test.diff, 2)}
                  {res.test.lift !== null && <> ({signedPct(res.test.lift, 1)})</>}. {verdict}
                </p>
              ) : (
                <p className="lab-headline" aria-live="polite">
                  La moyenne de B est de <strong>{num(res.means[1], 2)}</strong> contre {num(res.means[0], 2)} pour A, soit {signed(res.test.diff, 2)}
                  {res.test.lift !== null && <> ({signedPct(res.test.lift, 1)})</>}. {verdict}
                </p>
              );
            })()}

            <div className="lab-readouts">
              <Readout
                label={res.kind === 'prop' ? 'Différence (B − A)' : 'Différence des moyennes'}
                value={fmtDiff(res.test.diff)}
                sub={`IC ${level} [${fmtDiff(res.test.ciLow)} ; ${fmtDiff(res.test.ciHigh)}]`}
              />
              <Readout
                label="Écart relatif"
                value={res.test.lift === null ? '—' : signedPct(res.test.lift, 1)}
                sub={
                  res.kind === 'prop' && res.test.liftLow !== null && res.test.liftHigh !== null
                    ? `IC ${level} [${signedPct(res.test.liftLow, 1)} ; ${signedPct(res.test.liftHigh, 1)}]`
                    : res.kind === 'prop'
                      ? 'non défini sans conversion'
                      : 'rapporté à la moyenne de A'
                }
              />
              <Readout
                label={res.kind === 'prop' ? 'Statistique z' : 'Statistique t de Welch'}
                value={num(res.kind === 'prop' ? res.test.z : res.test.t, 2)}
                sub={res.kind === 'mean' ? `${num(res.test.df, 1)} degrés de liberté` : 'variance poolée sous H₀'}
              />
              <Readout label="p-valeur (bilatérale)" value={pval(res.test.pValue)} sub={res.test.pValue < alpha ? `< α = ${num(alpha, 2)}` : `≥ α = ${num(alpha, 2)}`} />
            </div>

            <div className="lab-block">
              <h3 className="lab-h">Intervalle de confiance à {level} de la différence</h3>
              <IntervalChart
                est={res.test.diff}
                low={res.test.ciLow}
                high={res.test.ciHigh}
                format={fmtDiff}
                label={`Différence B − A, intervalle à ${level}`}
              />
              <div className="lab-formula lab-formula--compact">
                {res.kind === 'prop' ? (
                  <>
                    <Formula tex={`z=\\frac{\\hat p_B-\\hat p_A}{\\sqrt{\\hat p(1-\\hat p)\\left(\\frac1{n_A}+\\frac1{n_B}\\right)}}`} />
                    <Formula tex={`\\text{IC} : \\hat p_B-\\hat p_A\\pm z_{1-\\alpha/2}\\sqrt{\\tfrac{\\hat p_A(1-\\hat p_A)}{n_A}+\\tfrac{\\hat p_B(1-\\hat p_B)}{n_B}}`} />
                  </>
                ) : (
                  <>
                  <Formula tex={`t=\\frac{\\bar x_B-\\bar x_A}{\\sqrt{s_A^2/n_A+s_B^2/n_B}}`} />
                  <Formula
                    tex={`\\nu=\\frac{\\left(s_A^2/n_A+s_B^2/n_B\\right)^2}{\\frac{(s_A^2/n_A)^2}{n_A-1}+\\frac{(s_B^2/n_B)^2}{n_B-1}}`}
                  />
                  </>
                )}
              </div>
            </div>

            <div className="lab-block">
              <h3 className="lab-h">Avant de conclure : trois vérifications</h3>
              <ul className="lab-checks">
                <Check title="Répartition des groupes (SRM)" warn={res.srm.flagged}>
                  <p>
                    Observé : {int(res.n[0])} / {int(res.n[1])} ; attendu : {int(res.srm.expectedA)} / {int(res.srm.expectedB)}. χ² = {num(res.srm.chi2, 2)}, {pEq(res.srm.pValue)}.
                  </p>
                  <p>
                    {res.srm.flagged
                      ? 'Écart anormal (p < 0,001) : l’affectation ou le suivi des visiteurs est probablement défaillant. Ne concluez pas avant d’en avoir trouvé la cause.'
                      : 'Rien d’anormal au seuil usuel de 0,001.'}
                  </p>
                </Check>
                <Check title="Consultations répétées (peeking)" warn={res.looks > 1}>
                  {res.looks > 1 ? (
                    <p>
                      En regardant {int(res.looks)} fois et en s’arrêtant au premier « significatif », le vrai risque de faux positif n’est pas de{' '}
                      {pct(alpha, 0)} mais de <strong>{pct(peek, 1)}</strong>. Fixez la durée à l’avance, ou utilisez un plan séquentiel (O’Brien–Fleming,
                      Pocock).
                    </p>
                  ) : (
                    <p>Une seule lecture, à la date prévue : le risque de faux positif reste de {pct(alpha, 0)}.</p>
                  )}
                </Check>
                <Check title="Tests multiples" warn={res.others.length > 0 && holm([res.test.pValue, ...res.others])[0] >= alpha && res.test.pValue < alpha}>
                  {res.others.length === 0 ? (
                    <p>
                      Une seule comparaison déclarée. Si vous suivez plusieurs métriques ou variantes, ajoutez leurs p-valeurs à gauche : avec 5 comparaisons
                      indépendantes, la probabilité d’au moins un faux positif monte à {pct(1 - (1 - alpha) ** 5, 0)}.
                    </p>
                  ) : (
                    <MultipleTable p={[res.test.pValue, ...res.others]} alpha={alpha} />
                  )}
                </Check>
              </ul>
            </div>

            <section className="lab-bayes" aria-labelledby="lab-bayes-h">
              <div className="lab-bayes-head">
                <h3 id="lab-bayes-h" className="lab-h">
                  Lecture bayésienne
                </h3>
                <span className="lab-tag">Autre cadre d’inférence</span>
              </div>
              {res.kind === 'prop' ? (
                <>
                  <p className="lab-note">
                    A priori uniforme Beta(1, 1) sur chaque taux, mis à jour par les données : Beta(1 + conversions, 1 + non-conversions). La réponse porte
                    directement sur la question posée : quelle est la probabilité que B soit meilleur ?
                  </p>
                  <div className="lab-readouts lab-readouts--3">
                    <Readout label="P(taux B > taux A)" value={pct(res.bayes.probBBeatsA, 1)} sub="calcul exact (somme finie)" />
                    <Readout label="Taux A, intervalle crédible 95 %" value={`${pct(res.bayes.ciA[0], 2)} – ${pct(res.bayes.ciA[1], 2)}`} />
                    <Readout label="Taux B, intervalle crédible 95 %" value={`${pct(res.bayes.ciB[0], 2)} – ${pct(res.bayes.ciB[1], 2)}`} />
                  </div>
                  <PosteriorChart
                    aA={res.bayes.aA}
                    bA={res.bayes.bA}
                    aB={res.bayes.aB}
                    bB={res.bayes.bB}
                    lo={Math.max(0, Math.min(res.bayes.ciA[0], res.bayes.ciB[0]) - 0.6 * Math.max(res.bayes.ciA[1] - res.bayes.ciA[0], res.bayes.ciB[1] - res.bayes.ciB[0]))}
                    hi={Math.min(1, Math.max(res.bayes.ciA[1], res.bayes.ciB[1]) + 0.6 * Math.max(res.bayes.ciA[1] - res.bayes.ciA[0], res.bayes.ciB[1] - res.bayes.ciB[0]))}
                  />
                </>
              ) : (
                <>
                  <p className="lab-note">
                    Pour une moyenne, avec un a priori non informatif et l’approximation normale, la loi a posteriori de la différence est centrée sur{' '}
                    {signed(res.test.diff, 2)} avec un écart-type de {num(res.test.se, 2)}.
                  </p>
                  <div className="lab-readouts lab-readouts--3">
                    <Readout label="P(moyenne B > moyenne A)" value={pct(normCdf(res.test.diff / res.test.se), 1)} sub="approximation normale" />
                  </div>
                </>
              )}
              <p className="lab-note lab-note--rule">
                Ce n’est pas « 1 − p ». La p-valeur mesure la surprise des données si A et B étaient identiques ; la probabilité bayésienne dépend aussi de
                l’a priori. Les deux lectures se complètent, elles ne se remplacent pas.
              </p>
            </section>

            {res.kind === 'prop' && res.test.minExpected < 5 && (
              <InputError>
                Effectifs attendus inférieurs à 5 dans au moins une case : l’approximation normale est fragile. Préférez un test exact de Fisher.
              </InputError>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MultipleTable({ p, alpha }: { p: number[]; alpha: number }) {
  const b = bonferroni(p);
  const h = holm(p);
  return (
    <>
      <table className="lab-table lab-table--tight">
        <thead>
          <tr>
            <th scope="col">Comparaison</th>
            <th scope="col" className="num">p brute</th>
            <th scope="col" className="num">Bonferroni</th>
            <th scope="col" className="num">Holm</th>
          </tr>
        </thead>
        <tbody>
          {p.map((v, i) => (
            <tr key={i} className={i === 0 ? 'is-current' : undefined}>
              <td>{i === 0 ? 'Ce test' : `Autre n° ${i}`}</td>
              <td className="num">{pval(v)}</td>
              <td className={`num ${b[i] < alpha ? 'is-sig' : ''}`}>{pval(b[i])}</td>
              <td className={`num ${h[i] < alpha ? 'is-sig' : ''}`}>{pval(h[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {p.length} comparaisons : après correction de Holm (plus puissante que Bonferroni, même garantie), ce test est{' '}
        {h[0] < alpha ? <strong>toujours significatif</strong> : <strong>non significatif</strong>} au seuil de {pct(alpha, 0)}.
      </p>
    </>
  );
}
