/**
 * Qualité des données : profil de chaque colonne, doublons, score et nettoyage d'une table CSV.
 * Fonctions pures (le découpage du CSV en cellules est fait par papaparse dans la page) ; tout reste dans le navigateur.
 * Complexité linéaire en nombre de cellules (les quasi-doublons passent par une clé normalisée, jamais par des paires).
 */

/* ───────────── Table ───────────── */

export interface Table {
  header: string[];
  rows: string[][];
  delimiter: string;
}

export interface Structure {
  /** Lignes (index de données) qui n'avaient pas le nombre de colonnes de l'en-tête, complétées ou tronquées. */
  ragged: number[];
  /** En-têtes vides ou répétés, renommés. */
  renamed: { index: number; from: string; to: string }[];
}

export class InputError extends Error {}

const DELIMS = [';', ',', '\t', '|'] as const;

/** Séparateur le plus régulier sur les premières lignes (hors guillemets). */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 25);
  let best: string = ',';
  let bestScore = -1;
  for (const d of DELIMS) {
    const counts = lines.map((l) => {
      let n = 0;
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const regular = counts.filter((c) => c === first).length / counts.length;
    const score = regular * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Première ligne = en-tête ; lignes complétées ou tronquées à sa largeur ; noms vides ou répétés corrigés. */
export function tableFromRows(raw: string[][], delimiter: string): { table: Table; structure: Structure } {
  const rows = raw.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (rows.length < 2) throw new InputError('Il faut au moins une ligne d’en-tête et une ligne de données.');
  const head = rows[0]!.map((h) => String(h ?? '').replace(/^﻿/, ''));
  const renamed: Structure['renamed'] = [];
  const seen = new Map<string, number>();
  const header = head.map((h, i) => {
    let name = h.trim();
    if (!name) {
      name = `colonne_${i + 1}`;
      renamed.push({ index: i, from: h, to: name });
    }
    const k = name.toLowerCase();
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    if (c > 0) {
      const to = `${name}_${c + 1}`;
      renamed.push({ index: i, from: name, to });
      name = to;
    }
    return name;
  });
  const w = header.length;
  const ragged: number[] = [];
  const data = rows.slice(1).map((r, i) => {
    const cells = r.map((c) => String(c ?? ''));
    if (cells.length !== w) {
      ragged.push(i);
      if (cells.length > w) return cells.slice(0, w);
      return [...cells, ...Array<string>(w - cells.length).fill('')];
    }
    return cells;
  });
  return { table: { header, rows: data, delimiter }, structure: { ragged, renamed } };
}

/** Écrit la table en CSV (guillemets seulement si nécessaire). */
export function toCsv(t: Table): string {
  const d = t.delimiter;
  const q = (v: string) => (v.includes(d) || v.includes('"') || /[\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [t.header, ...t.rows].map((r) => r.map(q).join(d)).join('\r\n');
}

/* ───────────── Lecture des valeurs ───────────── */

/** Jetons lus comme « valeur manquante » (insensible à la casse). */
export const NA_TOKENS = new Set(['na', 'n/a', 'n.a.', 'null', 'none', 'nan', '#n/a', '-', '--', '?', 'nd', 'n.d.', 'vide', 'inconnu']);

export const isMissing = (raw: string) => {
  const t = raw.trim().toLowerCase();
  return t === '' || NA_TOKENS.has(t);
};

/** Minuscules, sans accents ni espaces superflus : la clé qui réunit « Lyon », « LYON » et « lyon ». */
export const normalizeText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s  ]+/g, ' ')
    .trim();

/** Espaces en début ou fin de cellule, ou doublés à l'intérieur. */
export const hasStraySpaces = (raw: string) => raw !== raw.trim() || /\s{2,}/.test(raw.trim());

export interface NumParse {
  value: number;
  /** Séparateur décimal écrit dans la cellule (null : entier). */
  dec: '.' | ',' | null;
  /** Écrit avec un symbole (€, %), des espaces de milliers… */
  decorated: boolean;
}

/** Nombre écrit à la française (1 250,50 €) ou à l'anglaise (1,250.50) ; null si ce n'en est pas un. */
export function parseNumber(raw: string): NumParse | null {
  const t = raw.trim();
  if (!t) return null;
  let s = t.replace(/[€$£%]/g, '').replace(/[\s  ]/g, '');
  const decorated = s !== t;
  if (!s) return null;
  let dec: NumParse['dec'] = null;
  if (/^[+-]?\d{1,3}(,\d{3}){2,}(\.\d+)?$/.test(s) || /^[+-]?\d{1,3}(,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, '');
    if (s.includes('.')) dec = '.';
  } else if (/^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^[+-]?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
    if (s.includes('.')) dec = ',';
  } else if (/^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/.test(s)) {
    if (s.includes(',')) {
      dec = ',';
      s = s.replace(',', '.');
    } else if (s.includes('.')) dec = '.';
  } else return null;
  const value = Number(s);
  return Number.isFinite(value) ? { value, dec, decorated } : null;
}

export interface DateParse {
  /** AAAA-MM-JJ (suivi de hh:mm si l'heure est donnée). */
  iso: string;
  /** Format reconnu, par ex. « JJ/MM/AAAA ». */
  fmt: string;
  /** false : forme de date mais jour impossible (31/02/2024). */
  valid: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function mkDate(y: number, m: number, d: number, fmt: string, time?: string): DateParse {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const valid = m >= 1 && m <= 12 && d >= 1 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2100;
  const iso = `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}${time ? ` ${time}` : ''}`;
  return { iso, fmt: time ? `${fmt} hh:mm` : fmt, valid };
}

/** Date dans un des formats courants ; null si la cellule n'a pas une forme de date. */
export function parseDate(raw: string): DateParse | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z?)?$/.exec(s);
  if (m) return mkDate(+m[1]!, +m[2]!, +m[3]!, 'AAAA-MM-JJ', m[4] ? `${pad2(+m[4])}:${m[5]}` : undefined);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return mkDate(+m[1]!, +m[2]!, +m[3]!, 'AAAA/MM/JJ');
  m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?: (\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(s);
  if (m) {
    const a = +m[1]!;
    const b = +m[3]!;
    const sep = m[2]!;
    const time = m[5] ? `${pad2(+m[5])}:${m[6]}` : undefined;
    // Jour en premier par défaut ; mois en premier seulement quand le premier nombre ne peut pas être un jour… de mois.
    if (b > 12 && a <= 12) return mkDate(+m[4]!, a, b, `MM${sep}JJ${sep}AAAA`, time);
    return mkDate(+m[4]!, b, a, `JJ${sep}MM${sep}AAAA`, time);
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
  if (m) {
    const yy = +m[3]!;
    return mkDate(yy < 50 ? 2000 + yy : 1900 + yy, +m[2]!, +m[1]!, 'JJ/MM/AA');
  }
  return null;
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
export const isEmail = (raw: string) => EMAIL.test(raw.trim());

/** Code postal français : 5 chiffres, département 01–95 ou outre-mer (97, 98). */
export function isPostalCode(raw: string): boolean {
  const s = raw.trim();
  if (!/^\d{5}$/.test(s)) return false;
  const dep = +s.slice(0, 2);
  return (dep >= 1 && dep <= 95) || dep === 97 || dep === 98;
}

const BOOL = new Set(['oui', 'non', 'o', 'n', 'true', 'false', 'vrai', 'faux', 'yes', 'no', 'y']);
export const isBoolean = (raw: string) => BOOL.has(normalizeText(raw));

/* ───────────── Types de colonnes ───────────── */

export type ColType = 'integer' | 'decimal' | 'date' | 'boolean' | 'email' | 'postal' | 'category' | 'text' | 'empty';

export const TYPE_LABEL: Record<ColType, string> = {
  integer: 'Entier',
  decimal: 'Décimal',
  date: 'Date',
  boolean: 'Booléen',
  email: 'E-mail',
  postal: 'Code postal',
  category: 'Catégorie',
  text: 'Texte',
  empty: 'Vide',
};

const POSTAL_HINT = /(code[ _-]?postal|^cp$|^cp[ _-]|zip|postcode|postal)/i;
const ID_HINT = /^(id|.*[ _-]id|id[ _-].*|identifiant.*|ref|r[ée]f[ée]rence|num[ée]ro|code[ _-]client)$/i;

/** Type le plus plausible d'après les valeurs renseignées (seuils de part des valeurs conformes). */
export function inferType(values: string[], name: string): { type: ColType; share: number } {
  const n = values.length;
  if (n === 0) return { type: 'empty', share: 1 };
  let email = 0;
  let date = 0;
  let num = 0;
  let int = 0;
  let bool = 0;
  let postalLike = 0;
  let postal = 0;
  for (const v of values) {
    if (isEmail(v) || /@/.test(v)) email++;
    if (parseDate(v)) date++;
    const p = parseNumber(v);
    if (p) {
      num++;
      if (p.dec === null && Number.isInteger(p.value)) int++;
    }
    if (isBoolean(v)) bool++;
    if (/^\s*\d{4,5}\s*$/.test(v)) postalLike++;
    if (isPostalCode(v)) postal++;
  }
  const share = (k: number) => k / n;
  if (share(email) >= 0.6) return { type: 'email', share: share(email) };
  if ((POSTAL_HINT.test(name) && share(postalLike) >= 0.6) || share(postal) >= 0.97) return { type: 'postal', share: share(postalLike) };
  if (share(date) >= 0.6) return { type: 'date', share: share(date) };
  const distinct = new Set(values.map(normalizeText));
  if (share(bool) >= 0.9 && distinct.size <= 6) return { type: 'boolean', share: share(bool) };
  if (share(num) >= 0.8) return { type: int === num ? 'integer' : 'decimal', share: share(num) };
  const avgLen = values.reduce((s, v) => s + v.length, 0) / n;
  const maxCats = Math.max(12, Math.min(60, Math.round(n * 0.05)));
  if (n >= 10 && distinct.size <= maxCats && distinct.size <= n / 2 && avgLen <= 40) return { type: 'category', share: 1 };
  return { type: 'text', share: 1 };
}

/* ───────────── Statistiques ───────────── */

/** Quantile d'un tableau trié (interpolation linéaire, type 7 de Hyndman et Fan, celui de R et NumPy). */
export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

export interface OutlierRule {
  /** mad : médiane ± 3,5 MAD ; mad-log : idem sur le logarithme (montants positifs et asymétriques) ; iqr : repli quand le MAD est nul. */
  method: 'mad' | 'mad-log' | 'iqr' | 'none';
  lo: number;
  hi: number;
}

/** Seuil d'aberration robuste : score z modifié d'Iglewicz et Hoaglin (|z| > 3,5) ; IQR × 3 quand le MAD est nul. */
export const MAD_Z = 3.5;
export const MAD_K = 0.6745;

function linearRule(sorted: number[]): OutlierRule {
  if (sorted.length < 8) return { method: 'none', lo: -Infinity, hi: Infinity };
  const med = quantileSorted(sorted, 0.5);
  const dev = sorted.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  const mad = quantileSorted(dev, 0.5);
  if (mad > 0) {
    const half = (MAD_Z * mad) / MAD_K;
    return { method: 'mad', lo: med - half, hi: med + half };
  }
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr > 0) return { method: 'iqr', lo: q1 - 3 * iqr, hi: q3 + 3 * iqr };
  return { method: 'none', lo: -Infinity, hi: Infinity };
}

/** Asymétrie de Bowley (quartiles) : 0 pour une loi symétrique, positive quand la queue droite s'étire. */
export function bowleySkew(sorted: number[]): number {
  const q1 = quantileSorted(sorted, 0.25);
  const q2 = quantileSorted(sorted, 0.5);
  const q3 = quantileSorted(sorted, 0.75);
  return q3 > q1 ? (q3 + q1 - 2 * q2) / (q3 - q1) : 0;
}

/**
 * Règle d'aberration d'une colonne numérique triée. Un montant (≥ 95 % de valeurs positives, queue droite étirée,
 * étendue de plus d’un facteur 5) est jugé sur son logarithme : sinon chaque grosse vente légitime passerait pour une erreur.
 * Dans ce cas, les valeurs nulles ou négatives tombent sous la borne basse.
 */
export function outlierRule(sorted: number[]): OutlierRule {
  const pos = sorted.filter((v) => v > 0);
  if (pos.length >= 8 && pos.length >= 0.95 * sorted.length && pos[pos.length - 1]! / pos[0]! > 5 && bowleySkew(pos) > 0.15) {
    const r = linearRule(pos.map(Math.log));
    if (r.method === 'mad' || r.method === 'iqr') return { method: 'mad-log', lo: Math.exp(r.lo), hi: Math.exp(r.hi) };
  }
  return linearRule(sorted);
}

/* ───────────── Profil ───────────── */

export type Severity = 'critique' | 'majeur' | 'mineur';
export const SEVERITY_RANK: Record<Severity, number> = { critique: 0, majeur: 1, mineur: 2 };

export type Dimension = 'completude' | 'unicite' | 'validite' | 'coherence';
export const DIMENSIONS: { id: Dimension; label: string; weight: number; help: string }[] = [
  { id: 'completude', label: 'Complétude', weight: 0.3, help: 'lignes sans cellule vide' },
  { id: 'validite', label: 'Validité', weight: 0.3, help: 'lignes sans valeur invalide ni aberrante' },
  { id: 'unicite', label: 'Unicité', weight: 0.2, help: 'lignes qui ne sont pas des doublons' },
  { id: 'coherence', label: 'Cohérence', weight: 0.2, help: 'lignes écrites de façon homogène' },
];

export interface Issue {
  id: string;
  severity: Severity;
  dimension: Dimension | 'structure';
  /** Colonne concernée (index), absente pour un problème de ligne entière. */
  column?: number;
  title: string;
  detail: string;
  /** Nombre de cellules ou de lignes concernées. */
  count: number;
  /** Lignes concernées (index de données, au plus MAX_ROWS). */
  rows: number[];
  /** Quelques valeurs fautives, pour l'aperçu. */
  examples: string[];
}

const MAX_ROWS = 2000;

export interface ColumnProfile {
  index: number;
  name: string;
  type: ColType;
  /** Part des valeurs renseignées conformes au type retenu. */
  share: number;
  n: number;
  missing: number;
  /** Jetons « NA », « null »… comptés comme manquants. */
  naTokens: number;
  distinct: number;
  top: { value: string; count: number }[];
  idLike: boolean;
  invalid: number;
  outliers: number;
  /** Cellules écrites autrement que la forme dominante (format de date, casse, séparateur décimal). */
  inconsistent: number;
  straySpaces: number;
  numeric?: {
    min: number;
    max: number;
    median: number;
    mean: number;
    q1: number;
    q3: number;
    rule: OutlierRule;
    /** Histogramme sur l'étendue des valeurs non aberrantes. */
    bins: number[];
    binLo: number;
    binHi: number;
    /** Histogramme tracé en échelle logarithmique. */
    binLog: boolean;
    decimals: { '.': number; ',': number };
    decorated: number;
  };
  dates?: { formats: { fmt: string; count: number }[]; min: string; max: string };
  /** Écritures différentes d'une même valeur (catégories). */
  variants?: { canonical: string; forms: { value: string; count: number }[] }[];
}

export interface Profile {
  rows: number;
  cols: number;
  cells: number;
  missingCells: number;
  invalidCells: number;
  outlierCells: number;
  inconsistentCells: number;
  columns: ColumnProfile[];
  exactDuplicates: number[];
  nearDuplicates: number[];
  /** Pour chaque ligne en double : la première occurrence. */
  duplicateOf: Map<number, number>;
  scores: Record<Dimension, number>;
  score: number;
  issues: Issue[];
}

function topValues(values: string[], k: number) {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([value, count]) => ({ value, count }));
}

const capRows = (r: number[]) => (r.length > MAX_ROWS ? r.slice(0, MAX_ROWS) : r);
const uniqExamples = (vals: string[], k = 4) => [...new Set(vals)].slice(0, k);
const pctTxt = (x: number) => `${(100 * x).toFixed(x < 0.1 ? 1 : 0).replace('.', ',')} %`;

/** Profil complet d'une table : une passe par colonne, une passe pour les doublons. */
export function profileTable(t: Table, structure: Structure = { ragged: [], renamed: [] }): Profile {
  const nRows = t.rows.length;
  const issues: Issue[] = [];
  const columns: ColumnProfile[] = [];
  let missingCells = 0;
  let invalidCells = 0;
  let outlierCells = 0;
  let inconsistentCells = 0;
  /** Défauts de chaque ligne : 1 = cellule manquante, 2 = invalide ou aberrante, 4 = écriture incohérente. */
  const flags = new Uint8Array(nRows);
  const mark = (rows: number[], bit: number) => {
    for (const r of rows) flags[r]! |= bit;
  };

  t.header.forEach((name, j) => {
    const present: { row: number; raw: string }[] = [];
    const missingRows: number[] = [];
    let naTokens = 0;
    for (let i = 0; i < nRows; i++) {
      const raw = t.rows[i]![j] ?? '';
      if (isMissing(raw)) {
        missingRows.push(i);
        if (raw.trim() !== '') naTokens++;
      } else present.push({ row: i, raw });
    }
    const values = present.map((p) => p.raw.trim());
    const { type, share } = inferType(values, name);
    const distinctSet = new Set(values);
    const col: ColumnProfile = {
      index: j,
      name,
      type,
      share,
      n: nRows,
      missing: missingRows.length,
      naTokens,
      distinct: distinctSet.size,
      top: topValues(values, 5),
      idLike: false,
      invalid: 0,
      outliers: 0,
      inconsistent: 0,
      straySpaces: 0,
    };
    missingCells += missingRows.length;
    mark(missingRows, 1);

    // Valeurs invalides pour le type retenu.
    const invalidRows: number[] = [];
    const invalidVals: string[] = [];
    const lostZeroRows: number[] = [];
    const lostZeroVals: string[] = [];
    const check = (ok: boolean, p: { row: number; raw: string }) => {
      if (!ok) {
        invalidRows.push(p.row);
        invalidVals.push(p.raw.trim());
      }
    };
    if (type === 'email') present.forEach((p) => check(isEmail(p.raw), p));
    if (type === 'postal')
      present.forEach((p) => {
        const s = p.raw.trim();
        if (/^\d{4}$/.test(s) && isPostalCode(`0${s}`)) {
          lostZeroRows.push(p.row);
          lostZeroVals.push(s);
        } else check(isPostalCode(s), p);
      });
    if (type === 'boolean') present.forEach((p) => check(isBoolean(p.raw), p));

    // Dates : formats, dates impossibles, étendue.
    if (type === 'date') {
      const fm = new Map<string, number>();
      const fmRows = new Map<string, number[]>();
      let min = '';
      let max = '';
      for (const p of present) {
        const d = parseDate(p.raw);
        if (!d || !d.valid) {
          check(false, p);
          continue;
        }
        fm.set(d.fmt, (fm.get(d.fmt) ?? 0) + 1);
        const arr = fmRows.get(d.fmt) ?? [];
        arr.push(p.row);
        fmRows.set(d.fmt, arr);
        if (!min || d.iso < min) min = d.iso;
        if (!max || d.iso > max) max = d.iso;
      }
      const formats = [...fm.entries()].sort((a, b) => b[1] - a[1]).map(([fmt, count]) => ({ fmt, count }));
      col.dates = { formats, min, max };
      if (formats.length > 1) {
        const dominant = formats[0]!.fmt;
        const minority = formats.slice(1);
        const cnt = minority.reduce((s, f) => s + f.count, 0);
        col.inconsistent += cnt;
        const rows = minority.flatMap((f) => fmRows.get(f.fmt) ?? []).sort((a, b) => a - b);
        mark(rows, 4);
        issues.push({
          id: `fmt-${j}`,
          severity: cnt / Math.max(1, present.length) > 0.02 ? 'majeur' : 'mineur',
          dimension: 'coherence',
          column: j,
          title: `Dates écrites dans ${formats.length} formats`,
          detail: `Format dominant ${dominant} ; ${minority.map((f) => `${f.fmt} (${f.count})`).join(', ')}. Un tri ou un filtre par date sera faux tant que les formats sont mélangés.`,
          count: cnt,
          rows: capRows(rows),
          examples: uniqExamples(rows.slice(0, 20).map((r) => t.rows[r]![j]!.trim())),
        });
      }
    }

    // Nombres : statistiques, séparateur décimal, aberrations.
    if (type === 'integer' || type === 'decimal') {
      const nums: { row: number; v: number; raw: string }[] = [];
      const decimals = { '.': 0, ',': 0 };
      const decRows: { '.': number[]; ',': number[] } = { '.': [], ',': [] };
      let decorated = 0;
      for (const p of present) {
        const r = parseNumber(p.raw);
        if (!r) {
          check(false, p);
          continue;
        }
        nums.push({ row: p.row, v: r.value, raw: p.raw.trim() });
        if (r.dec) {
          decimals[r.dec]++;
          decRows[r.dec].push(p.row);
        }
        if (r.decorated) decorated++;
      }
      const sorted = nums.map((x) => x.v).sort((a, b) => a - b);
      const strictlyIncreasing = nums.every((x, k) => k === 0 || x.v > nums[k - 1]!.v);
      col.idLike = type === 'integer' && (ID_HINT.test(name) || (strictlyIncreasing && distinctSet.size === nums.length && nums.length > 10));
      const rule: OutlierRule = col.idLike ? { method: 'none', lo: -Infinity, hi: Infinity } : outlierRule(sorted);
      const out = nums.filter((x) => x.v < rule.lo || x.v > rule.hi);
      const inRange = sorted.filter((v) => v >= rule.lo && v <= rule.hi);
      const binLo = inRange[0] ?? 0;
      const binHi = inRange[inRange.length - 1] ?? 0;
      const NB = 18;
      const bins = Array<number>(NB).fill(0);
      // Montants jugés sur le logarithme : histogramme en échelle logarithmique aussi.
      const binLog = rule.method === 'mad-log' && binLo > 0;
      const tr = binLog ? Math.log : (v: number) => v;
      const a = tr(binLo);
      const b = tr(binHi);
      for (const v of inRange) {
        const k = b > a ? Math.min(NB - 1, Math.floor(((tr(v) - a) / (b - a)) * NB)) : 0;
        bins[k]!++;
      }
      col.numeric = {
        min: sorted[0] ?? NaN,
        max: sorted[sorted.length - 1] ?? NaN,
        median: quantileSorted(sorted, 0.5),
        mean: sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length),
        q1: quantileSorted(sorted, 0.25),
        q3: quantileSorted(sorted, 0.75),
        rule,
        bins,
        binLo,
        binHi,
        binLog,
        decimals,
        decorated,
      };
      col.outliers = out.length;
      outlierCells += out.length;
      mark(out.map((x) => x.row), 2);
      if (out.length) {
        const ext = [...out].sort((a, b) => Math.abs(b.v - col.numeric!.median) - Math.abs(a.v - col.numeric!.median));
        issues.push({
          id: `out-${j}`,
          severity: out.length / nums.length > 0.01 ? 'majeur' : 'mineur',
          dimension: 'validite',
          column: j,
          title: `${out.length} valeur${out.length > 1 ? 's' : ''} aberrante${out.length > 1 ? 's' : ''}`,
          detail: `Hors de l’intervalle ${fmt(rule.lo)} – ${fmt(rule.hi)} (${RULE_LABEL[rule.method]}). À vérifier : erreur de saisie, d’unité, ou vrai cas extrême.`,
          count: out.length,
          rows: capRows(out.map((x) => x.row).sort((a, b) => a - b)),
          examples: uniqExamples(ext.map((x) => x.raw)),
        });
      }
      if (decimals['.'] > 0 && decimals[','] > 0) {
        const minor: '.' | ',' = decimals['.'] >= decimals[','] ? ',' : '.';
        const cnt = decimals[minor];
        col.inconsistent += cnt;
        mark(decRows[minor], 4);
        issues.push({
          id: `dec-${j}`,
          severity: 'majeur',
          dimension: 'coherence',
          column: j,
          title: 'Séparateur décimal mélangé',
          detail: `${decimals[',']} valeur${decimals[','] > 1 ? 's' : ''} avec une virgule, ${decimals['.']} avec un point. Un tableur lira une partie de la colonne comme du texte.`,
          count: cnt,
          rows: capRows(decRows[minor]),
          examples: uniqExamples(decRows[minor].slice(0, 20).map((r) => t.rows[r]![j]!.trim())),
        });
      }
    }

    // Catégories : plusieurs écritures d'une même valeur.
    if (type === 'category' || type === 'boolean') {
      const groups = new Map<string, Map<string, number>>();
      // Écriture = valeur sans espaces parasites (ceux-là sont comptés à part) ; clé = sans casse ni accents.
      const form = (raw: string) => raw.trim().replace(/\s{2,}/g, ' ');
      for (const p of present) {
        const key = normalizeText(p.raw);
        const g = groups.get(key) ?? new Map<string, number>();
        const f = form(p.raw);
        g.set(f, (g.get(f) ?? 0) + 1);
        groups.set(key, g);
      }
      const variants: NonNullable<ColumnProfile['variants']> = [];
      const variantRows: number[] = [];
      for (const g of groups.values()) {
        if (g.size < 2) continue;
        const forms = [...g.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
        variants.push({ canonical: forms[0]!.value, forms });
        const minorForms = new Set(forms.slice(1).map((f) => f.value));
        const key = normalizeText(forms[0]!.value);
        for (const p of present) if (minorForms.has(form(p.raw)) && normalizeText(p.raw) === key) variantRows.push(p.row);
      }
      if (variants.length) {
        variants.sort((a, b) => b.forms.length - a.forms.length);
        col.variants = variants;
        const cnt = variantRows.length;
        col.inconsistent += cnt;
        mark(variantRows, 4);
        issues.push({
          id: `var-${j}`,
          severity: cnt / Math.max(1, present.length) > 0.03 ? 'majeur' : 'mineur',
          dimension: 'coherence',
          column: j,
          title: `${variants.length} valeur${variants.length > 1 ? 's' : ''} écrite${variants.length > 1 ? 's' : ''} de plusieurs façons`,
          detail: `Par exemple ${variants[0]!.forms
            .slice(0, 3)
            .map((f) => `« ${f.value} »`)
            .join(', ')} : un regroupement compterait ${variants[0]!.forms.length} catégories au lieu d’une.`,
          count: cnt,
          rows: capRows(variantRows.sort((a, b) => a - b)),
          examples: uniqExamples(variantRows.slice(0, 30).map((r) => t.rows[r]![j]!)),
        });
      }
    }

    // Espaces parasites (toutes colonnes).
    const spaceRows = present.filter((p) => hasStraySpaces(p.raw)).map((p) => p.row);
    col.straySpaces = spaceRows.length;
    mark(spaceRows, 4);
    if (spaceRows.length) {
      issues.push({
        id: `sp-${j}`,
        severity: 'mineur',
        dimension: 'coherence',
        column: j,
        title: 'Espaces en trop',
        detail: 'Espaces en début, en fin ou doublés : « Lyon » et « Lyon␠» ne se rejoignent pas dans une jointure.',
        count: spaceRows.length,
        rows: capRows(spaceRows),
        examples: uniqExamples(spaceRows.slice(0, 20).map((r) => `«${t.rows[r]![j]!}»`)),
      });
    }

    col.invalid = invalidRows.length + lostZeroRows.length;
    invalidCells += col.invalid;
    mark(invalidRows, 2);
    mark(lostZeroRows, 2);
    if (lostZeroRows.length) {
      issues.push({
        id: `zero-${j}`,
        severity: 'majeur',
        dimension: 'validite',
        column: j,
        title: 'Codes postaux à 4 chiffres',
        detail: 'Le zéro initial a été perdu (classique après un passage par Excel) : 1000 est en réalité 01000.',
        count: lostZeroRows.length,
        rows: capRows(lostZeroRows),
        examples: uniqExamples(lostZeroVals),
      });
    }
    if (invalidRows.length) {
      const rate = invalidRows.length / Math.max(1, present.length);
      issues.push({
        id: `inv-${j}`,
        severity: rate >= 0.2 ? 'critique' : rate > 0.02 ? 'majeur' : 'mineur',
        dimension: 'validite',
        column: j,
        title: `${invalidRows.length} valeur${invalidRows.length > 1 ? 's' : ''} invalide${invalidRows.length > 1 ? 's' : ''} (${TYPE_LABEL[type].toLowerCase()})`,
        detail: INVALID_HINT[type] ?? 'Valeurs qui ne correspondent pas au type du reste de la colonne.',
        count: invalidRows.length,
        rows: capRows(invalidRows),
        examples: uniqExamples(invalidVals),
      });
    }

    if (missingRows.length) {
      const rate = missingRows.length / Math.max(1, nRows);
      issues.push({
        id: `na-${j}`,
        severity: rate > 0.3 ? 'critique' : rate > 0.05 ? 'majeur' : 'mineur',
        dimension: 'completude',
        column: j,
        title: `${pctTxt(rate)} de valeurs manquantes`,
        detail:
          naTokens > 0
            ? `${missingRows.length - naTokens} cellule${missingRows.length - naTokens > 1 ? 's' : ''} vide${missingRows.length - naTokens > 1 ? 's' : ''} et ${naTokens} marquée${naTokens > 1 ? 's' : ''} « NA », « null »… (lues comme manquantes).`
            : `${missingRows.length} cellule${missingRows.length > 1 ? 's' : ''} vide${missingRows.length > 1 ? 's' : ''}.`,
        count: missingRows.length,
        rows: capRows(missingRows),
        examples: [],
      });
    }

    inconsistentCells += col.inconsistent + col.straySpaces;
    columns.push(col);
  });

  // Doublons : clé brute (exacts), clé normalisée hors identifiants (quasi-doublons).
  const exactSeen = new Map<string, number>();
  const nearSeen = new Map<string, number>();
  const exactDuplicates: number[] = [];
  const nearDuplicates: number[] = [];
  const duplicateOf = new Map<number, number>();
  const keyCols = columns.filter((c) => !c.idLike && c.type !== 'empty').map((c) => c.index);
  const normCell = (raw: string) => {
    if (isMissing(raw)) return '';
    const d = parseDate(raw);
    if (d && d.valid) return d.iso;
    const nmb = parseNumber(raw);
    if (nmb) return String(nmb.value);
    return normalizeText(raw);
  };
  for (let i = 0; i < nRows; i++) {
    const row = t.rows[i]!;
    const ek = row.join('\u0001');
    const firstExact = exactSeen.get(ek);
    if (firstExact !== undefined) {
      exactDuplicates.push(i);
      duplicateOf.set(i, firstExact);
      continue;
    }
    exactSeen.set(ek, i);
    const nk = keyCols.map((j) => normCell(row[j] ?? '')).join('\u0001');
    if (nk.replace(/\u0001/g, '') === '') continue;
    const firstNear = nearSeen.get(nk);
    if (firstNear !== undefined) {
      nearDuplicates.push(i);
      duplicateOf.set(i, firstNear);
    } else nearSeen.set(nk, i);
  }
  if (exactDuplicates.length)
    issues.push({
      id: 'dup-exact',
      severity: exactDuplicates.length / nRows > 0.02 ? 'critique' : 'majeur',
      dimension: 'unicite',
      title: `${exactDuplicates.length} ligne${exactDuplicates.length > 1 ? 's' : ''} en double exact`,
      detail: 'Copies identiques d’une ligne précédente, souvent un import lancé deux fois : elles gonflent tous les totaux.',
      count: exactDuplicates.length,
      rows: capRows(exactDuplicates),
      examples: [],
    });
  if (nearDuplicates.length)
    issues.push({
      id: 'dup-near',
      severity: nearDuplicates.length / nRows > 0.02 ? 'critique' : 'majeur',
      dimension: 'unicite',
      title: `${nearDuplicates.length} quasi-doublon${nearDuplicates.length > 1 ? 's' : ''}`,
      detail: `Identiques à une ligne précédente une fois la casse, les accents, les espaces et les formats normalisés${
        columns.some((c) => c.idLike) ? `, l’identifiant (${columns.filter((c) => c.idLike).map((c) => c.name).join(', ')}) mis à part` : ''
      } : la même entité saisie deux fois.`,
      count: nearDuplicates.length,
      rows: capRows(nearDuplicates),
      examples: [],
    });
  if (structure.ragged.length)
    issues.push({
      id: 'ragged',
      severity: 'majeur',
      dimension: 'structure',
      title: `${structure.ragged.length} ligne${structure.ragged.length > 1 ? 's' : ''} au mauvais nombre de colonnes`,
      detail: 'Complétées ou tronquées pour l’analyse : un séparateur dans une cellule non protégée par des guillemets, le plus souvent.',
      count: structure.ragged.length,
      rows: capRows(structure.ragged),
      examples: [],
    });
  if (structure.renamed.length)
    issues.push({
      id: 'header',
      severity: 'mineur',
      dimension: 'structure',
      title: 'En-têtes vides ou répétés',
      detail: structure.renamed.map((r) => `« ${r.from || '(vide)'} » → ${r.to}`).join(', '),
      count: structure.renamed.length,
      rows: [],
      examples: [],
    });

  const cells = nRows * t.header.length;
  // Scores au niveau de la ligne : part des lignes sans aucun défaut de la dimension (une ligne vaut ce que vaut sa pire cellule).
  const clean = [0, 0, 0];
  for (let i = 0; i < nRows; i++) {
    const f = flags[i]!;
    if (!(f & 1)) clean[0]!++;
    if (!(f & 2)) clean[1]!++;
    if (!(f & 4)) clean[2]!++;
  }
  const N = Math.max(1, nRows);
  const scores: Record<Dimension, number> = {
    completude: (100 * clean[0]!) / N,
    validite: (100 * clean[1]!) / N,
    unicite: 100 * (1 - (exactDuplicates.length + nearDuplicates.length) / N),
    coherence: (100 * clean[2]!) / N,
  };
  const score = DIMENSIONS.reduce((s, d) => s + d.weight * scores[d.id], 0);
  issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);

  return {
    rows: nRows,
    cols: t.header.length,
    cells,
    missingCells,
    invalidCells,
    outlierCells,
    inconsistentCells,
    columns,
    exactDuplicates,
    nearDuplicates,
    duplicateOf,
    scores,
    score,
    issues,
  };
}

export const RULE_LABEL: Record<OutlierRule['method'], string> = {
  mad: 'médiane ± 3,5 écarts absolus médians',
  'mad-log': 'même règle sur le logarithme, colonne de montants asymétrique',
  iqr: 'quartiles ± 3 écarts interquartiles',
  none: 'aucune règle',
};

const INVALID_HINT: Partial<Record<ColType, string>> = {
  email: 'Adresses sans @, avec une virgule ou un espace, ou sans domaine : les envois échoueront.',
  postal: 'Pas 5 chiffres, ou département inexistant.',
  date: 'Dates impossibles (31 février…) ou illisibles au milieu de dates valides.',
  integer: 'Texte au milieu de nombres : la colonne ne pourra pas être additionnée telle quelle.',
  decimal: 'Texte au milieu de nombres : la colonne ne pourra pas être additionnée telle quelle.',
  boolean: 'Autre chose que oui / non.',
};

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return nf.format(v).replace(/ /g, ' ');
}

/** Note lisible d'un score sur 100. */
export function grade(score: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 90) return { label: 'Exploitable en l’état', tone: 'good' };
  if (score >= 75) return { label: 'À fiabiliser avant usage', tone: 'warn' };
  return { label: 'Fragile : corrections nécessaires', tone: 'bad' };
}

