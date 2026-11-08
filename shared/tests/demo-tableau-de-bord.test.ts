import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import initSqlJs, { type Database } from 'sql.js';
import { CA_SQL, SCHEMA_SQL, generateComptoir } from '../../client/src/demos/sql-lab/data';
import {
  DEFAULT_FILTERS,
  breakdown,
  buildBase,
  cohorts,
  insights,
  kpis,
  meanRetention,
  monthKey,
  monthOfDate,
  monthlyKpis,
  previousYear,
  topDecileShare,
  topProduits,
  type Filters,
} from '../../client/src/demos/tableau-de-bord/model';

const data = generateComptoir();
const base = buildBase(data);
const ALL: Filters = { ...DEFAULT_FILTERS, from: 0, to: 23 };
const fmt = { euros: (v: number) => `${Math.round(v)} €`, pct: (v: number) => `${(v * 100).toFixed(1)} %`, signedPct: (v: number) => `${(v * 100).toFixed(1)} %` };

/** Base SQLite identique à celle du SQL Lab, pour vérifier que les deux démos donnent les mêmes chiffres. */
let db: Database;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
  db = new SQL.Database();
  db.run(SCHEMA_SQL);
  const ins = (table: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]!);
    const st = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    for (const r of rows) st.run(cols.map((c) => r[c] as number | string));
    st.free();
  };
  db.run('BEGIN');
  ins('clients', data.clients as unknown as Record<string, unknown>[]);
  ins('produits', data.produits as unknown as Record<string, unknown>[]);
  ins('commandes', data.commandes as unknown as Record<string, unknown>[]);
  ins('lignes', data.lignes as unknown as Record<string, unknown>[]);
  db.run('COMMIT');
});
const sql = (q: string) => db.exec(q)[0]?.values ?? [];
const JOIN = 'FROM commandes c JOIN lignes l ON l.commande_id = c.id JOIN produits p ON p.id = l.produit_id JOIN clients cl ON cl.id = c.client_id';

describe('calendrier', () => {
  it('rattache une date à son mois et revient au format SQL', () => {
    expect(monthOfDate('2024-01-15')).toBe(0);
    expect(monthOfDate('2025-12-31')).toBe(23);
    expect(monthKey(14)).toBe('2025-03');
  });
  it('décale la période d’un an seulement si elle reste dans les données', () => {
    expect(previousYear(DEFAULT_FILTERS)).toMatchObject({ from: 0, to: 11 });
    expect(previousYear(ALL)).toBeNull();
  });
});

describe('cohérence avec le SQL Lab', () => {
  it('CA livré total et nombre de commandes livrées', () => {
    const k = kpis(base, ALL);
    const [[ca, n]] = sql(`SELECT SUM(${CA_SQL}), COUNT(DISTINCT c.id) ${JOIN} WHERE c.statut = 'livree'`) as [[number, number]];
    expect(k.ca).toBeCloseTo(ca, 6);
    expect(k.commandes).toBe(n);
    // Repère pour le rapport : valeurs exactes de la base de démonstration.
    expect(Math.round(k.ca * 100) / 100).toBeGreaterThan(0);
  });

  it('commandes livrées et CA par canal', () => {
    const rows = sql(`SELECT c.canal, COUNT(DISTINCT c.id), SUM(${CA_SQL}) ${JOIN} WHERE c.statut = 'livree' GROUP BY c.canal`);
    const b = new Map(breakdown(base, ALL, 'canal').map((r) => [r.key, r]));
    for (const [canal, n, ca] of rows as [string, number, number][]) {
      expect(b.get(canal)!.commandes).toBe(n);
      expect(b.get(canal)!.ca).toBeCloseTo(ca, 6);
    }
  });

  it('CA mensuel 2025 (défi « Chiffre d’affaires mensuel 2025 » du SQL Lab)', () => {
    const rows = sql(
      `SELECT strftime('%Y-%m', c.date_commande) AS mois, ROUND(SUM(${CA_SQL}), 2) ${JOIN} WHERE c.statut = 'livree' AND c.date_commande LIKE '2025-%' GROUP BY mois ORDER BY mois`,
    ) as [string, number][];
    const months = monthlyKpis(base, DEFAULT_FILTERS);
    expect(months).toHaveLength(12);
    rows.forEach(([mois, ca], i) => {
      expect(monthKey(12 + i)).toBe(mois);
      expect(Math.round(months[i]!.ca * 100) / 100).toBeCloseTo(ca, 2);
    });
  });

  it('marge et clients actifs avec filtres croisés (région × catégorie × segment)', () => {
    const flt: Filters = { ...DEFAULT_FILTERS, regions: ['Île-de-France', 'Bretagne'], categories: ['Textile'], segment: 'Particulier' };
    const [[ca, cout, clients]] = sql(
      `SELECT SUM(${CA_SQL}), SUM(l.quantite * p.cout_unitaire), COUNT(DISTINCT c.client_id) ${JOIN}
       WHERE c.statut = 'livree' AND c.date_commande LIKE '2025-%' AND cl.region IN ('Île-de-France','Bretagne')
         AND p.categorie = 'Textile' AND cl.segment = 'Particulier'`,
    ) as [[number, number, number]];
    const k = kpis(base, flt);
    expect(k.ca).toBeCloseTo(ca, 6);
    expect(k.marge).toBeCloseTo(ca - cout, 6);
    expect(k.clients).toBe(clients);
  });

  it('taux de retour = retournées / (livrées + retournées)', () => {
    const [[ret, exp]] = sql(
      `SELECT SUM(statut = 'retournee'), SUM(statut IN ('livree','retournee')) FROM commandes WHERE date_commande LIKE '2025-%'`,
    ) as [[number, number]];
    expect(kpis(base, DEFAULT_FILTERS).tauxRetour).toBeCloseTo(ret / exp, 10);
  });

  it('top produits identique à un GROUP BY produit', () => {
    const rows = sql(
      `SELECT p.nom, SUM(${CA_SQL}) AS ca ${JOIN} WHERE c.statut = 'livree' AND c.date_commande LIKE '2025-%' GROUP BY p.id ORDER BY ca DESC LIMIT 5`,
    ) as [string, number][];
    const top = topProduits(base, DEFAULT_FILTERS, 5);
    rows.forEach(([nom, ca], i) => {
      expect(top[i]!.nom).toBe(nom);
      expect(top[i]!.ca).toBeCloseTo(ca, 6);
    });
  });
});

