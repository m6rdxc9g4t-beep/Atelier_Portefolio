#!/usr/bin/env node
// @ts-check
/**
 * Téléchargement et agrégation des « Demandes de valeurs foncières » géolocalisées (DVF, DGFiP / Etalab)
 * pour la démo « Observatoire immobilier » du portfolio.
 *
 * Exécuté seulement sur demande (construction de l'image Docker avec DVF_FETCH=1) :
 *
 *   DVF_OPTIONAL=1 node scripts/dvf/fetch-dvf.mjs
 *
 * Variables d'environnement :
 *   DVF_DEPARTEMENTS  départements à couvrir (défaut « 49,62,59,44,35 »)
 *   DVF_ANNEES        nombre d'années à garder, les plus récentes disponibles (défaut 5)
 *   DVF_ECHANTILLON   ventes gardées par département pour le modèle hédonique (défaut 3000)
 *   DVF_OPTIONAL=1    un échec réseau n'interrompt pas la construction (message clair, code 0)
 *   DVF_OUT           dossier de sortie (défaut client/public/data/dvf)
 *   DVF_BASE_URL      racine des fichiers (défaut https://files.data.gouv.fr/geo-dvf/latest/csv)
 *   DVF_TIMEOUT_MS    délai maximal par fichier (défaut 300000)
 *
 * Node 22, sans dépendance : téléchargement par fetch, décompression gzip en flux (zlib),
 * lecture CSV ligne à ligne. Les colonnes sont repérées par leur nom dans l'en-tête.
 * Les fonctions de lecture et d'agrégation sont exportées pour les tests (hors réseau).
 */
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_DEPARTEMENTS = ['49', '62', '59', '44', '35'];
export const DEFAULT_BASE_URL = 'https://files.data.gouv.fr/geo-dvf/latest/csv';
export const LICENCE = 'Licence Ouverte 2.0, DGFiP / Etalab';

/** Colonnes indispensables du format Etalab « DVF géolocalisées ». */
export const REQUIRED_COLUMNS = /** @type {const} */ ([
  'id_mutation',
  'date_mutation',
  'nature_mutation',
  'valeur_fonciere',
  'code_commune',
  'nom_commune',
  'type_local',
  'surface_reelle_bati',
  'nombre_pieces_principales',
  'longitude',
  'latitude',
]);

/** Bornes absolues du prix au m² (€) avant l'écrêtage des 1 % extrêmes. */
export const PRIX_M2_MIN = 100;
export const PRIX_M2_MAX = 30000;
/** Surface habitable : strictement plus de 9 m² (seuil légal d'un logement), au plus 1 000 m². */
export const SURFACE_MIN = 9;
export const SURFACE_MAX = 1000;
/** Part écartée de chaque côté de la distribution du prix au m², par département. */
export const TRIM = 0.01;
/** Histogrammes du prix au m² : classes de 250 €, la dernière ouverte (≥ 8 000 €). */
export const HIST_LARGEUR = 250;
export const HIST_MAX = 8000;

const NOMS_DEPARTEMENTS = {
  '14': 'Calvados', '22': 'Côtes-d’Armor', '29': 'Finistère', '33': 'Gironde', '35': 'Ille-et-Vilaine',
  '37': 'Indre-et-Loire', '44': 'Loire-Atlantique', '49': 'Maine-et-Loire', '53': 'Mayenne', '56': 'Morbihan',
  '59': 'Nord', '62': 'Pas-de-Calais', '69': 'Rhône', '72': 'Sarthe', '76': 'Seine-Maritime', '80': 'Somme',
  '85': 'Vendée', '13': 'Bouches-du-Rhône', '31': 'Haute-Garonne', '34': 'Hérault', '06': 'Alpes-Maritimes',
};

/** Nom d'un département (code INSEE), sinon « Département <code> ». */
export function nomDepartement(code) {
  return NOMS_DEPARTEMENTS[/** @type {keyof typeof NOMS_DEPARTEMENTS} */ (code)] ?? `Département ${code}`;
}

/** Code de département accepté (deux chiffres, 2A / 2B, ou outre-mer à trois chiffres). */
export function isDepartementCode(code) {
  return /^(\d{2}|2[AB]|97[1-6])$/.test(code);
}

/* ───────────────────────── Lecture CSV ───────────────────────── */

