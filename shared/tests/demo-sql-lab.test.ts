import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { generateComptoir, montantLigne, N_CLIENTS, N_COMMANDES } from '../../client/src/demos/sql-lab/data';
import { CHALLENGES, compareResults, EXAMPLE_QUERY, loadComptoir, runQuery } from '../../client/src/demos/sql-lab/challenges';
import { chartSpec } from '../../client/src/demos/sql-lab/ResultChart';

describe('SQL Lab — base Comptoir Lumen', () => {
  const data = generateComptoir();
  let db: Database;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    loadComptoir(db, data);
  });

  it('est déterministe : même graine, même base', () => {
    const again = generateComptoir();
    expect(again.lignes.length).toBe(data.lignes.length);
    expect(again.commandes[1234]).toEqual(data.commandes[1234]);
    expect(again.clients[77]).toEqual(data.clients[77]);
  });

  it('a les volumes annoncés et une intégrité référentielle complète', () => {
    expect(data.clients).toHaveLength(N_CLIENTS);
    expect(data.commandes).toHaveLength(N_COMMANDES);
    const clientIds = new Set(data.clients.map((c) => c.id));
    const produitIds = new Set(data.produits.map((p) => p.id));
    const commandeIds = new Set(data.commandes.map((c) => c.id));
    expect(data.commandes.every((c) => clientIds.has(c.client_id))).toBe(true);
    expect(data.lignes.every((l) => produitIds.has(l.produit_id) && commandeIds.has(l.commande_id))).toBe(true);
    // Une commande n'est jamais passée avant l'inscription de son client.
    const insc = new Map(data.clients.map((c) => [c.id, c.date_inscription]));
    expect(data.commandes.every((c) => c.date_commande >= insc.get(c.client_id)!)).toBe(true);
  });

  it('le CA SQL est égal au CA calculé en mémoire', () => {
    const produit = new Map(data.produits.map((p) => [p.id, p]));
    const livrees = new Set(data.commandes.filter((c) => c.statut === 'livree').map((c) => c.id));
    const caMemoire = data.lignes.filter((l) => livrees.has(l.commande_id)).reduce((s, l) => s + montantLigne(l, produit.get(l.produit_id)!), 0);
    const r = runQuery(
      db,
      `SELECT SUM(l.quantite * p.prix_unitaire * (1 - l.remise)) FROM commandes c JOIN lignes l ON l.commande_id = c.id
       JOIN produits p ON p.id = l.produit_id WHERE c.statut = 'livree'`,
    );
    expect(r.rows[0]![0] as number).toBeCloseTo(caMemoire, 6);
  });

  it('chaque solution s’exécute, renvoie des lignes et se valide elle-même', () => {
    for (const c of CHALLENGES) {
      const r = runQuery(db, c.solution);
      expect(r.rows.length, c.id).toBeGreaterThan(0);
      expect(compareResults(r, r).ok, c.id).toBe(true);
    }
  });

  it('la correction ignore l’ordre et le nom des colonnes, pas les valeurs', () => {
    const regions = CHALLENGES.find((c) => c.id === 'regions')!;
    const want = runQuery(db, regions.solution);
    const autreEcriture = runQuery(db, 'SELECT region AS r, COUNT(id) n FROM clients GROUP BY 1 ORDER BY 1');
    expect(compareResults(autreEcriture, want).ok).toBe(true);
    const incomplet = runQuery(db, 'SELECT region FROM clients GROUP BY region');
    expect(compareResults(incomplet, want)).toEqual({ ok: false, why: '2 colonnes attendues, 1 obtenue.' });
    const faux = runQuery(db, "SELECT region, COUNT(*) FROM clients WHERE segment = 'Particulier' GROUP BY region");
    expect(compareResults(faux, want).ok).toBe(false);
  });

  it('l’exemple d’ouverture produit une courbe sur 24 mois', () => {
    const r = runQuery(db, EXAMPLE_QUERY);
    expect(r.rows).toHaveLength(24);
    const spec = chartSpec(r);
    expect(spec?.time).toBe(true);
    expect(spec?.valueCol).toBe('ca');
  });
});
