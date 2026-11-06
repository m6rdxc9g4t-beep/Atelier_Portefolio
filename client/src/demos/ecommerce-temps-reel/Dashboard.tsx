import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SEED,
  INCIDENTS,
  PRESETS,
  activeIncident,
  advance,
  createSim,
  injectIncident,
  setPreset,
  type IncidentKind,
  type PresetId,
  type SimState,
} from './model';
import { RevenuePanel } from './charts';
import { AlertsPanel, BreakdownPanel, FeedPanel, KpiBand, MonitorPanel, alertTitle } from './panels';
import { dayName, duration, hhmm, hhmmss } from './format';
import { EcrIcon, type EcrIconName } from './icons';
import { usePresetStats } from './presetStats';

const SPEEDS = [1, 10, 60] as const;
type Speed = (typeof SPEEDS)[number];
const INCIDENT_ICON: Record<IncidentKind, EcrIconName> = { payment: 'card', traffic: 'users', stockout: 'box' };
/** Rattrapage maximal par battement (onglet en arrière-plan, appareil lent) : au-delà, l'horloge saute. */
const MAX_CATCH_UP = 30;

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Tableau de bord de la boutique simulée : horloge accélérée, incidents, indicateurs, cartes de contrôle. */
export default function Dashboard() {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const compact = useMedia('(max-width: 640px)');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [sim, setSim] = useState<SimState>(() => createSim(DEFAULT_SEED));
  const simRef = useRef(sim);
  const clockRef = useRef(sim.minute * 60);
  const [clock, setClock] = useState(clockRef.current);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<Speed>(60);
  const [announce, setAnnounce] = useState('');
  const lastAnnounced = useRef(0);
  const stats = usePresetStats();

  const commit = useCallback((next: SimState) => {
    simRef.current = next;
    setSim(next);
  }, []);

  // Boucle de l'horloge : un battement toutes les 250 ms (1 s si l'utilisateur limite les animations).
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = window.setInterval(
      () => {
        const now = performance.now();
        const dt = Math.min(now - last, 2000) / 1000;
        last = now;
        if (document.hidden) return;
        clockRef.current += dt * speed;
        const cur = simRef.current;
        const target = Math.floor(clockRef.current / 60);
        if (target > cur.minute) {
          const n = Math.min(target - cur.minute, MAX_CATCH_UP);
          const next = advance(cur, n);
          if (n < target - cur.minute) clockRef.current = next.minute * 60;
          commit(next);
        }
        setClock(clockRef.current);
      },
      reduced ? 1000 : 250,
    );
    return () => window.clearInterval(id);
  }, [running, speed, reduced, commit]);

  // Annonce des nouvelles alertes aux lecteurs d'écran.
  useEffect(() => {
    const fresh = sim.alerts.filter((a) => a.id > lastAnnounced.current && a.end === null);
    if (sim.alerts.length) lastAnnounced.current = Math.max(lastAnnounced.current, ...sim.alerts.map((a) => a.id));
    const a = fresh[fresh.length - 1];
    if (a) setAnnounce(`Alerte à ${hhmm(a.start)} : ${alertTitle(a).toLowerCase()}.`);
  }, [sim.alerts]);

  const reset = (nextSeed: number) => {
    const s = createSim(nextSeed, simRef.current.preset);
    lastAnnounced.current = 0;
    clockRef.current = s.minute * 60;
    setClock(clockRef.current);
    setSeed(nextSeed);
    setAnnounce(`Boutique réinitialisée avec la graine ${nextSeed}.`);
    commit(s);
  };

  const inject = (kind: IncidentKind) => {
    const next = injectIncident(simRef.current, kind);
    if (next === simRef.current) return;
    const def = INCIDENTS.find((d) => d.kind === kind)!;
    setAnnounce(`Incident injecté à ${hhmm(next.minute)} : ${def.label.toLowerCase()}.`);
    commit(next);
  };

  const preset = PRESETS[sim.preset];
  const pstats = stats?.[sim.preset] ?? null;
  const clockMinute = Math.floor(clock / 60);

  return (
    <section className="ecr-tool" aria-label="Tableau de bord de la boutique simulée">
      <div className="ecr-toolbar">
        <div className="ecr-tb-row">
          <button type="button" className="ecr-btn ecr-btn-play" onClick={() => setRunning((r) => !r)} aria-pressed={!running}>
            <EcrIcon name={running ? 'pause' : 'play'} size={14} />
            {running ? 'Pause' : 'Reprendre'}
          </button>
          <div className="ecr-clock" aria-label={`Horloge simulée : ${dayName(clockMinute)} ${hhmm(clockMinute)}`}>
            <span className="ecr-clock-time">
              {dayName(clockMinute)} {hhmmss(clock)}
            </span>
            <span className="ecr-clock-sub">{running ? `Horloge simulée, ×${speed}` : 'Horloge en pause'}</span>
          </div>
          <div className="ecr-seg" role="group" aria-label="Vitesse de l’horloge">
            {SPEEDS.map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} title={s === 1 ? 'Temps réel' : `1 min réelle = ${s} min simulées`}>
                ×{s}
              </button>
            ))}
          </div>
          <div className="ecr-tb-end">
            <span className="ecr-sim-tag">Données simulées · graine {seed}</span>
            <button type="button" className="ecr-btn" onClick={() => reset(seed)} title="Recommencer à mardi 11:00 avec la même graine">
              <EcrIcon name="reset" size={14} />
              Réinitialiser
            </button>
            <button
              type="button"
              className="ecr-btn ecr-btn-ghost"
              onClick={() => reset(1 + Math.floor(Math.random() * 99_999_999))}
              title="Tirer une autre journée"
            >
              <EcrIcon name="shuffle" size={14} />
              Autre graine
            </button>
          </div>
        </div>
        <div className="ecr-tb-row ecr-tb-row-2">
          <div className="ecr-inject" role="group" aria-label="Injecter un incident">
            <span className="ecr-tb-label">Injecter un incident</span>
            {INCIDENTS.map((d) => {
              const act = activeIncident(sim, d.kind);
              return (
                <button key={d.kind} type="button" className="ecr-btn" onClick={() => inject(d.kind)} disabled={!!act} title={d.detail}>
                  <EcrIcon name={INCIDENT_ICON[d.kind]} size={14} />
                  {d.label}
                  {act && <span className="ecr-btn-note">encore {duration(act.end - sim.minute)}</span>}
                </button>
              );
            })}
          </div>
          <div className="ecr-sens">
            <span className="ecr-tb-label" id="ecr-sens-label">
              Sensibilité
            </span>
            <div className="ecr-seg" role="group" aria-labelledby="ecr-sens-label">
              {(Object.keys(PRESETS) as PresetId[]).map((p) => (
                <button key={p} type="button" aria-pressed={sim.preset === p} onClick={() => commit(setPreset(simRef.current, p))}>
                  {PRESETS[p].label}
                </button>
              ))}
            </div>
            <span className="ecr-sens-info">
              Limite L = {preset.L.toFixed(1).replace('.', ',')} ·{' '}
              {pstats ? (
                <>
                  fausse alerte ≈ toutes les {duration(pstats.falseEvery)} · écart de 1 σ repéré en ≈ {duration(pstats.delay[1])}
                </>
              ) : (
                'calcul des délais…'
              )}
            </span>
          </div>
        </div>
      </div>

      <KpiBand sim={sim} />

      <div className="ecr-grid">
        <section className="ecr-panel ecr-p-rev" aria-labelledby="ecr-h-rev">
          <div className="ecr-panel-head">
            <h3 id="ecr-h-rev">CA cumulé du jour et prévision</h3>
            <span className="ecr-panel-meta">Bande à 95 % du modèle attendu</span>
          </div>
          <RevenuePanel sim={sim} compact={compact} />
        </section>

        <section className="ecr-panel ecr-p-alerts" aria-labelledby="ecr-h-alerts">
          <div className="ecr-panel-head">
            <h3 id="ecr-h-alerts">Alertes</h3>
            <span className="ecr-panel-meta">{countLabel(sim)}</span>
          </div>
          <AlertsPanel sim={sim} falseEvery={pstats?.falseEvery ?? null} />
        </section>

        <section className="ecr-panel ecr-p-mon" aria-labelledby="ecr-h-mon">
          <div className="ecr-panel-head">
            <h3 id="ecr-h-mon">Cartes de contrôle</h3>
            <span className="ecr-panel-meta">
              Écart standardisé Z sur 3 h · limites ±{preset.L.toFixed(1).replace('.', ',')} en tirets · zones grisées : incidents
            </span>
          </div>
          <MonitorPanel sim={sim} />
        </section>

        <section className="ecr-panel ecr-p-feed" aria-labelledby="ecr-h-feed">
          <div className="ecr-panel-head">
            <h3 id="ecr-h-feed">Dernières commandes</h3>
            <span className="ecr-panel-meta">Flux simulé</span>
          </div>
          <FeedPanel sim={sim} rows={compact ? 8 : 13} />
        </section>

        <section className="ecr-panel ecr-p-break" aria-label="Ventilation du jour">
          <BreakdownPanel sim={sim} />
        </section>
      </div>

      <p className="ecr-sr" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
    </section>
  );
}

function countLabel(sim: SimState) {
  const open = sim.alerts.filter((a) => a.end === null).length;
  return open === 0 ? 'Aucune en cours' : `${open} en cours`;
}
