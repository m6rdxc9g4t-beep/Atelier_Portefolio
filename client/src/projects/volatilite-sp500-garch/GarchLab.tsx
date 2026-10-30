import { useMemo, useState } from 'react';
import { fmt, fmtSci, halfLife, kurtosis, persistence, simulateGarch, unconditionalVariance, type GarchParams } from '@atelier/shared';
import { LineChart } from '../../components/charts';
import { api } from '../../api';
import './garch-lab.css';

export interface GarchPreset {
  id: string;
  label: string;
  note: string;
  params: GarchParams;
}

const N = 520; // 10 ans de rendements hebdomadaires

/**
 * Simulateur AR(1)–GARCH(1,1) : les curseurs pilotent ω, α, β ; la simulation (graine fixe)
 * est calculée dans le navigateur avec le même code que l'API /api/models/garch/simulate.
 */
export function GarchLab({ presets }: { presets: GarchPreset[] }) {
  const [preset, setPreset] = useState(presets[0]?.id ?? '');
  const [p, setP] = useState<GarchParams>(presets[0].params);
  const [seed, setSeed] = useState(1987);
  const [hover, setHover] = useState<number | null>(null);
  const [apiCheck, setApiCheck] = useState<string | null>(null);

  const path = useMemo(() => simulateGarch(p, N, seed), [p, seed]);
  const s = persistence(p);
  const uv = unconditionalVariance(p);
  const hl = halfLife(p);
  const k = useMemo(() => kurtosis(path.returns), [path]);
  const maxAbs = Math.max(0.02, ...path.returns.map(Math.abs));
  const maxSig = Math.max(0.01, ...path.sigma);

  const apply = (id: string) => {
    const pr = presets.find((x) => x.id === id);
    if (!pr) return;
    setPreset(id);
    setP(pr.params);
  };
  const set = (patch: Partial<GarchParams>) => {
    setPreset('custom');
    setP((old) => ({ ...old, ...patch }));
  };

  const verify = async () => {
    setApiCheck('…');
    try {
      const r = await api<{ returns: number[]; persistence: number }>('/models/garch/simulate', {
        method: 'POST',
        json: { omega: p.omega, alpha: p.alpha, beta: p.beta, a0: p.a0, a1: p.a1, n: N, seed },
      });
      const same = r.returns.length === N && Math.abs(r.returns[N - 1] - path.returns[N - 1]) < 1e-12;
      setApiCheck(same ? `✓ L’API renvoie exactement la même trajectoire (persistance ${fmt(r.persistence, 3)}).` : '⚠ Écart entre navigateur et serveur.');
    } catch {
      setApiCheck('API indisponible (mode statique).');
    }
  };

  const logOmega = Math.log10(p.omega);

  return (
    <div className="glab">
      <div className="glab-presets" role="radiogroup" aria-label="Paramètres prédéfinis">
        {presets.map((pr) => (
          <button key={pr.id} role="radio" aria-checked={preset === pr.id} className={preset === pr.id ? 'is-on' : ''} onClick={() => apply(pr.id)} title={pr.note}>
            {pr.label}
          </button>
        ))}
        <button className="glab-reroll" onClick={() => setSeed((x) => x + 1)}>
          ↻ Nouveau tirage
        </button>
      </div>

      <div className="glab-grid">
        <div className="glab-controls">
          <label>
            <span>
              ω (constante) <b>{fmtSci(p.omega, 2)}</b>
            </span>
            <input type="range" min={-6} max={-2.5} step={0.01} value={logOmega} onChange={(e) => set({ omega: Math.pow(10, Number(e.target.value)) })} />
          </label>
          <label>
            <span>
              α (réaction aux chocs) <b>{fmt(p.alpha, 3, 3)}</b>
            </span>
            <input type="range" min={0} max={0.6} step={0.005} value={p.alpha} onChange={(e) => set({ alpha: Number(e.target.value) })} />
          </label>
          <label>
            <span>
              β (mémoire de la volatilité) <b>{fmt(p.beta, 3, 3)}</b>
            </span>
            <input type="range" min={0} max={0.98} step={0.005} value={p.beta} onChange={(e) => set({ beta: Number(e.target.value) })} />
          </label>
          <dl className="glab-stats">
            <div className={s >= 1 ? 'warn' : ''}>
              <dt>Persistance α + β</dt>
              <dd>{fmt(s, 3, 3)}</dd>
            </div>
            <div>
              <dt>Demi-vie d’un choc</dt>
              <dd>{Number.isFinite(hl) ? `${fmt(hl, 1)} sem.` : '∞'}</dd>
            </div>
            <div>
              <dt>
                Variance de long terme de <span className="nocaps">ηₜ</span>
              </dt>
              <dd>{Number.isFinite(uv) ? fmtSci(uv, 2) : 'non définie'}</dd>
            </div>
            <div>
              <dt>Kurtosis simulée</dt>
              <dd>
                {fmt(k, 2)} <small>(normale = 3)</small>
              </dd>
            </div>
          </dl>
          {s >= 1 && <p className="glab-warn">α + β ≥ 1 : la variance non conditionnelle n’existe plus (processus non stationnaire en variance).</p>}
          <button className="glab-api" onClick={verify}>
            Vérifier côté serveur (POST /api/models/garch/simulate)
          </button>
          {apiCheck && <p className="glab-api-msg">{apiCheck}</p>}
        </div>

        <div className="glab-charts">
          <div className="glab-chart-t">
            <span>Rendements simulés rₜ — {N} semaines</span>
            {hover !== null && (
              <span>
                semaine {Math.round(hover)} : {fmt(path.returns[Math.round(hover)] * 100, 2)} %
              </span>
            )}
          </div>
          <LineChart
            ariaLabel="Rendements simulés"
            series={[{ id: 'r', points: path.returns.map((r, i) => [i, r]), color: 'var(--g-ink)', width: 1 }]}
            xDomain={[0, N - 1]}
            yDomain={[-maxAbs, maxAbs]}
            yTicks={[-maxAbs, 0, maxAbs].map((v) => Number(v.toFixed(3)))}
            yFormat={(v) => `${fmt(v * 100, 1)} %`}
            xFormat={(v) => `${v}`}
            height={200}
            cursorX={hover}
            onHoverX={setHover}
            margin={{ top: 10, right: 12, bottom: 28, left: 56 }}
          />
          <div className="glab-chart-t">
            <span>Volatilité conditionnelle σₜ = √hₜ</span>
          </div>
          <LineChart
            ariaLabel="Volatilité conditionnelle simulée"
            series={[{ id: 's', points: path.sigma.map((v, i) => [i, v]), color: 'var(--g-accent)', width: 1.6, area: true, areaOpacity: 0.12 }]}
            xDomain={[0, N - 1]}
            yDomain={[0, maxSig * 1.05]}
            yFormat={(v) => `${fmt(v * 100, 1)} %`}
            height={170}
            cursorX={hover}
            onHoverX={setHover}
            margin={{ top: 10, right: 12, bottom: 28, left: 56 }}
          />
        </div>
      </div>
    </div>
  );
}
