import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import Tool from './Tool';
import './elasticite-prix.css';

/** Démo « Élasticité-prix » : régression log-log contrôlée, biais de variable omise, prix qui maximise la marge. */
export default function Demo() {
  return (
    <main className="demo-page elasticite-prix">
      <header className="wrap elp-hero">
        <h1>Mesurer la sensibilité de vos clients au prix, puis trouver le prix qui maximise la marge</h1>
        <p className="sec-lede">
          Une élasticité-prix s’estime en quelques lignes, et se trompe aussi vite : quand les promotions tombent au moment où la demande est déjà forte, la régression
          naïve confond l’effet du prix et celui de la saison. Comparez les deux estimations sur deux ans de ventes simulées, vérifiez-les contre la vraie valeur, puis
          simulez un prix.
        </p>
        <ul className="elp-chips" aria-label="Compétences mises en œuvre">
          <li>Économétrie appliquée</li>
          <li>Régression log-log</li>
          <li>Biais de variable omise</li>
          <li>Tarification</li>
        </ul>
        <p className="elp-disclaimer">Régression calculée dans votre navigateur, sur des données simulées ou sur votre propre fichier : rien n’est envoyé à un serveur.</p>
      </header>

      <div className="elp-tool-wrap">
        <Tool />
      </div>

      <section className="wrap elp-method" aria-labelledby="elp-method-title">
        <h2 id="elp-method-title">Méthode</h2>
        <div className="elp-method-grid">
          <article>
            <h3>Le modèle</h3>
            <p>
              On suppose une élasticité constante : la quantité vendue est proportionnelle au prix élevé à la puissance ε. En passant au logarithme, la relation devient
              linéaire et le coefficient du prix se lit directement comme une élasticité : +1 % de prix, ε % de volume.
            </p>
            <Formula tex={String.raw`\ln Q_t = \alpha + \varepsilon \,\ln P_t + \sum_{m=2}^{12} \gamma_m \,\mathbb{1}[\text{mois}_t = m] + \delta\, t + u_t`} />
            <p>
              Les coefficients sont estimés par moindres carrés ordinaires, écrits ici à la main : β̂ = (X′X)⁻¹X′y, erreurs-types tirées de σ̂²(X′X)⁻¹, intervalle à 95 %
              avec le quantile de Student.
            </p>
          </article>
          <article>
            <h3>Pourquoi la régression naïve se trompe</h3>
            <p>
              Si l’on oublie la saison S, elle passe dans le terme d’erreur. Or le prix est justement plus bas en haute saison : il est corrélé à cette variable omise, et
              l’estimateur absorbe une partie de son effet.
            </p>
            <Formula tex={String.raw`\operatorname{plim}\,\hat\varepsilon_{\text{naïf}} = \varepsilon + \gamma\,\frac{\operatorname{Cov}(\ln P, S)}{\operatorname{Var}(\ln P)}`} />
            <p>
              Ici γ &gt; 0 (la saison fait vendre) et Cov(ln P, S) &lt; 0 (on fait des promotions quand ça vend) : le biais est négatif, la régression naïve conclut à une
              demande plus sensible au prix qu’elle ne l’est, et pousse à baisser les prix à tort.
            </p>
          </article>
          <article>
            <h3>Du coefficient au prix</h3>
            <p>
              Avec Q = A·P<sup>ε</sup> et un coût unitaire c, la marge (P − c)·Q est maximale quand la marge relative égale l’inverse de l’élasticité (condition de
              Lerner) :
            </p>
            <Formula tex={String.raw`\frac{p^* - c}{p^*} = -\frac{1}{\varepsilon} \quad\Longleftrightarrow\quad p^* = c\,\frac{\varepsilon}{1+\varepsilon}, \qquad \varepsilon < -1`} />
            <p>
              Le volume prévu repart de la semaine moyenne de l’année récente (effets saisonniers et tendance compris), corrigé du passage du log au niveau par le facteur
              de Duan, moyenne des exp(résidus).
            </p>
          </article>
        </div>
        <div className="elp-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Contrôler la saison ne règle pas toute l’endogénéité : si les prix réagissent à des chocs de demande que l’on ne voit pas (stock, concurrence, météo), il faut
              une variable instrumentale ou une vraie expérimentation (test de prix A/B).
            </li>
            <li>
              L’élasticité est supposée constante. Loin des prix déjà pratiqués, elle change presque toujours : le simulateur grise la plage observée et signale les
              optimums qui en sortent.
            </li>
            <li>
              Les effets croisés sont ignorés : une baisse de prix sur une catégorie peut prendre des ventes à une autre (cannibalisation), ou en attirer (produits d’appel).
            </li>
            <li>Les ruptures de stock censurent la demande : une semaine sans stock ressemble à une semaine sans clients et tire l’estimation vers zéro.</li>
          </ul>
        </div>
      </section>

      <section className="wrap elp-cta" aria-labelledby="elp-cta-title">
        <h2 id="elp-cta-title">Un prix se décide avec des chiffres qui tiennent</h2>
        <p className="sec-lede">
          Élasticités par produit, effets des promotions, tests de prix : je monte l’analyse sur vos ventes, avec les contrôles qui évitent les conclusions trompeuses.
        </p>
        <div className="elp-cta-actions">
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
