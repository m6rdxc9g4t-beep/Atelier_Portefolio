/**
 * Démo « Modélisation de données » : logique pure (aucun DOM, aucun moteur SQL).
 * Modèle relationnel, modèles de départ, diagnostic de conception, corrections automatiques,
 * étapes de normalisation, génération du DDL (PostgreSQL, SQLite, MySQL) et jeu d'essai.
 */

export type ColType = 'INTEGER' | 'BIGINT' | 'NUMERIC' | 'REAL' | 'TEXT' | 'VARCHAR' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP';

export const COL_TYPES: { value: ColType; label: string }[] = [
  { value: 'INTEGER', label: 'INTEGER (entier)' },
  { value: 'BIGINT', label: 'BIGINT (grand entier)' },
  { value: 'NUMERIC', label: 'NUMERIC (décimal exact)' },
  { value: 'REAL', label: 'REAL (flottant)' },
  { value: 'TEXT', label: 'TEXT (texte libre)' },
  { value: 'VARCHAR', label: 'VARCHAR (texte court)' },
  { value: 'BOOLEAN', label: 'BOOLEAN (vrai / faux)' },
  { value: 'DATE', label: 'DATE' },
  { value: 'TIMESTAMP', label: 'TIMESTAMP (date et heure)' },
];

export interface FkRef {
  tableId: string;
  columnId: string;
}
export interface Column {
  id: string;
  name: string;
  type: ColType;
  notNull: boolean;
  pk: boolean;
  unique: boolean;
  fk: FkRef | null;
}
export interface TableDef {
  id: string;
  name: string;
  x: number;
  y: number;
  columns: Column[];
}
export interface IndexDef {
  id: string;
  tableId: string;
  columnIds: string[];
  unique: boolean;
}
export interface Model {
  tables: TableDef[];
  indexes: IndexDef[];
}

export class InputError extends Error {}

/* ───────────────────────── Outils ───────────────────────── */

let seq = 0;
/** Identifiant unique (nouvelles tables, colonnes, index créés dans l'éditeur). */
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const tableById = (m: Model, id: string) => m.tables.find((t) => t.id === id);
export const colById = (t: TableDef | undefined, id: string) => t?.columns.find((c) => c.id === id);

const INT_FAMILY = new Set<ColType>(['INTEGER', 'BIGINT']);
const TEXT_FAMILY = new Set<ColType>(['TEXT', 'VARCHAR']);
/** Deux types sont compatibles pour une clé étrangère s'ils sont de la même famille. */
export function sameFamily(a: ColType, b: ColType): boolean {
  if (a === b) return true;
  if (INT_FAMILY.has(a) && INT_FAMILY.has(b)) return true;
  if (TEXT_FAMILY.has(a) && TEXT_FAMILY.has(b)) return true;
  return false;
}

/** Nom en minuscules ASCII et tirets bas : « Date Inscription » → date_inscription, « prixUnitaire » → prix_unitaire. */
export function toSnake(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) return 'sans_nom';
  return /^[0-9]/.test(s) ? `c_${s}` : s;
}

/** Singulier approximatif d'un nom de table français : livres → livre, adherents → adherent. */
export function singular(name: string): string {
  const n = toSnake(name);
  if (n.endsWith('aux')) return `${n.slice(0, -3)}al`;
  if (n.endsWith('s') || n.endsWith('x')) return n.slice(0, -1);
  return n;
}

