import { useRef, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import SampleSizeTab from './SampleSizeTab';
import AnalysisTab from './AnalysisTab';
import DidTab from './DidTab';
import './labo-ab-causal.css';

const TABS = [
  { id: 'dimensionner', label: 'Taille d’échantillon', short: 'Taille', Panel: SampleSizeTab },
  { id: 'analyser', label: 'Analyse d’un test', short: 'Analyse', Panel: AnalysisTab },
  { id: 'did', label: 'Différence de différences', short: 'Diff. de diff.', Panel: DidTab },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Démo « Labo A/B et inférence causale » : dimensionner, analyser, et estimer un effet causal hors expérience. */
export default function LaboAbCausal() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('onglet');
  const active: TabId = TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : 'dimensionner';
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: TabId, focus = false) => {
    setParams(id === 'dimensionner' ? {} : { onglet: id }, { replace: true, preventScrollReset: true });
    if (focus) tabRefs.current[TABS.findIndex((t) => t.id === id)]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = TABS.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    select(TABS[next].id, true);
  };

  return (
    <main className="demo-page labo-ab-causal">
      <div className="wrap">
        <Link to="/demos" className="lab-back">
          <Icon name="arrow-left" size={14} /> Démos
        </Link>
        <header className="lab-hero">
          <h1>Labo A/B et inférence causale</h1>
          <p className="sec-lede">
            Combien de visiteurs faut-il, le résultat est-il réel, et que vaut une comparaison avant / après ? Trois outils pour décider sur des preuves,
            avec les formules exactes. Tout est calculé dans votre navigateur.
          </p>
          <ul className="lab-skills" aria-label="Compétences mobilisées">
            {['Tests A/B', 'Puissance statistique', 'Inférence bayésienne', 'Différence de différences', 'Calculs vérifiés contre R'].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </header>

        <section className="lab-tool" aria-label="Outil">
          <div className="lab-tabs" role="tablist" aria-label="Outils du labo">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`lab-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={active === t.id}
                aria-label={t.label}
                aria-controls={`lab-panel-${t.id}`}
                tabIndex={active === t.id ? 0 : -1}
                onClick={() => select(t.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className="lab-tab-long">{t.label}</span>
                <span className="lab-tab-short" aria-hidden="true">
                  {t.short}
                </span>
              </button>
            ))}
          </div>
          {TABS.map(({ id, Panel }) => (
            <div key={id} id={`lab-panel-${id}`} role="tabpanel" aria-labelledby={`lab-tab-${id}`} hidden={active !== id} tabIndex={-1}>
              <Panel />
            </div>
          ))}
        </section>

        <section className="lab-method" aria-labelledby="lab-method-h">
          <h2 id="lab-method-h">Méthode</h2>
          <div className="lab-method-cols">
            <div>
              <h3>Dimensionner</h3>
              <p>
                Approximation normale du test de deux proportions, variance poolée sous l’hypothèse nulle, répartition du trafic quelconque. Avec une
                répartition 50 / 50, l’effectif par groupe est celui de <code>power.prop.test</code> dans R.
              </p>
              <p>
                Hypothèses : visiteurs indépendants, effet fixé avant le test et choisi pour sa valeur métier, pas pour ce qu’on espère voir. Limites : effets
                de nouveauté, saisonnalité ; d’où des semaines complètes.
              </p>
            </div>
            <div>
              <h3>Analyser</h3>
              <p>
                Test z sans correction de continuité (identique à <code>prop.test(correct = FALSE)</code>), test t de Welch pour une moyenne, intervalle de
                l’écart relatif par la méthode delta sur le logarithme du rapport. SRM : χ² d’adéquation, alerte sous 0,001. Regards répétés : risque
                calculé par intégration numérique (Armitage, McPherson et Rowe, 1969). Lecture bayésienne : a priori Beta(1, 1), probabilité exacte par une
                somme finie, contrôlée par intégration.
              </p>
              <p>Limites : petits effectifs (test exact de Fisher), métriques en ratio (méthode delta ou bootstrap), visiteurs non indépendants.</p>
            </div>
            <div>
              <h3>Différence de différences</h3>
              <p>
                Panel simulé : effet fixe par magasin, tendance commune, bruit gaussien, générateur à graine fixe. L’erreur type est calculée sur les
                variations par magasin, ce qui respecte la corrélation des semaines d’un même magasin.
              </p>
              <p>
                Hypothèses : tendances parallèles, pas d’anticipation, pas de contagion entre groupes. Limites : avec des dates d’entrée échelonnées, le
                modèle à effets fixes classique est biaisé ; il faut des estimateurs adaptés (Callaway et Sant’Anna, Sun et Abraham).
              </p>
            </div>
          </div>
          <p className="lab-verified">
            <Icon name="shield-check" size={15} />
            <span>
              Les lois normale, de Student et Beta sont implémentées à la main et testées contre R (<code>qnorm</code>, <code>pt</code>, <code>pbeta</code>,{' '}
            <code>power.prop.test</code>, <code>prop.test</code>, <code>t.test</code>, <code>chisq.test</code>, <code>p.adjust</code>).
            </span>
          </p>
        </section>

        <aside className="lab-cta">
          <div>
            <strong>Un test à dimensionner, des résultats à relire, un effet à mesurer sans expérience ?</strong>
            <span>Je conçois le protocole, j’analyse les données et j’explique la conclusion à ceux qui décident.</span>
          </div>
          <div className="lab-cta-actions">
            <Link to="/cv" className="btn btn-ghost">
              Voir le CV
            </Link>
            <Link to="/#contact" className="btn btn-primary">
              Me contacter <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
