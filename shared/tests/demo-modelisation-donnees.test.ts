import { describe, expect, it } from 'vitest';
import {
  addTable,
  applyAllFixes,
  applyFix,
  bibliothequeModel,
  buildModel,
  comptoirModel,
  diagnose,
  exportModel,
  generateDDL,
  InputError,
  issueCounts,
  NORM_STEPS,
  parseModel,
  quoteIdent,
  removeColumn,
  removeTable,
  repeatedGroups,
  sampleSteps,
  singular,
  tableurModel,
  toSnake,
  topoOrder,
  type Model,
} from '../../client/src/demos/modelisation-donnees/model';

const codes = (m: Model) => diagnose(m).map((i) => i.code);
const names = (m: Model, order = topoOrder(m).order) => order.map((t) => t.name);

describe('noms', () => {
  it('met en minuscules ASCII avec tirets bas', () => {
    expect(toSnake('Date Inscription')).toBe('date_inscription');
    expect(toSnake('prixUnitaire')).toBe('prix_unitaire');
    expect(toSnake('Prénom')).toBe('prenom');
    expect(toSnake('  N° commande ')).toBe('n_commande');
    expect(toSnake('2024')).toBe('c_2024');
  });
  it('trouve le singulier des tables', () => {
    expect(singular('livres')).toBe('livre');
    expect(singular('adherents')).toBe('adherent');
    expect(singular('journaux')).toBe('journal');
  });
  it('cite les identifiants réservés ou atypiques selon le dialecte', () => {
    expect(quoteIdent('clients', 'postgresql')).toBe('clients');
    expect(quoteIdent('order', 'postgresql')).toBe('"order"');
    expect(quoteIdent('Prix TTC', 'mysql')).toBe('`Prix TTC`');
  });
});

describe('diagnostic', () => {
  it('Comptoir Lumen : montants flottants, dates en texte, un index manquant, aucun bloquant', () => {
    const issues = diagnose(comptoirModel());
    expect(issueCounts(issues)).toEqual({ error: 0, warning: 2, info: 3 });
    expect(issues.filter((i) => i.code === 'money-float').map((i) => i.where)).toEqual(['produits.prix_unitaire', 'produits.cout_unitaire']);
    expect(issues.find((i) => i.code === 'fk-index')?.where).toBe('lignes.produit_id');
  });
  it('la bibliothèque est propre', () => {
    expect(diagnose(bibliothequeModel())).toEqual([]);
  });
  it('le tableur cumule clé absente, groupes répétés (1FN) et dépendance transitive (3FN)', () => {
    const m = tableurModel();
    const issues = diagnose(m);
    expect(issues[0]!.code).toBe('no-pk');
    expect(repeatedGroups(m.tables[0]!).map((g) => g.base)).toEqual(['produit', 'prix', 'quantite']);
    expect(issues.filter((i) => i.normalForm === '1FN')).toHaveLength(3);
    const tr = issues.find((i) => i.code === 'transitive')!;
    expect(tr.normalForm).toBe('3FN');
    expect(tr.where).toContain('client_ville');
  });
  it('ne confond pas date_emprunt / date_retour avec une autre entité', () => {
    expect(codes(bibliothequeModel())).not.toContain('transitive');
  });
  it('signale une clé étrangère cassée, de type différent ou vers une colonne non unique', () => {
    const m = buildModel([
      { name: 'a', x: 0, y: 0, cols: ['id INTEGER pk', 'code TEXT'] },
      { name: 'b', x: 0, y: 0, cols: ['id INTEGER pk', 'a_id TEXT fk:a.id', 'a_code TEXT fk:a.code'] },
    ]);
    const c = codes(m);
    expect(c).toContain('fk-type');
    expect(c).toContain('fk-target');
    const broken = removeTable(m, 't_a');
    expect(codes(broken).filter((x) => x === 'fk-broken')).toHaveLength(2);
    expect(generateDDL(broken, 'postgresql')).toContain('contrainte omise');
  });
  it('les doublons de noms sont bloquants', () => {
    const m = buildModel([
      { name: 'x', x: 0, y: 0, cols: ['id INTEGER pk', 'v TEXT', 'v TEXT'] },
      { name: 'x', x: 0, y: 0, cols: ['id INTEGER pk'] },
    ]);
    const c = codes(m);
    expect(c).toContain('dup-table');
    expect(c).toContain('dup-column');
  });
});

