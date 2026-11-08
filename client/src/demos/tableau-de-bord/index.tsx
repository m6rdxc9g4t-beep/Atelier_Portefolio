import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import { Icon } from '../../components/Icon';
import { N_CLIENTS, N_COMMANDES } from '../sql-lab/data';
import Dashboard from './Dashboard';
import { int } from './format';
import './tableau-de-bord.css';

/** Démo « Tableau de bord » : les ventes de Comptoir Lumen, filtrées et comparées à l'année précédente, dans le navigateur. */
export default function Demo() {
  return (
    <main className="demo-page tableau-de-bord">
      <header className="wrap tdb-hero">
        <h1>Un tableau de bord de ventes où chaque chiffre se recoupe en SQL</h1>
        <p className="sec-lede">
          Deux ans de ventes d’une boutique d’objets pour la maison, à filtrer par période, région, canal, catégorie et type de client.
          Chaque indicateur est comparé à la même période un an plus tôt, sur le même périmètre ; un clic sur une barre ajoute le filtre.
          Les chiffres sont ceux que renvoient les requêtes du{' '}
          <Link to="/demos/sql-lab">SQL Lab</Link>, sur la même base.
        </p>
        <ul className="tdb-chips-skills" aria-label="Compétences mises en œuvre">
          <li>Définition d’indicateurs</li>
          <li>Comparaisons à périmètre égal</li>
          <li>Filtres croisés</li>
          <li>Analyse de cohortes</li>
        </ul>
        <p className="tdb-disclaimer">
          <Icon name="shield-check" size={14} />
          Données fictives générées dans votre navigateur ({int(N_CLIENTS)} clients, {int(N_COMMANDES)} commandes, 2024 – 2025). Rien n’est
          envoyé.
        </p>
      </header>

      <div className="tdb-tool-wrap">
        <Dashboard />
      </div>

      <Method />

      <section className="wrap tdb-cta" aria-labelledby="tdb-cta-title">
        <h2 id="tdb-cta-title">Des indicateurs définis une fois, lus de la même façon par tous</h2>
        <p className="sec-lede">
          Une définition écrite pour chaque chiffre, des comparaisons qui tiennent la route et des écrans qui répondent aux questions du
          comité : c’est ce que je mets en place, de la requête SQL au tableau de bord Power BI ou web.
        </p>
        <div className="tdb-cta-actions">
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

function Method() {
  return (
    <section className="wrap tdb-method" aria-labelledby="tdb-method-title">
      <h2 id="tdb-method-title">Méthode</h2>

      <div className="tdb-method-grid">
        <article>
          <h3>Une seule définition du chiffre d’affaires</h3>
          <p>
            Le CA d’une ligne de commande est son montant TTC, remise déduite. Il n’est compté que pour les commandes livrées : une
            commande annulée, retournée ou encore en cours ne fait pas de chiffre d’affaires.
          </p>
          <Formula tex={String.raw`\mathrm{CA} = \sum_{\ell \,\in\, \text{livrées}} q_\ell \, p_\ell \,(1 - r_\ell)`} />
          <p>
            C’est mot pour mot la formule des requêtes du SQL Lab (<code>quantite × prix_unitaire × (1 − remise)</code>,{' '}
            <code>statut = 'livree'</code>) : un test automatique compare les deux démos sur le total, chaque canal, chaque mois de 2025 et un
            périmètre croisé région × catégorie × segment.
          </p>
        </article>

        <article>
          <h3>Les autres indicateurs</h3>
          <p>Avec C l’ensemble des commandes livrées du périmètre et c_ℓ le coût d’achat unitaire :</p>
          <Formula
            tex={String.raw`\begin{aligned} \text{Panier moyen} &= \mathrm{CA} / |C| \\ \text{Marge brute} &= \mathrm{CA} - \textstyle\sum_\ell q_\ell\, c_\ell, \quad \text{taux} = \text{marge} / \mathrm{CA} \\ \text{Taux de retour} &= \frac{\text{retournées}}{\text{livrées} + \text{retournées}} \end{aligned}`}
          />
          <p>
            Les clients actifs sont les clients distincts ayant reçu au moins une commande sur la période. Le taux d’annulation rapporte
            les commandes annulées à toutes les commandes passées. Avec un filtre de catégorie, seules les lignes de la catégorie entrent
            dans le CA, et une commande compte dès qu’elle contient une de ces lignes.
          </p>
        </article>

        <article>
          <h3>Comparer à périmètre égal</h3>
          <p>
            La variation de chaque carte compare la période choisie à la même période décalée de douze mois, avec exactement les mêmes
            filtres. Comparer décembre à novembre, ou une région à toute la France, mélangerait saisonnalité et périmètre. Pour les taux,
            l’écart est donné en points :
          </p>
          <Formula tex={String.raw`\Delta\% = \frac{X_{t}}{X_{t-12}} - 1, \qquad \Delta_{\text{pts}} = \tau_{t} - \tau_{t-12}`} />
          <p>
            Sur 2024, il n’y a pas d’année précédente dans les données : la carte le dit plutôt que d’afficher une variation inventée.
          </p>
        </article>

        <article>
          <h3>Filtres croisés et cohortes</h3>
          <p>
            Chaque répartition applique tous les filtres sauf celui de sa propre dimension : on voit la part de la catégorie choisie
            parmi les autres, au lieu d’une barre unique à 100 %.
          </p>
          <p>
            Un client appartient à la cohorte du mois de sa première commande livrée, sur tout l’historique. La case (cohorte c, mois k)
            donne la part de la cohorte qui reçoit à nouveau une commande au mois c + k :
          </p>
          <Formula tex={String.raw`R_{c,k} = \frac{\big|\{\, i \in c : i \text{ actif au mois } c + k \,\}\big|}{|c|}`} />
          <p>Les cases au-delà de décembre 2025 restent vides : on ne sait pas encore.</p>
        </article>
      </div>

      <div className="tdb-limits">
        <h3>Limites</h3>
        <ul>
          <li>
            Les données sont simulées : saisonnalité, croissance de 35 % sur deux ans, Black Friday et part de clients professionnels sont
            des hypothèses du générateur, pas des références de marché.
          </li>
          <li>
            Fin décembre 2025, une partie des commandes est encore « en cours » : le dernier mois est mécaniquement sous-estimé, comme
            dans toute base vivante. Un vrai tableau de bord le signalerait ou attendrait la clôture.
          </li>
          <li>
            Le CA est TTC et la marge ne tient compte que du coût d’achat des produits (ni livraison, ni frais de paiement, ni
            retours).
          </li>
          <li>
            Les petites cellules (une région, une catégorie et un segment sur un mois) ne comptent parfois que quelques commandes :
            leurs variations relèvent du bruit plus que de la tendance.
          </li>
        </ul>
      </div>
    </section>
  );
}
