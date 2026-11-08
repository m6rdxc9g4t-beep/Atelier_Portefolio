import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * Moteur SQLite (sql.js, WebAssembly) chargé une seule fois et partagé entre les démos.
 * Le fichier .wasm est servi par le site lui-même (aucun CDN) ; la politique de sécurité
 * du serveur autorise la compilation WebAssembly (`'wasm-unsafe-eval'`).
 */
let enginePromise: Promise<SqlJsStatic> | null = null;

export function loadSqlEngine(): Promise<SqlJsStatic> {
  if (!enginePromise) {
    enginePromise = initSqlJs({ locateFile: () => wasmUrl }).catch((e: unknown) => {
      enginePromise = null;
      throw e;
    });
  }
  return enginePromise;
}
