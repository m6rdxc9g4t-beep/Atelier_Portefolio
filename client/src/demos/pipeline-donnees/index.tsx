import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import Pipeline from './Pipeline';
import { MODELS, SOURCES } from './model';
import './pipeline-donnees.css';

/** Démo « Pipeline de données » : un projet à la dbt (staging → intermédiaire → marts), exécuté et testé dans SQLite, dans le navigateur. */
export default function Demo() {
  const nTests = MODELS.reduce((s, m) => s + m.tests.length, 0);
  return (
    <main className="demo-page pipeline-donnees">
      <header className="wrap pl-hero">
        <h1>Un pipeline de données qui se teste lui-même, de l’export brut au tableau de bord</h1>
        <p className="sec-lede">
          {SOURCES.length} sources brutes et « sales », {MODELS.length} modèles SQL organisés en couches comme dans un projet dbt, {nTests} tests
          de données. Le pipeline s’exécute sous vos yeux : un doublon de chargement à la source fait échouer des tests jusqu’au mart final.
          Corrigez le modèle de staging, relancez, et regardez tout repasser au vert.
        </p>
        <ul className="pl-chips" aria-label="Compétences mises en œuvre">
          <li>Analytics engineering</li>
          <li>Modélisation en couches</li>
          <li>Tests de données</li>
          <li>Lignage</li>
        </ul>
        <p className="pl-disclaimer">
          <Icon name="shield-check" size={14} />
          Données fictives (la boutique Comptoir Lumen du <Link to="/demos/sql-lab">SQL Lab</Link>), exécutées par SQLite dans votre navigateur.
          Rien n’est envoyé.
        </p>
      </header>

      <div className="pl-tool-wrap">
        <Pipeline />
      </div>

      <section className="wrap pl-method" aria-labelledby="pl-method-title">
        <h2 id="pl-method-title">Méthode</h2>
        <div className="pl-method-grid">
          <article>
            <h3>Des couches qui ont chacune un rôle</h3>
            <p>
              Le <strong>staging</strong> ne fait qu’une chose : rendre chaque source propre et typée, une table pour une source. Dates
              ramenées au format ISO, virgules décimales converties, libellés harmonisés, document JSON déplié. L’<strong>intermédiaire</strong>{' '}
              assemble : chaque ligne de commande y retrouve sa commande et son produit, et le montant n’est calculé qu’à cet endroit. Les{' '}
              <strong>marts</strong> sont ce que lisent les tableaux de bord : un fait de vente par commande livrée, une dimension client, un
              agrégat mensuel.
            </p>
            <p>
              Un modèle ne cite jamais une table en dur : il écrit <code>{"{{ ref('stg_commandes') }}"}</code> ou{' '}
              <code>{"{{ source('erp', 'raw_commandes') }}"}</code>. Ce sont ces références qui dessinent le graphe, fixent l’ordre d’exécution
              (tri topologique, cycles refusés) et disent quels modèles reconstruire quand l’un d’eux change.
            </p>
          </article>
          <article>
            <h3>Des tests qui renvoient les lignes fautives</h3>
            <p>
              Comme dans dbt, un test est une requête qui renvoie les lignes en défaut : zéro ligne, le test passe. Quatre tests génériques
              couvrent l’essentiel : <code>unique</code>, <code>not_null</code>, <code>accepted_values</code> et <code>relationships</code>{' '}
              (toute clé étrangère retrouve sa ligne parente). S’y ajoutent des règles métier, dont un rapprochement : la somme du mart doit
              retomber, à l’euro près, sur le total comptable calculé sur les données d’origine.
            </p>
            <p>
              Le défaut injecté est classique : environ 4 % des commandes ont été chargées deux fois. Le test d’unicité du staging le voit le
              premier, la jointure le propage, le rapprochement le confirme au bout de la chaîne. La correction tient en une fonction de
              fenêtre : <code>ROW_NUMBER()</code> par commande, du chargement le plus récent au plus ancien, et on ne garde que le premier.
            </p>
          </article>
          <article>
            <h3>Un lignage qui répond à « d’où vient ce chiffre ? »</h3>
            <p>
              Chaque modèle documente l’origine de ses colonnes. En remontant ces déclarations depuis une colonne du mart, on obtient l’arbre
              complet jusqu’aux colonnes brutes, avec les filtres traversés. Le chiffre d’affaires mensuel vient ainsi de trois colonnes de
              l’export des lignes (quantité, prix, remise), filtrées sur le statut « livrée » de la commande.
            </p>
            <p>
              Modifier un modèle marque aussitôt tout son aval « à reconstruire » : on sait ce que touche un changement avant de l’exécuter, et
              « Exécuter ce modèle et l’aval » ne reconstruit que ce qui doit l’être.
            </p>
          </article>
        </div>
        <div className="pl-limits">
          <h3>Limites</h3>
          <ul>
            <li>
              Le lignage de colonnes est déclaré dans chaque modèle, comme une documentation dbt, et non déduit du SQL par un analyseur. Si
              vous réécrivez un modèle, il peut ne plus correspondre au code : la démo signale alors les colonnes déclarées qui n’existent plus
              dans le résultat.
            </li>
            <li>
              Tous les modèles sont matérialisés en tables reconstruites entièrement à chaque exécution. Un vrai projet utiliserait aussi des
              vues et des modèles incrémentaux, et tournerait sur un entrepôt (BigQuery, Snowflake, PostgreSQL), pas dans le navigateur.
            </li>
            <li>
              Les références <code>ref()</code> et <code>source()</code> sont reconnues par une expression régulière ; il n’y a ni macros
              Jinja ni variables. Le dialecte est celui de SQLite.
            </li>
          </ul>
        </div>
      </section>

      <section className="wrap pl-cta" aria-labelledby="pl-cta-title">
        <h2 id="pl-cta-title">Des données fiables avant d’être jolies</h2>
        <p className="sec-lede">
          Un tableau de bord ne vaut que ce que vaut la chaîne qui l’alimente. Je structure ces chaînes en couches, avec des tests qui
          préviennent avant que l’erreur n’arrive au comité, et une documentation qui dit d’où vient chaque chiffre.
        </p>
        <div className="pl-cta-actions">
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