/**
 * Découpe une ligne CSV (RFC 4180 : champs entre guillemets, guillemets doublés).
 * @param {string} line
 * @param {string} [sep]
 * @returns {string[]}
 */
export function parseCsvLine(line, sep = ',') {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

/**
 * Position de chaque colonne utile, d'après l'en-tête (l'ordre n'est jamais supposé).
 * @param {string[]} header
 * @returns {Record<string, number>}
 */
export function columnIndex(header) {
  /** @type {Record<string, number>} */
  const idx = {};
  header.forEach((name, i) => {
    idx[name.trim().replace(/^﻿/, '')] = i;
  });
  const missing = REQUIRED_COLUMNS.filter((c) => idx[c] === undefined);
  if (missing.length) throw new Error(`En-tête DVF inattendu : colonne(s) absente(s) ${missing.join(', ')}`);
  return idx;
}

/**
 * Lignes de texte d'un flux d'octets ou de chaînes (UTF-8, fins de ligne \n ou \r\n).
 * @param {AsyncIterable<Uint8Array | string>} chunks
 */
export async function* readLines(chunks) {
  const decoder = new TextDecoder('utf-8');
  let rest = '';
  for await (const chunk of chunks) {
    rest += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, nl);
      rest = rest.slice(nl + 1);
      yield line.endsWith('\r') ? line.slice(0, -1) : line;
    }
  }
  rest += decoder.decode();
  if (rest.length) yield rest.endsWith('\r') ? rest.slice(0, -1) : rest;
}

/** Nombre décimal du fichier (point ou virgule) ; NaN si vide. */
function num(s) {
  if (s === undefined || s === '') return NaN;
  return Number(s.replace(',', '.'));
}

/**
 * @typedef {'M' | 'A'} TypeBien
 * @typedef {{ code: string, nom: string, date: string, annee: number, type: TypeBien,
 *   surface: number, pieces: number, prix: number, lon: number | null, lat: number | null }} Vente
 * @typedef {{ lignes: number, mutations: number, ventes: number, horsVente: number,
 *   plusieursLogements: number, sansLogement: number, avecLocalActivite: number, prixInvalide: number }} StatsLecture
 */

/**
 * Lit un fichier DVF géolocalisé (déjà décompressé) et rend les ventes d'un seul logement.
 *
 * Une mutation s'étend sur plusieurs lignes (une par parcelle, local et nature de culture), avec la même
 * valeur foncière répétée. On regroupe par `id_mutation` et on ne garde que les ventes (« Vente »)
 * portant sur exactement un logement (une Maison ou un Appartement, éventuellement avec dépendances ou
 * terrain), sans local d'activité : leur prix se rapporte alors à ce seul logement.
 *
 * @param {AsyncIterable<Uint8Array | string>} chunks
 * @returns {Promise<{ ventes: Vente[], stats: StatsLecture }>}
 */
