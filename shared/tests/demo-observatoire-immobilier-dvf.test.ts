/**
 * Script de téléchargement DVF (scripts/dvf/fetch-dvf.mjs), testé hors réseau :
 * archive .csv.gz synthétique au format Etalab « DVF géolocalisées », générée dans le test.
 */
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGunzip, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  aggregateDepartement,
  buildIndex,
  cleanVentes,
  columnIndex,
  dvfUrl,
  fetchDvf,
  histogram,
  parseCsvLine,
  quantileSorted,
  readDvfCsv,
  run,
  sample,
  summarize,
} from '../../scripts/dvf/fetch-dvf.mjs';

/** En-tête officiel des fichiers geo-dvf (files.data.gouv.fr/geo-dvf/latest/csv). */
const HEADER =
  'id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe,' +
  'adresse_nom_voie,adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,' +
  'ancien_nom_commune,id_parcelle,ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,' +
  'lot2_surface_carrez,lot3_numero,lot3_surface_carrez,lot4_numero,lot4_surface_carrez,lot5_numero,' +
  'lot5_surface_carrez,nombre_lots,code_type_local,type_local,surface_reelle_bati,nombre_pieces_principales,' +
  'code_nature_culture,nature_culture,code_nature_culture_speciale,nature_culture_speciale,surface_terrain,' +
  'longitude,latitude';
const COLS = HEADER.split(',');

type Row = Partial<Record<string, string | number>>;
const csvRow = (r: Row) =>
  COLS.map((c) => {
    const v = r[c];
    if (v === undefined) return '';
    const s = String(v);
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');

const ANGERS = { code_commune: '49007', nom_commune: 'Angers', code_departement: '49' };
const CHOLET = { code_commune: '49099', nom_commune: 'Cholet', code_departement: '49' };

/** Une maison, vendue avec un jardin (deux lignes : deux natures de culture) et une dépendance. */
const maisonAvecJardin: Row[] = [
  { id_mutation: '2024-1', date_mutation: '2024-03-12', nature_mutation: 'Vente', valeur_fonciere: '210000', ...ANGERS,
    adresse_nom_voie: 'RUE DES "LILAS", BIS', id_parcelle: '49007000AB0012', code_type_local: 1, type_local: 'Maison',
    surface_reelle_bati: 100, nombre_pieces_principales: 4, code_nature_culture: 'S', nature_culture: 'sols',
    surface_terrain: 300, longitude: -0.55, latitude: 47.47 },
  { id_mutation: '2024-1', date_mutation: '2024-03-12', nature_mutation: 'Vente', valeur_fonciere: '210000', ...ANGERS,
    id_parcelle: '49007000AB0012', code_type_local: 1, type_local: 'Maison', surface_reelle_bati: 100,
    nombre_pieces_principales: 4, code_nature_culture: 'J', nature_culture: 'jardins', surface_terrain: 200,
    longitude: -0.55, latitude: 47.47 },
  { id_mutation: '2024-1', date_mutation: '2024-03-12', nature_mutation: 'Vente', valeur_fonciere: '210000', ...ANGERS,
    id_parcelle: '49007000AB0012', code_type_local: 3, type_local: 'Dépendance', longitude: -0.55, latitude: 47.47 },
];
/** Un appartement seul. */
const appartement: Row[] = [
  { id_mutation: '2024-2', date_mutation: '2024-05-02', nature_mutation: 'Vente', valeur_fonciere: '150000.5', ...ANGERS,
    id_parcelle: '49007000CD0001', lot1_numero: 12, code_type_local: 2, type_local: 'Appartement',
    surface_reelle_bati: 50, nombre_pieces_principales: 2, longitude: -0.56, latitude: 47.48 },
];
/** Deux appartements dans la même mutation (vente en bloc) : écartée. */
const deuxLots: Row[] = [
  { id_mutation: '2024-3', date_mutation: '2024-06-10', nature_mutation: 'Vente', valeur_fonciere: '300000', ...ANGERS,
    id_parcelle: '49007000CD0002', lot1_numero: 1, type_local: 'Appartement', surface_reelle_bati: 40, nombre_pieces_principales: 2 },
  { id_mutation: '2024-3', date_mutation: '2024-06-10', nature_mutation: 'Vente', valeur_fonciere: '300000', ...ANGERS,
    id_parcelle: '49007000CD0002', lot1_numero: 2, type_local: 'Appartement', surface_reelle_bati: 45, nombre_pieces_principales: 2 },
];
/** Vente en l'état futur d'achèvement : écartée (seules les « Vente » comptent). */
const vefa: Row[] = [
  { id_mutation: '2024-4', date_mutation: '2024-07-01', nature_mutation: "Vente en l'état futur d'achèvement",
    valeur_fonciere: '250000', ...CHOLET, type_local: 'Appartement', surface_reelle_bati: 60, nombre_pieces_principales: 3 },
];
/** Maison avec un local commercial : écartée. */
const avecCommerce: Row[] = [
  { id_mutation: '2024-5', date_mutation: '2024-08-01', nature_mutation: 'Vente', valeur_fonciere: '400000', ...CHOLET,
    id_parcelle: 'X1', type_local: 'Maison', surface_reelle_bati: 120, nombre_pieces_principales: 5 },
  { id_mutation: '2024-5', date_mutation: '2024-08-01', nature_mutation: 'Vente', valeur_fonciere: '400000', ...CHOLET,
    id_parcelle: 'X1', type_local: 'Local industriel. commercial ou assimilé', surface_reelle_bati: 80 },
];
/** Terrain nu : aucun logement. */
const terrain: Row[] = [
  { id_mutation: '2024-6', date_mutation: '2024-09-01', nature_mutation: 'Vente', valeur_fonciere: '40000', ...CHOLET,
    code_nature_culture: 'AB', nature_culture: 'terrains a bâtir', surface_terrain: 600 },
];
/** Maison sans coordonnées, en fin de fichier sans saut de ligne final. */
const sansGeo: Row[] = [
  { id_mutation: '2024-7', date_mutation: '2024-10-15', nature_mutation: 'Vente', valeur_fonciere: '120000', ...CHOLET,
    id_parcelle: 'Y1', type_local: 'Maison', surface_reelle_bati: 80, nombre_pieces_principales: 4 },
];

const ALL = [...maisonAvecJardin, ...appartement, ...deuxLots, ...vefa, ...avecCommerce, ...terrain, ...sansGeo];
const fileText = (rows: Row[]) => `${HEADER}\r\n${rows.map(csvRow).join('\r\n')}`;

let dir = '';
let gzPath = '';
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dvf-test-'));
  gzPath = path.join(dir, '49.csv.gz');
  await fs.writeFile(gzPath, gzipSync(Buffer.from(fileText(ALL), 'utf8')));
});
afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe('lecture CSV', () => {
  it('découpe les champs entre guillemets', () => {
    expect(parseCsvLine('a,"b, c","d ""e""",')).toEqual(['a', 'b, c', 'd "e"', '']);
  });
  it('repère les colonnes par leur nom, quel que soit leur ordre', () => {
    const shuffled = [...COLS].reverse();
    const idx = columnIndex(shuffled);
    expect(shuffled[idx.valeur_fonciere]).toBe('valeur_fonciere');
    expect(() => columnIndex(['id_mutation', 'date_mutation'])).toThrow(/valeur_fonciere/);
  });
});

