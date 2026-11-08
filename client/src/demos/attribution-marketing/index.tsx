import { Link } from "react-router-dom";
import { Formula } from "../../components/Formula";
import Tool from "./Tool";
import { CHANNELS, N_PARCOURS } from "./model";
import "./attribution-marketing.css";

/** Démo « Attribution marketing » : sept modèles d'attribution confrontés à une vérité causale connue. */
export default function Demo() {
  return (
    <main className="demo-page attribution-marketing">
      <header className="wrap atb-hero">
        <h1>
          Quel canal mérite vraiment la vente ? Sept modèles d’attribution face
          à la vérité
        </h1>
        <p className="sec-lede">
          {N_PARCOURS.toLocaleString("fr-FR")} parcours clients simulés sur{" "}
          {CHANNELS.length} canaux, dont on connaît l’effet réel de chacun.
          Comparez dernier clic, linéaire, chaînes de Markov ou valeurs de
          Shapley à cette vérité, et voyez où partirait le budget si l’on
          suivait chacun d’eux.
        </p>
        <ul className="atb-chips" aria-label="Compétences mises en œuvre">
          <li>Attribution multi-touch</li>
          <li>Chaînes de Markov</li>
          <li>Valeurs de Shapley</li>
          <li>Causalité et incrémentalité</li>
        </ul>
        <p className="atb-disclaimer">
          Parcours simulés et calculs faits dans votre navigateur : rien n’est
          envoyé à un serveur.
        </p>
      </header>

      <div className="atb-tool-wrap">
        <Tool />
      </div>

      <section className="wrap atb-method" aria-labelledby="atb-method-title">
        <h2 id="atb-method-title">Méthode</h2>
        <div className="atb-method-grid">
          <article>
            <h3>Une simulation dont on connaît la vérité</h3>
            <p>
              Chaque client a une intention d’achat cachée <em>u</em>. Il croise
              de un à huit canaux, puis achète avec une probabilité qui dépend
              de son intention et des canaux causaux rencontrés :
            </p>
            <Formula
              tex={String.raw`P(\text{achat}) = \sigma\Big(\alpha + \gamma\,u + \sum_{c\,\in\,\text{parcours}} \beta_c\Big)`}
            />
            <p>
              Direct et Affiliation ont un effet nul (β = 0). Ils s’ajoutent
              après la décision : un acheteur décidé tape l’adresse du site ou
              passe par un site de bons de réduction juste avant de payer.
              L’effet réel d’un canal est la baisse des ventes attendues si on
              le retire de tous les parcours, la simulation restant identique
              par ailleurs.
            </p>
          </article>
          <article>
            <h3>Cinq règles fixes</h3>
            <p>
              Dernier clic et premier clic donnent tout au dernier ou au premier
              contact. Le modèle linéaire partage à parts égales. Le modèle en U
              donne 40 % au premier et au dernier contact, et partage les 20 %
              restants entre les contacts intermédiaires. La décroissance
              temporelle pondère chaque contact selon son ancienneté Δt et une
              demi-vie h :
            </p>
            <Formula
              tex={String.raw`w_i = \frac{2^{-\Delta t_i / h}}{\sum_j 2^{-\Delta t_j / h}}`}
            />
          </article>
          <article>
            <h3>Deux modèles pilotés par les données</h3>
            <p>
              <strong>Markov.</strong> Les parcours forment un graphe : départ,
              canaux, conversion, abandon. La probabilité de conversion se
              calcule en résolvant un système linéaire. Pour mesurer l’effet de
              retrait d’un canal, on le supprime du graphe : ceux qui y
              passaient abandonnent.
            </p>
            <Formula
              tex={String.raw`\mathrm{ER}_c = 1 - \frac{P(\text{conv} \mid c\ \text{retiré})}{P(\text{conv})}`}
            />
            <p>
              <strong>Shapley.</strong> La valeur d’un ensemble de canaux S
              correspond aux conversions qu’on obtiendrait si seuls ces canaux
              existaient. Elle s’estime avec le taux de conversion observé des
              parcours réduits à S. Chaque canal reçoit sa contribution
              marginale moyenne sur les 2⁷ = 128 coalitions :
            </p>
            <Formula
              tex={String.raw`\varphi_c = \sum_{S \subseteq N \setminus \{c\}} \frac{|S|!\,(n-|S|-1)!}{n!}\,\big(v(S \cup \{c\}) - v(S)\big)`}
            />
          </article>
        </div>
        <p className="atb-method-foot">
          Chaque modèle répartit 100 % des conversions. L’écart à l’effet réel
          est la demi-somme des écarts de parts, en points : 0 si le modèle
          répartit le mérite exactement comme les effets réels, 100 s’il se
          trompe sur tout.
        </p>
        <div className="atb-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Aucun modèle d’attribution ne mesure un effet causal : tous lisent
              des corrélations dans les parcours. Ici, plus de la moitié des
              ventes auraient eu lieu sans aucun canal, et chaque modèle doit
              pourtant les répartir. Pour mesurer l’effet réel d’un canal, il
              faut une expérience (groupe témoin, test géographique) : c’est
              l’objet du{" "}
              <Link to="/demos/labo-ab-causal">
                Labo A/B et inférence causale
              </Link>
              .
            </li>
            <li>
              La vérité vient d’une simulation dont j’ai choisi les hypothèses :
              effets additifs sur l’échelle logistique, un seul contact suffit,
              pas d’effet de répétition. Le classement des modèles dépend de ces
              hypothèses ; la leçon (les canaux de fin de parcours sont
              surévalués) est robuste.
            </li>
            <li>
              Le modèle de Markov est d’ordre 1 : il ne retient que le dernier
              canal visité. Les valeurs de Shapley dépendent de la façon de
              définir la valeur d’une coalition, et les taux des combinaisons
              rares sont lissés vers la moyenne.
            </li>
          </ul>
        </div>
      </section>

      <section className="wrap atb-cta" aria-labelledby="atb-cta-title">
        <h2 id="atb-cta-title">Mesurer ce que rapporte vraiment chaque euro</h2>
        <p className="sec-lede">
          Modèle d’attribution, test d’incrémentalité ou modèle de mix marketing
          : je choisis la méthode qui répond à votre question budgétaire, et je
          dis ce qu’elle ne peut pas voir.
        </p>
        <div className="atb-cta-actions">
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
