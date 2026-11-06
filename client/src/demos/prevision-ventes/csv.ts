/**
 * Lecture d'un historique de ventes : séparateur, décimale, format de date, colonnes, agrégation.
 * Fonctions pures (le découpage en lignes est fait par papaparse dans la page) ; tout reste dans le navigateur.
 */

/* ───────────── Périodes ───────────── */

export type Freq = 'day' | 'week' | 'month';

export const FREQ_LABEL: Record<Freq, string> = { day: 'Jour', week: 'Semaine', month: 'Mois' };
export const SEASON_LENGTH: Record<Freq, number> = { day: 7, week: 52, month: 12 };
const FREQ_RANK: Record<Freq, number> = { day: 0, week: 1, month: 2 };

/** Jour (nombre de jours depuis le 1er janvier 1970, UTC). */
export const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
export const dayToDate = (day: number) => new Date(day * 86400000);

/** Indice de période : jour → jour ; semaine → semaines depuis le lundi 29/12/1969 ; mois → 12 × année + mois. */
export function periodOf(day: number, freq: Freq): number {
  if (freq === 'day') return day;
  if (freq === 'week') return Math.floor((day + 3) / 7);
  const d = dayToDate(day);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Premier jour d'une période. */
export function periodStartDay(p: number, freq: Freq): number {
  if (freq === 'day') return p;
  if (freq === 'week') return p * 7 - 3;
  return dayNumber(Math.floor(p / 12), (p % 12) + 1, 1);
}

/** Nombre de jours couverts par une période. */
export function periodLength(p: number, freq: Freq): number {
  if (freq === 'day') return 1;
  if (freq === 'week') return 7;
  return periodStartDay(p + 1, freq) - periodStartDay(p, freq);
}

export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** Jour de la semaine, lundi = 0. */
export const weekday = (day: number) => (((day + 3) % 7) + 7) % 7;

/** Numéro de semaine ISO 8601 du jour donné. */
export function isoWeek(day: number): number {
  const thursday = day - weekday(day) + 3;
  const d = dayToDate(thursday);
  const jan1 = dayNumber(d.getUTCFullYear(), 1, 1);
  return Math.floor((thursday - jan1) / 7) + 1;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date JJ/MM/AAAA. */
export function formatDay(day: number): string {
  const d = dayToDate(day);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Libellé d'une période : « déc. 2025 », « sem. du 17/11/2025 », « sam. 06/12/2025 ». */
export function formatPeriod(p: number, freq: Freq, style: 'short' | 'long' = 'short'): string {
  if (freq === 'month') return `${(style === 'long' ? MONTHS_LONG : MONTHS_SHORT)[p % 12]} ${Math.floor(p / 12)}`;
  const day = periodStartDay(p, freq);
  if (freq === 'week') return style === 'long' ? `semaine du ${formatDay(day)}` : `sem. ${formatDay(day)}`;
  return `${(style === 'long' ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[weekday(day)]} ${formatDay(day)}`;
}

/** Date ISO (AAAA-MM-JJ) du début d'une période, pour l'export. */
export function isoDate(p: number, freq: Freq): string {
  const d = dayToDate(periodStartDay(p, freq));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/* ───────────── Séparateur, nombres ───────────── */

const DELIMS = [';', ',', '\t', '|'] as const;

/** Séparateur le plus régulier sur les premières lignes (hors guillemets) ; « ; » en cas d'égalité. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 25);
  let best: string = ';';
  let bestScore = -1;
  for (const d of DELIMS) {
    const counts = lines.map((l) => l.replace(/"[^"]*"/g, '').split(d).length - 1);
    if (!counts.length || counts[0] === 0) continue;
    const same = counts.filter((c) => c === counts[0]).length / counts.length;
    const score = same * 10 + Math.min(counts[0], 5) * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

const clean = (s: string) => s.replace(/[\s  ']/g, '').replace(/[€$£%]/g, '').replace(/^\((.*)\)$/, '-$1').replace(/[−–]/g, '-');

/** Lit un nombre au format français (1 234,56) ou anglais (1,234.56) selon le séparateur décimal. */
export function parseNumber(raw: string, decimal: ',' | '.'): number | null {
  let s = clean(raw.trim());
  if (!s || !/^[+-]?[\d.,]+(e[+-]?\d+)?$/i.test(s)) return null;
  s = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Séparateur décimal d'une colonne : indices dans les valeurs, sinon déduit du séparateur de champs. */
export function detectDecimal(values: readonly string[], delimiter: string): ',' | '.' {
  let comma = 0;
  let dot = 0;
  for (const raw of values.slice(0, 500)) {
    const s = clean(raw.trim());
    const lc = s.lastIndexOf(',');
    const ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) {
      if (lc > ld) comma++;
      else dot++;
    } else if (lc >= 0) {
      if (!/^\d{1,3}(,\d{3})+$/.test(s.replace(/^[+-]/, ''))) comma++;
    } else if (ld >= 0) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s.replace(/^[+-]/, ''))) dot++;
    }
  }
  if (comma !== dot) return comma > dot ? ',' : '.';
  return delimiter === ';' ? ',' : '.';
}

/* ───────────── Dates ───────────── */

export type DateFormat = 'iso' | 'dmy' | 'mdy' | 'ym' | 'my' | 'monthname';

export const DATE_FORMAT_LABEL: Record<DateFormat, string> = {
  iso: 'AAAA-MM-JJ',
  dmy: 'JJ/MM/AAAA',
  mdy: 'MM/JJ/AAAA',
  ym: 'AAAA-MM',
  my: 'MM/AAAA',
  monthname: 'mois en lettres',
};

const MONTH_WORDS: [RegExp, number][] = [
  [/^(janv?|janvier|jan|january)$/, 1],
  [/^(f[ée]vr?|f[ée]vrier|feb|february)$/, 2],
  [/^(mars|mar|march)$/, 3],
  [/^(avr|avril|apr|april)$/, 4],
  [/^(mai|may)$/, 5],
  [/^(juin|jun|june)$/, 6],
  [/^(juil|juillet|jul|july)$/, 7],
  [/^(ao[uû]t?|aug|august)$/, 8],
  [/^(sept?|septembre|september)$/, 9],
  [/^(oct|octobre|october)$/, 10],
  [/^(nov|novembre|november)$/, 11],
  [/^(d[ée]c|d[ée]cembre|dec|december)$/, 12],
];

const year4 = (y: string) => {
  const v = Number(y);
  return y.length === 2 ? (v < 70 ? 2000 + v : 1900 + v) : v;
};

function valid(y: number, m: number, d: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const day = dayNumber(y, m, d);
  const back = dayToDate(day);
  return back.getUTCMonth() + 1 === m && back.getUTCDate() === d ? day : null;
}

/** Lit une date selon un format ; renvoie le numéro de jour (UTC) ou null. Les heures éventuelles sont ignorées. */
export function parseDate(raw: string, fmt: DateFormat): number | null {
  const s = raw.trim().toLowerCase();
  let r: RegExpMatchArray | null;
  switch (fmt) {
    case 'iso':
      r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t ].*)?$/);
      return r ? valid(+r[1], +r[2], +r[3]) : null;
    case 'dmy':
    case 'mdy':
      r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:[t ].*)?$/);
      if (!r) return null;
      return fmt === 'dmy' ? valid(year4(r[3]), +r[2], +r[1]) : valid(year4(r[3]), +r[1], +r[2]);
    case 'ym':
      r = s.match(/^(\d{4})(?:[-/.]|m)(\d{1,2})$/);
      return r ? valid(+r[1], +r[2], 1) : null;
    case 'my':
      r = s.match(/^(\d{1,2})[-/.](\d{4})$/);
      return r ? valid(+r[2], +r[1], 1) : null;
    case 'monthname': {
      r = s.match(/^([a-zéèûô]+)\.?[\s\-/]*(\d{4}|\d{2})$/);
      if (!r) return null;
      const word = r[1];
      const month = MONTH_WORDS.find(([re]) => re.test(word))?.[1];
      return month ? valid(year4(r[2]), month, 1) : null;
    }
  }
}

