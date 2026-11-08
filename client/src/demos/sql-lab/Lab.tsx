import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Database } from 'sql.js';
import { loadSqlEngine } from './sqljs';
import { generateComptoir } from './data';
import {
  CHALLENGES,
  compareResults,
  EXAMPLE_QUERY,
  isMoneyColumn,
  LEVEL_LABEL,
  loadComptoir,
  runQuery,
  type Cell,
  type Challenge,
  type QueryResult,
} from './challenges';
import { ResultChart } from './ResultChart';

type Progress = Record<string, 'done' | 'solution'>;
type Verdict = { ok: boolean; text: string } | null;

const STORE_KEY = 'atelier-portfolio:sql-lab:progress';
const MAX_ROWS = 300;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function readProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}
function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : la progression vit le temps de la visite */
  }
}

interface TableInfo {
  name: string;
  rows: number;
  columns: { name: string; type: string; pk: boolean; fk: string | null }[];
}

const TABLE_NOTES: Record<string, string> = {
  commandes: 'statut : livree, annulee, retournee ou en_cours',
  lignes: 'remise : 0, 0,1, 0,15 ou 0,2',
};

export default function Lab() {
  const dbRef = useRef<Database | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [engine, setEngine] = useState<{ state: 'loading' } | { state: 'ready'; version: string } | { state: 'error'; message: string }>({ state: 'loading' });
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [sql, setSql] = useState(EXAMPLE_QUERY);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Challenge | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [progress, setProgress] = useState<Progress>(() => readProgress());
  const [copied, setCopied] = useState<'idle' | 'ok' | 'ko'>('idle');

  const execute = useCallback(
    (text: string, challenge: Challenge | null, prog: Progress) => {
      const db = dbRef.current;
      if (!db || !text.trim()) return;
      setVerdict(null);
      let r: QueryResult;
      try {
        r = runQuery(db, text);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setResult(null);
        return;
      }
      setError(null);
      setResult(r);
      if (!challenge) return;
      const check = compareResults(r, runQuery(db, challenge.solution));
      if (check.ok) {
        const viaSolution = prog[challenge.id] === 'solution';
        setVerdict({
          ok: true,
          text: viaSolution
            ? 'Résultat correct. Ce défi reste marqué « solution vue ».'
            : 'Défi réussi : votre résultat correspond à l’attendu.',
        });
        if (!viaSolution && prog[challenge.id] !== 'done') {
          const next = { ...prog, [challenge.id]: 'done' as const };
          setProgress(next);
          saveProgress(next);
        }
      } else {
        setVerdict({ ok: false, text: `Pas encore : ${check.why}` });
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadSqlEngine()
      .then((SQL) => {
        if (cancelled) return;
        const db = new SQL.Database();
        loadComptoir(db, generateComptoir());
        dbRef.current = db;
        const version = String(db.exec('SELECT sqlite_version()')[0]!.values[0]![0]);
        const info: TableInfo[] = ['clients', 'produits', 'commandes', 'lignes'].map((name) => {
          const cols = db.exec(`PRAGMA table_info(${name})`)[0]!.values;
          const fks = db.exec(`PRAGMA foreign_key_list(${name})`)[0]?.values ?? [];
          const rows = Number(db.exec(`SELECT COUNT(*) FROM ${name}`)[0]!.values[0]![0]);
          return {
            name,
            rows,
            columns: cols.map((c) => {
              const col = String(c[1]);
              const fk = fks.find((f) => String(f[3]) === col);
              return { name: col, type: String(c[2]).toLowerCase(), pk: Number(c[5]) > 0, fk: fk ? `${String(fk[2])}.${String(fk[4])}` : null };
            }),
          };
        });
        setTables(info);
        setEngine({ state: 'ready', version });
        execute(EXAMPLE_QUERY, null, {});
      })
      .catch((e: unknown) => {
        if (!cancelled) setEngine({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, [execute]);

  const run = () => execute(sql, active, progress);

  const insert = (text: string) => {
    const ta = editorRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = sql.slice(0, s) + text + sql.slice(e);
    setSql(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + text.length, s + text.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insert('  ');
    }
  };

  const startChallenge = (c: Challenge) => {
    setActive(c);
    setVerdict(null);
    setSql(`-- Défi : ${c.title}\n-- ${c.question}\n\nSELECT `);
    requestAnimationFrame(() => {
      const ta = editorRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };

  const showSolution = (c: Challenge) => {
    const next = progress[c.id] === 'done' ? progress : { ...progress, [c.id]: 'solution' as const };
    if (next !== progress) {
      setProgress(next);
      saveProgress(next);
    }
    setActive(c);
    const text = `-- Une solution possible : ${c.title}\n${c.solution}`;
    setSql(text);
    execute(text, c, next);
  };

  const backToExample = () => {
    setActive(null);
    setSql(EXAMPLE_QUERY);
    execute(EXAMPLE_QUERY, null, progress);
  };

  const copyCsv = async () => {
    if (!result) return;
    const q = (v: Cell) => (v === null ? '' : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [result.columns.map(q).join(','), ...result.rows.map((r) => r.map(q).join(','))].join('\n');
    try {
      await navigator.clipboard.writeText(csv);
      setCopied('ok');
    } catch {
      setCopied('ko');
    }
    setTimeout(() => setCopied('idle'), 1800);
  };

  const solved = CHALLENGES.filter((c) => progress[c.id]).length;
  const isMac = useMemo(() => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent), []);
  const numericCols = useMemo(
    () => (result ? result.columns.map((_, i) => result.rows.length > 0 && result.rows.every((r) => r[i] === null || typeof r[i] === 'number')) : []),
    [result],
  );

  if (engine.state === 'error')
    return (
      <div className="sl-panel sl-fatal" role="alert">
        Le moteur SQL n’a pas pu démarrer dans ce navigateur ({engine.message}). Essayez une version récente de Chrome, Firefox, Safari ou
        Edge.
      </div>
    );

  return (
    <div className="sl-tool" aria-busy={engine.state === 'loading'}>
      <aside className="sl-panel sl-schema" aria-label="Schéma de la base">
        <div className="sl-head">
          <h2>Schéma</h2>
          <span className="sl-engine">{engine.state === 'ready' ? `SQLite ${engine.version}` : 'Chargement…'}</span>
        </div>
        {tables.map((t) => (
          <div className="sl-table" key={t.name}>
            <div className="sl-tname">
              <button type="button" onClick={() => insert(t.name)} title={`Insérer « ${t.name} »`}>
                {t.name}
              </button>
              <span className="sl-count">{nf.format(t.rows)} lignes</span>
            </div>
            <ul>
              {t.columns.map((c) => (
                <li key={c.name}>
                  <button type="button" onClick={() => insert(c.name)} title={c.fk ? `Clé étrangère vers ${c.fk}` : `Insérer « ${c.name} »`}>
                    <span>{c.name}</span>
                    <span className="sl-type">
                      {c.fk ? `→ ${c.fk.split('.')[0]}` : `${c.type}${c.pk ? ' · clé' : ''}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {TABLE_NOTES[t.name] && <p className="sl-note">{TABLE_NOTES[t.name]}</p>}
          </div>
        ))}
        <p className="sl-hint">Un clic sur une table ou une colonne l’insère dans l’éditeur.</p>
      </aside>

      <section className="sl-bench" aria-label="Éditeur et résultat">
        <div className="sl-panel">
          <div className="sl-head">
            <h2>{active ? `Défi : ${active.title}` : 'Requête'}</h2>
            <div className="sl-actions">
              {active && (
                <button type="button" className="btn" onClick={backToExample}>
                  Revenir à l’exemple
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={run} disabled={engine.state !== 'ready'}>
                Exécuter <kbd>{isMac ? '⌘ ↵' : 'Ctrl ↵'}</kbd>
              </button>
            </div>
          </div>
          <label htmlFor="sl-sql" className="sl-sr">
            Requête SQL
          </label>
          <textarea
            id="sl-sql"
            ref={editorRef}
            className="sl-editor"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        <div className="sl-panel" aria-live="polite">
          <div className="sl-head">
            <h2>Résultat</h2>
            <button type="button" className="btn" onClick={copyCsv} disabled={!result || result.columns.length === 0}>
              {copied === 'ok' ? 'Copié' : copied === 'ko' ? 'Copie refusée' : 'Copier en CSV'}
            </button>
          </div>
          {verdict && <p className={`sl-verdict ${verdict.ok ? 'is-ok' : 'is-ko'}`}>{verdict.text}</p>}
          {error && (
            <p className="sl-error" role="alert">
              Erreur SQL : {error}
            </p>
          )}
          {result && !error && <ResultChart result={result} />}
          <div className="sl-status">
            {engine.state === 'loading' && 'Préparation de la base…'}
            {engine.state === 'ready' && error && 'La requête n’a pas pu s’exécuter : corrigez-la puis relancez.'}
            {engine.state === 'ready' && !error && result && result.columns.length > 0 && (
              <>
                <span>
                  <strong>{nf.format(result.rows.length)}</strong> ligne{result.rows.length > 1 ? 's' : ''}
                </span>
                <span>
                  <strong>{result.columns.length}</strong> colonne{result.columns.length > 1 ? 's' : ''}
                </span>
                <span>
                  exécutée en <strong>{result.ms < 1 ? '< 1' : nf.format(Math.round(result.ms))}</strong> ms
                </span>
                {result.rows.length > MAX_ROWS && <span>{MAX_ROWS} premières lignes affichées</span>}
              </>
            )}
            {engine.state === 'ready' && !error && result && result.columns.length === 0 && 'Requête exécutée : elle ne renvoie pas de lignes.'}
          </div>
          {result && !error && result.columns.length > 0 && (
            <div className="sl-table-wrap">
              {result.rows.length === 0 ? (
                <p className="sl-empty">Aucune ligne ne correspond à cette requête.</p>
              ) : (
                <table className="sl-res">
                  <thead>
                    <tr>
                      {result.columns.map((c, i) => (
                        <th key={i} scope="col" className={numericCols[i] ? 'is-num' : ''}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, MAX_ROWS).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((v, i) =>
                          v === null ? (
                            <td key={i} className="is-null">
                              NULL
                            </td>
                          ) : typeof v === 'number' ? (
                            <td key={i} className="is-num">
                              {nf.format(v)}
                              {isMoneyColumn(result.columns[i]!) ? ' €' : ''}
                            </td>
                          ) : (
                            <td key={i}>{v instanceof Uint8Array ? `(${v.length} octets)` : v}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="sl-panel sl-challenges" aria-label="Défis SQL">
        <div className="sl-head">
          <h2>Défis</h2>
          <span className="sl-progress">
            <strong>{solved}</strong> / {CHALLENGES.length} résolus
          </span>
        </div>
        <ol className="sl-ch-list">
          {CHALLENGES.map((c) => {
            const st = progress[c.id];
            const isActive = active?.id === c.id;
            return (
              <li key={c.id} className={`sl-ch${isActive ? ' is-active' : ''}`}>
                <div className="sl-ch-top">
                  <span className={`sl-level sl-level-${c.level}`}>{LEVEL_LABEL[c.level]}</span>
                  <span className="sl-notion">{c.notion}</span>
                  {st && <span className={`sl-state${st === 'done' ? ' is-done' : ''}`}>{st === 'done' ? 'Réussi' : 'Solution vue'}</span>}
                </div>
                <h3>{c.title}</h3>
                <p>{c.question}</p>
                <div className="sl-ch-actions">
                  <button type="button" className="btn" onClick={() => startChallenge(c)} aria-pressed={isActive}>
                    {isActive ? 'Défi en cours' : 'Relever le défi'}
                  </button>
                  <button type="button" className="btn sl-btn-quiet" onClick={() => showSolution(c)}>
                    Voir une solution
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