describe('corrections', () => {
  it('« Tout corriger » rend Comptoir Lumen sans alerte', () => {
    expect(diagnose(applyAllFixes(comptoirModel()))).toEqual([]);
  });
  it('ajoute une clé id, ou promeut une colonne id existante', () => {
    const fixed = applyFix(tableurModel(), { kind: 'add-pk', tableId: 't_ventes_export' });
    expect(fixed.tables[0]!.columns[0]).toMatchObject({ name: 'id', pk: true, notNull: true });
    const m = buildModel([{ name: 't', x: 0, y: 0, cols: ['id INTEGER', 'v TEXT'] }]);
    const p = applyFix(m, { kind: 'add-pk', tableId: 't_t' });
    expect(p.tables[0]!.columns).toHaveLength(2);
    expect(p.tables[0]!.columns[0]!.pk).toBe(true);
  });
  it('le tableur corrigé automatiquement garde ses problèmes de forme normale', () => {
    const issues = diagnose(applyAllFixes(tableurModel()));
    expect(issues.every((i) => i.normalForm)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });
  it('supprimer une colonne retire aussi ses index', () => {
    const m = removeColumn(comptoirModel(), 't_lignes', 'c_lignes_commande_id');
    expect(m.indexes.some((ix) => ix.tableId === 't_lignes')).toBe(false);
  });
  it('ajoute une table à droite, avec un nom libre', () => {
    const { model, tableId } = addTable(comptoirModel());
    const t = model.tables.find((x) => x.id === tableId)!;
    expect(t.name).toBe('nouvelle_table');
    expect(t.x).toBeGreaterThan(576);
    expect(addTable(model).model.tables.at(-1)!.name).toBe('nouvelle_table_2');
  });
});

describe('normalisation', () => {
  it('trois étapes : 1FN, 2FN, 3FN', () => {
    expect(NORM_STEPS.map((s) => s.form)).toEqual(['1FN', '2FN', '3FN']);
  });
  it('l’étape 1 supprime les groupes répétés ; la 3FN supprime la dépendance transitive', () => {
    const s1 = diagnose(NORM_STEPS[0]!.build());
    expect(s1.some((i) => i.code === 'repeat-group')).toBe(false);
    expect(s1.some((i) => i.code === 'transitive')).toBe(true);
    expect(diagnose(NORM_STEPS[2]!.build())).toEqual([]);
  });
  it('le modèle final sépare clients, commandes, lignes et produits', () => {
    expect(names(NORM_STEPS[2]!.build()).sort()).toEqual(['clients', 'commandes', 'lignes', 'produits']);
  });
});

describe('SQL', () => {
  it('crée les tables après celles qu’elles référencent', () => {
    expect(names(comptoirModel())).toEqual(['clients', 'commandes', 'produits', 'lignes']);
    const pg = generateDDL(comptoirModel(), 'postgresql');
    expect(pg.indexOf('CREATE TABLE clients')).toBeLessThan(pg.indexOf('CREATE TABLE commandes'));
    expect(pg.indexOf('CREATE TABLE produits')).toBeLessThan(pg.indexOf('CREATE TABLE lignes'));
  });
  it('adapte types, auto-incrément et options au dialecte', () => {
    const m = comptoirModel();
    const pg = generateDDL(m, 'postgresql');
    const lite = generateDDL(m, 'sqlite');
    const my = generateDDL(m, 'mysql');
    expect(pg).toContain('id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY');
    expect(pg).toContain('prix_unitaire DOUBLE PRECISION');
    expect(lite.startsWith('-- ')).toBe(true);
    expect(lite).toContain('PRAGMA foreign_keys = ON;');
    expect(lite).toContain('id INTEGER PRIMARY KEY');
    expect(my).toContain('id INT AUTO_INCREMENT PRIMARY KEY');
    expect(my).toContain('ENGINE=InnoDB');
    expect(pg).toContain('CREATE INDEX ix_lignes_commande_id ON lignes (commande_id);');
  });
  it('clé primaire composite, et TEXT indexé converti en VARCHAR pour MySQL', () => {
    const final = NORM_STEPS[2]!.build();
    const my = generateDDL(final, 'mysql');
    expect(my).toContain('PRIMARY KEY (num_commande, produit_id)');
    expect(my).toContain('num_commande VARCHAR(255) PRIMARY KEY');
    expect(my).not.toMatch(/num_commande TEXT/);
    expect(generateDDL(final, 'sqlite')).toContain('num_commande TEXT NOT NULL PRIMARY KEY');
  });
  it('signale les références circulaires', () => {
    const m = buildModel([
      { name: 'a', x: 0, y: 0, cols: ['id INTEGER pk', 'b_id INTEGER fk:b.id'] },
      { name: 'b', x: 0, y: 0, cols: ['id INTEGER pk', 'a_id INTEGER fk:a.id'] },
    ]);
    expect(topoOrder(m).cyclic.size).toBe(2);
    expect(generateDDL(m, 'postgresql')).toContain('références circulaires');
  });
});

describe('jeu d’essai', () => {
  it('trois lignes par table puis une insertion orpheline à rejeter', () => {
    const steps = sampleSteps(comptoirModel());
    expect(steps.filter((s) => s.expect === 'ok')).toHaveLength(4);
    const orphan = steps.at(-1)!;
    expect(orphan.expect).toBe('reject');
    expect(orphan.sql).toContain('9999');
  });
  it('une clé étrangère reprend la valeur de la ligne visée', () => {
    const steps = sampleSteps(NORM_STEPS[0]!.build());
    const lignes = steps.find((s) => s.label.startsWith('lignes'))!;
    expect(lignes.sql).toContain("'num_commande 1'");
  });
});

describe('import / export', () => {
  it('relit exactement un modèle exporté', () => {
    const m = bibliothequeModel();
    expect(parseModel(exportModel(m))).toEqual(m);
  });
  it('refuse un fichier qui n’est pas un modèle', () => {
    expect(() => parseModel('pas du json')).toThrow(InputError);
    expect(() => parseModel('{"foo": 1}')).toThrow(/tables/);
  });
  it('corrige les champs invalides', () => {
    const m = parseModel(JSON.stringify({ tables: [{ name: 't', columns: [{ name: 'a', type: 'BLOB', pk: true }] }] }));
    expect(m.tables[0]!.columns[0]).toMatchObject({ type: 'TEXT', pk: true, notNull: true, fk: null });
    expect(m.indexes).toEqual([]);
  });
});