/* ───────────── Nettoyage ───────────── */

export interface CleanOptions {
  /** Espaces en début et fin supprimés, espaces doublés réduits. */
  trim: boolean;
  /** « NA », « null »… remplacés par une cellule vide. */
  na: boolean;
  /** Catégories : chaque variante remplacée par l'écriture la plus fréquente. */
  categories: boolean;
  /** Dates converties au format ISO AAAA-MM-JJ. */
  dates: boolean;
  /** Nombres : séparateur décimal dominant, sans symbole ni espace de milliers. */
  numbers: boolean;
  /** Codes postaux à 4 chiffres complétés par le zéro initial. */
  postal: boolean;
  /** Lignes identiques (après les corrections ci-dessus) supprimées. */
  dropExact: boolean;
}

export const DEFAULT_CLEAN: CleanOptions = { trim: true, na: true, categories: true, dates: true, numbers: true, postal: true, dropExact: true };

export type CleanOp = Exclude<keyof CleanOptions, 'dropExact'>;

export interface CleanResult {
  table: Table;
  /** Cellules modifiées par opération. */
  changes: Record<CleanOp, number>;
  changedCells: number;
  removedRows: number;
  /** Lignes modifiées : index d'origine, avant / après, colonnes touchées. */
  preview: { row: number; before: string[]; after: string[]; changed: boolean[] }[];
}