const FORMAT_ORDER: DateFormat[] = ['iso', 'dmy', 'mdy', 'ym', 'my', 'monthname'];

/** Format de date qui lit le plus de valeurs ; à égalité JJ/MM passe avant MM/JJ (usage français). */
export function detectDateFormat(values: readonly string[]): { format: DateFormat; rate: number; ambiguous: boolean } {
  const sample = values.filter((v) => v.trim()).slice(0, 500);
  let best: { format: DateFormat; rate: number } = { format: 'iso', rate: 0 };
  const rates: Partial<Record<DateFormat, number>> = {};
  for (const f of FORMAT_ORDER) {
    const ok = sample.filter((v) => parseDate(v, f) !== null).length;
    const rate = sample.length ? ok / sample.length : 0;
    rates[f] = rate;
    if (rate > best.rate) best = { format: f, rate };
  }
  const ambiguous = best.format === 'dmy' && (rates.mdy ?? 0) === best.rate;
  return { ...best, ambiguous };
}

/* ───────────── Colonnes ───────────── */

export interface ColumnGuess {
  hasHeader: boolean;
  names: string[];
  dateCol: number;
  valueCol: number;
  /** Colonnes numériques proposées pour la valeur. */
  numericCols: number[];
  dateCols: number[];
}

const VALUE_HINT = /vente|chiffre|\bca\b|montant|total|quantit|\bqt|volume|commande|sales|revenue|amount|valeur|value|unit/i;