export async function readDvfCsv(chunks) {
  /** @type {Record<string, number> | null} */
  let col = null;
  /** @type {Map<string, { date: string, nature: string, valeur: number, code: string, nom: string,
   *   logements: Map<string, { type: TypeBien, surface: number, pieces: number, lon: number, lat: number }>,
   *   activite: boolean }>} */
  const mutations = new Map();
  let lignes = 0;
  for await (const line of readLines(chunks)) {
    if (!line) continue;
    if (!col) {
      col = columnIndex(parseCsvLine(line));
      continue;
    }
    lignes++;
    const f = parseCsvLine(line);
    const get = (/** @type {string} */ name) => (col && col[name] !== undefined ? (f[col[name]] ?? '') : '');
    const id = get('id_mutation');
    if (!id) continue;
    let m = mutations.get(id);
    if (!m) {
      m = {
        date: get('date_mutation'),
        nature: get('nature_mutation'),
        valeur: num(get('valeur_fonciere')),
        code: get('code_commune'),
        nom: get('nom_commune'),
        logements: new Map(),
        activite: false,
      };
      mutations.set(id, m);
    }
    const type = get('type_local');
    if (type === 'Maison' || type === 'Appartement') {
      const surface = num(get('surface_reelle_bati'));
      const pieces = num(get('nombre_pieces_principales'));
      // Un même local revient sur plusieurs lignes (une par nature de culture) : on l'identifie par
      // sa parcelle, son lot, son type, sa surface et ses pièces.
      const key = [get('id_parcelle'), get('lot1_numero'), type, surface, pieces].join('|');
      if (!m.logements.has(key)) {
        m.logements.set(key, {
          type: type === 'Maison' ? 'M' : 'A',
          surface,
          pieces,
          lon: num(get('longitude')),
          lat: num(get('latitude')),
        });
      }
    } else if (type && type !== 'Dépendance') {
      m.activite = true; // « Local industriel. commercial ou assimilé »
    }
  }
  if (!col) throw new Error('Fichier DVF vide : aucun en-tête');

  /** @type {Vente[]} */
  const ventes = [];
  /** @type {StatsLecture} */
  const stats = {
    lignes,
    mutations: mutations.size,
    ventes: 0,
    horsVente: 0,
    plusieursLogements: 0,
    sansLogement: 0,
    avecLocalActivite: 0,
    prixInvalide: 0,
  };
  for (const m of mutations.values()) {
    if (m.nature !== 'Vente') {
      stats.horsVente++;
      continue;
    }
    if (m.logements.size === 0) {
      stats.sansLogement++;
      continue;
    }
    if (m.logements.size > 1) {
      stats.plusieursLogements++;
      continue;
    }
    if (m.activite) {
      stats.avecLocalActivite++;
      continue;
    }
    if (!(m.valeur > 0)) {
      stats.prixInvalide++;
      continue;
    }
    const [l] = m.logements.values();
    const annee = Number(m.date.slice(0, 4));
    ventes.push({
      code: m.code,
      nom: m.nom,
      date: m.date,
      annee,
      type: l.type,
      surface: l.surface,
      pieces: Number.isFinite(l.pieces) ? l.pieces : 0,
      prix: m.valeur,
      lon: Number.isFinite(l.lon) ? l.lon : null,
      lat: Number.isFinite(l.lat) ? l.lat : null,
    });
  }
  stats.ventes = ventes.length;
  return { ventes, stats };
}

/* ───────────────────────── Statistiques ───────────────────────── */

/**
 * Quantile d'un tableau TRIÉ par interpolation linéaire (type 7 de Hyndman & Fan, celui de R et d'Excel).
 * @param {number[]} sorted
 * @param {number} p
 */
export function quantileSorted(sorted, p) {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Médiane (copie triée). @param {number[]} values */
export function median(values) {
  return quantileSorted([...values].sort((a, b) => a - b), 0.5);
}

/**
 * Résumé d'une série de prix au m² : [effectif, 1er quartile, médiane, 3e quartile] (euros arrondis).
 * @param {number[]} values
 * @returns {[number, number, number, number]}
 */
export function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  return [s.length, Math.round(quantileSorted(s, 0.25)), Math.round(quantileSorted(s, 0.5)), Math.round(quantileSorted(s, 0.75))];
}

/** Prix au m² d'une vente. @param {Vente} v */
export const prixM2 = (v) => v.prix / v.surface;

/**
 * Filtre de qualité : surface habitable > 9 m² (≤ 1 000), prix au m² dans des bornes raisonnables,
 * puis écrêtage des 1 % les plus bas et les plus hauts (prix au m², sur l'ensemble du département).
 * @param {Vente[]} ventes
 * @param {{ trim?: number }} [opts]
 * @returns {{ ventes: Vente[], bornes: [number, number], ecartees: number }}
 */
export function cleanVentes(ventes, { trim = TRIM } = {}) {
  const ok = ventes.filter((v) => {
    if (!(v.surface > SURFACE_MIN && v.surface <= SURFACE_MAX)) return false;
    const p = prixM2(v);
    return p >= PRIX_M2_MIN && p <= PRIX_M2_MAX && Number.isFinite(v.annee);
  });
  if (!ok.length) return { ventes: [], bornes: [NaN, NaN], ecartees: ventes.length };
  const sorted = ok.map(prixM2).sort((a, b) => a - b);
  const lo = quantileSorted(sorted, trim);
  const hi = quantileSorted(sorted, 1 - trim);
  const kept = ok.filter((v) => {
    const p = prixM2(v);
    return p >= lo && p <= hi;
  });
  return { ventes: kept, bornes: [Math.round(lo), Math.round(hi)], ecartees: ventes.length - kept.length };
}

