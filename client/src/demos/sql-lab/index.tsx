import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import Lab from './Lab';
import { CATALOGUE, N_CLIENTS, N_COMMANDES, REGIONS } from './data';
import { CHALLENGES } from './challenges';
import './sql-lab.css';

/** Démo « SQL Lab » : une vraie base SQLite dans le navigateur, une boutique fictive et des défis corrigés automatiquement. */
export default function Demo() {
  const nProduits = CATALOGUE.reduce((s, c) => s + c.articles.length, 0);
  return (
    <main className="demo-page sql-lab">
      <header className="wrap sl-hero">
        <h1>Interrogez une vraie base de ventes, directement dans votre navigateur</h1>
        <p className="sec-lede">
          Comptoir Lumen est une boutique fictive d’objets pour la maison : {N_CLIENTS} clients, {nProduits} produits,{' '}
          {N_COMMANDES.toLocaleString('fr-FR')} commandes sur deux ans. Écrivez vos requêtes, regardez le résultat se tracer tout seul, puis
          relevez les {CHALLENGES.length} défis : votre réponse est comparée à l’attendu dès que vous l’exécutez.
        </p>
        <ul className="sl-chips" aria-label="Compétences mises en œuvre">
          <li>SQL analytique</li>
          <li>Jointures et agrégats</li>
          <li>Fonctions de fenêtre</li>
          <li>Modèle de données de vente</li>
        </ul>
        <p className="sl-disclaimer">
          Base SQLite compilée en WebAssembly et générée dans votre navigateur : données fictives, rien n’est envoyé à un serveur.
        </p>
      </header>

      <div className="sl-tool-wrap">
        <Lab />
      </div>

      <section className="wrap sl-method" aria-labelledby="sl-method-title">
        <h2 id="sl-method-title">Méthode</h2>
        <div className="sl-method-grid">
          <article>
            <h3>Une base réaliste, identique pour tous</h3>
            <p>
              Les données sont tirées par un générateur pseudo-aléatoire à graine fixe : chaque visiteur obtient exactement la même base, donc
              les mêmes réponses. Les clients sont répartis dans {REGIONS.length} régions selon leur poids démographique, avec une forte
              inégalité d’achat (quelques gros clients, beaucoup de petits). Les commandes suivent une saisonnalité mensuelle, un surcroît le
              week-end, un pic de Black Friday et une croissance d’environ 35 % sur deux ans.
            </p>
            <p>Le chiffre d’affaires d’une ligne déduit la remise ; on ne compte que les commandes livrées :</p>
            <Formula tex={String.raw`\mathrm{CA} = \sum_{\text{lignes livrées}} q \times p \times (1 - r)`} />
          </article>
          <article>
            <h3>Une correction qui juge le résultat, pas la syntaxe</h3>
            <p>
              Il existe toujours plusieurs façons d’écrire une bonne requête. La vérification exécute donc la solution de référence et compare
              les deux résultats : même nombre de lignes et de colonnes, mêmes valeurs, en ignorant l’ordre des lignes et le nom des colonnes.
              Les nombres sont comparés au centime près, pour qu’un arrondi fait plus tôt ou plus tard ne soit pas compté comme une erreur.
            </p>
            <p>
              Les défis montent en difficulté : regroupements, jointures sur trois tables, sous-requêtes nommées (<code>WITH</code>), puis
              fonctions de fenêtre (<code>LAG</code>, <code>RANK … PARTITION BY</code>) et logique d’ensembles pour mesurer la fidélité.
            </p>
          </article>
          <article>
            <h3>Le moteur</h3>
            <p>
              C’est SQLite lui-même, compilé en WebAssembly (sql.js) : les requêtes sont exécutées par le vrai moteur, avec ses index, ses
              plans d’exécution et ses messages d’erreur. La base est construite en mémoire à l’ouverture de la page, en une transaction, en
              une fraction de seconde. Quand un résultat associe une colonne de libellés à une colonne de nombres, le graphique choisit seul
              entre une courbe (une série de mois) et des barres.
            </p>
          </article>
        </div>
        <div className="sl-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Le dialecte est celui de SQLite : les dates se manipulent avec <code>strftime</code>, là où PostgreSQL utiliserait{' '}
              <code>date_trunc</code> et SQL Server <code>FORMAT</code>. Les notions, elles, sont les mêmes partout.
            </li>
            <li>
              La correction compare des résultats : une requête qui tombe juste par hasard sur cette base serait acceptée. Lire la solution
              proposée reste le meilleur moyen de vérifier son raisonnement.
            </li>
            <li>
              Les données sont fictives et leurs ordres de grandeur sont des hypothèses de simulation, pas des références de marché. L’affichage
              se limite aux 300 premières lignes ; la requête, elle, porte sur toute la base.
            </li>
          </ul>
        </div>
      </section>

      <section className="wrap sl-cta" aria-labelledby="sl-cta-title">
        <h2 id="sl-cta-title">Des requêtes qui répondent aux questions du métier</h2>
        <p className="sec-lede">
          Chiffre d’affaires, marge, fidélité, saisonnalité : écrire la bonne requête, c’est d’abord poser la bonne question. Je le fais sur
          vos données, dans votre entrepôt ou votre outil de BI.
        </p>
        <div className="sl-cta-actions">
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
