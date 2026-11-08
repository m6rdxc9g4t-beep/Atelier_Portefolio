import Papa from 'papaparse';
import type { Column, Dataset } from './model';

export class InputError extends Error {}

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 50_000;
const MAX_LEVELS = 12;

/** Lit un nombre écrit à la française ou à l'anglaise (« 1 234,5 », « 1234.5 », « 12 % »). */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/[\s  ]/g, '').replace(/%$/, '').replace(/^€|€$/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '?', '#n/a']);

/** Transforme un CSV avec en-tête en jeu de données : colonnes numériques et catégorielles (≤ 12 modalités). */
export function parseCsv(text: string): { data: Dataset; notes: string[] } {
  const clean = text.replace(/^﻿/, '');
  if (!clean.trim()) throw new InputError('Le fichier est vide.');
  const nl = clean.indexOf('\n');
  const firstLine = nl < 0 ? clean : clean.slice(0, nl);
  const delimiter = [';', '\t', ',', '|'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const parsed = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: 'greedy' });
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (rows.length < 4) throw new InputError('Il faut une ligne d’en-tête et au moins trois lignes de données.');
  const header = rows[0]!.map((h, j) => String(h).trim() || `colonne_${j + 1}`);
  const body = rows.slice(1, MAX_ROWS + 1);
  const notes: string[] = [];
  if (rows.length - 1 > MAX_ROWS) notes.push(`Seules les ${MAX_ROWS.toLocaleString('fr-FR')} premières lignes sont analysées.`);

  const columns: Column[] = [];
  const seen = new Set<string>();
  header.forEach((rawName, j) => {
    let name = rawName.replace(/\s+/g, '_');
    while (seen.has(name)) name += '_bis';
    seen.add(name);
    const cells = body.map((r) => String(r[j] ?? '').trim());
    const present = cells.filter((c) => !MISSING.has(c.toLowerCase()));
    if (present.length === 0) return;
    const nums = cells.map((c) => (MISSING.has(c.toLowerCase()) ? null : parseNumber(c)));
    const numOk = nums.filter((v) => v !== null).length;
    if (numOk >= 0.9 * present.length) {
      columns.push({ name, kind: 'num', values: nums });
      return;
    }
    const counts = new Map<string, number>();
    for (const c of present) counts.set(c, (counts.get(c) ?? 0) + 1);
    if (counts.size >= 2 && counts.size <= MAX_LEVELS) {
      const levels = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
      columns.push({ name, kind: 'cat', values: cells.map((c) => (MISSING.has(c.toLowerCase()) ? null : c)), levels });
      return;
    }
    notes.push(`Colonne « ${name} » ignorée : ni numérique, ni catégorielle à ${MAX_LEVELS} modalités au plus.`);
  });
  if (!columns.some((c) => c.kind === 'num')) throw new InputError('Aucune colonne numérique : il faut au moins une variable à expliquer chiffrée.');
  return { data: { n: body.length, columns }, notes };
}

export async function readFile(file: File): Promise<string> {
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/i.test(file.name))
    throw new InputError('Classeur non pris en charge : enregistrez la feuille au format CSV, puis déposez-la ici.');
  if (file.size > MAX_BYTES) throw new InputError('Fichier trop volumineux (10 Mo au plus).');
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
