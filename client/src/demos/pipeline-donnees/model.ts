/**
 * Pipeline de données à la dbt : sources brutes → staging → intermédiaire → marts.
 * Logique pure (aucune dépendance au moteur SQL) : dépendances déduites du SQL, tri topologique,
 * propagation « à reconstruire », génération des requêtes de test, lignage de colonnes.
 */

export type Layer = 'source' | 'staging' | 'intermediate' | 'mart';

export const LAYER_LABEL: Record<Layer, string> = {
  source: 'Sources',
  staging: 'Staging',
  intermediate: 'Intermédiaire',
  mart: 'Marts',
};

export type DataTest =
  | { kind: 'unique'; column: string }
  | { kind: 'not_null'; column: string }
  | { kind: 'accepted_values'; column: string; values: string[] }
  | { kind: 'relationships'; column: string; to: string; field: string }
  | { kind: 'expression'; label: string; expression: string }
  | { kind: 'custom'; label: string; sql: string };

export interface SourceDef {
  name: string;
  /** Nom du système d'origine, comme dans `source('erp', 'raw_commandes')`. */
  system: string;
  description: string;
  defects: string;
}

export interface ModelDef {
  name: string;
  layer: Exclude<Layer, 'source'>;
  description: string;
  sql: string;
  tests: DataTest[];
  /** Lignage déclaré : colonne produite → colonnes amont (« modele.colonne »). */
  lineage: Record<string, string[]>;
  /** Filtre qui conditionne toutes les lignes du modèle (affiché avec le lignage). */
  filter?: string;
}

/* ───────────── Dépendances ───────────── */

const REF_RE = /\{\{\s*ref\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)\s*\}\}/g;
const SOURCE_RE = /\{\{\s*source\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*['"]([A-Za-z0-9_]+)['"]\s*\)\s*\}\}/g;

/** Références d'un modèle : `ref('x')` vers d'autres modèles, `source('sys', 'table')` vers des tables brutes. Sans doublon, dans l'ordre d'apparition. */
export function extractDeps(sql: string): { refs: string[]; sources: string[] } {
  const refs: string[] = [];
  const sources: string[] = [];
  for (const m of sql.matchAll(REF_RE)) if (!refs.includes(m[1]!)) refs.push(m[1]!);
  for (const m of sql.matchAll(SOURCE_RE)) if (!sources.includes(m[2]!)) sources.push(m[2]!);
  return { refs, sources };
}

/** SQL exécutable : chaque `{{ ref(...) }}` / `{{ source(...) }}` est remplacé par le nom de la table. */
export function compileSql(sql: string): string {
  return sql.replace(REF_RE, (_m, name: string) => name).replace(SOURCE_RE, (_m, _sys: string, table: string) => table);
}

export interface Edge {
  from: string;
  to: string;
}

/** Arêtes du graphe : source ou modèle amont → modèle. */
export function buildEdges(models: ModelDef[]): Edge[] {
  const edges: Edge[] = [];
  for (const m of models) {
    const { refs, sources } = extractDeps(m.sql);
    for (const s of sources) edges.push({ from: s, to: m.name });
    for (const r of refs) edges.push({ from: r, to: m.name });
  }
  return edges;
}

/** Tri topologique (Kahn), stable dans l'ordre fourni. Renvoie les nœuds pris dans un cycle s'il y en a un. */
export function topoSort(nodes: string[], edges: Edge[]): { ok: true; order: string[] } | { ok: false; cycle: string[] } {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue;
    indeg.set(e.to, indeg.get(e.to)! + 1);
    out.get(e.from)!.push(e.to);
  }
  const queue = nodes.filter((n) => indeg.get(n) === 0);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const t of out.get(n)!) {
      indeg.set(t, indeg.get(t)! - 1);
      if (indeg.get(t) === 0) queue.push(t);
    }
  }
  if (order.length === nodes.length) return { ok: true, order };
  return { ok: false, cycle: nodes.filter((n) => !order.includes(n)) };
}

