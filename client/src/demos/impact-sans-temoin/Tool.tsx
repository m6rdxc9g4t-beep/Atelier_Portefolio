import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyse, CONTROL_CITIES, DEFAULT_PARAMS, N_WEEKS, NOISE_SD, simulate, TREATED_CITY, weekLabel, type MethodResult, type NoiseLevel, type ScenarioParams } from './model';
import { CumChart, GapChart, PlaceboChart, RatioChart, SeriesChart, WeightsChart } from './charts';
import { fmtK, fmtKSigned, fmtNum, fmtPct, fmtPctAbs } from './format';

const NOISES: NoiseLevel[] = ['faible', 'moyen', 'fort'];
const T0_MIN = 40;
const T0_MAX = N_WEEKS - 10;

const METHOD_NOTES: Record<MethodResult['id'], { hyp: string; why: string }> = {
  naif: {
    hyp: 'Rien d’autre n’a changé entre avant et après.',
    why: 'Prend la saison, la tendance et la grève pour un effet de la campagne.',
  },
  did: {
    hyp: 'Sans campagne, la ville aurait suivi la moyenne des autres, en euros.',
    why: 'Faux pour une grosse ville : en euros, la saison y pèse plus lourd que dans la moyenne.',
  },
  synth: {
    hyp: 'Un mélange pondéré d’autres villes reproduit la ville traitée avant le lancement.',
    why: 'Les poids sont choisis sur le passé, puis figés : le jumeau dit ce qui se serait passé.',
  },
  reg: {
    hyp: 'La relation passée entre la ville et 4 contrôles corrélés reste stable.',
    why: 'Donne un intervalle de prévision ; les coefficients libres peuvent extrapoler.',
  },
};

/** Conteneur défilant (petits écrans) ouvert sur la fin de la série : l'après-lancement, qui est le sujet. */
function ScrollEnd({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div className="imp-scroll" ref={ref}>
      {children}
    </div>
  );
}

