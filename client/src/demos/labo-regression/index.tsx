import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Formula } from '../../components/Formula';
import { Tool } from './Tool';
import './labo-regression.css';

/** Démo « Labo de régression » : MCO écrits à la main, erreurs-types robustes, diagnostics et comparaison de modèles. */
export default function LaboRegression() {
  return (
    <main className="demo-page labo-regression">
      <div className="wrap">
        <header className="rg-head">
          <h1>Une régression qui montre ce qu’elle vaut, diagnostics compris</h1>
          <p className="sec-lede">
            Choisissez la variable à expliquer et ses déterminants : les moindres carrés sont estimés sous vos yeux, avec les erreurs-types classiques et robustes, les
            tests qui disent si le modèle tient, et une comparaison côte à côte pour voir un coefficient bouger quand on ajoute une variable.
          </p>
          <ul className="chips rg-skills" aria-label="Compétences mises en œuvre">
            {['Économétrie', 'Moindres carrés ordinaires', 'Erreurs-types robustes', 'Diagnostics de modèle', 'Biais de variable omise'].map((s) => (
              <li key={s} className="chip">
                {s}
              </li>
            ))}
          </ul>
        </header>

        <Tool />

        <section className="rg-method" aria-labelledby="rg-method-title">
          <h2 id="rg-method-title">Méthode</h2>
          <div className="rg-method-grid">
            <article>
              <h3>Estimation</h3>
              <p>Les coefficients minimisent la somme des carrés des résidus :</p>
              <Formula tex={String.raw`\hat\beta = \arg\min_\beta \lVert y - X\beta \rVert^2 = (X'X)^{-1}X'y`} />
              <p>
                Ils sont calculés sans jamais former <Formula display={false} tex="X'X" />, dont le conditionnement est le carré de celui de X : une décomposition QR de
                Householder donne <Formula display={false} tex="X = QR" />, puis on résout le système triangulaire <Formula display={false} tex="R\hat\beta = Q'y" />. Un
                régresseur exactement combinaison des autres est détecté sur la diagonale de R et retiré, comme le « NA » de R.
              </p>
              <h3>Erreurs-types</h3>
              <p>Classiques, sous l’hypothèse d’une variance constante des erreurs :</p>
              <Formula tex={String.raw`\widehat{V}(\hat\beta) = \hat\sigma^2 (X'X)^{-1}, \qquad \hat\sigma^2 = \frac{e'e}{n-k}`} />
              <p>Robustes à l’hétéroscédasticité (sandwich de White, avec la correction de petit échantillon HC1) :</p>
              <Formula tex={String.raw`\widehat{V}_{HC1}(\hat\beta) = \frac{n}{n-k}\,(X'X)^{-1}\Big(\sum_i e_i^2\,x_i x_i'\Big)(X'X)^{-1}`} />
              <p>
                Les p-valeurs viennent de la loi de Student à n − k degrés de liberté, et le F global de la loi de Fisher. Leurs fonctions de répartition sont calculées ici
                même, par la fonction bêta incomplète.
              </p>
            </article>
            <article>
              <h3>Diagnostics</h3>
              <ul>
                <li>
                  <b>Breusch-Pagan</b> (version de Koenker, robuste à la non-normalité) : on régresse <Formula display={false} tex="e_i^2" /> sur les régresseurs ;{' '}
                  <Formula display={false} tex="LM = n\,R^2_{aux}" /> suit un χ² à k − 1 degrés de liberté si la variance est constante.
                </li>
                <li>
                  <b>Jarque-Bera</b> : <Formula display={false} tex={String.raw`JB = \tfrac{n}{6}\big(S^2 + \tfrac{(K-3)^2}{4}\big)`} />, χ² à 2 degrés de liberté, avec
                  S l’asymétrie et K l’aplatissement des résidus.
                </li>
                <li>
                  <b>VIF</b> : <Formula display={false} tex={String.raw`VIF_j = 1/(1-R_j^2)`} />, où <Formula display={false} tex="R_j^2" /> vient de la régression
                  du régresseur j sur les autres. Au-delà de 10, la variance de son coefficient est plus que décuplée.
                </li>
                <li>
                  <b>Distance de Cook</b> : <Formula display={false} tex={String.raw`D_i = \frac{e_i^2}{k\,\hat\sigma^2}\,\frac{h_{ii}}{(1-h_{ii})^2}`} />, où{' '}
                  <Formula display={false} tex="h_{ii}" /> est le levier de l’observation. Seuil d’alerte 4/n, point très influent au-delà de 1.
                </li>
              </ul>
            </article>
            <article>
              <h3>Le biais que les tests ne voient pas</h3>
              <p>
                Si le vrai modèle est <Formula display={false} tex={String.raw`y = \beta x + \gamma z + u`} /> et que z est oublié, le coefficient estimé de x vaut en
                moyenne
              </p>
              <Formula tex={String.raw`\mathbb{E}[\tilde\beta] = \beta + \gamma\,\delta, \qquad \delta = \frac{\operatorname{Cov}(x,z)}{\operatorname{Var}(x)}`} />
              <p>
                Dans le scénario « Formation », γ = 6 points par écart-type d’aptitude et δ ≈ 0,08 : le biais attendu est d’environ +0,48, ce qui fait presque doubler
                l’effet de 0,5. Aucun des diagnostics ci-dessus ne s’en aperçoit : les résidus restent sages. Seule la question « qu’est-ce qui pousse à la fois x et y ? »
                permet de le voir, et la comparaison de modèles d’en mesurer l’ampleur.
              </p>
              <h3>Les scénarios</h3>
              <p>
                Les trois jeux de données sont simulés à graine fixe, avec des vraies valeurs connues (dépliez « Les vraies valeurs de la simulation ») : on peut juger
                chaque estimation à l’aune de la vérité, ce que ne permet aucun jeu réel.
              </p>
            </article>
          </div>
          <div className="rg-limits">
            <h3>Limites</h3>
            <ul>
              <li>
                Le modèle reste linéaire dans ses paramètres et suppose des régresseurs exogènes : en cas de causalité inverse ou de variable omise, il faut des variables
                instrumentales, un panel à effets fixes ou une expérience, qui ne sont pas proposés ici.
              </li>
              <li>
                Les erreurs-types robustes HC1 valent pour des observations indépendantes et un échantillon assez grand. Pas de correction pour des données groupées
                (erreurs-types en grappes) ni pour l’autocorrélation des séries temporelles (Newey-West) ; HC3 serait préférable sous une centaine d’observations.
              </li>
              <li>
                Les seuils (VIF de 10, distance de Cook de 4/n) sont des conventions, pas des lois : ils signalent ce qu’il faut regarder, pas ce qu’il faut supprimer.
              </li>
              <li>
                Un CSV chargé est limité à 50 000 lignes, avec des colonnes numériques ou catégorielles d’au plus 12 modalités ; au-delà de 2 500 observations, les
                graphiques en montrent un échantillon régulier.
              </li>
            </ul>
          </div>
        </section>

        <section className="rg-cta">
          <div>
            <h2>Une estimation se défend autant qu’elle se calcule</h2>
            <p>Effet d’un prix, d’une formation, d’une campagne : je construis le modèle, je vérifie ce qui peut le fausser, et je l’explique à ceux qui décident.</p>
          </div>
          <div className="rg-cta-actions">
            <Link className="btn btn-primary" to="/#contact">
              Me contacter
              <Icon name="arrow-right" />
            </Link>
            <Link className="btn" to="/cv">
              Voir le CV
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