/** Tous les nœuds en aval (descendants), sans le nœud lui-même. */
export function downstream(name: string, edges: Edge[]): string[] {
  const seen = new Set<string>();
  const stack = [name];
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of edges) if (e.from === n && !seen.has(e.to)) {
      seen.add(e.to);
      stack.push(e.to);
    }
  }
  seen.delete(name);
  return [...seen];
}

/** Tous les nœuds en amont (ancêtres), sans le nœud lui-même. */
export function upstream(name: string, edges: Edge[]): string[] {
  const seen = new Set<string>();
  const stack = [name];
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of edges) if (e.to === n && !seen.has(e.from)) {
      seen.add(e.from);
      stack.push(e.from);
    }
  }
  seen.delete(name);
  return [...seen];
}

export type NodeState = 'idle' | 'stale' | 'running' | 'ok' | 'error' | 'skipped';

/** Après modification de `name` : le modèle et tout son aval passent « à reconstruire » (les autres gardent leur état). */
export function markStale(states: Record<string, NodeState>, name: string, edges: Edge[]): Record<string, NodeState> {
  const next = { ...states };
  for (const n of [name, ...downstream(name, edges)]) next[n] = 'stale';
  return next;
}

/* ───────────── Tests de données ───────────── */

const quote = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Requête d'un test, à la manière de dbt : elle renvoie les lignes en défaut ; le test passe si elle n'en renvoie aucune. */
export function testSql(test: DataTest, model: string): string {
  switch (test.kind) {
    case 'unique':
      return `SELECT ${test.column}, COUNT(*) AS occurrences\nFROM ${model}\nWHERE ${test.column} IS NOT NULL\nGROUP BY ${test.column}\nHAVING COUNT(*) > 1`;
    case 'not_null':
      return `SELECT *\nFROM ${model}\nWHERE ${test.column} IS NULL`;
    case 'accepted_values':
      return `SELECT ${test.column}, COUNT(*) AS occurrences\nFROM ${model}\nWHERE ${test.column} NOT IN (${test.values.map(quote).join(', ')})\nGROUP BY ${test.column}`;
    case 'relationships':
      return `SELECT enfant.${test.column}\nFROM ${model} AS enfant\nLEFT JOIN ${test.to} AS parent ON parent.${test.field} = enfant.${test.column}\nWHERE enfant.${test.column} IS NOT NULL\n  AND parent.${test.field} IS NULL`;
    case 'expression':
      return `SELECT *\nFROM ${model}\nWHERE NOT (${test.expression})`;
    case 'custom':
      return compileSql(test.sql);
  }
}

/** Libellé court d'un test, tel que dbt l'afficherait. */
export function testLabel(test: DataTest): string {
  switch (test.kind) {
    case 'unique':
      return `unique(${test.column})`;
    case 'not_null':
      return `not_null(${test.column})`;
    case 'accepted_values':
      return `accepted_values(${test.column})`;
    case 'relationships':
      return `relationships(${test.column} → ${test.to}.${test.field})`;
    case 'expression':
    case 'custom':
      return test.label;
  }
}

/** Le test de relation ajoute une dépendance : la table parente doit être construite avant d'exécuter le test. */
export function testDeps(test: DataTest): string[] {
  if (test.kind === 'relationships') return [test.to];
  if (test.kind === 'custom') return extractDeps(test.sql).refs;
  return [];
}

/* ───────────── Lignage de colonnes ───────────── */

export interface LineageNode {
  /** « modele.colonne » ou « raw_table.colonne ». */
  id: string;
  model: string;
  column: string;
  children: LineageNode[];
}

