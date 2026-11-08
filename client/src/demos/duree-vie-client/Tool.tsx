import { useId, useMemo, useState } from 'react';
import {
  atRisk,
  CANAUX,
  concordance,
  CONTRATS,
  COVARIABLES,
  coxFit,
  covariateRow,
  groupings,
  HORIZON,
  kaplanMeier,
  lifetimeValue,
  logRank,
  meanTrap,
  predictSurvival,
  REGIONS,
  simulateAbonnes,
  survivalAt,
  TRUE_BETA,
  type Abonne,
  type Canal,
  type Contrat,
  type GroupingKey,
  type KMResult,
  type Region,
} from './model';
import { HazardBar, SurvivalChart, type Series } from './charts';
import { eur, int, mois, num, pct, pEq, pval } from './format';

const RISK_TICKS = [0, 6, 12, 18, 24, 30, 36];

type Profile = Pick<Abonne, 'contrat' | 'canal' | 'remise' | 'usage' | 'region'>;
const PROFILE_A: Profile = { contrat: 'Annuel', canal: 'Parrainage', remise: false, usage: 6, region: 'Île-de-France' };
const PROFILE_B: Profile = { contrat: 'Mensuel', canal: 'Réseaux sociaux', remise: true, usage: 2, region: 'Île-de-France' };

function kmSeries(km: KMResult, label: string, color: number, end: number): Series {
  return {
    label,
    color,
    step: true,
    end,
    points: km.steps.map((s) => ({ t: s.t, s: s.s, lo: s.lo, hi: s.hi })),
    censors: km.censorTimes,
  };
}

/** Lecture d'un rapport de risques : « × 1,49 » ou « ÷ 2,6 ». */
const hrText = (hr: number) => (hr >= 1 ? `× ${num(hr)}` : `÷ ${num(1 / hr)}`);

function ProfileForm({ id, title, color, value, onChange }: { id: string; title: string; color: number; value: Profile; onChange: (p: Profile) => void }) {
  return (
    <fieldset className="sv-profile">
      <legend>
        <span className={`sv-swatch sv-c${color}`} aria-hidden="true" /> {title}
      </legend>
      <label htmlFor={`${id}-contrat`}>Contrat</label>
      <select id={`${id}-contrat`} value={value.contrat} onChange={(e) => onChange({ ...value, contrat: e.target.value as Contrat })}>
        {CONTRATS.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <label htmlFor={`${id}-canal`}>Canal d’acquisition</label>
      <select id={`${id}-canal`} value={value.canal} onChange={(e) => onChange({ ...value, canal: e.target.value as Canal })}>
        {CANAUX.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <label htmlFor={`${id}-region`}>Région</label>
      <select id={`${id}-region`} value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value as Region })}>
        {REGIONS.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <label htmlFor={`${id}-usage`}>
        Usage initial <output htmlFor={`${id}-usage`}>{num(value.usage, 1)} h / semaine</output>
      </label>
      <input
        id={`${id}-usage`}
        type="range"
        min={0.5}
        max={12}
        step={0.5}
        value={value.usage}
        onChange={(e) => onChange({ ...value, usage: Number(e.target.value) })}
      />
      <label className="sv-check" htmlFor={`${id}-remise`}>
        <input id={`${id}-remise`} type="checkbox" checked={value.remise} onChange={(e) => onChange({ ...value, remise: e.target.checked })} />
        Remise de bienvenue
      </label>
    </fieldset>
  );
}

