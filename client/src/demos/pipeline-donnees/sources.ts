import type { Database } from 'sql.js';
import { generateComptoir, montantLigne, mulberry32, type ComptoirData } from '../sql-lab/data';

/**
 * Les tables brutes du pipeline : la base Comptoir Lumen (la même que le SQL Lab et le tableau de bord),
 * « salie » comme le serait un vrai export : texte partout, formats mélangés, doublons de chargement.
 * Les défauts sont tirés avec une graine fixe : tout le monde voit les mêmes.
 */

export const DEFECT_SEED = 4242;

export interface RawSources {
  raw_commandes: [string, string, string, string, string, string][];
  raw_lignes: [string, string, string, string, string, string][];
  raw_produits: [string][];
  raw_clients: [string, string, string, string, string, string][];
  /** Nombre de commandes chargées deux fois. */
  doublons: number;
  /** Total comptable de référence : CA livré calculé sur les données d'origine, avant tout défaut. */
  caReference: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const frNumber = (v: number, decimals: number) => v.toFixed(decimals).replace('.', ',');

const CANAL_VARIANTES: Record<string, string[]> = {
  'Site web': ['Site web', 'site web', 'SITE WEB', 'Web ', 'Site Web'],
  Application: ['Application', 'appli', 'APPLICATION', 'Application '],
  Boutique: ['Boutique', 'boutique ', 'BOUTIQUE'],
};
const STATUT_VARIANTES: Record<string, string[]> = {
  livree: ['livree', 'LIVREE', 'Livree ', 'livree'],
  annulee: ['annulee', 'ANNULEE'],
  retournee: ['retournee', 'Retournee'],
  en_cours: ['en_cours', 'EN_COURS'],
};
const SEGMENT_VARIANTES: Record<string, string[]> = {
  Particulier: ['Particulier', 'particulier', 'PART', 'Particulier '],
  Professionnel: ['Professionnel', 'pro', 'PRO', 'B2B'],
};

/** Le total que doit retrouver le mart : CA des lignes livrées, sur les données propres d'origine. */
export function caLivreReference(data: ComptoirData): number {
  const produit = new Map(data.produits.map((p) => [p.id, p]));
  const livrees = new Set(data.commandes.filter((c) => c.statut === 'livree').map((c) => c.id));
  const total = data.lignes.filter((l) => livrees.has(l.commande_id)).reduce((s, l) => s + montantLigne(l, produit.get(l.produit_id)!), 0);
  return Math.round(total * 100) / 100;
}

export function buildRawSources(data: ComptoirData = generateComptoir(), seed = DEFECT_SEED): RawSources {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;

  // Commandes : date en texte dans trois formats, libellés en casse libre, ~4 % chargées deux fois.
  const raw_commandes: RawSources['raw_commandes'] = [];
  let doublons = 0;
  for (const c of data.commandes) {
    const [y, m, d] = c.date_commande.split('-');
    const r = rnd();
    const date = r < 0.68 ? c.date_commande : r < 0.9 ? `${d}/${m}/${y}` : `${c.date_commande}T${pad(8 + Math.floor(rnd() * 12))}:${pad(Math.floor(rnd() * 60))}:00`;
    const row: RawSources['raw_commandes'][number] = [
      String(c.id),
      String(c.client_id),
      date,
      pick(CANAL_VARIANTES[c.canal]!),
      pick(STATUT_VARIANTES[c.statut]!),
      `${c.date_commande} 23:00:00`,
    ];
    raw_commandes.push(row);
    if (rnd() < 0.04) {
      // Rechargement le lendemain : même contenu, horodatage de chargement plus récent.
      const next = new Date(`${c.date_commande}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      raw_commandes.push([row[0], row[1], row[2], row[3], row[4], `${next.toISOString().slice(0, 10)} 06:30:00`]);
      doublons++;
    }
  }

  // Lignes : tout en texte, virgule décimale.
  const prix = new Map(data.produits.map((p) => [p.id, p.prix_unitaire]));
  const raw_lignes: RawSources['raw_lignes'] = data.lignes.map((l) => [
    String(l.id),
    String(l.commande_id),
    String(l.produit_id),
    String(l.quantite),
    frNumber(prix.get(l.produit_id)!, 2),
    l.remise === 0 ? '0' : frNumber(l.remise, 2),
  ]);

  // Produits : un document JSON par produit.
  const raw_produits: RawSources['raw_produits'] = data.produits.map((p) => [
    JSON.stringify({ id: p.id, nom: p.nom, categorie: p.categorie, prix: p.prix_unitaire, cout: p.cout_unitaire }),
  ]);

  // Clients : ville en casse et espaces incohérents, segment en libellés variés.
  const raw_clients: RawSources['raw_clients'] = data.clients.map((c) => {
    const r = rnd();
    const ville = r < 0.55 ? c.ville : r < 0.75 ? c.ville.toUpperCase() : r < 0.9 ? c.ville.toLowerCase() : ` ${c.ville} `;
    return [String(c.id), c.prenom, c.nom, ville, c.region, pick(SEGMENT_VARIANTES[c.segment]!)];
  });

  return { raw_commandes, raw_lignes, raw_produits, raw_clients, doublons, caReference: caLivreReference(data) };
}

export const RAW_DDL = `CREATE TABLE raw_commandes (id_commande TEXT, id_client TEXT, date_commande TEXT, canal TEXT, statut TEXT, _charge_le TEXT);
CREATE TABLE raw_lignes (id_ligne TEXT, id_commande TEXT, id_produit TEXT, quantite TEXT, prix_paye TEXT, remise TEXT);
CREATE TABLE raw_produits (contenu TEXT);
CREATE TABLE raw_clients (id TEXT, prenom TEXT, nom TEXT, ville TEXT, region TEXT, segment TEXT);`;

/** Crée et remplit les tables brutes (une transaction, requêtes préparées). */
export function loadRawSources(db: Database, raw: RawSources): void {
  db.run(RAW_DDL);
  db.run('BEGIN');
  const ins = (sql: string, rows: string[][]) => {
    const st = db.prepare(sql);
    for (const r of rows) st.run(r);
    st.free();
  };
  ins('INSERT INTO raw_commandes VALUES (?,?,?,?,?,?)', raw.raw_commandes);
  ins('INSERT INTO raw_lignes VALUES (?,?,?,?,?,?)', raw.raw_lignes);
  ins('INSERT INTO raw_produits VALUES (?)', raw.raw_produits);
  ins('INSERT INTO raw_clients VALUES (?,?,?,?,?,?)', raw.raw_clients);
  db.run('COMMIT');
}