/** Remonte le lignage déclaré d'une colonne jusqu'aux sources (arbre ; un nœud déjà visité sur la branche n'est pas redéroulé). */
export function traceLineage(model: string, column: string, models: ModelDef[], path: string[] = []): LineageNode {
  const id = `${model}.${column}`;
  const def = models.find((m) => m.name === model);
  const parents = def?.lineage[column] ?? [];
  const children = path.includes(id)
    ? []
    : parents.map((p) => {
        const [pm, pc] = p.split('.') as [string, string];
        return traceLineage(pm, pc, models, [...path, id]);
      });
  return { id, model, column, children };
}

/** Feuilles d'un arbre de lignage : les colonnes sources d'où vient la valeur. */
export function lineageLeaves(node: LineageNode): string[] {
  if (!node.children.length) return [node.id];
  const out: string[] = [];
  for (const c of node.children) for (const l of lineageLeaves(c)) if (!out.includes(l)) out.push(l);
  return out;
}

/** Modèles traversés par un arbre de lignage (pour les surligner dans le graphe). */
export function lineageModels(node: LineageNode): string[] {
  const out = new Set<string>([node.model]);
  for (const c of node.children) for (const m of lineageModels(c)) out.add(m);
  return [...out];
}

/* ───────────── Le projet ───────────── */

export const SOURCES: SourceDef[] = [
  {
    name: 'raw_commandes',
    system: 'erp',
    description: 'Export quotidien des commandes de l’ERP, chargé tel quel.',
    defects: 'Dates en trois formats, canal et statut en casse libre, une partie des commandes chargée deux fois.',
  },
  {
    name: 'raw_lignes',
    system: 'erp',
    description: 'Lignes de commande, toutes les colonnes en texte.',
    defects: 'Prix et remises avec une virgule décimale (« 189,00 », « 0,15 »).',
  },
  {
    name: 'raw_produits',
    system: 'catalogue',
    description: 'Référentiel produits reçu en JSON, un document par produit.',
    defects: 'Attributs imbriqués dans un document JSON à extraire.',
  },
  {
    name: 'raw_clients',
    system: 'crm',
    description: 'Fichier clients du CRM.',
    defects: 'Villes en casse incohérente (« PARIS », « paris »), segment en libellés variés.',
  },
];

/** Version d'origine de stg_commandes : elle oublie les doublons de chargement (le défaut que les tests vont révéler). */
export const STG_COMMANDES_SQL = `-- Commandes de l'ERP : types, dates au format ISO, libellés harmonisés.
SELECT
  CAST(id_commande AS INTEGER)  AS commande_id,
  CAST(id_client AS INTEGER)    AS client_id,
  CASE
    WHEN date_commande LIKE '__/__/____'
      THEN substr(date_commande, 7, 4) || '-' || substr(date_commande, 4, 2)
           || '-' || substr(date_commande, 1, 2)
    ELSE substr(date_commande, 1, 10)
  END                           AS date_commande,
  CASE lower(trim(canal))
    WHEN 'site web'    THEN 'Site web'
    WHEN 'web'         THEN 'Site web'
    WHEN 'application' THEN 'Application'
    WHEN 'appli'       THEN 'Application'
    WHEN 'boutique'    THEN 'Boutique'
  END                           AS canal,
  lower(trim(statut))           AS statut
FROM {{ source('erp', 'raw_commandes') }}`;

/** La correction : ne garder que le dernier chargement de chaque commande. */
export const STG_COMMANDES_FIXED_SQL = `-- Commandes de l'ERP : types, dates au format ISO, libellés harmonisés.
-- Une commande peut avoir été chargée plusieurs fois : on garde le dernier chargement.
WITH chargements AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY id_commande
           ORDER BY _charge_le DESC
         ) AS rang
  FROM {{ source('erp', 'raw_commandes') }}
)
SELECT
  CAST(id_commande AS INTEGER)  AS commande_id,
  CAST(id_client AS INTEGER)    AS client_id,
  CASE
    WHEN date_commande LIKE '__/__/____'
      THEN substr(date_commande, 7, 4) || '-' || substr(date_commande, 4, 2)
           || '-' || substr(date_commande, 1, 2)
    ELSE substr(date_commande, 1, 10)
  END                           AS date_commande,
  CASE lower(trim(canal))
    WHEN 'site web'    THEN 'Site web'
    WHEN 'web'         THEN 'Site web'
    WHEN 'application' THEN 'Application'
    WHEN 'appli'       THEN 'Application'
    WHEN 'boutique'    THEN 'Boutique'
  END                           AS canal,
  lower(trim(statut))           AS statut
FROM chargements
WHERE rang = 1`;

