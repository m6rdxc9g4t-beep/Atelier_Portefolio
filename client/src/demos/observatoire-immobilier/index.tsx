import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Formula } from '../../components/Formula';
import { CommunePanel, CommuneTable } from './CommunePanel';
import { CommuneSearch } from './CommuneSearch';
import { Estimator } from './Estimator';
import { MapView } from './MapView';
import { loadJson } from './hooks';
import {
  MIN_VENTES,
  SHRINK_K,
  communeParDefaut,
  fmtDate,
  fmtInt,
  isDepartementData,
  isDvfIndex,
  type DepartementData,
  type DvfIndex,
  type TypeCode,
} from './model';
import './observatoire-immobilier.css';

const BASE = `${import.meta.env.BASE_URL}data/dvf/`;

type IndexState =
  { status: 'loading' } | { status: 'absent' } | { status: 'error'; message: string } | { status: 'ready'; index: DvfIndex };
type DepState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: DepartementData };

const TYPES: [TypeCode, string][] = [
  ['T', 'Tous'],
  ['M', 'Maisons'],
  ['A', 'Appartements'],
];

/** Démo « Observatoire immobilier » : ventes DVF par commune, carte, tendances et modèle hédonique. */
export default function ObservatoireImmobilier() {
  const [idx, setIdx] = useState<IndexState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setIdx({ status: 'loading' });
    loadJson(`${BASE}index.json`, ctl.signal)
      .then((j) => setIdx(j === undefined ? { status: 'absent' } : isDvfIndex(j) ? { status: 'ready', index: j } : { status: 'absent' }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setIdx({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => ctl.abort();
  }, [attempt]);

  return (
    <main className="demo-page observatoire-immobilier">
      <header className="wrap oi-head">
        <h1>Observatoire des prix immobiliers</h1>
        <p className="sec-lede">
          Les ventes réelles enregistrées par l’administration fiscale (DVF), commune par commune : prix au m² sur la carte, évolution année
          par année, et une estimation de prix par un modèle hédonique dont chaque coefficient est affiché et expliqué.
        </p>
        <ul className="chips oi-chips" aria-label="Compétences">
          {[
            'Données publiques DVF',
            'Nettoyage et agrégation',
            'Cartographie SVG',
            'Régression hédonique',
            'Écarts-types robustes',
            'Validation hors échantillon',
          ].map((s) => (
            <li key={s} className="chip">
              {s}
            </li>
          ))}
        </ul>
      </header>

      <section className="wrap oi-tool" aria-label="Observatoire">
        {idx.status === 'loading' && <Loading text="Chargement de l’index des données…" />}
        {idx.status === 'absent' && (
          <div className="oi-state">
            <Icon name="hard-drive" size={20} className="oi-state-ic" />
            <strong>Données en préparation</strong>
            <p>
              Elles sont téléchargées depuis data.gouv.fr lors de la mise à jour du serveur (fichiers DVF géolocalisés d’Etalab, ventes des
              cinq dernières années). La méthode ci-dessous décrit ce que l’outil calcule.
            </p>
          </div>
        )}
        {idx.status === 'error' && (
          <div className="oi-state" role="alert">
            <Icon name="circle-alert" size={20} className="oi-state-ic oi-state-ic-err" />
            <strong>Les données n’ont pas pu être chargées</strong>
            <p>Le fichier d’index n’a pas répondu ({idx.message}). Vérifiez votre connexion, puis réessayez.</p>
            <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}>
              Réessayer
            </button>
          </div>
        )}
        {idx.status === 'ready' && <Observatoire index={idx.index} />}
      </section>

      <Methode />

      <section className="wrap oi-cta" aria-label="Contact">
        <div className="oi-cta-inner">
          <p>
            Vous avez des données de prix, de ventes ou de loyers à exploiter ? Je construis ce type d’outil, du fichier brut au modèle
            expliqué.
          </p>
          <div className="oi-cta-actions">
            <Link to="/#contact" className="btn btn-primary">
              Me contacter <Icon name="arrow-right" size={14} />
            </Link>
            <Link to="/cv" className="btn">
              Voir le CV
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="oi-loading" role="status">
      <span className="oi-spinner" aria-hidden="true" />
      {text}
    </div>
  );
}

function Observatoire({ index }: { index: DvfIndex }) {
  const [depCode, setDepCode] = useState(index.departements[0].code);
  const [dep, setDep] = useState<DepState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, DepartementData>());
  const [annee, setAnnee] = useState(index.annees[index.annees.length - 1]);
  const [type, setType] = useState<TypeCode>('T');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const hit = cache.current.get(depCode);
    if (hit) {
      setDep({ status: 'ready', data: hit });
      return;
    }
    const entry = index.departements.find((d) => d.code === depCode);
    const ctl = new AbortController();
    setDep({ status: 'loading' });
    loadJson(`${BASE}${entry?.fichier ?? `${depCode}.json`}`, ctl.signal)
      .then((j) => {
        if (!isDepartementData(j)) throw new Error('fichier du département absent ou illisible');
        cache.current.set(depCode, j);
        setDep({ status: 'ready', data: j });
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setDep({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => ctl.abort();
  }, [depCode, index, attempt]);

  const data = dep.status === 'ready' ? dep.data : null;
  // Commune par défaut à chaque changement de département ; année ramenée dans la période du département.
  useEffect(() => {
    if (!data) return;
    setSelected((s) => (s && data.communes.some((c) => c.c === s) ? s : (communeParDefaut(data)?.c ?? null)));
    setAnnee((a) => (data.annees.includes(a) ? a : data.annees[data.annees.length - 1]));
  }, [data]);

  const commune = useMemo(() => data?.communes.find((c) => c.c === selected) ?? null, [data, selected]);
  const select = useCallback((code: string) => setSelected(code), []);
  const partielle = data?.periode.fin && Number(data.periode.fin.slice(0, 4)) === annee && data.periode.fin.slice(5, 7) !== '12';

  return (
    <>
      {index.exemple && (
        <div className="oi-example" role="note">
          <Icon name="circle-alert" size={16} />
          <span>
            <b>Données d’exemple.</b> Ces ventes sont générées pour vérifier l’interface : elles ne décrivent aucun marché réel.
          </span>
        </div>
      )}

      <div className="oi-toolbar">
        <div className="oi-field oi-field-inline">
          <label className="oi-label" htmlFor="oi-dep">
            Département
          </label>
          <select id="oi-dep" className="oi-select" value={depCode} onChange={(e) => setDepCode(e.target.value)}>
            {index.departements.map((d) => (
              <option key={d.code} value={d.code}>
                {d.nom} ({d.code})
              </option>
            ))}
          </select>
        </div>
        <div className="oi-field oi-field-inline">
          <span className="oi-label" id="oi-annee-l">
            Année
          </span>
          <div className="oi-seg" role="group" aria-labelledby="oi-annee-l">
            {(data?.annees ?? index.annees).map((a) => (
              <button key={a} type="button" aria-pressed={a === annee} onClick={() => setAnnee(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="oi-field oi-field-inline">
          <span className="oi-label" id="oi-type-l">
            Biens
          </span>
          <div className="oi-seg" role="group" aria-labelledby="oi-type-l">
            {TYPES.map(([t, l]) => (
              <button key={t} type="button" aria-pressed={t === type} onClick={() => setType(t)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {data && <CommuneSearch communes={data.communes} onSelect={select} />}
      </div>

      <p className="oi-source">
        Source : {index.source}, {index.licence}. Ventes du {fmtDate(index.periode.debut)} au {fmtDate(index.periode.fin)}
        {data ? `, ${fmtInt(data.filtres.retenues)} retenues pour ce département` : ''}.
        {partielle && (
          <>
            {' '}
            L’année {annee} est partielle (dernière vente publiée le {fmtDate(data?.periode.fin ?? null)}).
          </>
        )}
      </p>

      {dep.status === 'loading' && <Loading text="Chargement des ventes du département…" />}
      {dep.status === 'error' && (
        <div className="oi-state" role="alert">
          <Icon name="circle-alert" size={20} className="oi-state-ic oi-state-ic-err" />
          <strong>Ce département n’a pas pu être chargé</strong>
          <p>{dep.message}. Choisissez un autre département ou réessayez.</p>
          <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}>
            Réessayer
          </button>
        </div>
      )}
      {data && (
        <>
          <div className="oi-grid">
            <div className="oi-col-map">
              <MapView dep={data} annee={annee} type={type} selected={selected} onSelect={select} />
              <CommuneTable dep={data} annee={annee} type={type} selected={selected} onSelect={select} />
            </div>
            <div className="oi-col-panel">
              {commune ? (
                <CommunePanel dep={data} commune={commune} annee={annee} type={type} />
              ) : (
                <p className="oi-empty-note">Choisissez une commune sur la carte, dans le tableau ou par la recherche.</p>
              )}
            </div>
          </div>

          <section className="oi-section" aria-labelledby="oi-est-title">
            <div className="oi-section-head">
              <h2 id="oi-est-title">Estimer un prix</h2>
              <p>
                Modèle hédonique ajusté dans votre navigateur sur {fmtInt(data.echantillon.lignes.length)} ventes tirées au hasard parmi les{' '}
                {fmtInt(data.echantillon.total)} du département. Chaque facteur multiplie le prix du bien de référence.
              </p>
            </div>
            {commune ? <Estimator key={data.code} dep={data} commune={commune} annee={annee} /> : null}
          </section>
        </>
      )}
    </>
  );
}

function Methode() {
  return (
    <section className="wrap oi-method" aria-labelledby="oi-method-title">
      <h2 id="oi-method-title">Méthode</h2>
      <div className="oi-method-grid">
        <div>
          <h3>Données</h3>
          <p>
            Fichiers « Demandes de valeurs foncières » géolocalisés publiés par la DGFiP et Etalab (Licence Ouverte 2.0), téléchargés et
            agrégés lors de la construction du site ; le navigateur ne reçoit que des agrégats et un échantillon.
          </p>
          <ul>
            <li>
              Une mutation s’étale sur plusieurs lignes (parcelles, cultures) : elles sont regroupées, et seules les ventes d’un seul
              logement sont gardées.
            </li>
            <li>
              Maisons et appartements, dépendances comprises ; ventes en l’état futur d’achèvement et ventes avec un local d’activité
              écartées.
            </li>
            <li>Surface habitable de plus de 9 m², prix au m² borné, puis 1 % de chaque extrémité retiré par département.</li>
          </ul>
        </div>
        <div>
          <h3>Statistiques et carte</h3>
          <p>
            Médiane et quartiles du prix au m² par commune, année et type de bien. Une médiane n’est publiée qu’à partir de {MIN_VENTES}{' '}
            ventes. Le point d’une commune est placé au centre de ses ventes (médiane des coordonnées), sa surface suit le nombre de ventes,
            sa couleur la classe de prix (cinq classes d’effectifs égaux).
          </p>
        </div>
        <div className="oi-method-wide">
          <h3>Modèle hédonique</h3>
          <Formula
            tex={String.raw`\begin{aligned}\ln P_i={}&\beta_0+\beta_1\ln\tfrac{S_i}{100}+\beta_2\,(\text{pièces}_i-4)\\&+\beta_3\,\mathbb{1}_{\text{appartement}}+\beta_4\ln\tilde I_{c(i)}\\&+\textstyle\sum_{a}\gamma_a\,\mathbb{1}_{\text{année}=a}+\varepsilon_i\end{aligned}`}
          />
          <p>
            Moindres carrés ordinaires sur le logarithme du prix : les coefficients se lisent en élasticités ou en pourcentages. La
            localisation entre par un indice de commune : le niveau de prix de la commune rapporté au département, rétréci vers 0 quand la
            commune a peu de ventes (<Formula display={false} tex={String.raw`n_c`} /> ventes) :
          </p>
          <Formula tex={String.raw`\ln\tilde I_c=\frac{n_c}{n_c+${SHRINK_K}}\,\ln\frac{I_c}{I_d}`} />
          <p>
            Les coefficients <Formula display={false} tex={String.raw`\gamma_a`} /> forment un indice de prix à qualité constante.
            Écarts-types robustes à l’hétéroscédasticité (White, HC1). L’estimation affichée est{' '}
            <Formula display={false} tex={String.raw`e^{x'\hat\beta}`} />, le prix médian conditionnel (le prix moyen serait plus haut d’un
            facteur <Formula display={false} tex={String.raw`e^{\hat\sigma^2/2}`} />) ; l’intervalle à 80 % vient de la dispersion des
            résidus.
          </p>
        </div>
        <div className="oi-method-wide">
          <h3>Limites</h3>
          <ul>
            <li>
              DVF ne décrit ni l’état du bien, ni l’étage, ni le diagnostic énergétique : le modèle ne peut pas les prendre en compte.
            </li>
            <li>L’indice de commune est calculé sur les mêmes ventes que celles du modèle, et mélange maisons et appartements.</li>
            <li>
              Les prix voisins se ressemblent (autocorrélation spatiale) : un modèle spatial serait plus juste, comme dans mon{' '}
              <Link to="/projets/immobilier-arras-spatial">projet d’économétrie spatiale à Arras</Link>. Voir aussi l’
              <Link to="/projets/immobilier-maine-et-loire">étude du marché du Maine-et-Loire</Link>.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