describe('archive DVF synthétique (.csv.gz)', () => {
  it('ne garde que les ventes d’un seul logement', async () => {
    const { ventes, stats } = await readDvfCsv(createReadStream(gzPath).pipe(createGunzip()));
    expect(stats.lignes).toBe(ALL.length);
    expect(stats.mutations).toBe(7);
    expect(stats.horsVente).toBe(1);
    expect(stats.plusieursLogements).toBe(1);
    expect(stats.avecLocalActivite).toBe(1);
    expect(stats.sansLogement).toBe(1);
    expect(ventes.map((v) => v.code + ':' + v.type)).toEqual(['49007:M', '49007:A', '49099:M']);
    const [maison, appart, sansCoord] = ventes;
    // la maison apparaît sur deux lignes (sols + jardins) mais compte une fois, au prix de la mutation
    expect(maison).toMatchObject({ surface: 100, pieces: 4, prix: 210000, annee: 2024, lon: -0.55, lat: 47.47 });
    expect(appart.prix).toBeCloseTo(150000.5, 6);
    expect(sansCoord).toMatchObject({ lon: null, lat: null });
  });

  it('lit des colonnes dans un autre ordre', async () => {
    const order = [...COLS].sort();
    const text = [order.join(','), ...appartement.map((r) => order.map((c) => r[c] ?? '').join(','))].join('\n');
    const { ventes } = await readDvfCsv([Buffer.from(text)]);
    expect(ventes).toHaveLength(1);
    expect(ventes[0]).toMatchObject({ type: 'A', surface: 50, prix: 150000.5 });
  });

  it('télécharge par fetch et décompresse en flux ; 404 → null', async () => {
    const gz = await fs.readFile(gzPath);
    const fake = (async (url: string) =>
      url.includes('/2024/') ? new Response(new Uint8Array(gz)) : new Response('absent', { status: 404 })) as typeof fetch;
    const r = await fetchDvf(dvfUrl('https://exemple.test/csv/', 2024, '49'), { fetchImpl: fake });
    expect(r?.ventes).toHaveLength(3);
    expect(await fetchDvf(dvfUrl('https://exemple.test/csv', 2025, '49'), { fetchImpl: fake })).toBeNull();
    expect(dvfUrl('https://exemple.test/csv/', 2024, '2A')).toBe('https://exemple.test/csv/2024/departements/2A.csv.gz');
  });
});