/** Jeton remplacé à l'exécution par le total comptable de référence (calculé à partir des données d'origine). */
export const CA_REFERENCE_TOKEN = '__CA_REFERENCE__';

export const MODELS: ModelDef[] = [
  {
    name: 'stg_commandes',
    layer: 'staging',
    description: 'Une ligne par commande : identifiants typés, date ISO, canal et statut harmonisés.',
    sql: STG_COMMANDES_SQL,
    tests: [
      { kind: 'unique', column: 'commande_id' },
      { kind: 'not_null', column: 'date_commande' },
      { kind: 'accepted_values', column: 'canal', values: ['Site web', 'Application', 'Boutique'] },
      { kind: 'accepted_values', column: 'statut', values: ['livree', 'annulee', 'retournee', 'en_cours'] },
    ],
    lineage: {
      commande_id: ['raw_commandes.id_commande'],
      client_id: ['raw_commandes.id_client'],
      date_commande: ['raw_commandes.date_commande'],
      canal: ['raw_commandes.canal'],
      statut: ['raw_commandes.statut'],
    },
  },
  {
    name: 'stg_lignes',
    layer: 'staging',
    description: 'Lignes de commande typées ; virgules décimales converties.',
    sql: `-- Lignes de commande : tout arrive en texte, avec des virgules décimales.
SELECT
  CAST(id_ligne AS INTEGER)                   AS ligne_id,
  CAST(id_commande AS INTEGER)                AS commande_id,
  CAST(id_produit AS INTEGER)                 AS produit_id,
  CAST(quantite AS INTEGER)                   AS quantite,
  CAST(replace(prix_paye, ',', '.') AS REAL)  AS prix_unitaire,
  CAST(replace(remise, ',', '.') AS REAL)     AS remise
FROM {{ source('erp', 'raw_lignes') }}`,
    tests: [
      { kind: 'unique', column: 'ligne_id' },
      { kind: 'relationships', column: 'produit_id', to: 'stg_produits', field: 'produit_id' },
      { kind: 'expression', label: 'quantité > 0 et remise entre 0 et 1', expression: 'quantite > 0 AND remise >= 0 AND remise < 1' },
    ],
    lineage: {
      ligne_id: ['raw_lignes.id_ligne'],
      commande_id: ['raw_lignes.id_commande'],
      produit_id: ['raw_lignes.id_produit'],
      quantite: ['raw_lignes.quantite'],
      prix_unitaire: ['raw_lignes.prix_paye'],
      remise: ['raw_lignes.remise'],
    },
  },
  {
    name: 'stg_produits',
    layer: 'staging',
    description: 'Référentiel produits extrait des documents JSON.',
    sql: `-- Référentiel produits : un document JSON par produit.
SELECT
  json_extract(contenu, '$.id')         AS produit_id,
  json_extract(contenu, '$.nom')        AS nom,
  json_extract(contenu, '$.categorie')  AS categorie,
  json_extract(contenu, '$.prix')       AS prix_catalogue,
  json_extract(contenu, '$.cout')       AS cout_unitaire
FROM {{ source('catalogue', 'raw_produits') }}`,
    tests: [
      { kind: 'unique', column: 'produit_id' },
      { kind: 'not_null', column: 'cout_unitaire' },
    ],
    lineage: {
      produit_id: ['raw_produits.contenu'],
      nom: ['raw_produits.contenu'],
      categorie: ['raw_produits.contenu'],
      prix_catalogue: ['raw_produits.contenu'],
      cout_unitaire: ['raw_produits.contenu'],
    },
  },
  {
    name: 'stg_clients',
    layer: 'staging',
    description: 'Clients du CRM : ville en majuscules (convention du référentiel), segment harmonisé.',
    sql: `-- Clients du CRM : casse des villes et libellés de segment harmonisés.
SELECT
  CAST(id AS INTEGER)  AS client_id,
  trim(prenom)         AS prenom,
  trim(nom)            AS nom,
  upper(trim(ville))   AS ville,
  region,
  CASE
    WHEN lower(trim(segment)) IN ('pro', 'professionnel', 'b2b')
      THEN 'Professionnel'
    ELSE 'Particulier'
  END                  AS segment
FROM {{ source('crm', 'raw_clients') }}`,
    tests: [
      { kind: 'unique', column: 'client_id' },
      { kind: 'accepted_values', column: 'segment', values: ['Particulier', 'Professionnel'] },
    ],
    lineage: {
      client_id: ['raw_clients.id'],
      prenom: ['raw_clients.prenom'],
      nom: ['raw_clients.nom'],
      ville: ['raw_clients.ville'],
      region: ['raw_clients.region'],
      segment: ['raw_clients.segment'],
    },
  },
  {
    name: 'int_lignes_enrichies',
    layer: 'intermediate',
    description: 'Chaque ligne de commande avec sa commande et son produit ; montant et coût calculés une seule fois.',
    sql: `-- Une ligne par ligne de commande, enrichie de la commande et du produit.
SELECT
  l.ligne_id,
  l.commande_id,
  c.date_commande,
  substr(c.date_commande, 1, 7)                  AS mois,
  c.client_id,
  c.canal,
  c.statut,
  l.produit_id,
  p.categorie,
  l.quantite,
  l.prix_unitaire,
  l.remise,
  l.quantite * l.prix_unitaire * (1 - l.remise)  AS montant,
  l.quantite * p.cout_unitaire                   AS cout
FROM {{ ref('stg_lignes') }} AS l
JOIN {{ ref('stg_commandes') }} AS c ON c.commande_id = l.commande_id
JOIN {{ ref('stg_produits') }} AS p ON p.produit_id = l.produit_id`,
    tests: [
      { kind: 'unique', column: 'ligne_id' },
      { kind: 'not_null', column: 'montant' },
    ],
    lineage: {
      ligne_id: ['stg_lignes.ligne_id'],
      commande_id: ['stg_lignes.commande_id'],
      date_commande: ['stg_commandes.date_commande'],
      mois: ['stg_commandes.date_commande'],
      client_id: ['stg_commandes.client_id'],
      canal: ['stg_commandes.canal'],
      statut: ['stg_commandes.statut'],
      produit_id: ['stg_lignes.produit_id'],
      categorie: ['stg_produits.categorie'],
      quantite: ['stg_lignes.quantite'],
      prix_unitaire: ['stg_lignes.prix_unitaire'],
      remise: ['stg_lignes.remise'],
      montant: ['stg_lignes.quantite', 'stg_lignes.prix_unitaire', 'stg_lignes.remise'],
      cout: ['stg_lignes.quantite', 'stg_produits.cout_unitaire'],
    },
  },
  {
    name: 'fct_ventes',
    layer: 'mart',
    description: 'Fait de vente : une ligne par commande livrée, avec son montant et sa marge.',
    filter: "int_lignes_enrichies.statut = 'livree'",
    sql: `-- Une ligne par commande livrée.
SELECT
  commande_id,
  date_commande,
  mois,
  client_id,
  canal,
  SUM(quantite)        AS articles,
  SUM(montant)         AS montant,
  SUM(montant - cout)  AS marge
FROM {{ ref('int_lignes_enrichies') }}
WHERE statut = 'livree'
GROUP BY commande_id, date_commande, mois, client_id, canal`,
    tests: [
      { kind: 'unique', column: 'commande_id' },
      { kind: 'relationships', column: 'client_id', to: 'stg_clients', field: 'client_id' },
    ],
    lineage: {
      commande_id: ['int_lignes_enrichies.commande_id'],
      date_commande: ['int_lignes_enrichies.date_commande'],
      mois: ['int_lignes_enrichies.mois'],
      client_id: ['int_lignes_enrichies.client_id'],
      canal: ['int_lignes_enrichies.canal'],
      articles: ['int_lignes_enrichies.quantite'],
      montant: ['int_lignes_enrichies.montant'],
      marge: ['int_lignes_enrichies.montant', 'int_lignes_enrichies.cout'],
    },
  },
  {
    name: 'dim_clients',
    layer: 'mart',
    description: 'Dimension clients : attributs nettoyés et cumul de leurs achats livrés.',
    sql: `-- Une ligne par client, avec son historique d'achats livrés.
SELECT
  c.client_id,
  c.prenom,
  c.nom,
  c.ville,
  c.region,
  c.segment,
  MIN(f.date_commande)          AS premiere_commande,
  COUNT(f.commande_id)          AS commandes_livrees,
  COALESCE(SUM(f.montant), 0)   AS ca_total
FROM {{ ref('stg_clients') }} AS c
LEFT JOIN {{ ref('fct_ventes') }} AS f ON f.client_id = c.client_id
GROUP BY c.client_id`,
    tests: [
      { kind: 'unique', column: 'client_id' },
      { kind: 'expression', label: 'ca_total ≥ 0', expression: 'ca_total >= 0' },
    ],
    lineage: {
      client_id: ['stg_clients.client_id'],
      prenom: ['stg_clients.prenom'],
      nom: ['stg_clients.nom'],
      ville: ['stg_clients.ville'],
      region: ['stg_clients.region'],
      segment: ['stg_clients.segment'],
      premiere_commande: ['fct_ventes.date_commande'],
      commandes_livrees: ['fct_ventes.commande_id'],
      ca_total: ['fct_ventes.montant'],
    },
  },
  {
    name: 'mart_ca_mensuel',
    layer: 'mart',
    description: 'Chiffre d’affaires, marge et panier moyen par mois : la table que lit le tableau de bord.',
    sql: `-- Le chiffre d'affaires mensuel, prêt pour le tableau de bord.
SELECT
  mois,
  COUNT(*)                            AS commandes,
  ROUND(SUM(montant), 2)              AS ca,
  ROUND(SUM(marge), 2)                AS marge,
  ROUND(SUM(montant) / COUNT(*), 2)   AS panier_moyen
FROM {{ ref('fct_ventes') }}
GROUP BY mois
ORDER BY mois`,
    tests: [
      { kind: 'unique', column: 'mois' },
      {
        kind: 'custom',
        label: 'rapprochement avec le total comptable',
        sql: `SELECT ROUND(SUM(ca), 2) AS ca_du_mart, ${CA_REFERENCE_TOKEN} AS ca_comptable
FROM {{ ref('mart_ca_mensuel') }}
HAVING ABS(SUM(ca) - ${CA_REFERENCE_TOKEN}) > 1`,
      },
    ],
    lineage: {
      mois: ['fct_ventes.mois'],
      commandes: ['fct_ventes.commande_id'],
      ca: ['fct_ventes.montant'],
      marge: ['fct_ventes.marge'],
      panier_moyen: ['fct_ventes.montant', 'fct_ventes.commande_id'],
    },
  },
];

/** Colonnes du mart final proposées pour le lignage. */
export const MART_COLUMNS = ['ca', 'marge', 'panier_moyen', 'commandes', 'mois'] as const;

export const ALL_NODES = [...SOURCES.map((s) => s.name), ...MODELS.map((m) => m.name)];

export function layerOf(name: string, models: ModelDef[] = MODELS): Layer {
  if (SOURCES.some((s) => s.name === name)) return 'source';
  return models.find((m) => m.name === name)?.layer ?? 'staging';
}
