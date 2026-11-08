import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import { Icon } from '../../components/Icon';
import Tool from './Tool';
import { HORIZON, N_ABONNES } from './model';
import { int } from './format';
import './duree-vie-client.css';

/** Démo « Durée de vie client » : analyse de survie (Kaplan-Meier, log-rank, Cox) et valeur vie, écrites à la main. */
export default function Demo() {
  return (
    <main className="demo-page duree-vie-client">
      <header className="wrap sv-hero">
        <h1>Combien de temps vos clients restent, sans oublier ceux qui sont encore là</h1>
        <p className="sec-lede">
          {int(N_ABONNES)} abonnés arrivés au fil de trois ans : beaucoup n’ont pas encore résilié, et c’est tout le problème. Les courbes de
          Kaplan-Meier mesurent la fidélité en tenant compte de ces abonnés encore actifs, le modèle de Cox dit ce qui fait partir et ce qui
          retient, et la survie prédite devient une valeur vie en euros, profil par profil.
        </p>
        <ul className="sv-chips" aria-label="Compétences mises en œuvre">
          <li>Analyse de survie</li>
          <li>Données censurées</li>
          <li>Modèle de Cox</li>
          <li>Valeur vie client</li>
        </ul>
        <p className="sv-disclaimer">
          <Icon name="shield-check" size={14} />
          Données simulées à graine fixe, calculs faits dans votre navigateur. Rien n’est envoyé.
        </p>
      </header>

      <div className="sv-tool-wrap">
        <Tool />
      </div>

      <section className="wrap sv-method" aria-labelledby="sv-method-title">
        <h2 id="sv-method-title">Méthode</h2>
        <div className="sv-method-grid">
          <article>
            <h3>Des données censurées, dont on connaît la vérité</h3>
            <p>
              Chaque abonné arrive à une date entre l’ouverture et la date d’observation, {HORIZON} mois plus tard. Sa durée de vie est tirée
              d’un modèle à risques proportionnels : un risque de base de Weibull, décroissant avec l’ancienneté, multiplié par l’effet de ses
              caractéristiques, aux coefficients β fixés à l’avance.
            </p>
            <Formula tex={String.raw`h(t \mid x) = h_0(t)\, e^{x^{\top}\beta}, \qquad h_0(t) = \frac{k}{\lambda}\Big(\frac{t}{\lambda}\Big)^{k-1}`} />
            <p>
              Quand la date d’observation arrive avant la résiliation, on sait seulement que l’abonné est resté au moins jusque-là : sa durée
              est <em>censurée à droite</em>. Les abonnés annuels ont en plus un engagement : la plupart de ceux qui veulent partir attendent
              leur échéance de 12 mois. Cet effet n’est pas proportionnel, volontairement.
            </p>
          </article>
          <article>
            <h3>Kaplan-Meier et le log-rank</h3>
            <p>
              À chaque date tᵢ où dᵢ abonnés résilient parmi les nᵢ encore suivis, la survie est multipliée par la part qui reste. Les censurés
              comptent dans nᵢ tant qu’on les observe, puis sortent sans être comptés comme partis :
            </p>
            <Formula tex={String.raw`\hat S(t) = \prod_{t_i \le t}\Big(1 - \frac{d_i}{n_i}\Big), \qquad \widehat{\operatorname{Var}}\,\hat S(t) = \hat S(t)^2 \sum_{t_i \le t} \frac{d_i}{n_i (n_i - d_i)}`} />
            <p>
              La variance est celle de Greenwood ; l’intervalle est calculé sur log(−log S), ce qui le garde entre 0 et 1. Le log-rank compare,
              à chaque date, les résiliations observées dans chaque groupe à celles qu’on attendrait si tous les groupes avaient la même
              courbe, et cumule les écarts en un χ² à k − 1 degrés de liberté.
            </p>
          </article>
          <article>
            <h3>Le modèle de Cox, écrit à la main</h3>
            <p>
              Cox estime β sans jamais supposer la forme du risque de base : à chaque résiliation, il compare l’abonné parti à tous ceux encore
              à risque à cette date. Les ex æquo sont traités par la méthode de Breslow, et la vraisemblance partielle est maximisée par
              Newton-Raphson :
            </p>
            <Formula tex={String.raw`\ell(\beta) = \sum_{t_i} \Big[\sum_{j \in D_i} x_j^{\top}\beta \;-\; d_i \log \sum_{k \in R_i} e^{x_k^{\top}\beta}\Big]`} />
            <p>
              Les erreurs-types viennent de l’inverse de l’information de Fisher. La concordance de Harrell est la part des paires d’abonnés
              comparables que le score de risque range dans le bon ordre. La survie d’un profil s’obtient avec le risque de base cumulé de
              Breslow, H₀(t), par S(t | x) = exp(−H₀(t) e^(x−x̄)ᵀβ).
            </p>
          </article>
          <article>
            <h3>De la survie à la valeur vie</h3>
            <p>
              Un abonné rapporte sa marge chaque mois où il est encore là. La valeur vie sur l’horizon H est donc la somme des survies
              mensuelles, actualisées au taux mensuel r équivalent au taux annuel choisi :
            </p>
            <Formula tex={String.raw`\mathrm{CLV}(x) = \sum_{k=0}^{H-1} \frac{m \; S(k \mid x)}{(1 + r)^k}`} />
            <p>
              Le piège de la durée moyenne vient du même raisonnement : la durée moyenne sur {HORIZON} mois est l’aire sous la courbe de
              survie. Calculer la moyenne des seuls partants, c’est oublier précisément ceux qui restent longtemps.
            </p>
          </article>
        </div>
        <div className="sv-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Le modèle de Cox suppose que l’effet de chaque variable est constant dans le temps. Ce n’est pas vrai ici pour le contrat annuel,
              à dessein : son rapport de risques estimé est une moyenne qui sur-protège après 12 mois et sous-protège avant. On le corrige en
              stratifiant sur le contrat, ou avec un effet qui dépend du temps, après l’avoir détecté par les résidus de Schoenfeld.
            </li>
            <li>
              La valeur vie s’arrête à {HORIZON} mois : au-delà, aucun abonné n’a été suivi, et prolonger la courbe demande une hypothèse
              (par exemple un risque de base de Weibull ajusté) qu’il faut annoncer comme telle.
            </li>
            <li>
              Les rapports de risques décrivent des associations : les abonnés venus avec une remise partent plus, mais supprimer la remise ne
              les ferait pas forcément rester. Mesurer l’effet d’une action demande une expérience.
            </li>
            <li>
              La censure est supposée sans lien avec le risque de partir, ce qui est vrai quand elle vient seulement de la date d’observation.
              Si des abonnés sortent du suivi pour d’autres raisons (changement d’offre, fusion de comptes), il faut le vérifier.
            </li>
          </ul>
        </div>
      </section>

      <section className="wrap sv-cta" aria-labelledby="sv-cta-title">
        <h2 id="sv-cta-title">La fidélité se mesure avec ceux qui sont encore là</h2>
        <p className="sec-lede">
          Durée de vie, facteurs de départ, valeur vie par segment et budget d’acquisition qui en découle : je mène ces analyses sur vos
          données d’abonnement ou de contrats, avec des méthodes qui ne jettent pas l’information des clients actifs.
        </p>
        <div className="sv-cta-actions">
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