describe('répartitions et cohortes', () => {
  it('les parts d’une répartition somment à 1 et ignorent le filtre de leur dimension', () => {
    const flt: Filters = { ...DEFAULT_FILTERS, categories: ['Cuisine'] };
    const rows = breakdown(base, flt, 'categorie');
    expect(rows).toHaveLength(6);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
    expect(rows.map((r) => r.ca)).toEqual([...rows.map((r) => r.ca)].sort((a, b) => b - a));
  });

  it('chaque cohorte est active à 100 % le mois 0 et masque les mois hors données', () => {
    const rows = cohorts(base, DEFAULT_FILTERS);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.rates[0]).toBe(1);
      for (let k = 0; k < 12; k++) expect(r.rates[k] === null).toBe(r.month + k > 23);
    }
    const r1 = meanRetention(rows, 1);
    expect(r1).not.toBeNull();
    expect(r1!).toBeGreaterThan(0);
    expect(r1!).toBeLessThan(1);
  });

  it('les nouveaux clients d’une cohorte n’ont aucune commande livrée avant leur mois', () => {
    const [[n]] = sql(
      `SELECT COUNT(*) FROM (SELECT client_id, MIN(strftime('%Y-%m', date_commande)) AS premier FROM commandes WHERE statut = 'livree' GROUP BY client_id) WHERE premier LIKE '2025-%'`,
    ) as [[number]];
    expect(cohorts(base, DEFAULT_FILTERS).reduce((s, r) => s + r.size, 0)).toBe(n);
  });
});

describe('constats', () => {
  it('produit trois constats chiffrés sur la vue par défaut', () => {
    const list = insights(base, DEFAULT_FILTERS, fmt);
    expect(list.map((i) => i.id)).toEqual(['evolution', 'pic', 'concentration']);
    for (const i of list) expect(i.text).toMatch(/\d/);
  });
  it('signale un périmètre vide', () => {
    const flt: Filters = { ...DEFAULT_FILTERS, from: 23, to: 23, regions: ['Normandie'], categories: ['Mobilier'], segment: 'Professionnel', canaux: ['Application'] };
    if (kpis(base, flt).commandes === 0) expect(insights(base, flt, fmt)[0]!.id).toBe('vide');
  });
  it('concentration : le décile supérieur pèse plus de 10 % du CA', () => {
    expect(topDecileShare(base, DEFAULT_FILTERS)!.share).toBeGreaterThan(0.1);
  });
});

describe('repères', () => {
  it('affiche les agrégats de contrôle', () => {
    const k = kpis(base, ALL);
    const k25 = kpis(base, DEFAULT_FILTERS);
    console.log(
      `CA livré total ${k.ca.toFixed(2)} € · commandes livrées ${k.commandes} · 2025 : CA ${k25.ca.toFixed(2)} €, ${k25.commandes} commandes, ${k25.clients} clients`,
    );
    expect(k.commandes).toBeGreaterThan(2000);
  });
});
