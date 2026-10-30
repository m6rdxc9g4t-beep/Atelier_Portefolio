import { useMemo, useState } from 'react';
import { fmt } from '@atelier/shared';
import { LineChart } from '../../components/charts';

export interface ThresholdCurve {
  threshold: number[];
  fpr: number[];
  tpr: number[];
}
export interface Roc {
  train: { fpr: number[]; tpr: number[] };
  test: { fpr: number[]; tpr: number[] };
}

const PI = 0.133; // part des assurés sinistrés (rapport)
const YOUDEN = 0.1394;

/** Interpolation linéaire sur une grille croissante. */
function interp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  const j = xs.findIndex((v) => v >= x);
  const t = (x - xs[j - 1]) / (xs[j] - xs[j - 1]);
  return ys[j - 1] + t * (ys[j] - ys[j - 1]);
}

/** Répartit 100 assurés en VP / FN / FP / VN (arrondi au plus fort reste). */
function hundred(tpr: number, fpr: number) {
  const raw = [PI * tpr, PI * (1 - tpr), (1 - PI) * fpr, (1 - PI) * (1 - fpr)].map((v) => v * 100);
  const base = raw.map(Math.floor);
  let rest = 100 - base.reduce((a, b) => a + b, 0);
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (rest > 0) {
        base[i] += 1;
        rest -= 1;
      }
    });
  return base; // [VP, FN, FP, VN]
}

/**
 * Simulateur de décision : où placer le seuil ? Les taux (sensibilité, faux positifs) selon le seuil
 * sont lus sur l'échelle de couleur de la courbe ROC du rapport ; la part classée « à risque »,
 * la VPP et le coût espéré suivent les formules du rapport (équations 5.2, 6.1 et 6.3).
 */