describe('statistiques', () => {
  it('quantiles de type 7 (R, Excel)', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantileSorted(s, 0.25)).toBeCloseTo(3.25, 12);
    expect(quantileSorted(s, 0.5)).toBeCloseTo(5.5, 12);
    expect(quantileSorted(s, 0.75)).toBeCloseTo(7.75, 12);
    expect(summarize([4, 1, 3, 2])).toEqual([4, 2, 3, 3]); // 1,75 → 2 ; 2,5 → 3 ; 3,25 → 3
  });
  it('histogramme par classes de 250 €, dernière classe ouverte', () => {
    const h = histogram([10, 260, 270, 9000, 12000]);
    expect(h[0]).toBe(1);
    expect(h[1]).toBe(2);
    expect(h[h.length - 1]).toBe(2);
    expect(h).toHaveLength(8000 / 250 + 1);
    expect(histogram([100])).toEqual([1]);
  });
  it('échantillon reproductible, sans doublon, plafonné', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const a = sample(items, 50, 7);
    expect(a).toEqual(sample(items, 50, 7));
    expect(new Set(a).size).toBe(50);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(sample([1, 2], 50)).toEqual([1, 2]);
  });
});

/** Ventes synthétiques : prix au m² = 1 000 + i (i = 0…199), plus quelques valeurs aberrantes. */
function ventesSynthetiques() {
  const v = [];
  for (let i = 0; i < 200; i++) {
    v.push({
      code: i % 2 ? '49007' : '49099', nom: i % 2 ? 'Angers' : 'Cholet', date: `${2022 + (i % 3)}-06-01`,
      annee: 2022 + (i % 3), type: i % 4 < 2 ? ('M' as const) : ('A' as const), surface: 100, pieces: 4,
      prix: (1000 + i) * 100, lon: i % 2 ? -0.55 + i * 1e-5 : -0.88, lat: 47.4,
    });
  }
  v.push({ ...v[0], surface: 8, prix: 100000 }); // surface trop petite
  v.push({ ...v[0], prix: 500 }); // 5 €/m²
  v.push({ ...v[0], prix: 5_000_000 }); // 50 000 €/m²
  return v;
}

