import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import { Icon } from '../../components/Icon';
import { N_CLIENTS, N_COMMANDES } from '../sql-lab/data';
import Segmentation from './Segmentation';
import { int } from './format';
import { K_MAX, K_MIN, KMEANS_RUNS } from './model';
import './segmentation-clients.css';

/** Démo « Segmentation clients » : scores RFM et k-means sur la clientèle de Comptoir Lumen, calculés dans le navigateur. */
export default function Demo() {
  return (
    <main className="demo-page segmentation-clients">
      <header className="wrap seg-hero">
        <h1>Qui sont vos clients ? Deux façons de les regrouper, et ce qu’on en fait</h1>
        <p className="sec-lede">
          La clientèle d’une boutique d’objets pour la maison, segmentée deux fois : d’abord par les scores RFM (récence, fréquence,
          montant), une grille simple que tout le marketing comprend ; puis par un k-means, qui laisse les données dessiner les groupes.
          Chaque groupe reçoit un portrait chiffré et une action marketing. Ce sont les mêmes clients que dans le{' '}
          <Link to="/demos/sql-lab">SQL Lab</Link> et le <Link to="/demos/tableau-de-bord">tableau de bord</Link>.
        </p>
        <ul className="seg-chips-skills" aria-label="Compétences mises en œuvre">
          <li>Segmentation RFM</li>
          <li>Clustering k-means</li>
          <li>Choix du nombre de groupes</li>
          <li>Analyse en composantes principales</li>
        </ul>
        <p className="seg-disclaimer">
          <Icon name="shield-check" size={14} />
          Données fictives générées dans votre navigateur ({int(N_CLIENTS)} clients, {int(N_COMMANDES)} commandes, 2024 – 2025) ; tous
          les calculs sont faits ici. Rien n’est envoyé.
        </p>
      </header>

      <div className="seg-tool-wrap">
        <Segmentation />
      </div>

      <section className="wrap seg-method" aria-labelledby="seg-method-title">
        <h2 id="seg-method-title">Méthode</h2>
        <div className="seg-method-grid">
          <article>
            <h3>Les trois mesures RFM</h3>
            <p>
              Pour chaque client ayant reçu au moins une commande, on mesure au 31 décembre 2025 : la récence R (jours depuis la dernière
              commande livrée), la fréquence F (nombre de commandes livrées) et le montant M (chiffre d’affaires livré, remises déduites).
            </p>
            <p>
              Chaque mesure devient un score de 1 à 5 par quintiles : on classe les clients, et le rang fixe le score. Les ex æquo reçoivent
              le même score, celui de la première place de leur groupe ; pour la récence, le classement est inversé (5 = le plus récent).
            </p>
            <Formula tex={String.raw`\text{score}_i = 1 + \left\lfloor \frac{5\, \rho_i}{n} \right\rfloor, \quad \rho_i = \text{rang du premier ex æquo de } i \;(0 \le \rho_i < n)`} />
            <p>
              Les onze segments se lisent sur la grille récence × fréquence, comme dans la pratique courante : « Champions » en haut à
              droite, « Perdus » en bas à gauche, « À ne pas perdre » pour les très fidèles qui ne commandent plus.
            </p>
          </article>

          <article>
            <h3>Le k-means, écrit à la main</h3>
            <p>
              Les variables sont la récence, le logarithme de la fréquence et celui du montant : sans logarithme, les quelques gros clients
              professionnels écraseraient tous les autres. Chacune est ensuite centrée et réduite, pour qu’aucune ne pèse plus qu’une autre
              du seul fait de son unité.
            </p>
            <Formula tex={String.raw`z_{ij} = \frac{x_{ij} - \bar{x}_j}{\sigma_j}, \qquad \min_{C_1,\dots,C_k} \; \sum_{g=1}^{k} \sum_{i \in C_g} \lVert z_i - \mu_g \rVert^2`} />
            <p>
              L’algorithme alterne affectation de chaque client au centre le plus proche et recalcul des centres, jusqu’à ce que plus
              personne ne change de groupe. Les centres de départ sont tirés par k-means++ (loin les uns des autres, avec une probabilité
              proportionnelle au carré de la distance) ; on relance {KMEANS_RUNS} fois avec une graine fixe et on garde la solution
              d’inertie minimale. Les groupes sont numérotés par montant moyen décroissant.
            </p>
          </article>

          <article>
            <h3>Combien de groupes ?</h3>
            <p>
              Deux indices pour k de {K_MIN} à {K_MAX}. Le coude regarde l’inertie intra-groupes : elle baisse toujours quand k augmente, on
              cherche le point où elle cesse de baisser beaucoup. La silhouette compare, pour chaque client, la distance moyenne à son propre
              groupe (a) à celle du groupe voisin le plus proche (b) :
            </p>
            <Formula tex={String.raw`s_i = \frac{b_i - a_i}{\max(a_i,\, b_i)} \in [-1, 1], \qquad \bar{s} = \frac{1}{n} \sum_i s_i`} />
            <p>
              Le k proposé maximise la silhouette moyenne. Ce n’est qu’un point de départ : un groupe de plus, à silhouette presque égale,
              vaut souvent mieux s’il correspond à une action marketing différente.
            </p>
          </article>

          <article>
            <h3>Voir les groupes, puis les nommer</h3>
            <p>
              Trois variables ne se dessinent pas à plat. L’analyse en composantes principales (valeurs et vecteurs propres de la matrice de
              covariance, calculés par la méthode de Jacobi) projette les clients sur les deux directions qui gardent le plus de variance ;
              les poids affichés sous le nuage disent ce que chaque axe représente.
            </p>
            <p>
              Le nom et l’action de chaque groupe viennent de son centre standardisé : sa récence, et sa « valeur » (moyenne des z de
              fréquence et de montant), comparées à la moyenne de la clientèle. Le texte cite les médianes du groupe à côté de celles de
              l’ensemble, pour que chaque recommandation se vérifie d’un coup d’œil.
            </p>
          </article>
        </div>

        <div className="seg-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Les données sont simulées : l’inégalité des achats et la part de clients professionnels sont des hypothèses du générateur. Sur
              une vraie clientèle, les groupes seraient différents, la démarche resterait la même.
            </li>
            <li>
              Le k-means cherche des groupes ronds et de tailles comparables, dans l’espace des variables choisies. Changer les variables
              (ajouter la catégorie préférée, la remise moyenne) ou leur transformation changerait les groupes : c’est un choix métier autant
              que statistique.
            </li>
            <li>
              Les quintiles dépendent de la base : un score de 5 veut dire « parmi les meilleurs 20 % d’ici », pas un seuil absolu. Avec
              beaucoup d’ex æquo (une seule commande pour une grande partie des clients), certains scores sont peu remplis.
            </li>
            <li>
              Une segmentation décrit, elle ne prédit pas : savoir qui va partir demande un modèle de churn, évalué sur des données qu’il n’a
              pas vues.
            </li>
          </ul>
        </div>
      </section>

      <section className="wrap seg-cta" aria-labelledby="seg-cta-title">
        <h2 id="seg-cta-title">Des segments qui débouchent sur des actions</h2>
        <p className="sec-lede">
          Une segmentation n’a de valeur que si chaque groupe appelle une décision : qui relancer, qui récompenser, qui laisser tranquille.
          Je la construis avec vos équipes, sur vos données, et je la rends lisible dans vos outils.
        </p>
        <div className="seg-cta-actions">
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