/** Histogramme du prix au m² (classes de HIST_LARGEUR €, dernière ouverte), zéros de fin retirés. */
export function histogram(values) {
  const n = HIST_MAX / HIST_LARGEUR + 1;
  const h = new Array(n).fill(0);
  for (const v of values) h[Math.min(n - 1, Math.max(0, Math.floor(v / HIST_LARGEUR)))]++;
  while (h.length && h[h.length - 1] === 0) h.pop();
  return h;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). @param {number} seed */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Échantillon aléatoire simple sans remise, reproductible (réservoir, algorithme R), dans l'ordre d'origine.
 * @template T
 * @param {T[]} items
 * @param {number} k
 * @param {number} [seed]
 * @returns {T[]}
 */
export function sample(items, k, seed = 2026) {
  if (items.length <= k) return [...items];
  const rand = mulberry32(seed);
  const idx = Array.from({ length: k }, (_, i) => i);
  for (let i = k; i < items.length; i++) {
    const j = Math.floor(rand() * (i + 1));
    if (j < k) idx[j] = i;
  }
  return idx.sort((a, b) => a - b).map((i) => items[i]);
}

/**
 * Statistiques par année et par type (T = tous, M = maisons, A = appartements).
 * @param {Vente[]} ventes
 * @param {number[]} annees
 */
function statsParAnnee(ventes, annees) {
  /** @type {Record<string, Record<string, [number, number, number, number]>>} */
  const out = {};
  for (const a of annees) {
    const ya = ventes.filter((v) => v.annee === a);
    if (!ya.length) continue;
    /** @type {Record<string, [number, number, number, number]>} */
    const s = { T: summarize(ya.map(prixM2)) };
    for (const t of /** @type {TypeBien[]} */ (['M', 'A'])) {
      const yt = ya.filter((v) => v.type === t);
      if (yt.length) s[t] = summarize(yt.map(prixM2));
    }
    out[a] = s;
  }
  return out;
}

/** Histogrammes par type sur toute la période. @param {Vente[]} ventes */
function histParType(ventes) {
  /** @type {Record<string, number[]>} */
  const h = {};
  for (const t of /** @type {TypeBien[]} */ (['M', 'A'])) {
    const vt = ventes.filter((v) => v.type === t);
    if (vt.length) h[t] = histogram(vt.map(prixM2));
  }
  return h;
}

const round4 = (/** @type {number} */ x) => Math.round(x * 1e4) / 1e4;

/**
 * Agrégat d'un département : statistiques du département, puis par commune (centroïde = médiane des
 * coordonnées des ventes, statistiques par année × type, histogrammes), et un échantillon plafonné de ventes
 * pour ajuster le modèle hédonique dans le navigateur.
 *
 * Format de l'échantillon : lignes [surface, pièces, type (0 maison, 1 appartement), année, prix, indice de commune].
 *
 * @param {string} code
 * @param {Vente[]} brutes ventes lues (toutes années), avant nettoyage
 * @param {{ echantillon?: number, seed?: number }} [opts]
 */