/** Repère la colonne de dates et la colonne de valeurs (≥ 80 % des valeurs lisibles), et la ligne d'en-tête. */
export function guessColumns(rows: readonly string[][], delimiter: string): ColumnGuess | null {
  if (!rows.length) return null;
  const width = Math.max(...rows.slice(0, 50).map((r) => r.length));
  const body = rows.slice(1, 400);
  const col = (j: number) => body.map((r) => r[j] ?? '').filter((v) => v.trim() !== '');
  const dateCols: number[] = [];
  const numericCols: number[] = [];
  const dateRates: number[] = [];
  for (let j = 0; j < width; j++) {
    const vals = col(j);
    if (!vals.length) {
      dateRates.push(0);
      continue;
    }
    const d = detectDateFormat(vals);
    dateRates.push(d.rate);
    if (d.rate >= 0.8) dateCols.push(j);
    const dec = detectDecimal(vals, delimiter);
    const numRate = vals.filter((v) => parseNumber(v, dec) !== null).length / vals.length;
    if (numRate >= 0.8 && d.rate < 0.8) numericCols.push(j);
  }
  if (!dateCols.length && !numericCols.length) return { hasHeader: true, names: rows[0].map((n, j) => n || `Colonne ${j + 1}`), dateCol: -1, valueCol: -1, numericCols, dateCols };
  const dateCol = dateCols.length ? dateCols.reduce((a, b) => (dateRates[b] > dateRates[a] ? b : a)) : -1;
  const first = rows[0];
  const firstIsData = dateCol >= 0 && detectDateFormat([first[dateCol] ?? '']).rate === 1;
  const hasHeader = !firstIsData;
  const names = Array.from({ length: width }, (_, j) => (hasHeader && first[j]?.trim() ? first[j].trim() : `Colonne ${j + 1}`));
  const hinted = numericCols.find((j) => VALUE_HINT.test(names[j]));
  const valueCol = hinted ?? numericCols[0] ?? -1;
  return { hasHeader, names, dateCol, valueCol, numericCols, dateCols };
}

/* ───────────── Construction de la série ───────────── */

export interface Note {
  level: 'info' | 'warn';
  text: string;
}

export interface Series {
  freq: Freq;
  /** Indice de la première période. */
  start: number;
  values: number[];
  /** Positions complétées par interpolation. */
  imputed: number[];
}

export interface Prepared {
  series: Series;
  notes: Note[];
  rawFreq: Freq;
  dateFormat: DateFormat;
  decimal: ',' | '.';
  rowsUsed: number;
}

export class InputError extends Error {}

const fr = (n: number) => n.toLocaleString('fr-FR');

/** Dispersion (coefficient de variation) des écarts entre dates distinctes : 0 = parfaitement régulier. */
export function gapDispersion(values: readonly string[], fmt: DateFormat): number {
  const u = [...new Set(values.map((v) => parseDate(v, fmt)).filter((d): d is number => d !== null))].sort((x, y) => x - y);
  if (u.length < 3) return Number.POSITIVE_INFINITY;
  const gaps = u.slice(1).map((d, i) => d - u[i]);
  const mu = gaps.reduce((a, g) => a + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mu) ** 2, 0) / gaps.length);
  return sd / mu;
}