function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((n) => n.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}_${i}`.toLowerCase())) return `${base}_${i}`;
}
export const uniqueTableName = (m: Model, base: string) => uniqueName(base, m.tables.map((t) => t.name));
export const uniqueColumnName = (t: TableDef, base: string) => uniqueName(base, t.columns.map((c) => c.name));

/** Colonnes de la clé primaire, dans l'ordre de la table. */
export const pkColumns = (t: TableDef) => t.columns.filter((c) => c.pk);

/** Une colonne est « indexée » si un index, la clé primaire ou une contrainte d'unicité commence par elle. */
export function isIndexed(m: Model, t: TableDef, c: Column): boolean {
  if (c.unique) return true;
  const pk = pkColumns(t);
  if (pk.length > 0 && pk[0]!.id === c.id) return true;
  return m.indexes.some((ix) => ix.tableId === t.id && ix.columnIds[0] === c.id);
}

/* ───────────────────── Modèles de départ ───────────────────── */

interface TableSpec {
  name: string;
  x: number;
  y: number;
  /** « nom TYPE [pk] [nn] [uq] [fk:table.colonne] » */
  cols: string[];
}

/** Construit un modèle à partir d'une description compacte ; identifiants déterministes (t_<table>, c_<table>_<colonne>). */
export function buildModel(specs: TableSpec[], indexes: [string, string, boolean?][] = []): Model {
  const tables: TableDef[] = specs.map((s) => ({
    id: `t_${s.name}`,
    name: s.name,
    x: s.x,
    y: s.y,
    columns: s.cols.map((spec) => {
      const [name, type, ...flags] = spec.split(/\s+/);
      const pk = flags.includes('pk');
      return {
        id: `c_${s.name}_${name}`,
        name: name!,
        type: type as ColType,
        pk,
        notNull: pk || flags.includes('nn'),
        unique: flags.includes('uq'),
        fk: null,
      };
    }),
  }));
  specs.forEach((s, ti) => {
    s.cols.forEach((spec, ci) => {
      const fk = spec.split(/\s+/).find((f) => f.startsWith('fk:'));
      if (!fk) return;
      const [tName, cName] = fk.slice(3).split('.');
      tables[ti]!.columns[ci]!.fk = { tableId: `t_${tName}`, columnId: `c_${tName}_${cName}` };
    });
  });
  return {
    tables,
    indexes: indexes.map(([t, c, unique]) => ({ id: `ix_${t}_${c}`, tableId: `t_${t}`, columnIds: [`c_${t}_${c}`], unique: !!unique })),
  };
}

/** Le schéma du SQL Lab (Comptoir Lumen), tel qu'il est créé dans SQLite. */
export const comptoirModel = () =>
  buildModel(
    [
      { name: 'clients', x: 24, y: 24, cols: ['id INTEGER pk', 'prenom TEXT', 'nom TEXT', 'ville TEXT', 'region TEXT', 'date_inscription TEXT', 'segment TEXT'] },
      { name: 'commandes', x: 300, y: 24, cols: ['id INTEGER pk', 'client_id INTEGER fk:clients.id', 'date_commande TEXT', 'canal TEXT', 'statut TEXT'] },
      { name: 'lignes', x: 576, y: 24, cols: ['id INTEGER pk', 'commande_id INTEGER fk:commandes.id', 'produit_id INTEGER fk:produits.id', 'quantite INTEGER', 'remise REAL'] },
      { name: 'produits', x: 300, y: 228, cols: ['id INTEGER pk', 'nom TEXT', 'categorie TEXT', 'prix_unitaire REAL', 'cout_unitaire REAL'] },
    ],
    [
      ['lignes', 'commande_id'],
      ['commandes', 'client_id'],
    ],
  );

/** Une bibliothèque bien normalisée, avec une table d'association N–N (livres ↔ auteurs). */
export const bibliothequeModel = () =>
  buildModel(
    [
      { name: 'auteurs', x: 24, y: 24, cols: ['id INTEGER pk', 'nom VARCHAR nn', 'prenom VARCHAR', 'pays VARCHAR'] },
      { name: 'livres_auteurs', x: 300, y: 40, cols: ['livre_id INTEGER pk fk:livres.id', 'auteur_id INTEGER pk fk:auteurs.id'] },
      { name: 'livres', x: 576, y: 24, cols: ['id INTEGER pk', 'isbn VARCHAR nn uq', 'titre VARCHAR nn', 'annee INTEGER', 'editeur VARCHAR'] },
      { name: 'adherents', x: 300, y: 236, cols: ['id INTEGER pk', 'nom VARCHAR nn', 'prenom VARCHAR nn', 'email VARCHAR uq', 'date_adhesion DATE nn'] },
      { name: 'emprunts', x: 576, y: 236, cols: ['id INTEGER pk', 'livre_id INTEGER nn fk:livres.id', 'adherent_id INTEGER nn fk:adherents.id', 'date_emprunt DATE nn', 'date_retour DATE'] },
    ],
    [
      ['livres_auteurs', 'auteur_id'],
      ['emprunts', 'livre_id'],
      ['emprunts', 'adherent_id'],
    ],
  );

/** Un export de tableur « tout dans une ligne » : groupes répétés, client recopié dans chaque commande, total calculé. */
export const tableurModel = () =>
  buildModel([
    {
      name: 'ventes_export',
      x: 24,
      y: 24,
      cols: [
        'num_commande TEXT',
        'date_commande DATE',
        'client_nom TEXT',
        'client_ville TEXT',
        'client_email TEXT',
        'produit1 TEXT',
        'prix1 REAL',
        'quantite1 INTEGER',
        'produit2 TEXT',
        'prix2 REAL',
        'quantite2 INTEGER',
        'produit3 TEXT',
        'prix3 REAL',
        'quantite3 INTEGER',
        'total_commande REAL',
      ],
    },
  ]);

export type TemplateId = 'comptoir' | 'bibliotheque' | 'tableur';
export const TEMPLATES: { id: TemplateId; label: string; description: string; build: () => Model }[] = [
  { id: 'comptoir', label: 'Comptoir Lumen', description: 'Le schéma de la boutique du SQL Lab : clients, commandes, lignes, produits.', build: comptoirModel },
  { id: 'bibliotheque', label: 'Bibliothèque', description: 'Livres, auteurs (relation N–N), adhérents et emprunts : un modèle propre.', build: bibliothequeModel },
  { id: 'tableur', label: 'Tableur à normaliser', description: 'Un export Excel « une ligne par commande », à remettre en forme.', build: tableurModel },
];

/* ───────────────────── Normalisation pas à pas ───────────────────── */

export interface NormStep {
  form: '1FN' | '2FN' | '3FN';
  title: string;
  problem: string;
  action: string;
  build: () => Model;
}

const stage1 = () =>
  buildModel([
    { name: 'commandes', x: 24, y: 24, cols: ['num_commande TEXT pk', 'date_commande DATE nn', 'client_nom TEXT', 'client_ville TEXT', 'client_email TEXT', 'total_commande REAL'] },
    { name: 'lignes', x: 320, y: 24, cols: ['num_commande TEXT pk fk:commandes.num_commande', 'produit TEXT pk', 'prix_unitaire REAL', 'quantite INTEGER nn'] },
  ]);

const stage2 = () =>
  buildModel(
    [
      { name: 'commandes', x: 24, y: 24, cols: ['num_commande TEXT pk', 'date_commande DATE nn', 'client_nom TEXT', 'client_ville TEXT', 'client_email TEXT', 'total_commande REAL'] },
      { name: 'lignes', x: 320, y: 24, cols: ['num_commande TEXT pk fk:commandes.num_commande', 'produit_id INTEGER pk fk:produits.id', 'quantite INTEGER nn'] },
      { name: 'produits', x: 600, y: 24, cols: ['id INTEGER pk', 'nom TEXT nn uq', 'prix_unitaire NUMERIC nn'] },
    ],
    [['lignes', 'produit_id']],
  );

const stage3 = () =>
  buildModel(
    [
      { name: 'clients', x: 24, y: 220, cols: ['id INTEGER pk', 'nom TEXT nn', 'ville TEXT', 'email TEXT uq'] },
      { name: 'commandes', x: 24, y: 24, cols: ['num_commande TEXT pk', 'date_commande DATE nn', 'client_id INTEGER nn fk:clients.id'] },
      { name: 'lignes', x: 320, y: 24, cols: ['num_commande TEXT pk fk:commandes.num_commande', 'produit_id INTEGER pk fk:produits.id', 'quantite INTEGER nn'] },
      { name: 'produits', x: 600, y: 24, cols: ['id INTEGER pk', 'nom TEXT nn uq', 'prix_unitaire NUMERIC nn'] },
    ],
    [
      ['lignes', 'produit_id'],
      ['commandes', 'client_id'],
    ],
  );

export const NORM_STEPS: NormStep[] = [
  {
    form: '1FN',
    title: 'Une valeur par case',
    problem:
      'Les colonnes produit1, produit2, produit3 (et leurs prix et quantités) répètent le même groupe. Une commande de quatre articles ne rentre pas, et chercher « toutes les ventes du plaid » oblige à fouiller trois colonnes.',
    action:
      'On identifie la commande par num_commande, puis chaque article commandé devient une ligne de la table lignes, identifiée par (num_commande, produit).',
    build: stage1,
  },
  {
    form: '2FN',
    title: 'Dépendre de toute la clé',
    problem:
      'Dans lignes, la clé est (num_commande, produit). Or le prix unitaire ne dépend que du produit : il est recopié dans chaque commande, et un changement de prix doit être corrigé partout.',
    action: 'Le produit et son prix partent dans une table produits ; lignes ne garde que la quantité, qui dépend bien de la commande et du produit.',
    build: stage2,
  },
  {
    form: '3FN',
    title: 'Ne dépendre que de la clé',
    problem:
      'Dans commandes, client_nom, client_ville et client_email dépendent du client, pas de la commande : un déménagement oblige à modifier chaque commande passée. total_commande, lui, se recalcule à partir des lignes.',
    action: 'Les informations du client forment la table clients, reliée par client_id ; le total calculé est supprimé (une vue ou une requête le fournit).',
    build: stage3,
  },
];

/* ───────────────────── Diagnostic ───────────────────── */

export type Severity = 'error' | 'warning' | 'info';
export const SEVERITY_LABEL: Record<Severity, string> = { error: 'Bloquant', warning: 'À corriger', info: 'Conseil' };
const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export type Fix =
  | { kind: 'add-pk'; tableId: string }
  | { kind: 'add-index'; tableId: string; columnId: string }
  | { kind: 'set-type'; tableId: string; columnId: string; type: ColType }
  | { kind: 'set-unique'; tableId: string; columnId: string }
  | { kind: 'drop-fk'; tableId: string; columnId: string }
  | { kind: 'rename-table'; tableId: string; name: string }
  | { kind: 'rename-column'; tableId: string; columnId: string; name: string };

export type IssueCode =
  | 'dup-table'
  | 'empty-name'
  | 'empty-table'
  | 'dup-column'
  | 'no-pk'
  | 'fk-broken'
  | 'fk-type'
  | 'fk-target'
  | 'repeat-group'
  | 'transitive'
  | 'money-float'
  | 'fk-index'
  | 'date-text'
  | 'naming';

export interface Issue {
  key: string;
  code: IssueCode;
  severity: Severity;
  tableId: string;
  columnId?: string;
  /** Emplacement lisible, ex. « commandes.client_ville ». */
  where: string;
  title: string;
  why: string;
  fix?: Fix;
  fixLabel?: string;
  /** Normalisation : l'assistant pas à pas peut traiter le problème. */
  normalForm?: '1FN' | '2FN' | '3FN';
}

/** Préfixes qui désignent une autre entité : client_ville dans commandes est une donnée du client. */
const ENTITY_WORDS = new Set([
  'client', 'produit', 'fournisseur', 'auteur', 'adherent', 'employe', 'salarie', 'commande', 'livre', 'article',
  'vendeur', 'magasin', 'categorie', 'societe', 'entreprise', 'patient', 'medecin', 'eleve', 'etudiant', 'professeur', 'agence',
]);
const MONEY = /(^|_)(prix|montant|cout|total|tarif|salaire|solde|ca|price|amount|cost)(_|\d|$)/;
const DATEY = /(^|_)(date|jour|naissance)(_|$)/;

/** Repère les groupes répétés : nom + numéro (produit1, produit2, tel_1…). */
export function repeatedGroups(t: TableDef): { base: string; columns: string[] }[] {
  const groups = new Map<string, Set<string>>();
  const cols = new Map<string, string[]>();
  for (const c of t.columns) {
    const m = /^(.*?[a-z])_?(\d+)$/i.exec(c.name);
    if (!m) continue;
    const base = m[1]!.toLowerCase();
    if (base.length < 2) continue;
    if (!groups.has(base)) groups.set(base, new Set());
    groups.get(base)!.add(m[2]!);
    cols.set(base, [...(cols.get(base) ?? []), c.name]);
  }
  return [...groups.entries()].filter(([, nums]) => nums.size >= 2).map(([base]) => ({ base, columns: cols.get(base)! }));
}

export function diagnose(m: Model): Issue[] {
  const out: Issue[] = [];
  const push = (i: Omit<Issue, 'key'>) => out.push({ ...i, key: `${i.code}:${i.tableId}:${i.columnId ?? ''}:${i.where}` });
  const singulars = new Set(m.tables.map((t) => singular(t.name)));

  const seenTables = new Map<string, number>();
  for (const t of m.tables) seenTables.set(t.name.trim().toLowerCase(), (seenTables.get(t.name.trim().toLowerCase()) ?? 0) + 1);

  for (const t of m.tables) {
    const tn = t.name || '(sans nom)';
    if (!t.name.trim()) {
      push({ code: 'empty-name', severity: 'error', tableId: t.id, where: tn, title: 'Table sans nom', why: 'Une table doit avoir un nom pour être créée.' });
    } else if ((seenTables.get(t.name.trim().toLowerCase()) ?? 0) > 1) {
      push({ code: 'dup-table', severity: 'error', tableId: t.id, where: tn, title: 'Nom de table en double', why: 'Deux tables portent ce nom : la seconde création échouerait.', fix: { kind: 'rename-table', tableId: t.id, name: uniqueTableName({ ...m, tables: m.tables.filter((x) => x.id !== t.id) }, `${toSnake(t.name)}_2`) }, fixLabel: 'Renommer' });
    }
    if (t.columns.length === 0) {
      push({ code: 'empty-table', severity: 'error', tableId: t.id, where: tn, title: 'Table sans colonne', why: 'Une table vide ne peut pas être créée.', fix: { kind: 'add-pk', tableId: t.id }, fixLabel: 'Ajouter une clé id' });
      continue;
    }
    const seenCols = new Map<string, number>();
    for (const c of t.columns) seenCols.set(c.name.trim().toLowerCase(), (seenCols.get(c.name.trim().toLowerCase()) ?? 0) + 1);
    for (const c of t.columns) {
      if (!c.name.trim()) push({ code: 'empty-name', severity: 'error', tableId: t.id, columnId: c.id, where: `${tn}.?`, title: 'Colonne sans nom', why: 'Chaque colonne doit avoir un nom.' });
      else if ((seenCols.get(c.name.trim().toLowerCase()) ?? 0) > 1)
        push({ code: 'dup-column', severity: 'error', tableId: t.id, columnId: c.id, where: `${tn}.${c.name}`, title: 'Colonne en double', why: 'Deux colonnes de la table portent ce nom.', fix: { kind: 'rename-column', tableId: t.id, columnId: c.id, name: uniqueColumnName({ ...t, columns: t.columns.filter((x) => x.id !== c.id) }, `${toSnake(c.name)}_2`) }, fixLabel: 'Renommer' });
    }

    const pk = pkColumns(t);
    if (pk.length === 0) {
      const hasId = t.columns.some((c) => c.name.toLowerCase() === 'id');
      push({
        code: 'no-pk',
        severity: 'error',
        tableId: t.id,
        where: tn,
        title: 'Pas de clé primaire',
        why: 'Sans clé primaire, rien n’empêche deux lignes identiques, et aucune autre table ne peut pointer de façon sûre vers une ligne précise.',
        fix: { kind: 'add-pk', tableId: t.id },
        fixLabel: hasId ? 'Faire de id la clé primaire' : 'Ajouter une colonne id (clé primaire)',
      });
    }

    for (const c of t.columns) {
      const where = `${tn}.${c.name}`;
      if (c.fk) {
        const target = tableById(m, c.fk.tableId);
        const tcol = colById(target, c.fk.columnId);
        if (!target || !tcol) {
          push({ code: 'fk-broken', severity: 'error', tableId: t.id, columnId: c.id, where, title: 'Clé étrangère sans cible', why: 'La table ou la colonne référencée n’existe plus : la contrainte ne peut pas être créée.', fix: { kind: 'drop-fk', tableId: t.id, columnId: c.id }, fixLabel: 'Retirer la référence' });
        } else {
          if (!sameFamily(c.type, tcol.type)) {
            push({ code: 'fk-type', severity: 'error', tableId: t.id, columnId: c.id, where, title: `Type différent de ${target.name}.${tcol.name}`, why: `La clé étrangère est en ${c.type} et la colonne visée en ${tcol.type} : les jointures convertissent chaque valeur, et PostgreSQL refuse la contrainte.`, fix: { kind: 'set-type', tableId: t.id, columnId: c.id, type: tcol.type }, fixLabel: `Passer en ${tcol.type}` });
          }
          const targetPk = pkColumns(target);
          const targetUnique = tcol.unique || (targetPk.length === 1 && targetPk[0]!.id === tcol.id);
          if (!targetUnique) {
            push({ code: 'fk-target', severity: 'warning', tableId: t.id, columnId: c.id, where, title: `${target.name}.${tcol.name} n’est pas unique`, why: 'Une clé étrangère doit viser une colonne unique (la clé primaire, en général), sinon une même valeur désigne plusieurs lignes. SQLite rejette alors chaque insertion (« foreign key mismatch »).', fix: { kind: 'set-unique', tableId: target.id, columnId: tcol.id }, fixLabel: `Rendre ${tcol.name} unique` });
          }
          if (!isIndexed(m, t, c)) {
            push({ code: 'fk-index', severity: 'info', tableId: t.id, columnId: c.id, where, title: 'Clé étrangère sans index', why: `Les jointures avec ${target.name} et les suppressions côté ${target.name} parcourent toute la table ${tn}. PostgreSQL et SQLite ne créent pas cet index tout seuls.`, fix: { kind: 'add-index', tableId: t.id, columnId: c.id }, fixLabel: 'Créer l’index' });
          }
        }
      }
      const snake = toSnake(c.name);
      if ((c.type === 'REAL') && MONEY.test(snake)) {
        push({ code: 'money-float', severity: 'warning', tableId: t.id, columnId: c.id, where, title: 'Montant en nombre flottant', why: 'Un flottant ne représente pas exactement 0,10 € : les sommes dérivent de quelques centimes. Un décimal exact (NUMERIC / DECIMAL) évite les écarts de rapprochement.', fix: { kind: 'set-type', tableId: t.id, columnId: c.id, type: 'NUMERIC' }, fixLabel: 'Passer en NUMERIC' });
      }
      if ((c.type === 'TEXT' || c.type === 'VARCHAR') && DATEY.test(snake)) {
        push({ code: 'date-text', severity: 'info', tableId: t.id, columnId: c.id, where, title: 'Date stockée en texte', why: 'En texte, rien n’empêche « 31/02/2025 » et les comparaisons dépendent du format. Un type DATE valide la valeur (SQLite garde du texte ISO, c’est son usage).', fix: { kind: 'set-type', tableId: t.id, columnId: c.id, type: 'DATE' }, fixLabel: 'Passer en DATE' });
      }
      if (c.name.trim() && !/^[a-z][a-z0-9_]*$/.test(c.name)) {
        push({ code: 'naming', severity: 'info', tableId: t.id, columnId: c.id, where, title: 'Nom à harmoniser', why: 'Majuscules, accents ou espaces obligent à entourer le nom de guillemets dans chaque requête, et la casse se comporte différemment selon le moteur.', fix: { kind: 'rename-column', tableId: t.id, columnId: c.id, name: uniqueColumnName({ ...t, columns: t.columns.filter((x) => x.id !== c.id) }, snake) }, fixLabel: `Renommer en ${snake}` });
      }
    }

    if (t.name.trim() && !/^[a-z][a-z0-9_]*$/.test(t.name)) {
      const snake = toSnake(t.name);
      push({ code: 'naming', severity: 'info', tableId: t.id, where: tn, title: 'Nom de table à harmoniser', why: 'Un nom en minuscules sans accent ni espace s’écrit pareil dans tous les moteurs et sans guillemets.', fix: { kind: 'rename-table', tableId: t.id, name: uniqueTableName({ ...m, tables: m.tables.filter((x) => x.id !== t.id) }, snake) }, fixLabel: `Renommer en ${snake}` });
    }

    for (const g of repeatedGroups(t)) {
      push({ code: 'repeat-group', severity: 'warning', tableId: t.id, where: `${tn} : ${g.columns.join(', ')}`, title: `Groupe répété « ${g.base} »`, why: `Les colonnes ${g.columns.join(', ')} répètent la même information : c’est une violation de la première forme normale. Le nombre d’occurrences est figé et chaque recherche doit lire toutes les colonnes. Il faut une table à part, une ligne par occurrence.`, normalForm: '1FN' });
    }

    const own = singular(t.name);
    const byPrefix = new Map<string, string[]>();
    for (const c of t.columns) {
      if (c.pk || c.fk) continue;
      const snake = toSnake(c.name);
      const i = snake.indexOf('_');
      if (i <= 0) continue;
      const prefix = snake.slice(0, i);
      const rest = snake.slice(i + 1);
      if (!rest || rest === 'id' || prefix === own) continue;
      if (!(singulars.has(prefix) || ENTITY_WORDS.has(prefix))) continue;
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), c.name]);
    }
    for (const [prefix, names] of byPrefix) {
      const target = m.tables.find((x) => singular(x.name) === prefix && x.id !== t.id);
      push({
        code: 'transitive',
        severity: 'warning',
        tableId: t.id,
        where: `${tn} : ${names.join(', ')}`,
        title: `Données du ${prefix} recopiées dans ${tn}`,
        why: `${names.join(', ')} décrivent le ${prefix}, pas la ligne de ${tn} : elles dépendent de la clé à travers le ${prefix} (violation de la troisième forme normale). ${
          target ? `Gardez-les dans ${target.name} et reliez par une clé étrangère.` : `Créez une table pour le ${prefix} et reliez-la par une clé étrangère.`
        }`,
        normalForm: '3FN',
      });
    }
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || m.tables.findIndex((t) => t.id === a.tableId) - m.tables.findIndex((t) => t.id === b.tableId));
}

export function issueCounts(issues: Issue[]): Record<Severity, number> {
  const r: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of issues) r[i.severity]++;
  return r;
}

/* ───────────────────── Modifications ───────────────────── */

export const mapTable = (m: Model, tableId: string, f: (t: TableDef) => TableDef): Model => ({ ...m, tables: m.tables.map((t) => (t.id === tableId ? f(t) : t)) });
export const mapColumn = (m: Model, tableId: string, columnId: string, f: (c: Column) => Column): Model =>
  mapTable(m, tableId, (t) => ({ ...t, columns: t.columns.map((c) => (c.id === columnId ? f(c) : c)) }));

export function applyFix(m: Model, fix: Fix): Model {
  switch (fix.kind) {
    case 'add-pk':
      return mapTable(m, fix.tableId, (t) => {
        const id = t.columns.find((c) => c.name.toLowerCase() === 'id');
        if (id) return { ...t, columns: t.columns.map((c) => (c.id === id.id ? { ...c, pk: true, notNull: true } : c)) };
        return { ...t, columns: [{ id: newId('c'), name: 'id', type: 'INTEGER', pk: true, notNull: true, unique: false, fk: null }, ...t.columns] };
      });
    case 'add-index':
      if (m.indexes.some((ix) => ix.tableId === fix.tableId && ix.columnIds[0] === fix.columnId)) return m;
      return { ...m, indexes: [...m.indexes, { id: newId('ix'), tableId: fix.tableId, columnIds: [fix.columnId], unique: false }] };
    case 'set-type':
      return mapColumn(m, fix.tableId, fix.columnId, (c) => ({ ...c, type: fix.type }));
    case 'set-unique':
      return mapColumn(m, fix.tableId, fix.columnId, (c) => ({ ...c, unique: true }));
    case 'drop-fk':
      return mapColumn(m, fix.tableId, fix.columnId, (c) => ({ ...c, fk: null }));
    case 'rename-table':
      return mapTable(m, fix.tableId, (t) => ({ ...t, name: fix.name }));
    case 'rename-column':
      return mapColumn(m, fix.tableId, fix.columnId, (c) => ({ ...c, name: fix.name }));
  }
}

/** Applique toutes les corrections automatiques, jusqu'à ce qu'il n'en reste plus. */
export function applyAllFixes(m: Model): Model {
  let cur = m;
  for (let guard = 0; guard < 200; guard++) {
    const next = diagnose(cur).find((i) => i.fix);
    if (!next) break;
    const after = applyFix(cur, next.fix!);
    if (after === cur) break;
    cur = after;
  }
  return cur;
}

/** Supprime une table ; les clés étrangères qui la visaient restent, signalées comme cassées. */
export function removeTable(m: Model, tableId: string): Model {
  return { tables: m.tables.filter((t) => t.id !== tableId), indexes: m.indexes.filter((ix) => ix.tableId !== tableId) };
}
export function removeColumn(m: Model, tableId: string, columnId: string): Model {
  const next = mapTable(m, tableId, (t) => ({ ...t, columns: t.columns.filter((c) => c.id !== columnId) }));
  return {
    ...next,
    indexes: next.indexes
      .map((ix) => (ix.tableId === tableId ? { ...ix, columnIds: ix.columnIds.filter((id) => id !== columnId) } : ix))
      .filter((ix) => ix.columnIds.length > 0),
  };
}

/** Ajoute une table (clé id) à droite du modèle. */
export function addTable(m: Model): { model: Model; tableId: string } {
  const id = newId('t');
  const right = m.tables.reduce((r, t) => Math.max(r, t.x + BOX_W), 0);
  const table: TableDef = {
    id,
    name: uniqueTableName(m, 'nouvelle_table'),
    x: m.tables.length ? right + 56 : 24,
    y: 24,
    columns: [{ id: newId('c'), name: 'id', type: 'INTEGER', pk: true, notNull: true, unique: false, fk: null }],
  };
  return { model: { ...m, tables: [...m.tables, table] }, tableId: id };
}

/* ───────────────────── Géométrie du diagramme ───────────────────── */

export const BOX_W = 232;
export const HEAD_H = 32;
export const ROW_H = 22;
export const boxHeight = (t: TableDef) => HEAD_H + Math.max(1, t.columns.length) * ROW_H + 8;
export const rowCenterY = (t: TableDef, colIndex: number) => t.y + HEAD_H + colIndex * ROW_H + ROW_H / 2 + 2;

export function canvasSize(m: Model): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const t of m.tables) {
    w = Math.max(w, t.x + BOX_W);
    h = Math.max(h, t.y + boxHeight(t));
  }
  return { w: w + 80, h: h + 48 };
}

/* ───────────────────── Génération du SQL ───────────────────── */

export type Dialect = 'postgresql' | 'sqlite' | 'mysql';
export const DIALECTS: { id: Dialect; label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'mysql', label: 'MySQL' },
];

const TYPE_MAP: Record<Dialect, Record<ColType, string>> = {
  postgresql: { INTEGER: 'INTEGER', BIGINT: 'BIGINT', NUMERIC: 'NUMERIC(12, 2)', REAL: 'DOUBLE PRECISION', TEXT: 'TEXT', VARCHAR: 'VARCHAR(255)', BOOLEAN: 'BOOLEAN', DATE: 'DATE', TIMESTAMP: 'TIMESTAMP' },
  sqlite: { INTEGER: 'INTEGER', BIGINT: 'INTEGER', NUMERIC: 'NUMERIC', REAL: 'REAL', TEXT: 'TEXT', VARCHAR: 'TEXT', BOOLEAN: 'INTEGER', DATE: 'TEXT', TIMESTAMP: 'TEXT' },
  mysql: { INTEGER: 'INT', BIGINT: 'BIGINT', NUMERIC: 'DECIMAL(12, 2)', REAL: 'DOUBLE', TEXT: 'TEXT', VARCHAR: 'VARCHAR(255)', BOOLEAN: 'BOOLEAN', DATE: 'DATE', TIMESTAMP: 'DATETIME' },
};

const RESERVED = new Set(['user', 'order', 'group', 'table', 'select', 'from', 'where', 'index', 'key', 'references', 'check', 'default', 'limit', 'column', 'primary', 'foreign', 'unique', 'constraint', 'to', 'desc', 'asc', 'by', 'and', 'or', 'not', 'null', 'in', 'is', 'as', 'on']);

export function quoteIdent(name: string, d: Dialect): string {
  if (/^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED.has(name)) return name;
  if (d === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

/** Ordre de création : une table après celles qu'elle référence (tri topologique, cycles signalés). */
export function topoOrder(m: Model): { order: TableDef[]; cyclic: Set<string> } {
  const deps = new Map<string, Set<string>>();
  for (const t of m.tables) {
    const s = new Set<string>();
    for (const c of t.columns) if (c.fk && c.fk.tableId !== t.id && tableById(m, c.fk.tableId)) s.add(c.fk.tableId);
    deps.set(t.id, s);
  }
  const order: TableDef[] = [];
  const done = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of m.tables) {
      if (done.has(t.id)) continue;
      if ([...deps.get(t.id)!].every((d) => done.has(d))) {
        order.push(t);
        done.add(t.id);
        progress = true;
      }
    }
  }
  const cyclic = new Set(m.tables.filter((t) => !done.has(t.id)).map((t) => t.id));
  for (const t of m.tables) if (cyclic.has(t.id)) order.push(t);
  return { order, cyclic };
}

function indexName(m: Model, ix: IndexDef, taken: Set<string>): string {
  const t = tableById(m, ix.tableId);
  const cols = ix.columnIds.map((id) => colById(t, id)?.name ?? 'col');
  const base = toSnake(`${ix.unique ? 'ux' : 'ix'}_${t?.name ?? 'table'}_${cols.join('_')}`);
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
  taken.add(name);
  return name;
}

export function generateDDL(m: Model, d: Dialect, title = 'Modèle'): string {
  const q = (n: string) => quoteIdent(n, d);
  const label = DIALECTS.find((x) => x.id === d)!.label;
  const out: string[] = [`-- ${title} : schéma généré pour ${label}`, `-- ${m.tables.length} table${m.tables.length > 1 ? 's' : ''}, ${m.indexes.length} index`, ''];
  if (d === 'sqlite') out.push('PRAGMA foreign_keys = ON;', '');
  const { order, cyclic } = topoOrder(m);
  if (cyclic.size) out.push('-- Attention : références circulaires entre tables ; certains moteurs exigent de créer ces contraintes après coup (ALTER TABLE).', '');

  // MySQL n'indexe pas un TEXT sans longueur : clés, colonnes uniques, référencées ou indexées passent en VARCHAR(255).
  const keyed = new Set<string>();
  for (const t of m.tables) for (const c of t.columns) if (c.pk || c.unique || c.fk) keyed.add(c.id);
  for (const t of m.tables) for (const c of t.columns) if (c.fk) keyed.add(c.fk.columnId);
  for (const ix of m.indexes) for (const id of ix.columnIds) keyed.add(id);
  const sqlType = (c: Column) => (d === 'mysql' && c.type === 'TEXT' && keyed.has(c.id) ? 'VARCHAR(255)' : TYPE_MAP[d][c.type]);

  for (const t of order) {
    if (t.columns.length === 0) {
      out.push(`-- Table ${t.name} ignorée : elle n'a aucune colonne.`, '');
      continue;
    }
    const pk = pkColumns(t);
    const single = pk.length === 1 ? pk[0]! : null;
    const lines: string[] = [];
    const notes: string[] = [];
    for (const c of t.columns) {
      const type = sqlType(c);
      const auto = single === c && INT_FAMILY.has(c.type) && !c.fk;
      let line = `  ${q(c.name)} ${type}`;
      if (single === c) {
        if (auto && d === 'postgresql') line += ' GENERATED BY DEFAULT AS IDENTITY';
        if (auto && d === 'mysql') line += ' AUTO_INCREMENT';
        // SQLite accepte NULL dans une clé primaire qui n'est pas un INTEGER : on l'interdit explicitement.
        if (d === 'sqlite' && !INT_FAMILY.has(c.type)) line += ' NOT NULL';
        line += ' PRIMARY KEY';
      } else {
        if (c.notNull || c.pk) line += ' NOT NULL';
        if (c.unique) line += ' UNIQUE';
      }
      lines.push(line);
    }
    if (pk.length > 1) lines.push(`  PRIMARY KEY (${pk.map((c) => q(c.name)).join(', ')})`);
    for (const c of t.columns) {
      if (!c.fk) continue;
      const target = tableById(m, c.fk.tableId);
      const tcol = colById(target, c.fk.columnId);
      if (!target || !tcol) {
        notes.push(`-- ${t.name}.${c.name} : référence vers une table ou colonne absente, contrainte omise.`);
        continue;
      }
      lines.push(`  CONSTRAINT ${q(toSnake(`fk_${t.name}_${c.name}`))} FOREIGN KEY (${q(c.name)}) REFERENCES ${q(target.name)} (${q(tcol.name)})`);
    }
    out.push(...notes);
    out.push(`CREATE TABLE ${q(t.name)} (`, lines.join(',\n'), d === 'mysql' ? ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;' : ');', '');
  }

  const taken = new Set<string>();
  const ixLines: string[] = [];
  for (const ix of m.indexes) {
    const t = tableById(m, ix.tableId);
    const cols = ix.columnIds.map((id) => colById(t, id)).filter((c): c is Column => !!c);
    if (!t || cols.length === 0) continue;
    ixLines.push(`CREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX ${q(indexName(m, ix, taken))} ON ${q(t.name)} (${cols.map((c) => q(c.name)).join(', ')});`);
  }
  if (ixLines.length) out.push(...ixLines, '');
  return out.join('\n').replace(/\n+$/, '\n');
}