export function aggregateDepartement(code, brutes, { echantillon = 3000, seed = 2026 } = {}) {
  const { ventes, bornes, ecartees } = cleanVentes(brutes);
  const annees = [...new Set(ventes.map((v) => v.annee))].sort((a, b) => a - b);
  const dates = ventes.map((v) => v.date).sort();

  /** @type {Map<string, Vente[]>} */
  const parCommune = new Map();
  for (const v of ventes) {
    const list = parCommune.get(v.code);
    if (list) list.push(v);
    else parCommune.set(v.code, [v]);
  }
  const codes = [...parCommune.keys()].sort();
  const communes = codes.map((c) => {
    const list = /** @type {Vente[]} */ (parCommune.get(c));
    const geo = list.filter((v) => v.lon !== null && v.lat !== null);
    // Nom le plus récent (une commune nouvelle garde son code mais peut changer de nom).
    const nom = list.reduce((a, b) => (b.date > a.date ? b : a)).nom;
    return {
      c,
      n: nom,
      x: geo.length ? round4(median(geo.map((v) => /** @type {number} */ (v.lon)))) : null,
      y: geo.length ? round4(median(geo.map((v) => /** @type {number} */ (v.lat)))) : null,
      v: list.length,
      s: statsParAnnee(list, annees),
      h: histParType(list),
    };
  });
  const indexCommune = new Map(codes.map((c, i) => [c, i]));
  const lignes = sample(ventes, echantillon, seed).map((v) => [
    Math.round(v.surface),
    v.pieces,
    v.type === 'M' ? 0 : 1,
    v.annee,
    Math.round(v.prix),
    /** @type {number} */ (indexCommune.get(v.code)),
  ]);
  return {
    version: 1,
    code,
    nom: nomDepartement(code),
    annees,
    periode: { debut: dates[0] ?? null, fin: dates[dates.length - 1] ?? null },
    filtres: { bornesPrixM2: bornes, lues: brutes.length, ecartees, retenues: ventes.length },
    histogramme: { largeur: HIST_LARGEUR, max: HIST_MAX },
    departement: { v: ventes.length, s: statsParAnnee(ventes, annees), h: histParType(ventes) },
    communes,
    echantillon: {
      colonnes: ['surface', 'pieces', 'type', 'annee', 'prix', 'commune'],
      total: ventes.length,
      lignes,
    },
  };
}

/**
 * Index des données : départements disponibles, années, période, date de génération, source et licence.
 * @param {ReturnType<typeof aggregateDepartement>[]} deps
 * @param {{ genere?: string, baseUrl?: string }} [opts]
 */
export function buildIndex(deps, { genere = new Date().toISOString(), baseUrl = DEFAULT_BASE_URL } = {}) {
  const annees = [...new Set(deps.flatMap((d) => d.annees))].sort((a, b) => a - b);
  const debuts = deps.map((d) => d.periode.debut).filter(Boolean).sort();
  const fins = deps.map((d) => d.periode.fin).filter(Boolean).sort();
  return {
    version: 1,
    genere,
    source: 'Demandes de valeurs foncières géolocalisées (DVF)',
    producteur: 'DGFiP / Etalab',
    licence: LICENCE,
    url: `${baseUrl.replace(/\/$/, '')}/`,
    annees,
    periode: { debut: debuts[0] ?? null, fin: fins[fins.length - 1] ?? null },
    filtres:
      'Ventes d’un seul logement (maison ou appartement, dépendances comprises), surface habitable > 9 m², ' +
      `prix au m² entre ${PRIX_M2_MIN} et ${PRIX_M2_MAX} €, 1 % extrêmes écartés de chaque côté par département.`,
    departements: deps.map((d) => ({
      code: d.code,
      nom: d.nom,
      fichier: `${d.code}.json`,
      ventes: d.filtres.retenues,
      communes: d.communes.length,
      annees: d.annees,
    })),
  };
}

/* ───────────────────────── Téléchargement ───────────────────────── */

/** Adresse d'un fichier départemental. */
export function dvfUrl(baseUrl, annee, dep) {
  return `${baseUrl.replace(/\/$/, '')}/${annee}/departements/${dep}.csv.gz`;
}

/**
 * Télécharge et lit un fichier départemental ; `null` si le fichier n'existe pas (404).
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export async function fetchDvf(url, { fetchImpl = fetch, timeoutMs = 300_000 } = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 404) return null;
  if (!res.ok || !res.body) throw new Error(`${url} : réponse HTTP ${res.status}`);
  const gunzip = createGunzip();
  // Le flux est consommé pendant la décompression : aucune archive entière en mémoire.
  const pumping = pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), gunzip).catch((err) => gunzip.destroy(err));
  let result;
  try {
    result = await readDvfCsv(gunzip);
  } catch (err) {
    gunzip.destroy(); // arrête le téléchargement en cours
    throw err;
  }
  await pumping;
  return result;
}

/**
 * Télécharge les années disponibles d'un département, de l'année courante − 1 en descendant.
 * @param {string} dep
 * @param {{ baseUrl?: string, annees?: number, anneeCourante?: number, fetchImpl?: typeof fetch,
 *   timeoutMs?: number, log?: (msg: string) => void }} [opts]
 */
