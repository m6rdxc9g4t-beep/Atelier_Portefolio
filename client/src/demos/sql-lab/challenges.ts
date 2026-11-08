import type { Database } from 'sql.js';
import { CA_SQL, SCHEMA_SQL, type ComptoirData } from './data';

export type Level = 1 | 2 | 3;
export const LEVEL_LABEL: Record<Level, string> = { 1: 'Débutant', 2: 'Intermédiaire', 3: 'Avancé' };

export interface Challenge {
  id: string;
  level: Level;
  title: string;
  question: string;
  /** Notion SQL travaillée (affichée en puce). */
  notion: string;
  solution: string;
}

const CA = CA_SQL;

export const CHALLENGES: Challenge[] = [
  {
    id: 'regions',
    level: 1,
    title: 'Clients par région',
    notion: 'GROUP BY',
    question: 'Combien de clients compte chaque région ? Classez les régions de la plus peuplée à la moins peuplée.',
    solution: `SELECT region, COUNT(*) AS nb_clients
FROM clients
GROUP BY region
ORDER BY nb_clients DESC;`,
  },
  {
    id: 'chers',
    level: 1,
    title: 'Les 5 produits les plus chers',
    notion: 'ORDER BY, LIMIT',
    question: 'Affichez le nom, la catégorie et le prix des 5 produits les plus chers du catalogue.',
    solution: `SELECT nom, categorie, prix_unitaire
FROM produits
ORDER BY prix_unitaire DESC
LIMIT 5;`,
  },
  {
    id: 'ca-mensuel',
    level: 2,
    title: 'Chiffre d’affaires mensuel 2025',
    notion: 'Jointures',
    question:
      'Calculez le chiffre d’affaires de chaque mois de 2025, sur les seules commandes livrées (statut « livree »). Arrondissez à 2 décimales.',
    solution: `SELECT strftime('%Y-%m', c.date_commande) AS mois,
       ROUND(SUM(${CA}), 2) AS ca
FROM commandes c
JOIN lignes l   ON l.commande_id = c.id
JOIN produits p ON p.id = l.produit_id
WHERE c.statut = 'livree'
  AND c.date_commande LIKE '2025-%'
GROUP BY mois
ORDER BY mois;`,
  },
  {
    id: 'panier',
    level: 2,
    title: 'Panier moyen par canal',
    notion: 'Sous-requête (CTE)',
    question:
      'Pour chaque canal de vente, donnez le nombre de commandes livrées et le montant moyen d’une commande (arrondi à 2 décimales).',
    solution: `WITH paniers AS (
  SELECT c.id, c.canal, SUM(${CA}) AS montant
  FROM commandes c
  JOIN lignes l   ON l.commande_id = c.id
  JOIN produits p ON p.id = l.produit_id
  WHERE c.statut = 'livree'
  GROUP BY c.id
)
SELECT canal, COUNT(*) AS commandes, ROUND(AVG(montant), 2) AS panier_moyen
FROM paniers
GROUP BY canal
ORDER BY panier_moyen DESC;`,
  },
  {
    id: 'top-clients',
    level: 2,
    title: 'Top 10 des clients',
    notion: 'Jointures multiples',
    question:
      'Quels sont les 10 clients qui ont généré le plus de chiffre d’affaires sur des commandes livrées ? Affichez prénom et nom réunis, la ville et le CA arrondi.',
    solution: `SELECT cl.prenom || ' ' || cl.nom AS client, cl.ville,
       ROUND(SUM(${CA}), 2) AS ca
FROM clients cl
JOIN commandes c ON c.client_id = cl.id
JOIN lignes l    ON l.commande_id = c.id
JOIN produits p  ON p.id = l.produit_id
WHERE c.statut = 'livree'
GROUP BY cl.id
ORDER BY ca DESC
LIMIT 10;`,
  },
  {
    id: 'croissance',
    level: 3,
    title: 'Croissance d’un mois sur l’autre',
    notion: 'LAG()',
    question:
      'Sur toute la période, donnez pour chaque mois le CA livré et son évolution en % par rapport au mois précédent (arrondie à 1 décimale).',
    solution: `WITH m AS (
  SELECT strftime('%Y-%m', c.date_commande) AS mois,
         ROUND(SUM(${CA}), 2) AS ca
  FROM commandes c
  JOIN lignes l   ON l.commande_id = c.id
  JOIN produits p ON p.id = l.produit_id
  WHERE c.statut = 'livree'
  GROUP BY mois
)
SELECT mois, ca,
       ROUND(100.0 * (ca - LAG(ca) OVER (ORDER BY mois))
             / LAG(ca) OVER (ORDER BY mois), 1) AS evolution_pct
FROM m
ORDER BY mois;`,
  },
  {
    id: 'marge',
    level: 3,
    title: 'Marge par catégorie',
    notion: 'Agrégats calculés',
    question:
      'Pour chaque catégorie, calculez le CA livré, la marge brute (CA moins coût d’achat) et le taux de marge en %. Classez par marge décroissante.',
    solution: `WITH v AS (
  SELECT p.categorie,
         SUM(${CA}) AS ca,
         SUM(l.quantite * p.cout_unitaire) AS cout
  FROM commandes c
  JOIN lignes l   ON l.commande_id = c.id
  JOIN produits p ON p.id = l.produit_id
  WHERE c.statut = 'livree'
  GROUP BY p.categorie
)
SELECT categorie, ROUND(ca, 2) AS ca, ROUND(ca - cout, 2) AS marge,
       ROUND(100.0 * (ca - cout) / ca, 1) AS taux_marge_pct
FROM v
ORDER BY marge DESC;`,
  },
  {
    id: 'rang',
    level: 3,
    title: 'Les 2 best-sellers de chaque catégorie',
    notion: 'RANK() OVER (PARTITION BY …)',
    question: 'Dans chaque catégorie, trouvez les 2 produits les plus vendus en quantité, sur les commandes livrées.',
    solution: `WITH ventes AS (
  SELECT p.categorie, p.nom, SUM(l.quantite) AS unites,
         RANK() OVER (PARTITION BY p.categorie
                      ORDER BY SUM(l.quantite) DESC) AS rang
  FROM commandes c
  JOIN lignes l   ON l.commande_id = c.id
  JOIN produits p ON p.id = l.produit_id
  WHERE c.statut = 'livree'
  GROUP BY p.id
)
SELECT categorie, nom, unites, rang
FROM ventes
WHERE rang <= 2
ORDER BY categorie, rang;`,
  },
  {
    id: 'retention',
    level: 3,
    title: 'Fidélité 2024 → 2025',
    notion: 'Ensembles',
    question:
      'Parmi les clients livrés au moins une fois en 2024, combien l’ont aussi été en 2025 ? Donnez les deux effectifs et le taux de rétention en %.',
    solution: `WITH a AS (SELECT DISTINCT client_id FROM commandes
           WHERE statut = 'livree' AND date_commande LIKE '2024-%'),
     b AS (SELECT DISTINCT client_id FROM commandes
           WHERE statut = 'livree' AND date_commande LIKE '2025-%')
SELECT COUNT(*) AS clients_2024,
       SUM(client_id IN (SELECT client_id FROM b)) AS revenus_2025,
       ROUND(100.0 * SUM(client_id IN (SELECT client_id FROM b)) / COUNT(*), 1) AS retention_pct
FROM a;`,
  },
];