/* ───────────────────── Jeu d'essai ───────────────────── */

export interface SampleStep {
  label: string;
  sql: string;
  /** « ok » : doit passer ; « reject » : doit être refusée (intégrité référentielle). */
  expect: 'ok' | 'reject';
  tableId: string;
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Valeur déterministe de la colonne pour la ligne i ; une clé étrangère reprend la valeur de la ligne i de la table visée. */
export function sampleValue(m: Model, t: TableDef, c: Column, i: number, depth = 0): string {
  if (c.fk && depth < 6) {
    const target = tableById(m, c.fk.tableId);
    const tcol = colById(target, c.fk.columnId);
    if (target && tcol) return sampleValue(m, target, tcol, i, depth + 1);
  }
  switch (c.type) {
    case 'INTEGER':
    case 'BIGINT':
      return String(i);
    case 'NUMERIC':
    case 'REAL':
      return (i * 12.5).toFixed(2);
    case 'BOOLEAN':
      return String(i % 2);
    case 'DATE':
      return sqlStr(`2025-01-${String(i).padStart(2, '0')}`);
    case 'TIMESTAMP':
      return sqlStr(`2025-01-${String(i).padStart(2, '0')} 10:00:00`);
    default:
      return sqlStr(`${c.name} ${i}`);
  }
}

export const SAMPLE_ROWS = 3;
export const ORPHAN_INT = 9999;

/** Trois lignes par table (dans l'ordre de création), puis une insertion orpheline qui doit être rejetée. */
export function sampleSteps(m: Model): SampleStep[] {
  const steps: SampleStep[] = [];
  const { order } = topoOrder(m);
  const q = (n: string) => quoteIdent(n, 'sqlite');
  for (const t of order) {
    if (t.columns.length === 0) continue;
    const rows: string[] = [];
    for (let i = 1; i <= SAMPLE_ROWS; i++) rows.push(`(${t.columns.map((c) => sampleValue(m, t, c, i)).join(', ')})`);
    steps.push({
      label: `${t.name} : ${SAMPLE_ROWS} lignes`,
      sql: `INSERT INTO ${q(t.name)} (${t.columns.map((c) => q(c.name)).join(', ')}) VALUES\n  ${rows.join(',\n  ')};`,
      expect: 'ok',
      tableId: t.id,
    });
  }
  for (const t of order) {
    const fkCol = t.columns.find((c) => c.fk && colById(tableById(m, c.fk.tableId), c.fk.columnId));
    if (!fkCol) continue;
    const target = tableById(m, fkCol.fk!.tableId)!;
    const i = SAMPLE_ROWS + 1;
    const orphan = INT_FAMILY.has(fkCol.type) ? String(ORPHAN_INT) : sqlStr('inexistant');
    const values = t.columns.map((c) => (c.id === fkCol.id ? orphan : sampleValue(m, t, c, i)));
    steps.push({
      label: `${t.name}.${fkCol.name} = ${orphan.replace(/'/g, '')}, absent de ${target.name}`,
      sql: `INSERT INTO ${q(t.name)} (${t.columns.map((c) => q(c.name)).join(', ')}) VALUES (${values.join(', ')});`,
      expect: 'reject',
      tableId: t.id,
    });
    break;
  }
  return steps;
}

/* ───────────────────── Import / export ───────────────────── */

export interface SavedModel {
  format: 'atelier-modelisation';
  version: 1;
  model: Model;
}

export const exportModel = (m: Model): string => JSON.stringify({ format: 'atelier-modelisation', version: 1, model: m } satisfies SavedModel, null, 2);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Relit un modèle exporté ; contrôle la forme et normalise les champs. Lève une InputError lisible sinon. */
export function parseModel(text: string): Model {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InputError('Ce fichier n’est pas un JSON valide.');
  }
  const body = isObj(raw) && isObj(raw.model) ? raw.model : raw;
  if (!isObj(body) || !Array.isArray(body.tables)) throw new InputError('Aucune liste de tables trouvée : ce fichier ne vient pas de cet outil.');
  if (body.tables.length > 60) throw new InputError('Trop de tables (60 au maximum).');
  const types = new Set(COL_TYPES.map((t) => t.value));
  const tables: TableDef[] = body.tables.map((t: unknown, ti: number) => {
    if (!isObj(t) || !Array.isArray(t.columns)) throw new InputError(`Table n° ${ti + 1} : colonnes manquantes.`);
    return {
      id: typeof t.id === 'string' && t.id ? t.id : newId('t'),
      name: typeof t.name === 'string' ? t.name.slice(0, 64) : `table_${ti + 1}`,
      x: Number.isFinite(t.x) ? Math.max(0, Math.min(4000, Number(t.x))) : 24 + ti * 260,
      y: Number.isFinite(t.y) ? Math.max(0, Math.min(4000, Number(t.y))) : 24,
      columns: (t.columns as unknown[]).slice(0, 80).map((c, ci) => {
        if (!isObj(c)) throw new InputError(`Table n° ${ti + 1}, colonne n° ${ci + 1} : format inattendu.`);
        const fk = isObj(c.fk) && typeof c.fk.tableId === 'string' && typeof c.fk.columnId === 'string' ? { tableId: c.fk.tableId, columnId: c.fk.columnId } : null;
        const pk = c.pk === true;
        return {
          id: typeof c.id === 'string' && c.id ? c.id : newId('c'),
          name: typeof c.name === 'string' ? c.name.slice(0, 64) : `colonne_${ci + 1}`,
          type: types.has(c.type as ColType) ? (c.type as ColType) : 'TEXT',
          pk,
          notNull: pk || c.notNull === true,
          unique: c.unique === true,
          fk,
        };
      }),
    };
  });
  const tIds = new Set(tables.map((t) => t.id));
  const indexes: IndexDef[] = Array.isArray(body.indexes)
    ? (body.indexes as unknown[])
        .filter((ix): ix is Record<string, unknown> => isObj(ix) && typeof ix.tableId === 'string' && tIds.has(ix.tableId) && Array.isArray(ix.columnIds))
        .map((ix) => ({ id: typeof ix.id === 'string' ? ix.id : newId('ix'), tableId: ix.tableId as string, columnIds: (ix.columnIds as unknown[]).filter((x): x is string => typeof x === 'string'), unique: ix.unique === true }))
        .filter((ix) => ix.columnIds.length > 0)
    : [];
  return { tables, indexes };
}