export async function fetchDepartement(dep, opts = {}) {
  const { baseUrl = DEFAULT_BASE_URL, annees = 5, anneeCourante = new Date().getFullYear(), log = console.log } = opts;
  /** @type {Vente[]} */
  const ventes = [];
  const trouvees = [];
  // Au plus deux années de plus que demandé : la plus récente n'est souvent pas encore publiée.
  for (let a = anneeCourante - 1; a >= anneeCourante - annees - 2 && trouvees.length < annees; a--) {
    const url = dvfUrl(baseUrl, a, dep);
    const r = await fetchDvf(url, opts);
    if (!r) {
      log(`  ${dep} ${a} : pas de fichier (404), année ignorée`);
      continue;
    }
    trouvees.push(a);
    ventes.push(...r.ventes);
    log(`  ${dep} ${a} : ${r.stats.lignes} lignes, ${r.stats.mutations} mutations, ${r.stats.ventes} ventes d’un logement`);
  }
  if (!trouvees.length) throw new Error(`Département ${dep} : aucun fichier trouvé`);
  return ventes;
}

/** Écriture atomique d'un JSON compact (fichier temporaire puis renommage). */
async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

/**
 * Programme complet : télécharge, agrège, écrit un fichier par département puis `index.json` (en dernier).
 * @param {{ departements?: string[], outDir: string, optional?: boolean, echantillon?: number,
 *   baseUrl?: string, annees?: number, anneeCourante?: number, fetchImpl?: typeof fetch, timeoutMs?: number,
 *   log?: (msg: string) => void, warn?: (msg: string) => void }} opts
 * @returns {Promise<{ ecrits: string[], echecs: string[] }>}
 */
export async function run(opts) {
  const { departements = DEFAULT_DEPARTEMENTS, outDir, optional = false, echantillon = 3000, log = console.log, warn = console.warn } = opts;
  const bad = departements.filter((d) => !isDepartementCode(d));
  if (bad.length) throw new Error(`Code(s) de département invalide(s) : ${bad.join(', ')}`);
  await fs.mkdir(outDir, { recursive: true });
  const deps = [];
  const echecs = [];
  for (const dep of departements) {
    log(`DVF ${dep} (${nomDepartement(dep)})`);
    try {
      const ventes = await fetchDepartement(dep, { ...opts, log });
      const agg = aggregateDepartement(dep, ventes, { echantillon });
      await writeJson(path.join(outDir, `${dep}.json`), agg);
      log(`  → ${agg.filtres.retenues} ventes retenues, ${agg.communes.length} communes, années ${agg.annees.join(', ')}`);
      deps.push(agg);
    } catch (err) {
      const msg = `Département ${dep} : ${err instanceof Error ? err.message : String(err)}`;
      if (!optional) throw new Error(msg);
      warn(`  ! ${msg}`);
      echecs.push(dep);
    }
  }
  if (!deps.length) throw new Error('Aucune donnée DVF n’a pu être téléchargée.');
  await writeJson(path.join(outDir, 'index.json'), buildIndex(deps, { baseUrl: opts.baseUrl }));
  return { ecrits: deps.map((d) => d.code), echecs };
}

/* ───────────────────────── Ligne de commande ───────────────────────── */

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const env = process.env;
  const optional = env.DVF_OPTIONAL === '1';
  const outDir = path.resolve(env.DVF_OUT ?? path.join(here, '..', '..', 'client', 'public', 'data', 'dvf'));
  const departements = (env.DVF_DEPARTEMENTS ?? DEFAULT_DEPARTEMENTS.join(','))
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const started = Date.now();
  try {
    const { ecrits, echecs } = await run({
      departements,
      outDir,
      optional,
      echantillon: Number(env.DVF_ECHANTILLON ?? 3000),
      annees: Number(env.DVF_ANNEES ?? 5),
      baseUrl: env.DVF_BASE_URL ?? DEFAULT_BASE_URL,
      timeoutMs: Number(env.DVF_TIMEOUT_MS ?? 300_000),
    });
    const s = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`DVF : ${ecrits.length} département(s) écrit(s) dans ${outDir} en ${s} s.`);
    if (echecs.length) console.warn(`DVF : échec pour ${echecs.join(', ')} (voir ci-dessus).`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`DVF : téléchargement impossible — ${msg}`);
    if (optional) {
      console.error('DVF_OPTIONAL=1 : la construction continue ; la démo affichera « Données en préparation ».');
      process.exitCode = 0;
    } else process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
