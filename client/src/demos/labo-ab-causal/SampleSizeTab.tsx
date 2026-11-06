import { useMemo, useState } from 'react';
import { Formula } from '../../components/Formula';
import { minimalDetectableEffect, parseNumber, sampleSize, targetRate, type Sides } from './model';
import { int, num, pct, plural, pts, signedPct } from './format';
import { InputError, NumField, RangeField, Readout, Segmented } from './ui';
import { PowerChart } from './charts';

const tex = (x: number, d: number) => num(x, d).replace(',', '{,}').replace(/\s/g, '\\,');

/** Onglet 1 : taille d'échantillon, durée et courbe de puissance d'un test de deux proportions. */
export default function SampleSizeTab() {
  const [baseRaw, setBaseRaw] = useState('4');
  const [mdeMode, setMdeMode] = useState<'relative' | 'absolute'>('relative');
  const [mdeRaw, setMdeRaw] = useState('10');
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [sides, setSides] = useState<Sides>('two');
  const [shareB, setShareB] = useState(50);
  const [trafficRaw, setTrafficRaw] = useState('5 000');

  const switchMode = (m: 'relative' | 'absolute') => {
    if (m === mdeMode) return;
    const base = parseNumber(baseRaw);
    const mde = parseNumber(mdeRaw);
    // Convertit la valeur saisie pour garder le même effet.
    if (base !== null && mde !== null && base > 0) {
      const v = m === 'absolute' ? (base * mde) / 100 : (mde / base) * 100;
      setMdeRaw(num(v, m === 'absolute' ? 2 : 1).replace(/ | /g, ' '));
    }
    setMdeMode(m);
  };

  const v = useMemo(() => {
    const errors: Record<string, string> = {};
    const base = parseNumber(baseRaw);
    if (base === null) errors.base = 'Saisissez un nombre, par exemple 4 ou 2,5.';
    else if (base <= 0 || base >= 100) errors.base = 'Un taux entre 0 et 100 %, bornes exclues.';
    const mde = parseNumber(mdeRaw);
    if (mde === null) errors.mde = 'Saisissez un nombre, par exemple 10.';
    else if (mde <= 0) errors.mde = 'L’effet à détecter doit être strictement positif.';
    let pB = NaN;
    if (base !== null && mde !== null && !errors.base && !errors.mde) {
      pB = targetRate(base / 100, mde / 100, mdeMode);
      if (pB >= 1) errors.mde = `Le taux attendu en B dépasserait 100 % (${pct(pB, 1)}).`;
    }
    const traffic = parseNumber(trafficRaw);
    if (traffic === null) errors.traffic = 'Saisissez un nombre de visiteurs, par exemple 5 000.';
    else if (traffic < 1) errors.traffic = 'Au moins un visiteur par jour.';
    else if (traffic > 1e9) errors.traffic = 'Au plus un milliard de visiteurs par jour.';
    if (Object.keys(errors).length) return { errors, res: null, pB };
    const res = sampleSize({
      baseline: base! / 100,
      mde: mde! / 100,
      mdeMode,
      alpha,
      power,
      sides,
      shareB: shareB / 100,
      dailyTraffic: traffic!,
    });
    if (!Number.isFinite(res.nTotal) || res.nTotal > 1e10)
      return { errors: { mde: 'Effet trop petit : il faudrait plus de 10 milliards de visiteurs.' }, res: null, pB };
    return { errors, res, pB, traffic: traffic! };
  }, [baseRaw, mdeRaw, mdeMode, alpha, power, sides, shareB, trafficRaw]);

  const res = v.res;
  const traffic = 'traffic' in v ? (v.traffic as number) : 0;
  const weeks = res ? Math.ceil(res.days / 7) : 0;
  const w = shareB / 100;

  const mdeRows = useMemo(() => {
    if (!res) return [];
    return [1, 2, 4, 8].map((k) => {
      const n = traffic * 7 * k;
      const d = minimalDetectableEffect(res.pA, n, alpha, power, sides, w);
      return { k, n, d };
    });
  }, [res, traffic, alpha, power, sides, w]);

  const za = sides === 'two' ? 'z_{1-\\alpha/2}' : 'z_{1-\\alpha}';

  return (
    <div className="lab-body">
      <form className="lab-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Hypothèses du test">
        <NumField label="Taux de conversion actuel (A)" value={baseRaw} onChange={setBaseRaw} suffix="%" error={v.errors.base} />
        <Segmented
          label="Effet minimal à détecter"
          options={[
            { value: 'relative', label: 'Relatif' },
            { value: 'absolute', label: 'Absolu' },
          ]}
          value={mdeMode}
          onChange={switchMode}
        />
        <NumField
          label={mdeMode === 'relative' ? 'Hausse relative' : 'Hausse en points'}
          value={mdeRaw}
          onChange={setMdeRaw}
          suffix={mdeMode === 'relative' ? '%' : 'pt'}
          error={v.errors.mde}
          hint={Number.isFinite(v.pB) && !v.errors.base ? <>Taux attendu en B : {pct(v.pB, 2)}</> : undefined}
        />
        <Segmented
          label="Seuil de significativité α"
          options={[
            { value: 0.01, label: '1 %' },
            { value: 0.05, label: '5 %' },
            { value: 0.1, label: '10 %' },
          ]}
          value={alpha}
          onChange={setAlpha}
        />
        <Segmented
          label="Puissance visée (1 − β)"
          options={[
            { value: 0.8, label: '80 %' },
            { value: 0.9, label: '90 %' },
            { value: 0.95, label: '95 %' },
          ]}
          value={power}
          onChange={setPower}
        />
        <Segmented
          label="Hypothèse alternative"
          options={[
            { value: 'two', label: 'Bilatérale' },
            { value: 'one', label: 'Unilatérale (B > A)' },
          ]}
          value={sides}
          onChange={setSides}
        />
        <RangeField
          label="Part du trafic envoyée vers B"
          value={shareB}
          onChange={setShareB}
          min={10}
          max={90}
          step={5}
          format={(x) => `${x} %`}
        />
        <NumField label="Visiteurs par jour dans le test" value={trafficRaw} onChange={setTrafficRaw} inputMode="numeric" error={v.errors.traffic} />
      </form>

      <div className="lab-results">
        {!res ? (
          <InputError>
            <strong>Calcul impossible avec ces valeurs.</strong> Corrigez le ou les champs signalés à gauche ; le résultat s’affichera aussitôt.
          </InputError>
        ) : (
          <>
            <p className="lab-headline" aria-live="polite">
              Il faut <strong>{int(res.nA)}</strong> visiteurs en A et <strong>{int(res.nB)}</strong> en B, soit{' '}
              <strong>{plural(res.days, 'jour', 'jours')}</strong> de test à {int(traffic)} visiteurs par jour.
            </p>
            <div className="lab-readouts">
              <Readout label="Groupe A (contrôle)" value={int(res.nA)} sub={`taux ${pct(res.pA, 2)}`} />
              <Readout label="Groupe B (variante)" value={int(res.nB)} sub={`taux attendu ${pct(res.pB, 2)}`} />
              <Readout label="Total" value={int(res.nTotal)} sub={`effet ${pts(res.delta, 2)} (${signedPct(res.delta / res.pA, 1)})`} />
              <Readout label="Durée" value={plural(res.days, 'jour', 'jours')} sub={`prévoir ${plural(weeks, 'semaine complète', 'semaines complètes')}`} />
            </div>

            <div className="lab-block">
              <h3 className="lab-h">Puissance selon le nombre de visiteurs</h3>
              <p className="lab-note">
                Probabilité de conclure à un effet s’il existe vraiment un effet de {pts(res.delta, 2)}. Survolez ou touchez la courbe pour lire chaque point.
              </p>
              <PowerChart pA={res.pA} pB={res.pB} alpha={alpha} sides={sides} w={w} nStar={res.nTotal} target={power} daily={traffic} />
            </div>

            <div className="lab-block">
              <h3 className="lab-h">Si la durée est imposée</h3>
              <p className="lab-note">Plus petit effet détectable avec la même puissance, selon la durée du test.</p>
              <table className="lab-table">
                <thead>
                  <tr>
                    <th scope="col">Durée</th>
                    <th scope="col" className="num">Visiteurs</th>
                    <th scope="col" className="num">Effet détectable</th>
                    <th scope="col" className="num">Soit</th>
                  </tr>
                </thead>
                <tbody>
                  {mdeRows.map((r) => (
                    <tr key={r.k}>
                      <td>{plural(r.k, 'semaine', 'semaines')}</td>
                      <td className="num">{int(r.n)}</td>
                      <td className="num">{r.d === null ? 'hors de portée' : pts(r.d, 2)}</td>
                      <td className="num">{r.d === null ? '—' : signedPct(r.d / res.pA, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lab-block">
              <h3 className="lab-h">Formule (approximation normale, deux proportions)</h3>
              <div className="lab-formula">
                <Formula tex={`N=\\frac{\\left(${za}\\,S_0+z_{1-\\beta}\\,S_1\\right)^2}{(p_B-p_A)^2}`} />
                <Formula tex={`S_0=\\sqrt{\\bar p(1-\\bar p)\\left(\\tfrac{1}{1-w}+\\tfrac{1}{w}\\right)}`} />
                <Formula tex={`S_1=\\sqrt{\\tfrac{p_A(1-p_A)}{1-w}+\\tfrac{p_B(1-p_B)}{w}}`} />
                <Formula tex={`\\bar p=(1-w)\\,p_A+w\\,p_B`} />
                <Formula tex={`n_A=\\lceil(1-w)N\\rceil,\\quad n_B=\\lceil wN\\rceil`} />
              </div>
              <p className="lab-formula-values">
                <Formula display={false} tex={`${za}=${tex(res.zAlpha, 3)}`} />
                <Formula display={false} tex={`z_{1-\\beta}=${tex(res.zBeta, 3)}`} />
                <Formula display={false} tex={`\\bar p=${tex(res.pBar * 100, 3)}\\,\\%`} />
                <Formula display={false} tex={`w=${tex(w * 100, 0)}\\,\\%`} />
                <Formula display={false} tex={`N=${tex(res.nTotalExact, 1)}`} />
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
