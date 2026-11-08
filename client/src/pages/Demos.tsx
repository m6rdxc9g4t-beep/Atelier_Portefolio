import { Link } from 'react-router-dom';
import { DEMOS, DEMO_THEMES, type DemoEntry } from '../demos/registry';
import { DemoCard } from '../components/DemoCard';
import { Icon } from '../components/Icon';
import { useTitle } from '../components/SiteChrome';

const COUNT_WORD: Record<number, string> = {
  4: 'Quatre', 5: 'Cinq', 6: 'Six', 7: 'Sept', 8: 'Huit', 9: 'Neuf', 10: 'Dix', 11: 'Onze', 12: 'Douze', 13: 'Treize',
  14: 'Quatorze', 15: 'Quinze', 16: 'Seize', 17: 'Dix-sept', 18: 'Dix-huit', 19: 'Dix-neuf', 20: 'Vingt',
};

/** Parcours conseillés : trois démos par profil recherché (les slugs absents du registre sont ignorés). */
const PARCOURS: { profil: string; pourquoi: string; slugs: string[] }[] = [
  { profil: 'Data analyst, BI', pourquoi: 'Requêter, fiabiliser, restituer.', slugs: ['sql-lab', 'tableau-de-bord', 'qualite-donnees'] },
  { profil: 'Économètre, chargé d’études', pourquoi: 'Mesurer un effet, pas une corrélation.', slugs: ['labo-regression', 'impact-sans-temoin', 'elasticite-prix', 'labo-ab-causal'] },
  { profil: 'Data scientist', pourquoi: 'Un modèle, puis une décision chiffrée.', slugs: ['score-churn', 'duree-vie-client', 'segmentation-clients', 'attribution-marketing'] },
  { profil: 'Analytics engineer', pourquoi: 'Des données modélisées, testées, tracées.', slugs: ['pipeline-donnees', 'modelisation-donnees', 'sql-lab'] },
];

const bySlug = new Map(DEMOS.map((d) => [d.slug, d]));

/** Démos interactives, regroupées par famille, avec un point d'entrée par profil. */
export default function Demos() {
  useTitle('Démos — François Pichon');
  const themes = DEMO_THEMES.map((t) => ({ ...t, demos: DEMOS.filter((d) => d.theme === t.id) })).filter((t) => t.demos.length > 0);
  return (
    <main className="demos-page">
      <header className="pp-hero">
        <div className="wrap">
          <h1>
            Des outils qui <em>tournent</em>, pas des captures.
          </h1>
          <p className="sec-lede">
            {COUNT_WORD[DEMOS.length] ?? DEMOS.length} démos interactives, à manipuler directement dans le navigateur : rien n’est installé, rien
            n’est envoyé. Chacune montre une compétence que j’apporte à une équipe data, de la donnée brute à la décision.
          </p>
          <nav className="demos-themes-nav" aria-label="Familles de démos">
            {themes.map((t) => (
              <a key={t.id} href={`#${t.id}`}>
                {t.title} <span>{t.demos.length}</span>
              </a>
            ))}
          </nav>
        </div>
      </header>

      <section className="wrap demos-parcours" aria-labelledby="demos-parcours-title">
        <h2 id="demos-parcours-title" className="demos-section-title">
          Par où commencer ?
        </h2>
        <div className="demos-parcours-grid">
          {PARCOURS.map((p) => {
            const demos = p.slugs.map((s) => bySlug.get(s)).filter((d): d is DemoEntry => Boolean(d)).slice(0, 3);
            return (
              <div key={p.profil} className="demos-parcours-card">
                <p className="demos-parcours-for">Vous recrutez</p>
                <h3>{p.profil}</h3>
                <p className="demos-parcours-why">{p.pourquoi}</p>
                <ol>
                  {demos.map((d) => (
                    <li key={d.slug}>
                      <Link to={`/demos/${d.slug}`}>
                        <Icon name={d.icon as never} size={15} />
                        <span>{d.title}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </section>

      {themes.map((t) => (
        <section key={t.id} id={t.id} className="wrap demos-theme" aria-labelledby={`demos-${t.id}-title`}>
          <div className="demos-theme-head">
            <h2 id={`demos-${t.id}-title`} className="demos-section-title">
              {t.title}
            </h2>
            <p>{t.lede}</p>
          </div>
          <div className="demos-grid">
            {t.demos.map((d) => (
              <DemoCard key={d.slug} demo={d} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