export function DecisionLab({ curve, roc }: { curve: ThresholdCurve; roc: Roc }) {
  const [mode, setMode] = useState<'seuil' | 'cout'>('seuil');
  const [t, setT] = useState(YOUDEN);
  const [rho, setRho] = useState(5);
  const tStar = 1 / (1 + rho);
  const thr = mode === 'cout' ? tStar : t;

  const tpr = interp(curve.threshold, curve.tpr, thr);
  const fpr = interp(curve.threshold, curve.fpr, thr);
  const share = PI * tpr + (1 - PI) * fpr;
  const vpp = (PI * tpr) / share;
  const vpn = ((1 - PI) * (1 - fpr)) / ((1 - PI) * (1 - fpr) + PI * (1 - tpr));
  const [vp, fn, fp, vn] = hundred(tpr, fpr);

  // coût espéré (en unités de C(FP)) pour 1 000 contrats, sur la grille de seuils
  const cost = (k: number) => 1000 * ((1 - PI) * curve.fpr[k] + rho * PI * (1 - curve.tpr[k]));
  const costCurve = useMemo(() => curve.threshold.map((x, k) => [x, cost(k)] as [number, number]), [curve, rho]); // eslint-disable-line react-hooks/exhaustive-deps
  const costAt = 1000 * ((1 - PI) * fpr + rho * PI * (1 - tpr));
  const best = costCurve.reduce((a, b) => (b[1] < a[1] ? b : a));
  const cells = [...Array(vp).fill('vp'), ...Array(fn).fill('fn'), ...Array(fp).fill('fp'), ...Array(vn).fill('vn')];

  return (
    <div className="sim dlab">
      <div className="dlab-modes" role="tablist" aria-label="Mode de choix du seuil">
        <button role="tab" aria-selected={mode === 'seuil'} className={mode === 'seuil' ? 'is-on' : ''} onClick={() => setMode('seuil')}>
          Choisir un seuil
        </button>
        <button role="tab" aria-selected={mode === 'cout'} className={mode === 'cout' ? 'is-on' : ''} onClick={() => setMode('cout')}>
          Partir des coûts (seuil économique)
        </button>
      </div>

      <div className="sim-grid">
        <div>
          {mode === 'seuil' ? (
            <div className="field">
              <label htmlFor="dlab-t">
                Seuil de probabilité t <span className="fv">{fmt(t, 3, 3)}</span>
              </label>
              <input id="dlab-t" type="range" min={0.03} max={0.45} step={0.001} value={t} onChange={(e) => setT(Number(e.target.value))} />
              <div className="dlab-presets">
                <button onClick={() => setT(YOUDEN)} className={Math.abs(t - YOUDEN) < 1e-9 ? 'is-on' : ''}>
                  Youden du rapport · 0,1394
                </button>
                <button onClick={() => setT(0.25)}>Prudent · 0,25</button>
                <button onClick={() => setT(0.08)}>Large · 0,08</button>
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="dlab-rho">
                Un faux négatif coûte ρ fois un faux positif <span className="fv">ρ = {fmt(rho, 1, 1)}</span>
              </label>
              <input id="dlab-rho" type="range" min={1} max={15} step={0.5} value={rho} onChange={(e) => setRho(Number(e.target.value))} />
              <p className="dlab-formula">
                Seuil économique t* = 1 / (1 + ρ) = <b>{fmt(tStar, 3, 3)}</b>
              </p>
            </div>
          )}

          <div className="dlab-kpis">
            <div>
              <span>Sinistrés repérés</span>
              <b>{fmt(tpr * 100, 1, 1)} %</b>
              <small>sensibilité</small>
            </div>
            <div>
              <span>Prudents mal classés</span>
              <b>{fmt(fpr * 100, 1, 1)} %</b>
              <small>taux de faux positifs</small>
            </div>
            <div>
              <span>Portefeuille « à risque »</span>
              <b>{fmt(share * 100, 1, 1)} %</b>
              <small>π·TPR + (1 − π)·FPR</small>
            </div>
            <div>
              <span>Valeur prédictive positive</span>
              <b>{fmt(vpp * 100, 0)} %</b>
              <small>VPN ≈ {fmt(vpn * 100, 0)} %</small>
            </div>
          </div>

          {mode === 'cout' && (
            <div className="dlab-cost">
              <div className="sa-chart-title">Coût espéré pour 1 000 contrats (en unités de C(FP))</div>
              <LineChart
                ariaLabel="Coût espéré selon le seuil"
                xDomain={[0.02, 0.5]}
                yDomain={[0, Math.max(...costCurve.map((p) => p[1])) * 1.05]}
                height={210}
                width={560}
                margin={{ top: 10, right: 12, bottom: 32, left: 52 }}
                xFormat={(v) => fmt(v, 2, 2)}
                yFormat={(v) => fmt(v)}
                series={[{ id: 'c', points: costCurve, color: 'var(--gold)', width: 2.2, smooth: true }]}
                vlines={[
                  { x: tStar, label: 't*', color: 'var(--gold)' },
                  { x: YOUDEN, label: 'Youden', color: 'var(--dim)', anchor: 'end' },
                ]}
                markers={[{ x: tStar, y: costAt, color: '#fff', r: 5 }]}
              />
              <p className="sa-cap">
                Au seuil t*, coût ≈ {fmt(costAt)} ; minimum de la courbe ≈ {fmt(best[1])} vers t = {fmt(best[0], 2, 2)} (calculé). t* n’est optimal que si les probabilités sont bien
                calibrées, ce que le rapport recommande de vérifier.
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="sa-chart-title">Sur 100 assurés, au seuil {fmt(thr, 3, 3)}</div>
          <div className="dlab-grid" role="img" aria-label={`${vp} sinistrés repérés, ${fn} sinistrés manqués, ${fp} fausses alertes, ${vn} prudents bien classés`}>
            {cells.map((c, i) => (
              <i key={i} className={c} />
            ))}
          </div>
          <ul className="dlab-legend">
            <li>
              <i className="vp" /> {vp} sinistrés repérés
            </li>
            <li>
              <i className="fn" /> {fn} sinistrés manqués
            </li>
            <li>
              <i className="fp" /> {fp} fausses alertes
            </li>
            <li>
              <i className="vn" /> {vn} prudents classés « sûrs »
            </li>
          </ul>
          <div className="sa-chart-title dlab-roc-t">Courbe ROC (apprentissage)</div>
          <LineChart
            ariaLabel="Courbe ROC avec le point de fonctionnement choisi"
            xDomain={[0, 1]}
            yDomain={[0, 1]}
            height={270}
            width={400}
            margin={{ top: 10, right: 12, bottom: 46, left: 40 }}
            xTicks={[0, 0.25, 0.5, 0.75, 1]}
            yTicks={[0, 0.25, 0.5, 0.75, 1]}
            xFormat={(v) => fmt(v, 2, 0)}
            yFormat={(v) => fmt(v, 2, 0)}
            xLabel="taux de faux positifs"
            series={[
              { id: 'diag', points: [[0, 0], [1, 1]], color: 'var(--faint)', width: 1, dash: '4 4' },
              { id: 'test', points: roc.test.fpr.map((x, i) => [x, roc.test.tpr[i]] as [number, number]), color: 'var(--teal)', width: 1.4, dash: '5 4' },
              { id: 'train', points: roc.train.fpr.map((x, i) => [x, roc.train.tpr[i]] as [number, number]), color: 'var(--gold)', width: 2.4 },
            ]}
            markers={[
              { x: 0.294, y: 0.684, color: 'var(--dim)', r: 4 },
              { x: fpr, y: tpr, color: '#fff', r: 6 },
            ]}
          />
          <p className="sa-cap">Or : apprentissage (AUC 0,758) · pointillés : test (AUC 0,754) · point blanc : seuil choisi ; gris : Youden.</p>
        </div>
      </div>
      <p className="dlab-note">
        Sensibilité et faux positifs selon le seuil : lus sur l’échelle de couleur de la courbe ROC du rapport (valeurs approchées, recalées sur le point publié 0,1394 → 0,684 /
        0,294). Part « à risque », VPP, VPN et coûts : calculés avec les formules du rapport et π = 0,133.
      </p>
    </div>
  );
}