export default function Tool() {
  const data = useMemo(() => simulateAbonnes(), []);
  const times = useMemo(() => data.map((a) => a.duree), [data]);
  const events = useMemo(() => data.map((a) => a.resilie), [data]);
  const allGroupings = useMemo(() => groupings(data), [data]);
  const [groupKey, setGroupKey] = useState<GroupingKey>('contrat');
  const [showCI, setShowCI] = useState(true);
  const [profileA, setProfileA] = useState<Profile>(PROFILE_A);
  const [profileB, setProfileB] = useState<Profile>(PROFILE_B);
  const [marge, setMarge] = useState(15);
  const [taux, setTaux] = useState(0.08);
  const ids = { ci: useId(), marge: useId(), taux: useId(), a: useId(), b: useId() };

  const kmAll = useMemo(() => kaplanMeier(times, events), [times, events]);
  const trap = useMemo(() => meanTrap(data, kmAll), [data, kmAll]);

  const grouping = allGroupings.find((g) => g.key === groupKey)!;
  const groupView = useMemo(() => {
    const g = grouping.groups.map((label, i) => {
      const members = data.filter((a) => grouping.of(a) === i);
      const t = members.map((a) => a.duree);
      const e = members.map((a) => a.resilie);
      const km = kaplanMeier(t, e);
      return { label, i, n: members.length, km, times: t, end: Math.max(...t) };
    });
    const lr = g.length > 1 ? logRank(times, events, data.map(grouping.of), g.length) : null;
    return { groups: g, lr };
  }, [data, grouping, times, events]);

  const fit = useMemo(() => coxFit(data.map(covariateRow), times, events), [data, times, events]);
  const cIndex = useMemo(() => {
    const risk = data.map((a) => covariateRow(a).reduce((s, v, j) => s + (v - fit.means[j]!) * fit.beta[j]!, 0));
    return concordance(times, events, risk);
  }, [data, fit, times, events]);

  const series: Series[] = groupView.groups.map((g) => kmSeries(g.km, g.label, g.i % 5, g.end));
  const riskTable = groupView.groups.map((g) => ({ label: g.label, color: g.i % 5, counts: RISK_TICKS.map((t) => atRisk(g.times, t)) }));

  const coxRows = COVARIABLES.map((c, j) => {
    const b = fit.beta[j]!;
    const se = fit.se[j]!;
    return {
      c,
      hr: Math.exp(b),
      lo: Math.exp(b - 1.959964 * se),
      hi: Math.exp(b + 1.959964 * se),
      p: fit.p[j]!,
      truth: Math.exp(TRUE_BETA[c.key]),
    };
  });
  const strongest = [...coxRows].filter((r) => r.p < 0.05 && r.c.key !== 'annuel' && r.c.key !== 'usage').sort((a, b) => Math.abs(Math.log(b.hr)) - Math.abs(Math.log(a.hr)));
  const usageRow = coxRows.find((r) => r.c.key === 'usage')!;
  const annuelRow = coxRows.find((r) => r.c.key === 'annuel')!;

  const curveFor = (p: Profile) => {
    const x = covariateRow(p);
    return (t: number) => predictSurvival(fit, x, t);
  };
  const sA = curveFor(profileA);
  const sB = curveFor(profileB);
  const grid = Array.from({ length: HORIZON * 4 + 1 }, (_, k) => k / 4);
  const profileSeries: Series[] = [
    { label: 'Tous (Kaplan-Meier)', color: 4, step: true, end: kmAll.steps[kmAll.steps.length - 1]!.t, points: kmAll.steps.map((s) => ({ t: s.t, s: s.s })), dashed: true },
    { label: 'Profil A', color: 0, step: false, end: HORIZON, points: grid.map((t) => ({ t, s: sA(t) })) },
    { label: 'Profil B', color: 1, step: false, end: HORIZON, points: grid.map((t) => ({ t, s: sB(t) })) },
  ];
  const clvA = lifetimeValue(sA, marge, taux);
  const clvB = lifetimeValue(sB, marge, taux);
  const clvAll = lifetimeValue((k) => survivalAt(kmAll, k).s, marge, taux);

  const trapRows = [
    { key: 'partis', label: 'Moyenne des seuls abonnés partis', value: trap.partisSeuls, note: `${int(kmAll.events)} résiliations, les ${int(kmAll.n - kmAll.events)} actifs ignorés`, bad: true },
    { key: 'brutes', label: 'Moyenne des durées observées', value: trap.observeesBrutes, note: 'les actifs comptés comme s’ils venaient de partir', bad: true },
    { key: 'km', label: 'Aire sous la courbe de Kaplan-Meier', value: trap.kaplanMeier, note: 'les actifs comptent pour le temps où on les a vus', bad: false },
    { key: 'vraie', label: 'Vraie valeur (connue par simulation)', value: trap.vraie, note: 'durées réelles, y compris après la date d’observation', bad: false, truth: true },
  ];

  return (
    <div className="sv-tool">
      <div className="sv-kpis">
        <div className="sv-kpi">
          <span className="sv-kpi-label">Abonnés suivis</span>
          <span className="sv-kpi-value">{int(data.length)}</span>
          <span className="sv-kpi-sub">arrivés au fil de {HORIZON} mois</span>
        </div>
        <div className="sv-kpi">
          <span className="sv-kpi-label">Résiliations observées</span>
          <span className="sv-kpi-value">{int(kmAll.events)}</span>
          <span className="sv-kpi-sub">{pct(1 - kmAll.events / kmAll.n, 0)} encore actifs : leur durée est censurée</span>
        </div>
        <div className="sv-kpi">
          <span className="sv-kpi-label">Durée de vie médiane</span>
          <span className="sv-kpi-value">{mois(kmAll.median)}</span>
          <span className="sv-kpi-sub">
            IC 95 % : {kmAll.medianLo === null ? '?' : num(kmAll.medianLo, 1)} à {kmAll.medianHi === null ? 'non atteinte' : `${num(kmAll.medianHi, 1)} mois`}
          </span>
        </div>
        <div className="sv-kpi">
          <span className="sv-kpi-label">Concordance du modèle de Cox</span>
          <span className="sv-kpi-value">{num(cIndex, 2)}</span>
          <span className="sv-kpi-sub">0,5 = hasard, 1 = ordre parfait</span>
        </div>
      </div>

      <section className="sv-panel" aria-labelledby="sv-km-title">
        <div className="sv-head">
          <h2 id="sv-km-title">Courbes de survie de Kaplan-Meier</h2>
          <div className="sv-toolbar">
            <span className="sv-tb-label" id="sv-group-label">
              Comparer selon
            </span>
            <div className="sv-seg" role="group" aria-labelledby="sv-group-label">
              {allGroupings.map((g) => (
                <button key={g.key} type="button" className={g.key === groupKey ? 'is-on' : ''} aria-pressed={g.key === groupKey} onClick={() => setGroupKey(g.key)}>
                  {g.label}
                </button>
              ))}
            </div>
            <label className="sv-check" htmlFor={ids.ci}>
              <input id={ids.ci} type="checkbox" checked={showCI} onChange={(e) => setShowCI(e.target.checked)} />
              Intervalles à 95 %
            </label>
          </div>
        </div>
        <div className="sv-legend" aria-hidden="true">
          {groupView.groups.map((g) => (
            <span key={g.i}>
              <span className={`sv-swatch sv-c${g.i % 5}`} /> {g.label}
            </span>
          ))}
          <span className="sv-legend-note">trait vertical : abonné encore actif (censuré)</span>
        </div>
        <div className="sv-chart-wrap">
          <SurvivalChart
            series={series}
            showCI={showCI}
            riskTable={riskTable}
            marker={groupKey === 'contrat' ? { t: 12, text: 'fin d’engagement des annuels' } : undefined}
            label={`Courbes de survie par ${grouping.label.toLowerCase()} ; survolez ou utilisez les flèches pour lire les valeurs`}
          />
        </div>
        <div className="sv-table-wrap">
          <table className="sv-table">
            <caption className="sv-sr">Résumé des courbes de survie par groupe</caption>
            <thead>
              <tr>
                <th scope="col">Groupe</th>
                <th scope="col" className="is-num">Abonnés</th>
                <th scope="col" className="is-num">Résiliations</th>
                <th scope="col" className="is-num">Encore là à 12 mois</th>
                <th scope="col" className="is-num">Encore là à 24 mois</th>
                <th scope="col" className="is-num">Médiane (IC 95 %)</th>
              </tr>
            </thead>
            <tbody>
              {groupView.groups.map((g) => {
                const s12 = survivalAt(g.km, 12);
                const s24 = survivalAt(g.km, 24);
                return (
                  <tr key={g.i}>
                    <th scope="row">
                      <span className={`sv-swatch sv-c${g.i % 5}`} aria-hidden="true" /> {g.label}
                    </th>
                    <td className="is-num">{int(g.n)}</td>
                    <td className="is-num">{int(g.km.events)}</td>
                    <td className="is-num">
                      {pct(s12.s, 0)} <span className="sv-ci">[{pct(s12.lo, 0)} ; {pct(s12.hi, 0)}]</span>
                    </td>
                    <td className="is-num">
                      {pct(s24.s, 0)} <span className="sv-ci">[{pct(s24.lo, 0)} ; {pct(s24.hi, 0)}]</span>
                    </td>
                    <td className="is-num">
                      {mois(g.km.median)}{' '}
                      {g.km.median !== null && (
                        <span className="sv-ci">
                          [{g.km.medianLo === null ? '?' : num(g.km.medianLo, 1)} ; {g.km.medianHi === null ? '—' : num(g.km.medianHi, 1)}]
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="sv-foot">
          {groupView.lr ? (
            <>
              Test du log-rank : χ² = <strong>{num(groupView.lr.chi2, 1)}</strong> à {groupView.lr.df} degré{groupView.lr.df > 1 ? 's' : ''} de liberté,{' '}
              <strong>{pEq(groupView.lr.p)}</strong>.{' '}
              {groupView.lr.p < 0.05
                ? 'Les courbes diffèrent nettement : l’écart n’est pas un effet du hasard.'
                : 'Aucune différence décelable entre ces groupes : l’écart visible est compatible avec le hasard.'}
              {groupKey === 'contrat' &&
                ' Les annuels sont retenus jusqu’à leur échéance, puis beaucoup partent juste après 12 mois : leur courbe plonge d’un coup.'}
              {groupKey === 'region' && ' C’est attendu : la simulation ne donne aucun effet à la région.'}
            </>
          ) : (
            <>
              Chaque marche est une résiliation ; les abonnés encore actifs sortent du calcul à leur date d’observation, sans être comptés comme
              partis. Choisissez une variable pour comparer des groupes.
            </>
          )}
        </p>
      </section>

      <section className="sv-panel" aria-labelledby="sv-trap-title">
        <div className="sv-head">
          <h2 id="sv-trap-title">Le piège de la durée moyenne</h2>
          <span className="sv-head-meta">durée moyenne sur les {HORIZON} premiers mois</span>
        </div>
        <div className="sv-trap">
          {trapRows.map((r) => (
            <div key={r.key} className={`sv-trap-row${r.truth ? ' is-truth' : ''}`}>
              <div className="sv-trap-text">
                <span className="sv-trap-label">{r.label}</span>
                <span className="sv-trap-note">{r.note}</span>
              </div>
              <div className="sv-trap-bar" aria-hidden="true">
                <span className={`sv-trap-fill${r.bad ? ' is-bad' : ''}`} style={{ width: `${(r.value / HORIZON) * 100}%` }} />
              </div>
              <span className={`sv-trap-value${r.bad ? ' is-bad' : ''}`}>{mois(r.value)}</span>
            </div>
          ))}
        </div>
        <p className="sv-foot">
          Calculée sur les seuls partants, la durée de vie paraît <strong className="is-bad">{num(trap.vraie / trap.partisSeuls, 1)} fois plus courte</strong> qu’elle ne l’est :
          on ne retient que ceux qui sont partis vite, puisque les autres n’ont pas encore eu le temps de partir. Kaplan-Meier utilise
          l’information des actifs sans inventer leur date de départ, et tombe à {num(Math.abs(trap.kaplanMeier - trap.vraie), 1)} mois de la vraie valeur.
        </p>
      </section>

      <section className="sv-panel" aria-labelledby="sv-cox-title">
        <div className="sv-head">
          <h2 id="sv-cox-title">Modèle de Cox : ce qui fait partir, ce qui retient</h2>
          <span className="sv-head-meta">
            {int(kmAll.events)} résiliations · rapport de vraisemblance χ² = {num(fit.lr, 0)} ({COVARIABLES.length} ddl), {pEq(fit.lrP)}
          </span>
        </div>
        <ul className="sv-sentences">
          {strongest.slice(0, 2).map((r) => (
            <li key={r.c.key}>
              <strong>{r.c.label}</strong> ({r.c.ref}) : risque de départ {r.hr >= 1 ? 'multiplié' : 'divisé'} par <strong>{num(r.hr >= 1 ? r.hr : 1 / r.hr)}</strong> à chaque instant.
            </li>
          ))}
          <li>
            <strong>Chaque heure d’usage hebdomadaire en plus</strong> au départ divise le risque par <strong>{num(1 / usageRow.hr)}</strong> : 5 heures de plus le
            divisent par {num(Math.pow(1 / usageRow.hr, 5), 1)}.
          </li>
          <li>
            Le <strong>contrat annuel</strong> ressort avec un rapport de {num(annuelRow.hr)} alors que la simulation utilise {num(annuelRow.truth)} : son effet n’est pas
            constant dans le temps (très protecteur avant 12 mois, beaucoup moins ensuite), ce qu’un modèle de Cox résume mal.
          </li>
        </ul>
        <div className="sv-table-wrap">
          <table className="sv-table sv-cox">
            <caption className="sv-sr">Rapports de risques estimés par le modèle de Cox</caption>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Lecture</th>
                <th scope="col" className="is-num">Rapport de risques</th>
                <th scope="col" className="is-num">IC 95 %</th>
                <th scope="col" className="is-num">p</th>
                <th scope="col" className="sv-hr-col">
                  <span className="sv-hr-scale">
                    <span>÷ 4</span>
                    <span>1</span>
                    <span>× 4</span>
                  </span>
                </th>
                <th scope="col" className="is-num">Simulé</th>
              </tr>
            </thead>
            <tbody>
              {coxRows.map((r) => (
                <tr key={r.c.key}>
                  <th scope="row">
                    {r.c.label}
                    {r.c.key === 'annuel' && <span className="sv-flag">effet non constant</span>}
                  </th>
                  <td className="sv-unit">{r.c.ref}</td>
                  <td className={`is-num ${r.p < 0.05 ? (r.hr >= 1 ? 'is-bad' : 'is-good') : ''}`}>
                    {num(r.hr)} <span className="sv-ci">({hrText(r.hr)})</span>
                  </td>
                  <td className="is-num sv-ci">
                    {num(r.lo)} – {num(r.hi)}
                  </td>
                  <td className="is-num">{pval(r.p)}</td>
                  <td className="sv-hr-col">
                    <HazardBar hr={r.hr} lo={r.lo} hi={r.hi} truth={r.truth} significant={r.p < 0.05} />
                  </td>
                  <td className="is-num sv-ci">{num(r.truth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sv-foot">
          Un rapport de risques de × 1,5 veut dire qu’à ancienneté égale, ce profil a 50 % de chances de plus de résilier dans le mois qui
          vient. La colonne « Simulé » donne la vraie valeur : les régions n’ont aucun effet réel, et le modèle les trouve bien non
          significatives.
        </p>
      </section>

      <section className="sv-panel" aria-labelledby="sv-clv-title">
        <div className="sv-head">
          <h2 id="sv-clv-title">Deux profils, deux valeurs vie</h2>
          <span className="sv-head-meta">survie prédite par le modèle de Cox, horizon {HORIZON} mois</span>
        </div>
        <div className="sv-clv">
          <div className="sv-clv-forms">
            <ProfileForm id={ids.a} title="Profil A" color={0} value={profileA} onChange={setProfileA} />
            <ProfileForm id={ids.b} title="Profil B" color={1} value={profileB} onChange={setProfileB} />
          </div>
          <div className="sv-clv-main">
            <div className="sv-chart-wrap">
              <SurvivalChart series={profileSeries} showCI={false} label="Survie prédite des profils A et B, comparée à la courbe de tous les abonnés" />
            </div>
            <div className="sv-sliders">
              <div className="sv-slider">
                <label htmlFor={ids.marge}>
                  Marge mensuelle par abonné <output htmlFor={ids.marge}>{eur(marge)}</output>
                </label>
                <input id={ids.marge} type="range" min={5} max={40} step={1} value={marge} onChange={(e) => setMarge(Number(e.target.value))} />
              </div>
              <div className="sv-slider">
                <label htmlFor={ids.taux}>
                  Taux d’actualisation annuel <output htmlFor={ids.taux}>{pct(taux, 0)}</output>
                </label>
                <input id={ids.taux} type="range" min={0} max={0.2} step={0.01} value={taux} onChange={(e) => setTaux(Number(e.target.value))} />
              </div>
            </div>
            <div className="sv-clv-cards">
              <div className="sv-kpi">
                <span className="sv-kpi-label">
                  <span className="sv-swatch sv-c0" aria-hidden="true" /> Valeur vie, profil A
                </span>
                <span className="sv-kpi-value">{eur(clvA)}</span>
                <span className="sv-kpi-sub">encore là à 12 mois : {pct(sA(12), 0)}</span>
              </div>
              <div className="sv-kpi">
                <span className="sv-kpi-label">
                  <span className="sv-swatch sv-c1" aria-hidden="true" /> Valeur vie, profil B
                </span>
                <span className="sv-kpi-value">{eur(clvB)}</span>
                <span className="sv-kpi-sub">encore là à 12 mois : {pct(sB(12), 0)}</span>
              </div>
              <div className="sv-kpi">
                <span className="sv-kpi-label">
                  <span className="sv-swatch sv-c4" aria-hidden="true" /> Abonné moyen
                </span>
                <span className="sv-kpi-value">{eur(clvAll)}</span>
                <span className="sv-kpi-sub">courbe de Kaplan-Meier de tous</span>
              </div>
            </div>
            <p className="sv-summary sv-summary-note">
              La petite marche à 12 mois vient des contrats annuels : le modèle de Cox l’applique à tous les profils, mensuels compris. C’est la
              limite des risques proportionnels, visible ici à l’œil nu.
            </p>
            <p className="sv-summary">
              Sur {HORIZON} mois, un abonné du profil {clvA >= clvB ? 'A' : 'B'} rapporte <strong>{eur(Math.abs(clvA - clvB))}</strong> de plus que le profil{' '}
              {clvA >= clvB ? 'B' : 'A'}, soit {num(Math.max(clvA, clvB) / Math.max(1, Math.min(clvA, clvB)), 1)} fois plus. C’est le montant maximal qu’il serait
              rationnel de dépenser en plus pour acquérir ou retenir ce profil plutôt que l’autre.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