/** Fréquence d'origine déduite de l'écart médian entre dates distinctes. */
export function inferFrequency(days: readonly number[]): Freq | null {
  const u = [...new Set(days)].sort((a, b) => a - b);
  if (u.length < 2) return null;
  const gaps = u.slice(1).map((d, i) => d - u[i]).sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  if (med <= 1.5) return 'day';
  if (med <= 10) return 'week';
  if (med <= 45) return 'month';
  return null;
}

export const MAX_IMPUTED_SHARE = 0.25;

/**
 * Lit les lignes, agrège à la fréquence demandée (somme : des ventes s'additionnent), écarte une période de
 * bord incomplète, complète les trous par interpolation linéaire et signale les cas particuliers.
 */
export function prepareSeries(
  rows: readonly string[][],
  guess: ColumnGuess,
  dateCol: number,
  valueCol: number,
  delimiter: string,
  freq: Freq | 'auto',
): Prepared {
  const notes: Note[] = [];
  const body = guess.hasHeader ? rows.slice(1) : rows;
  const dateVals = body.map((r) => r[dateCol] ?? '');
  const valVals = body.map((r) => r[valueCol] ?? '');
  const detected = detectDateFormat(dateVals);
  let format = detected.format;
  let ambiguous = detected.ambiguous;
  if (ambiguous) {
    // JJ/MM ou MM/JJ : on garde la lecture qui donne les dates les plus régulièrement espacées.
    const cd = gapDispersion(dateVals, 'dmy');
    const cm = gapDispersion(dateVals, 'mdy');
    if (cm < cd - 0.1) format = 'mdy';
    ambiguous = Math.abs(cd - cm) <= 0.1;
  }
  const decimal = detectDecimal(valVals, delimiter);
  const points: { day: number; value: number }[] = [];
  let bad = 0;
  let firstBad = '';
  let emptyValue = 0;
  body.forEach((r, i) => {
    const rawDate = r[dateCol] ?? '';
    const rawVal = r[valueCol] ?? '';
    if (!rawDate.trim() && !rawVal.trim()) return;
    const day = parseDate(rawDate, format);
    if (day === null) {
      bad++;
      if (!firstBad) firstBad = `ligne ${i + (guess.hasHeader ? 2 : 1)} : « ${rawDate.slice(0, 30)} »`;
      return;
    }
    if (!rawVal.trim()) {
      emptyValue++;
      return;
    }
    const v = parseNumber(rawVal, decimal);
    if (v === null) {
      bad++;
      if (!firstBad) firstBad = `ligne ${i + (guess.hasHeader ? 2 : 1)} : « ${rawVal.slice(0, 30)} »`;
      return;
    }
    points.push({ day, value: v });
  });
  if (!points.length) throw new InputError('Aucune ligne exploitable : vérifiez les colonnes de date et de valeur.');
  if (bad) notes.push({ level: 'warn', text: `${fr(bad)} ligne${bad > 1 ? 's' : ''} ignorée${bad > 1 ? 's' : ''} (date ou valeur illisible), par exemple ${firstBad}.` });
  if (emptyValue) notes.push({ level: 'warn', text: `${fr(emptyValue)} valeur${emptyValue > 1 ? 's' : ''} manquante${emptyValue > 1 ? 's' : ''} dans le fichier : la période est traitée comme sans donnée.` });
  if (ambiguous) notes.push({ level: 'info', text: 'Dates ambiguës (jour et mois tous deux ≤ 12) : lues au format français JJ/MM.' });

  const rawFreq = inferFrequency(points.map((p) => p.day));
  if (!rawFreq) throw new InputError('Fréquence non prise en charge : il faut des données au jour, à la semaine ou au mois (au moins deux dates distinctes).');
  const target: Freq = freq === 'auto' ? rawFreq : freq;
  if (FREQ_RANK[target] < FREQ_RANK[rawFreq]) throw new InputError(`Les données sont au ${FREQ_LABEL[rawFreq].toLowerCase()} : impossible de les détailler au ${FREQ_LABEL[target].toLowerCase()}.`);

  const sameRawPeriod = new Map<number, number>();
  points.forEach((p) => {
    const k = periodOf(p.day, rawFreq);
    sameRawPeriod.set(k, (sameRawPeriod.get(k) ?? 0) + 1);
  });
  const dup = points.length - sameRawPeriod.size;
  if (dup > 0) notes.push({ level: 'warn', text: `${fr(dup)} ligne${dup > 1 ? 's' : ''} en double sur une même date : les valeurs sont additionnées (plusieurs ventes le même ${rawFreq === 'month' ? 'mois' : rawFreq === 'week' ? 'semaine' : 'jour'}).` });

  const sums = new Map<number, number>();
  const coverage = new Map<number, Set<number>>();
  points.forEach((p) => {
    const k = periodOf(p.day, target);
    sums.set(k, (sums.get(k) ?? 0) + p.value);
    if (!coverage.has(k)) coverage.set(k, new Set());
    coverage.get(k)!.add(periodOf(p.day, rawFreq));
  });
  let keys = [...sums.keys()].sort((a, b) => a - b);
  if (target !== rawFreq) {
    const rawLen = rawFreq === 'day' ? 1 : 7;
    const expected = (k: number) => periodLength(k, target) / rawLen;
    const edge = (k: number, where: string) => {
      const got = coverage.get(k)!.size;
      if (got < 0.75 * expected(k)) {
        notes.push({ level: 'info', text: `${where} période (${formatPeriod(k, target)}) incomplète (${got} ${rawFreq === 'day' ? 'jours' : 'semaines'} sur ${Math.round(expected(k))}) : écartée.` });
        return true;
      }
      return false;
    };
    if (keys.length > 2 && edge(keys[keys.length - 1], 'Dernière')) keys = keys.slice(0, -1);
    if (keys.length > 2 && edge(keys[0], 'Première')) keys = keys.slice(1);
  }
  const start = keys[0];
  const end = keys[keys.length - 1];
  const values: (number | null)[] = [];
  for (let k = start; k <= end; k++) values.push(sums.has(k) ? sums.get(k)! : null);
  if (target === 'day' && values.length >= 28) {
    // Un jour de la semaine presque toujours absent = jour de fermeture : ventes nulles, pas une donnée manquante.
    for (let wd = 0; wd < 7; wd++) {
      const idx = values.map((_, i) => i).filter((i) => weekday(start + i) === wd);
      const missing = idx.filter((i) => values[i] === null);
      if (idx.length >= 4 && missing.length / idx.length >= 0.8) {
        missing.forEach((i) => (values[i] = 0));
        notes.push({ level: 'info', text: `Aucune vente le ${WEEKDAYS_LONG[wd]} (${missing.length} sur ${idx.length}) : jour de fermeture, compté à zéro plutôt qu’interpolé.` });
      }
    }
  }
  const imputed = values.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  if (imputed.length / values.length > MAX_IMPUTED_SHARE) {
    throw new InputError(`Trop de périodes sans donnée (${fr(imputed.length)} sur ${fr(values.length)}) : agrégez à une fréquence plus large ou complétez le fichier.`);
  }
  const filled = interpolate(values);
  if (imputed.length) notes.push({ level: 'warn', text: `${fr(imputed.length)} période${imputed.length > 1 ? 's' : ''} sans donnée complétée${imputed.length > 1 ? 's' : ''} par interpolation linéaire.` });
  const neg = filled.filter((v) => v < 0).length;
  const zero = filled.filter((v) => v === 0).length;
  if (neg) notes.push({ level: 'warn', text: `${fr(neg)} période${neg > 1 ? 's' : ''} à valeur négative (retours, avoirs ?) : Holt-Winters multiplicatif et MAPE désactivés.` });
  else if (zero) notes.push({ level: 'warn', text: `${fr(zero)} période${zero > 1 ? 's' : ''} à zéro : Holt-Winters multiplicatif et MAPE désactivés (division par zéro).` });
  return { series: { freq: target, start, values: filled, imputed }, notes, rawFreq, dateFormat: format, decimal, rowsUsed: points.length };
}

/** Interpolation linéaire des valeurs manquantes (bords : valeur connue la plus proche). */
export function interpolate(values: readonly (number | null)[]): number[] {
  const out = values.map((v) => (v === null ? NaN : v));
  const known = out.map((v, i) => (Number.isNaN(v) ? -1 : i)).filter((i) => i >= 0);
  if (!known.length) return out;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isNaN(out[i])) continue;
    const prev = [...known].reverse().find((k) => k < i);
    const next = known.find((k) => k > i);
    if (prev === undefined) out[i] = out[next!];
    else if (next === undefined) out[i] = out[prev];
    else out[i] = out[prev] + ((out[next] - out[prev]) * (i - prev)) / (next - prev);
  }
  return out;
}