describe('nettoyage et agrégation', () => {
  it('écarte surfaces ≤ 9 m², prix hors bornes, puis 1 % de chaque côté', () => {
    const { ventes, bornes, ecartees } = cleanVentes(ventesSynthetiques());
    // 200 valeurs 1000…1199 : quantiles 1 % et 99 % = 1001,99 et 1197,01 → 196 gardées
    expect(bornes).toEqual([1002, 1197]);
    expect(ventes).toHaveLength(196);
    expect(ecartees).toBe(203 - 196);
  });

  it('agrège par commune, par année et par type', () => {
    const agg = aggregateDepartement('49', ventesSynthetiques(), { echantillon: 40 });
    expect(agg.nom).toBe('Maine-et-Loire');
    expect(agg.annees).toEqual([2022, 2023, 2024]);
    expect(agg.communes.map((c) => c.c)).toEqual(['49007', '49099']);
    const angers = agg.communes[0];
    expect(angers.n).toBe('Angers');
    expect(angers.y).toBe(47.4);
    expect(angers.v).toBe(agg.communes[0].v);
    expect(agg.communes.reduce((s, c) => s + c.v, 0)).toBe(196);
    // cohérence : effectifs par type = effectif total de l'année
    for (const c of agg.communes)
      for (const s of Object.values(c.s)) expect((s.M?.[0] ?? 0) + (s.A?.[0] ?? 0)).toBe(s.T[0]);
    // la médiane d'Angers en 2022 = médiane des prix/m² de ses ventes de 2022
    const vals = cleanVentes(ventesSynthetiques()).ventes
      .filter((v) => v.code === '49007' && v.annee === 2022)
      .map((v) => v.prix / v.surface)
      .sort((a, b) => a - b);
    expect(angers.s['2022'].T[2]).toBe(Math.round(quantileSorted(vals, 0.5)));
    // échantillon : 40 lignes [surface, pièces, type, année, prix, indice de commune]
    expect(agg.echantillon.lignes).toHaveLength(40);
    for (const l of agg.echantillon.lignes) {
      expect(l).toHaveLength(6);
      expect([0, 1]).toContain(l[2]);
      expect(agg.communes[l[5]]).toBeDefined();
    }
    const idx = buildIndex([agg], { genere: '2026-11-06T00:00:00.000Z' });
    expect(idx).toMatchObject({
      licence: 'Licence Ouverte 2.0, DGFiP / Etalab',
      annees: [2022, 2023, 2024],
      departements: [{ code: '49', fichier: '49.json', ventes: 196, communes: 2 }],
    });
  });

  it('produit des fichiers compacts (≈ 1 Mo pour 30 000 ventes, 600 communes)', () => {
    const rand = (() => { let s = 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const v = Array.from({ length: 30000 }, (_, i) => {
      const c = i % 600;
      return { code: `62${String(c).padStart(3, '0')}`, nom: `C${c}`, date: `${2021 + (i % 5)}-01-01`, annee: 2021 + (i % 5),
        type: rand() < 0.7 ? ('M' as const) : ('A' as const), surface: 50 + rand() * 100, pieces: 3,
        prix: (1000 + rand() * 3000) * 100, lon: 2 + c / 600, lat: 50 + rand() * 0.01 };
    });
    const size = JSON.stringify(aggregateDepartement('62', v)).length;
    expect(size).toBeLessThan(1_200_000);
  });
});

describe('programme complet (fetch simulé)', () => {
  it('écrit un fichier par département puis index.json ; 404 des années récentes ignorés', async () => {
    const gz = await fs.readFile(gzPath);
    const out = path.join(dir, 'out');
    const fake = (async (url: string) =>
      url.includes('/2024/') ? new Response(new Uint8Array(gz)) : new Response('', { status: 404 })) as typeof fetch;
    const r = await run({ departements: ['49'], outDir: out, fetchImpl: fake, anneeCourante: 2026, log: () => {} });
    expect(r).toEqual({ ecrits: ['49'], echecs: [] });
    const index = JSON.parse(await fs.readFile(path.join(out, 'index.json'), 'utf8'));
    expect(index.departements[0]).toMatchObject({ code: '49', annees: [2024] });
    const dep = JSON.parse(await fs.readFile(path.join(out, '49.json'), 'utf8'));
    expect(dep.communes.length).toBeGreaterThan(0);
  });

  it('échec réseau : erreur claire ; en mode facultatif, les autres départements continuent', async () => {
    const out = path.join(dir, 'out2');
    const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await expect(run({ departements: ['49'], outDir: out, fetchImpl: down, log: () => {} })).rejects.toThrow(/49.*fetch failed/);
    await expect(
      run({ departements: ['49', '62'], outDir: out, fetchImpl: down, optional: true, log: () => {}, warn: () => {} }),
    ).rejects.toThrow(/Aucune donnée DVF/);
    await expect(fs.access(path.join(out, 'index.json'))).rejects.toThrow();
    await expect(run({ departements: ['4X'], outDir: out, log: () => {} })).rejects.toThrow(/invalide/);
  });
});

describe('ligne de commande', () => {
  const script = path.resolve(__dirname, '../../scripts/dvf/fetch-dvf.mjs');
  const runCli = async (extra: Record<string, string>) => {
    const { spawnSync } = await import('node:child_process');
    return spawnSync(process.execPath, [script], {
      env: { PATH: process.env.PATH ?? '', DVF_BASE_URL: 'http://127.0.0.1:9', DVF_DEPARTEMENTS: '49',
        DVF_OUT: path.join(dir, 'cli'), DVF_TIMEOUT_MS: '5000', ...extra },
      encoding: 'utf8',
      timeout: 30_000,
    });
  };
  it('serveur injoignable : code 0 avec DVF_OPTIONAL=1, sinon code 1', async () => {
    const opt = await runCli({ DVF_OPTIONAL: '1' });
    expect(opt.status).toBe(0);
    expect(opt.stderr).toMatch(/téléchargement impossible/);
    expect(opt.stderr).toMatch(/Données en préparation/);
    const strict = await runCli({});
    expect(strict.status).toBe(1);
  });
});
