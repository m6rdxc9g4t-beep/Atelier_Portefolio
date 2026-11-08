import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import Tool from './Tool';
import './impact-sans-temoin.css';

/** Démo « Impact sans groupe témoin » : contrôle synthétique, placebos, face à l'avant/après et à la DiD. */
export default function Demo() {
  return (
    <main className="demo-page impact-sans-temoin">
      <header className="wrap imp-hero">
        <h1>Mesurer l’effet d’une campagne quand personne n’a servi de groupe témoin</h1>
        <p className="sec-lede">
          Une campagne locale a tourné dans une seule ville. Pas de test A/B, seulement des ventes avant et après, et dix-neuf autres villes. On fabrique un jumeau de la
          ville à partir des autres, on mesure l’écart, puis on vérifie par des placebos que cet écart n’est pas du bruit. La vérité de la simulation est connue : à vous de
          juger les méthodes.
        </p>
        <ul className="imp-chips" aria-label="Compétences mises en œuvre">
          <li>Inférence causale</li>
          <li>Contrôle synthétique</li>
          <li>Différence de différences</li>
          <li>Tests par permutation</li>
        </ul>
        <p className="imp-disclaimer">Données simulées et calculs faits dans votre navigateur : rien n’est envoyé à un serveur.</p>
      </header>

      <div className="imp-tool-wrap">
        <Tool />
      </div>

      <section className="wrap imp-about" aria-labelledby="imp-about-title">
        <h2 id="imp-about-title">Méthode</h2>
        <div className="imp-about-grid">
          <article>
            <h3>Le contrôle synthétique</h3>
            <p>
              On cherche des poids positifs, qui somment à 1, tels que le mélange des villes de contrôle reproduise au mieux la ville traitée avant le lancement
              (Abadie, Diamond et Hainmueller). Les poids sont ensuite figés : après le lancement, le mélange donne les ventes qu’on aurait observées sans campagne.
            </p>
            <Formula tex={String.raw`\hat w = \arg\min_{w_j \ge 0,\ \sum_j w_j = 1}\ \sum_{t < T_0}\Big(y_{1t} - \sum_{j} w_j\, y_{jt}\Big)^2`} />
            <p>
              Le problème est résolu ici à la main par gradient projeté accéléré : un pas de gradient, puis une projection exacte sur le simplexe, jusqu’à convergence.
              L’effet de la semaine t est l’écart y₁ₜ − Σ ŵⱼ yⱼₜ.
            </p>
          </article>
          <article>
            <h3>Pourquoi les méthodes simples se trompent</h3>
            <p>
              L’avant/après attribue à la campagne tout ce qui change en même temps : la fin d’année, la croissance, la reprise après une grève. La différence de
              différences retire l’évolution moyenne des autres villes, mais en euros :
            </p>
            <Formula tex={String.raw`\hat\tau_{\text{DiD}} = \big(\bar y_1^{\,\text{après}} - \bar y_1^{\,\text{avant}}\big) - \big(\bar y_c^{\,\text{après}} - \bar y_c^{\,\text{avant}}\big)`} />
            <p>
              Elle suppose des tendances parallèles. Or quand la saison multiplie les ventes de 30 %, une grosse ville gagne plus d’euros qu’une petite : l’écart de
              taille se lit comme un effet. Le jumeau, lui, est calé sur la ville elle-même.
            </p>
          </article>
          <article>
            <h3>Savoir si l’écart est réel</h3>
            <p>
              Il n’y a pas d’erreur-type naturelle. On refait donc l’exercice en traitant fictivement chaque ville de contrôle, et l’on compare le rapport entre l’erreur
              du jumeau après et avant lancement :
            </p>
            <Formula tex={String.raw`r_j = \frac{\mathrm{RMSPE}_j^{\,\text{après}}}{\mathrm{RMSPE}_j^{\,\text{avant}}}, \qquad p = \frac{\operatorname{rang}(r_1)}{N + 1}`} />
            <p>
              Si la ville traitée a le rapport le plus élevé des 20 villes, il y a une chance sur 20 que ce soit le hasard. La régression sur les contrôles, elle, donne
              un intervalle de prévision classique, au prix d’une hypothèse plus forte : des coefficients libres, stables dans le temps.
            </p>
          </article>
        </div>
        <div className="imp-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Avec 19 villes de contrôle, la plus petite p-valeur possible est 1/20 = 0,05. Pour aller plus loin, il faut plus de donneurs ou plus d’unités traitées.
            </li>
            <li>
              Le jumeau ne vaut que si la ville traitée est dans l’enveloppe des autres : la plus grosse ville du pays, ou la seule en forte croissance, ne se reproduit
              pas par un mélange de villes plus petites ou plus lentes.
            </li>
            <li>
              Les villes de contrôle ne doivent pas être touchées par la campagne (pas de débordement : publicité régionale, achats en ligne depuis la ville voisine),
              ni par un autre événement propre à elles après le lancement.
            </li>
            <li>
              Avec beaucoup de donneurs bruités, les poids collent un peu au bruit d’avant le lancement : l’estimation garde un léger biais, visible ici quand le bruit
              est fort. L’intervalle de la régression suppose des erreurs indépendantes d’une semaine à l’autre, ce qui le rend trop étroit si elles sont corrélées.
            </li>
          </ul>
        </div>
      </section>

      <section className="wrap imp-cta" aria-labelledby="imp-cta-title">
        <h2 id="imp-cta-title">Mesurer ce qu’une action a vraiment changé</h2>
        <p className="sec-lede">
          Campagne locale, ouverture de magasin, changement de prix dans une région : quand le test A/B n’a pas été fait, je reconstruis le contrefactuel et je chiffre
          l’effet avec son incertitude.
        </p>
        <div className="imp-cta-actions">
          <Link to="/#contact" className="btn btn-primary">
            Parlons de votre besoin
          </Link>
          <Link to="/cv" className="btn">
            Voir le CV
          </Link>
        </div>
      </section>
    </main>
  );
}