export default function Tool() {
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_PARAMS);
  const [reveal, setReveal] = useState(false);
  const deferred = useDeferredValue(params);
  const scenario = useMemo(() => simulate(deferred), [deferred]);
  const a = useMemo(() => analyse(scenario), [scenario]);
  const stale = deferred !== params;
  const ids = { effect: useId(), t0: useId(), noise: useId() };

  const set = (patch: Partial<ScenarioParams>) => setParams((p) => ({ ...p, ...patch }));
  const synth = a.methods.find((m) => m.id === 'synth')!;
  const err = (m: MethodResult) => (a.trueAvgEffect > 0 ? (m.effect - a.trueAvgEffect) / a.trueAvgEffect : NaN);
  const significant = a.pValue <= 0.1;
  const nKept = a.placebos.filter((p) => !p.poorFit).length;
  const topDonors = scenario.controls
    .map((_, j) => ({ j, w: a.synth.weights[j]! }))
    .sort((x, y) => y.w - x.w)
    .slice(0, 3)
    .filter((d) => d.w >= 0.05);

  return (
    <div className={`imp-tool${stale ? ' is-stale' : ''}`}>
      <div className="imp-controls" role="group" aria-label="Réglages du scénario simulé">
        <div className="imp-field">
          <label htmlFor={ids.effect}>
            Effet réel de la campagne <b>{fmtPct(params.effect, 0)}</b>
          </label>
          <input id={ids.effect} type="range" min={0} max={0.3} step={0.01} value={params.effect} onChange={(e) => set({ effect: Number(e.target.value) })} />
        </div>
        <div className="imp-field">
          <label htmlFor={ids.t0}>
            Lancement <b>{weekLabel(params.t0)}</b>
          </label>
          <input id={ids.t0} type="range" min={T0_MIN} max={T0_MAX} step={1} value={params.t0} onChange={(e) => set({ t0: Number(e.target.value) })} />
        </div>
        <div className="imp-field">
          <span className="imp-label" id={ids.noise}>
            Bruit hebdomadaire
          </span>
          <div className="imp-seg" role="group" aria-labelledby={ids.noise}>
            {NOISES.map((n) => (
              <button key={n} type="button" aria-pressed={params.noise === n} onClick={() => set({ noise: n })}>
                {n} <span className="imp-seg-sub">±{fmtNum(NOISE_SD[n] * 100, 1)} %</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className={`btn${reveal ? ' btn-primary' : ''} imp-reveal`} aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
          {reveal ? 'Masquer l’effet vrai' : 'Révéler l’effet vrai'}
        </button>
      </div>

      <section className="imp-card" aria-labelledby="imp-series-title">
        <header className="imp-card-head">
          <h2 id="imp-series-title">
            {TREATED_CITY} et son jumeau synthétique
          </h2>
          <p>
            Vingt magasins, deux ans de ventes hebdomadaires. La campagne ne tourne qu’à {TREATED_CITY}. Le jumeau est un mélange pondéré des 19 autres villes, calé sur
            les semaines qui précèdent le lancement ; après, l’écart entre les deux courbes est l’effet estimé.
          </p>
        </header>
        <ScrollEnd>
          <SeriesChart s={scenario} a={a} reveal={reveal} />
        </ScrollEnd>
        <ul className="imp-legend">
          <li><span className="imp-key imp-key-treated" />{TREATED_CITY}, observé</li>
          <li><span className="imp-key imp-key-synth" />Contrôle synthétique</li>
          {reveal && <li><span className="imp-key imp-key-true" />{TREATED_CITY} sans campagne (vérité)</li>}
          <li><span className="imp-key imp-key-shock" />Grève, toutes villes</li>
        </ul>
        <p className="imp-fit">
          Ajustement avant lancement : erreur quadratique moyenne de <b>{fmtK(a.synth.rmspePre)}</b> par semaine, soit <b>{fmtPctAbs(a.rmspePrePct)}</b> des ventes.
          {a.rmspePrePct > 0.06 ? ' Ajustement lâche : l’estimation hérite de ce bruit.' : ' Le jumeau suit bien la ville avant le lancement.'}
        </p>
      </section>

      <section className="imp-card" aria-labelledby="imp-methods-title">
        <header className="imp-card-head">
          <h2 id="imp-methods-title">Quatre façons d’estimer l’effet</h2>
          <p>Effet moyen par semaine depuis le lancement, sur {a.nPost} semaines. Seules deux méthodes construisent un vrai contrefactuel.</p>
        </header>
        <div className="imp-methods">
          {a.methods.map((m) => {
            const e = err(m);
            const good = Number.isFinite(e) && Math.abs(e) <= 0.15;
            return (
              <article key={m.id} className={`imp-method imp-method--${m.id}`}>
                <h3>{m.label}</h3>
                <p className="imp-method-value">
                  <span className="imp-method-num">{fmtKSigned(m.effect)}</span>
                  <span className="imp-method-unit">par semaine, {fmtPct(m.effect / a.baseline)}</span>
                </p>
                {m.lo !== undefined && m.hi !== undefined && (
                  <p className="imp-method-ci">
                    IC 95 % : {fmtK(m.lo)} à {fmtK(m.hi)}
                  </p>
                )}
                <p className="imp-method-hyp">
                  <b>Hypothèse.</b> {METHOD_NOTES[m.id].hyp}
                </p>
                <p className="imp-method-why">{METHOD_NOTES[m.id].why}</p>
                {reveal && (
                  <p className={`imp-truth ${a.trueAvgEffect === 0 ? (Math.abs(m.effect) / a.baseline <= 0.015 ? 'is-ok' : 'is-ko') : good ? 'is-ok' : 'is-ko'}`}>
                    {a.trueAvgEffect === 0
                      ? `Effet vrai nul : erreur de ${fmtKSigned(m.effect)} par semaine`
                      : `Effet vrai ${fmtKSigned(a.trueAvgEffect)} : écart ${fmtPct(e, 0)}`}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className="imp-two">
        <section className="imp-card" aria-labelledby="imp-gap-title">
          <header className="imp-card-head">
            <h2 id="imp-gap-title">L’écart, semaine par semaine</h2>
            <p>
              Observé moins synthétique. La bande grise est la plage (5 % à 95 %) des écarts obtenus en faisant semblant que la campagne a eu lieu dans une autre ville :
              c’est le bruit normal d’un jumeau.
            </p>
          </header>
          <ScrollEnd>
            <GapChart s={scenario} a={a} reveal={reveal} />
          </ScrollEnd>
        </section>
        <section className="imp-card" aria-labelledby="imp-cum-title">
          <header className="imp-card-head">
            <h2 id="imp-cum-title">Ce que la campagne a rapporté</h2>
            <p>
              Somme des écarts depuis le lancement : <b>{fmtK(a.synthCum.at(-1) ?? 0, 0)}</b> de ventes en plus
              {reveal ? `, pour ${fmtK(a.trueCumEffect, 0)} en vrai` : ''}. C’est le chiffre à comparer au coût de la campagne.
            </p>
          </header>
          <ScrollEnd>
            <CumChart s={scenario} a={a} reveal={reveal} />
          </ScrollEnd>
        </section>
      </div>

      <div className="imp-two imp-two--narrow">
        <section className="imp-card" aria-labelledby="imp-w-title">
          <header className="imp-card-head">
            <h2 id="imp-w-title">De quoi est fait le jumeau</h2>
            <p>
              Poids positifs qui somment à 100 %, choisis pour coller aux ventes d’avant le lancement.
              {topDonors.length > 0 && ` Surtout ${topDonors.map((d) => CONTROL_CITIES[d.j]).join(', ')}.`}
              {reveal && ' Les traits verticaux montrent les vrais poids de la simulation.'}
            </p>
          </header>
          <WeightsChart s={scenario} a={a} reveal={reveal} />
        </section>
        <section className="imp-card" aria-labelledby="imp-ratio-title">
          <header className="imp-card-head">
            <h2 id="imp-ratio-title">Le test des placebos</h2>
            <p>
              Chaque ville joue tour à tour la ville traitée. On compare l’erreur du jumeau après lancement à celle d’avant : un vrai effet fait exploser ce rapport.
            </p>
          </header>
          <RatioChart a={a} />
          <p className={`imp-verdict ${significant ? 'is-ok' : 'is-neutral'}`}>
            {TREATED_CITY} arrive {a.rank === 1 ? 'en tête' : `au rang ${a.rank}`} sur {a.placebos.length + 1} : p = {fmtNum(a.pValue, 2)}.{' '}
            {significant
              ? 'Aussi fort par hasard ? Il faudrait que la ville tirée au sort soit justement la bonne.'
              : 'Rien ne distingue la ville traitée des placebos : on ne peut pas conclure à un effet.'}
          </p>
        </section>
      </div>

      <section className="imp-card" aria-labelledby="imp-spag-title">
        <header className="imp-card-head">
          <h2 id="imp-spag-title">
            {TREATED_CITY} parmi les placebos
          </h2>
          <p>
            Écart relatif de chaque ville à son propre jumeau. {nKept} placebos affichés ; {a.placebos.length - nKept} sont écartés car leur jumeau colle cinq fois moins
            bien avant le lancement que celui de {TREATED_CITY} (leur écart ne dirait rien).
          </p>
        </header>
        <ScrollEnd>
          <PlaceboChart s={scenario} a={a} />
        </ScrollEnd>
        <ul className="imp-legend">
          <li><span className="imp-key imp-key-gap" />{TREATED_CITY}</li>
          <li><span className="imp-key imp-key-placebo" />Villes placebo</li>
        </ul>
      </section>

      <section className="imp-card imp-reading" aria-labelledby="imp-reading-title">
        <h2 id="imp-reading-title">Ce que disent les chiffres</h2>
        <p>
          Le contrôle synthétique estime l’effet à <b>{fmtKSigned(synth.effect)}</b> par semaine ({fmtPct(synth.effect / a.baseline)}), soit{' '}
          <b>{fmtK(a.synthCum.at(-1) ?? 0, 0)}</b> sur {a.nPost} semaines.
          {' '}L’avant/après naïf annonce {fmtKSigned(a.methods[0]!.effect)} : il compte la saison et la reprise après la grève comme un succès de la campagne.
          {reveal &&
            (a.trueAvgEffect > 0
              ? ` L’effet vrai est de ${fmtKSigned(a.trueAvgEffect)} par semaine : le jumeau s’en écarte de ${fmtPct(err(synth), 0)}, l’avant/après de ${fmtPct(err(a.methods[0]!), 0)}.`
              : ' L’effet vrai est nul : toute valeur non nulle est une erreur de méthode.')}
        </p>
      </section>
    </div>
  );
}
