import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Database } from 'sql.js';
import { loadSqlEngine } from '../sql-lab/sqljs';
import Graph, { type NodeInfo } from './Graph';
import {
  ALL_NODES,
  buildEdges,
  downstream,
  extractDeps,
  LAYER_LABEL,
  layerOf,
  lineageLeaves,
  lineageModels,
  markStale,
  MART_COLUMNS,
  MODELS,
  SOURCES,
  STG_COMMANDES_FIXED_SQL,
  testDeps,
  testLabel,
  topoSort,
  traceLineage,
  upstream,
  type LineageNode,
  type ModelDef,
  type NodeState,
} from './model';
import { buildRawSources, loadRawSources, type RawSources } from './sources';
import { preview, runModel, runTest, tableColumns, type Cell, type ModelRun, type TestRun } from './runner';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface LogEntry {
  id: number;
  model: string;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

export default function Pipeline() {
  const dbRef = useRef<Database | null>(null);
  const rawRef = useRef<RawSources | null>(null);
  const logId = useRef(0);
  const [engine, setEngine] = useState<'loading' | 'ready' | { error: string }>('loading');
  const [sqlByModel, setSqlByModel] = useState<Record<string, string>>(() => Object.fromEntries(MODELS.map((m) => [m.name, m.sql])));
  const [states, setStates] = useState<Record<string, NodeState>>(() => Object.fromEntries(ALL_NODES.map((n) => [n, 'idle' as NodeState])));
  const [runs, setRuns] = useState<Record<string, ModelRun>>({});
  const [tests, setTests] = useState<Record<string, TestRun[]>>({});
  const [sourceRows, setSourceRows] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState('stg_commandes');
  const [lineageCol, setLineageCol] = useState<string>('ca');
  const [showLineage, setShowLineage] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [martTotal, setMartTotal] = useState<number | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [hint, setHint] = useState(false);

  const models: ModelDef[] = useMemo(() => MODELS.map((m) => ({ ...m, sql: sqlByModel[m.name] ?? m.sql })), [sqlByModel]);
  const edges = useMemo(() => buildEdges(models), [models]);

  const pushLog = useCallback((model: string, text: string, tone: LogEntry['tone']) => {
    setLog((l) => [{ id: ++logId.current, model, text, tone }, ...l].slice(0, 40));
  }, []);

  /** Exécute une liste de modèles dans l'ordre topologique, puis leurs tests dès que leurs dépendances sont construites. */
  const runModels = useCallback(
    async (targets: string[], current: ModelDef[], animate: boolean) => {
      const db = dbRef.current;
      const raw = rawRef.current;
      if (!db || !raw) return;
      const e = buildEdges(current);
      const sorted = topoSort(ALL_NODES, e);
      if (!sorted.ok) {
        pushLog('pipeline', `Cycle détecté entre ${sorted.cycle.join(', ')} : le pipeline ne peut pas s'exécuter.`, 'bad');
        return;
      }
      const order = sorted.order.filter((n) => targets.includes(n));
      setRunning(true);
      const delay = animate && !reducedMotion() ? 140 : 0;
      const built = new Set<string>(
        Object.entries(runs)
          .filter(([n, r]) => r.ok && !targets.includes(n))
          .map(([n]) => n),
      );
      for (const s of SOURCES) built.add(s.name);
      const failed = new Set<string>();
      const pendingTests: string[] = [];
      const newRuns: Record<string, ModelRun> = {};
      const newTests: Record<string, TestRun[]> = {};

      const flushTests = () => {
        for (const name of [...pendingTests]) {
          const def = current.find((m) => m.name === name)!;
          if (!def.tests.every((t) => testDeps(t).every((d) => d === name || built.has(d)))) continue;
          pendingTests.splice(pendingTests.indexOf(name), 1);
          const results = def.tests.map((t) => runTest(db, t, name, testLabel(t), raw.caReference));
          newTests[name] = results;
          setTests((prev) => ({ ...prev, [name]: results }));
          const ko = results.filter((r) => !r.ok).length;
          if (ko) pushLog(name, `${ko} test${ko > 1 ? 's' : ''} en échec sur ${results.length}`, 'bad');
        }
      };

      for (const name of order) {
        const def = current.find((m) => m.name === name);
        if (!def) continue;
        const deps = extractDeps(def.sql).refs;
        if (deps.some((d) => failed.has(d) || (!built.has(d) && !order.includes(d)))) {
          failed.add(name);
          setStates((s) => ({ ...s, [name]: 'skipped' }));
          setTests((prev) => ({ ...prev, [name]: [] }));
          pushLog(name, 'ignoré : un modèle amont a échoué', 'bad');
          continue;
        }
        setStates((s) => ({ ...s, [name]: 'running' }));
        if (delay) await sleep(delay);
        const r = runModel(db, name, def.sql);
        newRuns[name] = r;
        setRuns((prev) => ({ ...prev, [name]: r }));
        setStates((s) => ({ ...s, [name]: r.ok ? 'ok' : 'error' }));
        if (r.ok) {
          built.add(name);
          pushLog(name, `${nf.format(r.rows)} lignes · ${r.ms < 1 ? '< 1' : nf.format(Math.round(r.ms))} ms`, 'good');
          pendingTests.push(name);
        } else {
          failed.add(name);
          setTests((prev) => ({ ...prev, [name]: [] }));
          pushLog(name, `erreur SQL : ${r.error}`, 'bad');
        }
        flushTests();
      }
      flushTests();
      try {
        const v = db.exec('SELECT SUM(ca) FROM mart_ca_mensuel')[0]?.values[0]?.[0];
        setMartTotal(typeof v === 'number' ? v : null);
      } catch {
        setMartTotal(null);
      }
      setPreviewVersion((v) => v + 1);
      setRunning(false);
    },
    [pushLog, runs],
  );

  // Démarrage : moteur, sources brutes, premier build complet (sans animation : la page s'ouvre sur un état réel).
  const booted = useRef(false);
  useEffect(() => {
    let cancelled = false;
    loadSqlEngine()
      .then((SQL) => {
        if (cancelled) return;
        const db = new SQL.Database();
        const raw = buildRawSources();
        loadRawSources(db, raw);
        dbRef.current = db;
        rawRef.current = raw;
        setSourceRows({
          raw_commandes: raw.raw_commandes.length,
          raw_lignes: raw.raw_lignes.length,
          raw_produits: raw.raw_produits.length,
          raw_clients: raw.raw_clients.length,
        });
        setEngine('ready');
      })
      .catch((e: unknown) => {
        if (!cancelled) setEngine({ error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (engine === 'ready' && !booted.current) {
      booted.current = true;
      void runModels(
        MODELS.map((m) => m.name),
        models,
        false,
      );
    }
  }, [engine, models, runModels]);

  const runAll = () => void runModels(MODELS.map((m) => m.name), models, true);
  const runFrom = (name: string) => void runModels([name, ...downstream(name, edges)], models, true);

  const editSql = (name: string, sql: string) => {
    setSqlByModel((prev) => ({ ...prev, [name]: sql }));
    setStates((s) => markStale(s, name, buildEdges(models.map((m) => (m.name === name ? { ...m, sql } : m)))));
  };

  const applyFix = () => {
    const sql = STG_COMMANDES_FIXED_SQL;
    const next = models.map((m) => (m.name === 'stg_commandes' ? { ...m, sql } : m));
    setSqlByModel((prev) => ({ ...prev, stg_commandes: sql }));
    setStates((s) => markStale(s, 'stg_commandes', buildEdges(next)));
    void runModels(['stg_commandes', ...downstream('stg_commandes', buildEdges(next))], next, true);
  };

  const resetDemo = () => {
    const original = Object.fromEntries(MODELS.map((m) => [m.name, m.sql]));
    setSqlByModel(original);
    setHint(false);
    setLog([]);
    void runModels(
      MODELS.map((m) => m.name),
      MODELS,
      true,
    );
  };

  // Informations par nœud pour le graphe.
  const info: Record<string, NodeInfo> = useMemo(() => {
    const out: Record<string, NodeInfo> = {};
    for (const s of SOURCES) out[s.name] = { state: 'ok', rows: sourceRows[s.name], testsOk: 0, testsTotal: 0 };
    for (const m of models) {
      const t = tests[m.name] ?? [];
      out[m.name] = { state: states[m.name] ?? 'idle', rows: runs[m.name]?.ok ? runs[m.name]!.rows : undefined, testsOk: t.filter((x) => x.ok).length, testsTotal: t.length };
    }
    return out;
  }, [models, states, runs, tests, sourceRows]);

  const related = useMemo(() => new Set([...upstream(selected, edges), ...downstream(selected, edges)]), [selected, edges]);
  const tree: LineageNode = useMemo(() => traceLineage('mart_ca_mensuel', lineageCol, models), [lineageCol, models]);
  const lineageSet = useMemo(() => (showLineage ? new Set(lineageModels(tree)) : null), [showLineage, tree]);

  const allTests = Object.values(tests).flat();
  const testsKo = allTests.filter((t) => !t.ok).length;
  const staleCount = MODELS.filter((m) => states[m.name] === 'stale').length;
  const builtCount = MODELS.filter((m) => states[m.name] === 'ok').length;
  const caRef = rawRef.current?.caReference ?? null;
  const stgTests = tests.stg_commandes ?? [];
  const dupFailing = stgTests.find((t) => t.label === 'unique(commande_id)' && !t.ok);

  if (typeof engine === 'object')
    return (
      <div className="pl-panel pl-fatal" role="alert">
        Le moteur SQL n’a pas pu démarrer dans ce navigateur ({engine.error}). Essayez une version récente de Chrome, Firefox, Safari ou Edge.
      </div>
    );

  const selModel = models.find((m) => m.name === selected);
  const selSource = SOURCES.find((s) => s.name === selected);

  return (
    <div className="pl-tool" aria-busy={engine === 'loading' || running}>
      <div className="pl-panel pl-toolbar">
        <div className="pl-tb-actions">
          <button type="button" className="btn btn-primary" onClick={runAll} disabled={engine !== 'ready' || running}>
            {running ? 'Exécution…' : 'Exécuter le pipeline'}
          </button>
          <button type="button" className="btn" onClick={resetDemo} disabled={engine !== 'ready' || running}>
            Réinitialiser la démo
          </button>
        </div>
        <dl className="pl-summary">
          <div>
            <dt>Modèles construits</dt>
            <dd>
              {builtCount} / {MODELS.length}
            </dd>
          </div>
          <div className={testsKo ? 'is-bad' : allTests.length ? 'is-good' : ''}>
            <dt>Tests</dt>
            <dd>
              {allTests.length ? `${allTests.length - testsKo} réussis · ${testsKo} en échec` : '—'}
            </dd>
          </div>
          <div className={staleCount ? 'is-stale' : ''}>
            <dt>À reconstruire</dt>
            <dd>{staleCount}</dd>
          </div>
          <div className={martTotal !== null && caRef !== null ? (Math.abs(martTotal - caRef) > 1 ? 'is-bad' : 'is-good') : ''}>
            <dt>CA du mart / total comptable</dt>
            <dd>
              {martTotal !== null ? eur.format(martTotal) : '—'} / {caRef !== null ? eur.format(caRef) : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="pl-panel pl-graph-panel">
        <div className="pl-graph-scroll">
          <Graph
            nodes={ALL_NODES}
            edges={edges}
            models={models}
            info={info}
            selected={selected}
            related={related}
            lineage={lineageSet}
            onSelect={setSelected}
          />
        </div>
        <p className="pl-graph-legend">
          <span className="pl-lg pl-lg-good">construit, tests au vert</span>
          <span className="pl-lg pl-lg-bad">erreur ou test en échec</span>
          <span className="pl-lg pl-lg-stale">à reconstruire</span>
          <span className="pl-lg-hint">Cliquez sur un nœud (ou Tab puis Entrée) pour voir son SQL, ses tests et ses données.</span>
        </p>
      </div>

      {dupFailing && (
        <div className="pl-callout" role="status">
          <p>
            <strong>Un seul défaut à la source, plusieurs tests au rouge.</strong> {nf.format(dupFailing.failures)} commandes ont été chargées
            deux fois dans <code>raw_commandes</code>. <code>stg_commandes</code> les garde toutes : son test <code>unique(commande_id)</code>{' '}
            échoue, les lignes de commande sont dédoublées par la jointure de <code>int_lignes_enrichies</code>, et le mart ne retombe plus
            sur le total comptable.
          </p>
          <div className="pl-callout-actions">
            {selected !== 'stg_commandes' && (
              <button type="button" className="btn" onClick={() => setSelected('stg_commandes')}>
                Ouvrir stg_commandes
              </button>
            )}
            <button type="button" className="btn" onClick={() => setHint((h) => !h)} aria-expanded={hint}>
              {hint ? 'Masquer l’indice' : 'Un indice'}
            </button>
            <button type="button" className="btn btn-primary" onClick={applyFix} disabled={running}>
              Appliquer la correction
            </button>
          </div>
          {hint && (
            <p className="pl-hint">
              Numérotez les chargements de chaque commande avec <code>ROW_NUMBER() OVER (PARTITION BY id_commande ORDER BY _charge_le DESC)</code>{' '}
              et ne gardez que le rang 1. Modifiez le SQL de <code>stg_commandes</code>, puis « Exécuter ce modèle et l’aval ».
            </p>
          )}
        </div>
      )}

      <div className="pl-lower">
        <section className="pl-panel pl-detail" aria-label={`Détail de ${selected}`}>
          <div className="pl-head">
            <div className="pl-title">
              <h2>{selected}</h2>
              <span className={`pl-layer pl-layer--${layerOf(selected, models)}`}>{LAYER_LABEL[layerOf(selected, models)]}</span>
            </div>
            {selModel && (
              <div className="pl-actions">
                {sqlByModel[selected] !== MODELS.find((m) => m.name === selected)!.sql && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => editSql(selected, MODELS.find((m) => m.name === selected)!.sql)}
                    disabled={running}
                  >
                    SQL d’origine
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={() => runFrom(selected)} disabled={running || engine !== 'ready'}>
                  Exécuter ce modèle et l’aval
                </button>
              </div>
            )}
          </div>

          {selSource && (
            <div className="pl-body">
              <p className="pl-desc">{selSource.description}</p>
              <p className="pl-defects">
                <strong>Défauts connus :</strong> {selSource.defects}
              </p>
              <p className="pl-meta">
                Système d’origine : <code>{selSource.system}</code> · appelée dans le SQL par{' '}
                <code>{`{{ source('${selSource.system}', '${selSource.name}') }}`}</code>
              </p>
            </div>
          )}

          {selModel && (
            <div className="pl-body">
              <p className="pl-desc">{selModel.description}</p>
              <label htmlFor="pl-sql" className="pl-label">
                SQL du modèle{' '}
                <span>
                  dépend de :{' '}
                  {[...extractDeps(selModel.sql).sources, ...extractDeps(selModel.sql).refs].map((d, i, arr) => (
                    <span key={d}>
                      <code>{d}</code>
                      {i < arr.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </span>
              </label>
              <textarea
                id="pl-sql"
                className="pl-editor"
                value={selModel.sql}
                onChange={(e) => editSql(selected, e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                rows={Math.min(24, selModel.sql.split('\n').length + 1)}
              />
              <RunStatus run={runs[selected]} state={states[selected] ?? 'idle'} />
              <TestList results={tests[selected] ?? []} />
            </div>
          )}

          <Preview db={dbRef.current} name={selected} version={previewVersion} state={states[selected] ?? 'idle'} />
        </section>

        <aside className="pl-side">
          <section className="pl-panel" aria-labelledby="pl-lineage-title">
            <div className="pl-head">
              <h2 id="pl-lineage-title">Lignage d’une colonne</h2>
            </div>
            <div className="pl-body">
              <div className="pl-lineage-controls">
                <label htmlFor="pl-col">
                  <code>mart_ca_mensuel.</code>
                </label>
                <select id="pl-col" value={lineageCol} onChange={(e) => setLineageCol(e.target.value)}>
                  {MART_COLUMNS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <label className="pl-check">
                <input type="checkbox" checked={showLineage} onChange={(e) => setShowLineage(e.target.checked)} /> Surligner dans le graphe
              </label>
              <LineageTree node={tree} runs={runs} root />
              <p className="pl-leaves">
                Vient de : {lineageLeaves(tree).map((l, i, arr) => (
                  <span key={l}>
                    <code>{l}</code>
                    {i < arr.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
              {lineageModels(tree)
                .map((m) => models.find((x) => x.name === m))
                .filter((m): m is ModelDef => Boolean(m?.filter))
                .map((m) => (
                  <p key={m.name} className="pl-filter">
                    Filtre appliqué dans <code>{m.name}</code> : <code>{m.filter}</code>
                  </p>
                ))}
            </div>
          </section>

          <section className="pl-panel" aria-labelledby="pl-log-title">
            <div className="pl-head">
              <h2 id="pl-log-title">Journal d’exécution</h2>
            </div>
            <ol className="pl-log" aria-live="polite">
              {log.length === 0 && <li className="pl-log-empty">Le premier build s’affichera ici.</li>}
              {log.map((l) => (
                <li key={l.id} className={`is-${l.tone}`}>
                  <code>{l.model}</code> {l.text}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function RunStatus({ run, state }: { run: ModelRun | undefined; state: NodeState }) {
  if (state === 'stale')
    return <p className="pl-run is-stale">Modifié (ou en aval d’un modèle modifié) : à reconstruire. Les données affichées datent du build précédent.</p>;
  if (state === 'skipped') return <p className="pl-run is-bad">Ignoré : un modèle amont n’a pas pu être construit.</p>;
  if (!run) return null;
  if (!run.ok)
    return (
      <p className="pl-run is-bad" role="alert">
        Erreur SQL : {run.error}
      </p>
    );
  return (
    <p className="pl-run">
      Table construite : <strong>{nf.format(run.rows)}</strong> lignes, {run.columns.length} colonnes, en{' '}
      <strong>{run.ms < 1 ? '< 1' : nf.format(Math.round(run.ms))}</strong> ms.
    </p>
  );
}

function TestList({ results }: { results: TestRun[] }) {
  if (!results.length) return null;
  return (
    <div className="pl-tests">
      <h3>Tests de données</h3>
      <ul>
        {results.map((t) => (
          <li key={t.label} className={t.ok ? 'is-ok' : 'is-ko'}>
            <details>
              <summary>
                <span className="pl-test-mark" aria-hidden="true">
                  {t.ok ? '✓' : '✕'}
                </span>
                <code>{t.label}</code>
                <span className="pl-test-res">{t.error ? 'erreur' : t.ok ? 'réussi' : `${nf.format(t.failures)} ligne${t.failures > 1 ? 's' : ''} en défaut`}</span>
              </summary>
              <pre className="pl-test-sql">{t.sql}</pre>
              {t.error && <p className="pl-run is-bad">{t.error}</p>}
              {!t.ok && t.sample.rows.length > 0 && <MiniTable columns={t.sample.columns} rows={t.sample.rows} caption="Premières lignes en défaut" />}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniTable({ columns, rows, caption }: { columns: string[]; rows: Cell[][]; caption?: string }) {
  return (
    <div className="pl-table-wrap">
      <table className="pl-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, i) => (
                <td key={i} className={typeof v === 'number' ? 'is-num' : v === null ? 'is-null' : ''}>
                  {v === null ? 'NULL' : typeof v === 'number' ? nf.format(v) : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Preview({ db, name, version, state }: { db: Database | null; name: string; version: number; state: NodeState }) {
  // `version` change à chaque build : l'aperçu est relu après chaque exécution.
  const data = useMemo(() => (db && version >= 0 ? preview(db, name) : null), [db, name, version]);
  if (!db) return <p className="pl-body pl-muted">Préparation de la base…</p>;
  if (!data) return <p className="pl-body pl-muted">Pas encore de table : exécutez le modèle.</p>;
  return (
    <div className="pl-preview">
      <h3>
        Aperçu {state === 'stale' ? '(build précédent) ' : ''}: {Math.min(20, data.total)} premières lignes sur {nf.format(data.total)}
      </h3>
      <MiniTable columns={data.columns.length ? data.columns : tableColumns(db, name)} rows={data.rows} />
    </div>
  );
}

function LineageTree({ node, runs, root = false }: { node: LineageNode; runs: Record<string, ModelRun>; root?: boolean }) {
  const run = runs[node.model];
  const missing = run?.ok && !run.columns.includes(node.column);
  const item = (
    <>
      <code>{node.id}</code>
      {missing && <span className="pl-missing"> absente du résultat actuel</span>}
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <li key={c.id}>
              <LineageTree node={c} runs={runs} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
  return root ? (
    <ul className="pl-tree">
      <li>{item}</li>
    </ul>
  ) : (
    item
  );
}
