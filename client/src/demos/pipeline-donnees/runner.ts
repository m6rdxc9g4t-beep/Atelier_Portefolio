import type { Database } from 'sql.js';
import { CA_REFERENCE_TOKEN, compileSql, testSql, type DataTest } from './model';

export type Cell = string | number | null;

export interface ModelRun {
  ok: boolean;
  rows: number;
  ms: number;
  columns: string[];
  error?: string;
}

export interface TestRun {
  label: string;
  sql: string;
  ok: boolean;
  /** Nombre de lignes en défaut (0 si le test passe). */
  failures: number;
  sample: { columns: string[]; rows: Cell[][] };
  error?: string;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Matérialise un modèle en table (`DROP` puis `CREATE TABLE … AS`), comme `dbt run`. */
export function runModel(db: Database, name: string, sql: string): ModelRun {
  const t0 = now();
  try {
    db.run(`DROP TABLE IF EXISTS ${name}`);
    db.run(`CREATE TABLE ${name} AS\n${compileSql(sql)}`);
    const rows = Number(db.exec(`SELECT COUNT(*) FROM ${name}`)[0]!.values[0]![0]);
    const columns = (db.exec(`PRAGMA table_info(${name})`)[0]?.values ?? []).map((c) => String(c[1]));
    return { ok: true, rows, ms: now() - t0, columns };
  } catch (e) {
    db.run(`DROP TABLE IF EXISTS ${name}`);
    return { ok: false, rows: 0, ms: now() - t0, columns: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Exécute un test : sa requête renvoie les lignes en défaut. */
export function runTest(db: Database, test: DataTest, model: string, label: string, caReference: number): TestRun {
  const sql = testSql(test, model).split(CA_REFERENCE_TOKEN).join(caReference.toFixed(2));
  try {
    const res = db.exec(sql)[0];
    const rows = (res?.values ?? []) as Cell[][];
    return { label, sql, ok: rows.length === 0, failures: rows.length, sample: { columns: res?.columns ?? [], rows: rows.slice(0, 5) } };
  } catch (e) {
    return { label, sql, ok: false, failures: 0, sample: { columns: [], rows: [] }, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Aperçu des premières lignes d'une table (modèle ou source). */
export function preview(db: Database, name: string, limit = 20): { columns: string[]; rows: Cell[][]; total: number } | null {
  try {
    const res = db.exec(`SELECT * FROM ${name} LIMIT ${limit}`)[0];
    const total = Number(db.exec(`SELECT COUNT(*) FROM ${name}`)[0]!.values[0]![0]);
    return { columns: res?.columns ?? [], rows: (res?.values ?? []) as Cell[][], total };
  } catch {
    return null;
  }
}

/** Colonnes d'une table brute. */
export function tableColumns(db: Database, name: string): string[] {
  return (db.exec(`PRAGMA table_info(${name})`)[0]?.values ?? []).map((c) => String(c[1]));
}
