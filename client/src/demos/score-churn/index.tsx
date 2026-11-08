import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import { Icon } from '../../components/Icon';
import Tool from './Tool';
import { N_ABONNES } from './model';
import { int } from './format';
import './score-churn.css';

/** Démo « Score de churn » : une régression logistique écrite à la main, évaluée honnêtement, puis transformée en décision chiffrée. */
export default function Demo() {
  return (
    <main className="demo-page score-churn">
      <header className="wrap chn-hero">
        <h1>Prédire qui va résilier, puis décider en euros qui appeler</h1>
        <p className="sec-lede">
          {int(N_ABONNES)} abonnés d’un service mensuel, leur usage, leurs tickets au support, leurs retards de paiement et leur contrat. Une
          régression logistique estime le risque de départ de chacun, on vérifie sur des abonnés qu’elle n’a jamais vus si ce risque est
          fiable, puis on choisit qui contacter selon ce que coûte une offre et ce que rapporte un client retenu.
        </p>
        <ul className="chn-chips" aria-label="Compétences mises en œuvre">
          <li>Régression logistique</li>
          <li>Évaluation d’un classifieur</li>
          <li>Calibration</li>
          <li>Décision au coût</li>
        </ul>
        <p className="chn-disclaimer">
          <Icon name="shield-check" size={14} />
          Données simulées à graine fixe, modèle entraîné dans votre navigateur. Rien n’est envoyé.
        </p>
      </header>

      <div className="chn-tool-wrap">
        <Tool />
      </div>

      <section className="wrap chn-method" aria-labelledby="chn-method-title">
        <h2 id="chn-method-title">Méthode</h2>
        <div className="chn-method-grid">
          <article>
            <h3>Des données dont on connaît la vérité</h3>
            <p>
              Chaque abonné a une probabilité de résilier tirée d’un vrai modèle logistique, aux coefficients fixés à l’avance, plus un
              surcroît de risque les premiers mois qui décroît avec l’ancienneté. On peut donc comparer ce que le modèle retrouve à ce qui a
              servi à simuler, et mesurer le plafond atteignable : l’AUC qu’aurait le vrai modèle sur le même jeu de test.
            </p>
            <Formula
              tex={String.raw`\operatorname{logit} P(y_i = 1) = \beta_0 + x_i^{\top}\beta + 1{,}3\, e^{-a_i / 5}`}
            />
            <p>
              Le terme non linéaire en ancienneté (aᵢ, en mois) échappe à un modèle linéaire en aᵢ : la case « log(1 + ancienneté) » ajoute
              une variable qui en capte l’essentiel, et l’AUC le montre.
            </p>
          </article>
          <article>
            <h3>Une régression logistique écrite à la main</h3>
            <p>
              Les variables sont centrées-réduites, puis les coefficients maximisent la vraisemblance pénalisée par un terme ridge (la
              constante n’est pas pénalisée). L’optimisation se fait par moindres carrés repondérés itérés (IRLS), c’est-à-dire Newton :
            </p>
            <Formula
              tex={String.raw`\beta^{(k+1)} = \beta^{(k)} + \left(X^{\top} W X + \lambda I\right)^{-1}\left(X^{\top}(y - \mu) - \lambda \beta^{(k)}\right)`}
            />
            <p>
              avec μᵢ la probabilité prédite et W = diag(μᵢ(1 − μᵢ)). Les coefficients sont ramenés à l’échelle d’origine pour se lire en
              odds ratios : e^(β·u) est le facteur qui multiplie la cote p / (1 − p) quand la variable augmente de u. Les intervalles viennent
              de l’inverse du hessien et sont approchés quand λ &gt; 0.
            </p>
          </article>
          <article>
            <h3>Une évaluation sur des abonnés jamais vus</h3>
            <p>
              Le jeu est coupé en 70 % d’apprentissage et 30 % de test, en gardant le même taux de résiliation des deux côtés (découpage
              stratifié). Toutes les courbes sont calculées sur le test. L’AUC est la probabilité qu’un partant ait un score plus élevé qu’un
              fidèle ; on la calcule par la statistique de Mann-Whitney, qui donne exactement l’aire de la courbe ROC :
            </p>
            <Formula tex={String.raw`\mathrm{AUC} = \frac{1}{n_1 n_0}\sum_{i : y_i = 1}\;\sum_{j : y_j = 0} \Big(\mathbb{1}[s_i > s_j] + \tfrac12\,\mathbb{1}[s_i = s_j]\Big)`} />
            <p>
              Avec seulement 18 % de partants, la courbe précision/rappel dit mieux que la ROC ce que valent les contacts. La calibration
              vérifie qu’un score de 30 % correspond bien à 30 % de départs : c’est indispensable pour raisonner en euros.
            </p>
          </article>
          <article>
            <h3>Un seuil choisi par le coût, pas à 50 %</h3>
            <p>
              Contacter un abonné coûte c (l’offre) ; s’il allait partir, l’offre le retient avec la probabilité s et l’on garde sa valeur V.
              Par rapport à ne contacter personne, le gain net d’une campagne et le seuil rentable pour un score bien calibré sont :
            </p>
            <Formula tex={String.raw`G = s\,V \cdot \mathrm{VP} - c\,(\mathrm{VP} + \mathrm{FP}), \qquad \text{contacter si } \; p \geq \frac{c}{s\,V}`} />
            <p>
              Le graphique balaie tous les seuils sur le jeu de test et garde celui qui maximise G. Le seuil théorique et le seuil observé
              diffèrent un peu : le score n’est jamais parfaitement calibré, et 1 500 abonnés laissent du bruit.
            </p>
          </article>
        </div>
        <div className="chn-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Les données sont simulées : les effets sont réalistes en ordre de grandeur, pas mesurés sur un vrai service. Sur des données
              réelles, il faut veiller à ce que chaque variable soit connue avant la période où l’on observe la résiliation, sinon le modèle
              « triche » avec l’avenir.
            </li>
            <li>
              Un odds ratio décrit une association, pas une cause : les abonnés venus avec une remise résilient davantage, mais supprimer la
              remise ne les ferait pas forcément rester.
            </li>
            <li>
              Le calcul de gain suppose que l’offre agit pareil sur tous les partants et ne change rien pour ceux qui restaient. En pratique,
              certains seraient restés de toute façon et d’autres partent à cause du contact : c’est le domaine de la modélisation d’uplift,
              qui se mesure avec un groupe témoin.
            </li>
            <li>
              Un modèle linéaire en logit ne voit que les interactions et non-linéarités qu’on lui donne. Un modèle à arbres (gradient
              boosting) les trouverait seul, au prix d’une explication moins directe et d’une calibration à reprendre.
            </li>
          </ul>
        </div>
      </section>

      <section className="wrap chn-cta" aria-labelledby="chn-cta-title">
        <h2 id="chn-cta-title">Un score n’a de valeur que par la décision qu’il permet</h2>
        <p className="sec-lede">
          Variables construites avec le métier, validation honnête, calibration, seuil fixé par les coûts et liste d’actions lisible par
          les équipes : c’est ainsi que je mène un projet de scoring, du premier extrait de données à la campagne mesurée.
        </p>
        <div className="chn-cta-actions">
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
