import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';

/** Section « Méthode » : modèles, validation, intervalles, limites. */
export function Method() {
  return (
    <section className="pv-method" aria-labelledby="pv-method-title">
      <h2 id="pv-method-title">Méthode</h2>
      <div className="pv-method-grid">
        <article>
          <h3>Trois familles de modèles</h3>
          <p>
            <b>Naïf saisonnier</b> (référence) : chaque période répète la même période du cycle précédent, <Formula display={false} tex={String.raw`\hat y_{T+h} = y_{T+h-m}`} />.
            Un modèle qui ne fait pas mieux n’apporte rien.
          </p>
          <p>
            <b>Holt-Winters</b> : niveau, pente et saison lissés exponentiellement. En additif :
          </p>
          <Formula
            tex={String.raw`\begin{aligned}
\hat y_{t|t-1} &= \ell_{t-1} + b_{t-1} + s_{t-m}\\
\ell_t &= \alpha\,(y_t - s_{t-m}) + (1-\alpha)(\ell_{t-1} + b_{t-1})\\
b_t &= \beta\,(\ell_t - \ell_{t-1}) + (1-\beta)\,b_{t-1}\\
s_t &= \gamma\,(y_t - \ell_{t-1} - b_{t-1}) + (1-\gamma)\,s_{t-m}
\end{aligned}`}
          />
          <p>
            En multiplicatif, la saison multiplie le niveau (une saisonnalité qui grandit avec les ventes). <Formula display={false} tex={String.raw`\alpha, \beta, \gamma`} /> minimisent
            la somme des carrés des erreurs à un pas (Nelder-Mead, trois départs) ; β est affiché dans la convention de statsmodels (α·β). Les récursions sont
            vérifiées contre statsmodels sur la série AirPassengers.
          </p>
          <p>
            <b>Régression</b> tendance + indicatrices saisonnières, par moindres carrés :{' '}
            <Formula display={false} tex={String.raw`y_t = \beta_0 + \beta_1 t + \textstyle\sum_{j=1}^{m-1} \delta_j \mathbf 1[t \bmod m = j] + \varepsilon_t`} />.
          </p>
        </article>
        <article>
          <h3>Validation hors échantillon</h3>
          <p>
            Les dernières périodes sont mises de côté, à trois origines glissantes espacées d’un demi-horizon. À chaque origine, les paramètres sont
            réestimés sur le passé seul, puis la prévision est comparée au réalisé :
          </p>
          <Formula
            tex={String.raw`\begin{aligned}
\text{MAE} &= \tfrac1n \textstyle\sum_t |e_t| \qquad \text{RMSE} = \sqrt{\tfrac1n \textstyle\sum_t e_t^2}\\
\text{sMAPE} &= \tfrac{100}{n} \textstyle\sum_t \dfrac{2\,|e_t|}{|y_t| + |\hat y_t|}
\end{aligned}`}
          />
          <p>La MAPE n’est calculée que si toutes les valeurs observées sont positives. Le modèle à la MAE la plus faible est proposé.</p>
          <h3>Intervalles de prédiction</h3>
          <p>
            1 000 trajectoires futures sont simulées en réinjectant, période après période, des erreurs à un pas tirées avec remise dans l’historique
            (erreurs relatives en multiplicatif). Les quantiles 10–90 % et 2,5–97,5 % donnent les intervalles à 80 % et 95 %. Graine fixe : le résultat est
            reproductible. La couverture observée en validation dit si ces intervalles tiennent leur promesse.
          </p>
        </article>
        <article>
          <h3>Lecture et décomposition</h3>
          <p>
            Décomposition classique : tendance par moyenne mobile centrée sur un cycle, profil saisonnier par moyenne des écarts à la tendance. Les parts
            de variance et la force saisonnière alimentent un texte écrit par des règles fixes : aucun modèle de langage, aucun appel réseau.
          </p>
          <Formula tex={String.raw`F_S = \max\!\Big(0,\ 1 - \frac{\operatorname{Var}(R_t)}{\operatorname{Var}(S_t + R_t)}\Big)`} />
          <h3>Hypothèses et limites</h3>
          <ul>
            <li>Aucune variable explicative : prix, promotions, météo et jours fériés non récurrents ne sont pas prévus.</li>
            <li>Une seule saisonnalité (7 jours, 52 semaines ou 12 mois) ; au jour, le cycle annuel n’est pas modélisé.</li>
            <li>Erreurs supposées indépendantes et de même loi ; l’incertitude sur les paramètres n’entre pas dans les intervalles finaux.</li>
            <li>Ventes additionnées par période ; trous de moins de 25 % comblés par interpolation linéaire.</li>
          </ul>
          <p>
            La démarche Box-Jenkins (ARIMA, SARIMA) est détaillée dans le projet <Link to="/projets/prevision-arima-sarima">Prévision ARIMA / SARIMA</Link>.
          </p>
        </article>
      </div>
    </section>
  );
}