export const EXAMPLE_QUERY = `-- Exemple : chiffre d'affaires mensuel des commandes livrées.
-- Modifiez la requête, puis lancez-la avec Ctrl + Entrée.
SELECT strftime('%Y-%m', c.date_commande) AS mois,
       COUNT(DISTINCT c.id) AS commandes,
       ROUND(SUM(${CA}), 2) AS ca
FROM commandes c
JOIN lignes l   ON l.commande_id = c.id
JOIN produits p ON p.id = l.produit_id
WHERE c.statut = 'livree'
GROUP BY mois
ORDER BY mois;`;

/** Crée les tables et charge la base générée (une transaction, requêtes préparées). */
export function loadComptoir(db: Database, data: ComptoirData): void {
  db.run(SCHEMA_SQL);
  db.run('BEGIN');
  const ins = (sql: string, rows: (string | number)[][]) => {
    const st = db.prepare(sql);
    for (const r of rows) st.run(r);
    st.free();
  };
  ins('INSERT INTO clients VALUES (?,?,?,?,?,?,?)', data.clients.map((c) => [c.id, c.prenom, c.nom, c.ville, c.region, c.date_inscription, c.segment]));
  ins('INSERT INTO produits VALUES (?,?,?,?,?)', data.produits.map((p) => [p.id, p.nom, p.categorie, p.prix_unitaire, p.cout_unitaire]));
  ins('INSERT INTO commandes VALUES (?,?,?,?,?)', data.commandes.map((c) => [c.id, c.client_id, c.date_commande, c.canal, c.statut]));
  ins('INSERT INTO lignes VALUES (?,?,?,?,?)', data.lignes.map((l) => [l.id, l.commande_id, l.produit_id, l.quantite, l.remise]));
  db.run('COMMIT');
}

export type Cell = string | number | null | Uint8Array;
export interface QueryResult {
  columns: string[];
  rows: Cell[][];
  ms: number;
}

/** Exécute une ou plusieurs instructions ; renvoie le dernier jeu de résultats. */
export function runQuery(db: Database, sql: string): QueryResult {
  const t0 = performance.now();
  const res = db.exec(sql);
  const ms = performance.now() - t0;
  const last = res[res.length - 1];
  return { columns: last ? last.columns : [], rows: last ? (last.values as Cell[][]) : [], ms };
}

/** Compare un résultat à l'attendu : mêmes dimensions, mêmes lignes (ordre et noms de colonnes libres, nombres à 0,01 près). */
export function compareResults(got: Pick<QueryResult, 'columns' | 'rows'>, want: Pick<QueryResult, 'columns' | 'rows'>): { ok: true } | { ok: false; why: string } {
  if (got.rows.length !== want.rows.length)
    return { ok: false, why: `${want.rows.length} ligne${want.rows.length > 1 ? 's' : ''} attendue${want.rows.length > 1 ? 's' : ''}, ${got.rows.length} obtenue${got.rows.length > 1 ? 's' : ''}.` };
  if (got.columns.length !== want.columns.length)
    return { ok: false, why: `${want.columns.length} colonne${want.columns.length > 1 ? 's' : ''} attendue${want.columns.length > 1 ? 's' : ''}, ${got.columns.length} obtenue${got.columns.length > 1 ? 's' : ''}.` };
  const norm = (v: Cell) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v === null ? null : v instanceof Uint8Array ? `blob:${v.length}` : String(v).trim());
  const key = (r: Cell[]) => JSON.stringify(r.map(norm));
  const a = got.rows.map(key).sort();
  const b = want.rows.map(key).sort();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return { ok: false, why: 'Le bon nombre de lignes, mais certaines valeurs diffèrent de l’attendu.' };
  return { ok: true };
}

/** Colonnes monétaires (affichées en euros). */
export const isMoneyColumn = (name: string) => /(^|_)(ca|marge|montant|panier|prix|cout)(_|$)/i.test(name) && !/pct/i.test(name);