export function cleanTable(t: Table, p: Profile, opt: CleanOptions, previewSize = 12): CleanResult {
  const changes: Record<CleanOp, number> = { trim: 0, na: 0, categories: 0, dates: 0, numbers: 0, postal: 0 };
  // Forme canonique de chaque catégorie : l'écriture la plus fréquente, sans espaces parasites.
  const canon = new Map<number, Map<string, string>>();
  for (const c of p.columns) {
    if (c.type !== 'category' && c.type !== 'boolean') continue;
    const counts = new Map<string, Map<string, number>>();
    for (const r of t.rows) {
      const raw = r[c.index] ?? '';
      if (isMissing(raw)) continue;
      const k = normalizeText(raw);
      const form = raw.trim().replace(/\s{2,}/g, ' ');
      const g = counts.get(k) ?? new Map<string, number>();
      g.set(form, (g.get(form) ?? 0) + 1);
      counts.set(k, g);
    }
    const m = new Map<string, string>();
    for (const [k, g] of counts) m.set(k, [...g.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]);
    canon.set(c.index, m);
  }
  const decTarget = new Map<number, '.' | ','>();
  for (const c of p.columns) if (c.numeric) decTarget.set(c.index, c.numeric.decimals[','] > c.numeric.decimals['.'] ? ',' : '.');

  const rows: string[][] = [];
  const preview: CleanResult['preview'] = [];
  let changedCells = 0;
  const seen = new Set<string>();
  let removedRows = 0;
  t.rows.forEach((row, i) => {
    const after = row.map((raw, j) => {
      const col = p.columns[j]!;
      let v = raw;
      const apply = (op: CleanOp, next: string) => {
        if (next !== v) {
          changes[op]++;
          v = next;
        }
      };
      if (opt.trim) apply('trim', v.trim().replace(/[ \t ]{2,}/g, ' '));
      if (opt.na && isMissing(v) && v.trim() !== '') apply('na', '');
      if (isMissing(v)) return v;
      if (opt.categories && canon.has(j)) apply('categories', canon.get(j)!.get(normalizeText(v)) ?? v);
      if (opt.dates && col.type === 'date') {
        const d = parseDate(v);
        if (d && d.valid) apply('dates', d.iso);
      }
      if (opt.numbers && col.numeric) {
        const n = parseNumber(v);
        if (n && (n.decorated || (n.dec !== null && n.dec !== decTarget.get(j)))) {
          const s = String(n.value);
          apply('numbers', decTarget.get(j) === ',' ? s.replace('.', ',') : s);
        }
      }
      if (opt.postal && col.type === 'postal' && /^\d{4}$/.test(v.trim()) && isPostalCode(`0${v.trim()}`)) apply('postal', `0${v.trim()}`);
      return v;
    });
    const changed = after.map((v, j) => v !== row[j]);
    const nChanged = changed.filter(Boolean).length;
    if (opt.dropExact) {
      const k = after.join('\u0001');
      if (seen.has(k)) {
        removedRows++;
        return;
      }
      seen.add(k);
    }
    changedCells += nChanged;
    if (nChanged && preview.length < previewSize) preview.push({ row: i, before: row, after, changed });
    rows.push(after);
  });
  return { table: { header: t.header, rows, delimiter: t.delimiter }, changes, changedCells, removedRows, preview };
}

/* ───────────── Aléa à graine (exemples) ───────────── */

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
