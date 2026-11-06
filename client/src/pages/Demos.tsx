import { Link } from 'react-router-dom';
import { DEMOS } from '../demos/registry';
import { Icon } from '../components/Icon';
import { useTitle } from '../components/SiteChrome';

/** Liste des démos interactives : outils qui tournent dans le navigateur, sur données réelles ou simulées (signalées). */
export default function Demos() {
  useTitle('Démos — François Pichon');
  return (
    <main className="demos-page">
      <header className="pp-hero">
        <div className="wrap">
          <h1>
            Des outils qui <em>tournent</em>, pas des captures.
          </h1>
          <p className="sec-lede">
            Quatre démos interactives, à manipuler directement dans le navigateur : rien n’est installé, rien n’est envoyé.
            Chacune montre une compétence que j’apporte à une équipe data, de la donnée publique au modèle.
          </p>
        </div>
      </header>
      <section className="wrap demos-grid" aria-label="Démos">
        {DEMOS.map((d) => (
          <Link key={d.slug} to={`/demos/${d.slug}`} className="demo-card">
            <span className="demo-card-icon" aria-hidden="true">
              <Icon name={d.icon as never} size={20} />
            </span>
            <span className="demo-card-body">
              <span className="demo-card-title">{d.title}</span>
              <span className="demo-card-summary">{d.summary}</span>
              <span className="demo-card-skills">
                {d.skills.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </span>
            </span>
            <span className="demo-card-go">
              Ouvrir <Icon name="arrow-right" size={14} />
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
