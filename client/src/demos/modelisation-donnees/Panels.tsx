import { Fragment, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { loadSqlEngine } from '../sql-lab/sqljs';
import {
  DIALECTS,
  NORM_STEPS,
  SEVERITY_LABEL,
  generateDDL,
  issueCounts,
  sampleSteps,
  tableurModel,
  type Dialect,
  type Fix,
  type Issue,
  type Model,
  type TemplateId,
} from './model';

/* ───────────────────── Diagnostic ───────────────────── */

export function DiagnosticsPanel({
  issues,
  template,
  onFix,
  onFixAll,
  onShow,
  onOpenNormalize,
}: {
  issues: Issue[];
  template: TemplateId | 'import';
  onFix: (fix: Fix) => void;
  onFixAll: () => void;
  onShow: (tableId: string) => void;
  onOpenNormalize: () => void;
}) {
  const counts = issueCounts(issues);
  const fixable = issues.filter((i) => i.fix).length;
  return (
    <div className="md-diag">
      <div className="md-diag-head">
        <p className="md-diag-summary" aria-live="polite">
          {issues.length === 0 ? (
            <>
              <Icon name="check" size={15} /> Aucun problème détecté par les contrôles de l’outil.
            </>
          ) : (
            <>
              {counts.error > 0 && <span className="md-pill md-pill--error">{counts.error} bloquant{counts.error > 1 ? 's' : ''}</span>}
              {counts.warning > 0 && <span className="md-pill md-pill--warning">{counts.warning} à corriger</span>}
              {counts.info > 0 && (
                <span className="md-pill md-pill--info">
                  {counts.info} conseil{counts.info > 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </p>
        {fixable > 0 && (
          <button type="button" className="md-btn md-btn--primary" onClick={onFixAll}>
            Tout corriger automatiquement ({fixable})
          </button>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="md-issues">
          {issues.map((i) => (
            <li key={i.key} className={`md-issue md-issue--${i.severity}`}>
              <div className="md-issue-top">
                <span className={`md-pill md-pill--${i.severity}`}>{SEVERITY_LABEL[i.severity]}</span>
                {i.normalForm && <span className="md-pill">{i.normalForm}</span>}
                <button type="button" className="md-where" onClick={() => onShow(i.tableId)} title="Afficher la table dans l’éditeur">
                  {i.where}
                </button>
              </div>
              <strong>{i.title}</strong>
              <p>{i.why}</p>
              <div className="md-issue-actions">
                {i.fix && (
                  <button type="button" className="md-btn" onClick={() => onFix(i.fix!)}>
                    {i.fixLabel}
                  </button>
                )}
                {i.normalForm && template === 'tableur' && (
                  <button type="button" className="md-btn" onClick={onOpenNormalize}>
                    Ouvrir l’assistant de normalisation
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────── SQL ───────────────────── */

const SQL_KW =
  /\b(CREATE|TABLE|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|NOT|NULL|UNIQUE|INDEX|ON|GENERATED|BY|DEFAULT|AS|IDENTITY|AUTO_INCREMENT|ENGINE|CHARSET|PRAGMA|INTEGER|BIGINT|INT|NUMERIC|DECIMAL|REAL|DOUBLE|PRECISION|TEXT|VARCHAR|BOOLEAN|DATE|DATETIME|TIMESTAMP)\b/g;

function SqlCode({ sql }: { sql: string }) {
  return (
    <pre className="md-sql" tabIndex={0} aria-label="Script SQL généré">
      <code>
        {sql.split('\n').map((line, i) => (
          <Fragment key={i}>
            {line.trimStart().startsWith('--') ? (
              <span className="md-tk-com">{line}</span>
            ) : (
              line.split(SQL_KW).map((part, j) => (j % 2 === 1 ? <span key={j} className="md-tk-kw">{part}</span> : <Fragment key={j}>{part}</Fragment>))
            )}
            {'\n'}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}

export function SqlPanel({ model, title }: { model: Model; title: string }) {
  const [dialect, setDialect] = useState<Dialect>('postgresql');
  const [msg, setMsg] = useState('');
  const sql = useMemo(() => generateDDL(model, dialect, title), [model, dialect, title]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setMsg('Script copié dans le presse-papiers.');
    } catch {
      setMsg('Copie refusée par le navigateur : sélectionnez le texte puis copiez-le.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([sql], { type: 'application/sql;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `modele-${dialect}.sql`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(`Fichier modele-${dialect}.sql téléchargé.`);
  };
  return (
    <div className="md-sqlpanel">
      <div className="md-seg" role="radiogroup" aria-label="Dialecte SQL">
        {DIALECTS.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={dialect === d.id} onClick={() => setDialect(d.id)}>
            {d.label}
          </button>
        ))}
      </div>
      <p className="md-note">
        Tables créées dans l’ordre des dépendances, puis les index.{' '}
        {dialect === 'sqlite' ? 'SQLite n’a pas de type DATE : les dates restent du texte ISO.' : dialect === 'mysql' ? 'Un TEXT servant de clé devient VARCHAR(255), car MySQL n’indexe pas un TEXT sans longueur.' : 'Les identifiants entiers sont générés par la base (IDENTITY).'}
      </p>
      <SqlCode sql={sql} />
      <div className="md-row">
        <button type="button" className="md-btn" onClick={copy}>
          Copier
        </button>
        <button type="button" className="md-btn" onClick={download}>
          <Icon name="download" size={14} /> Télécharger le .sql
        </button>
        <span className="md-note" role="status">
          {msg}
        </span>
      </div>
    </div>
  );
}

/* ───────────────────── Test dans SQLite ───────────────────── */

interface StepResult {
  label: string;
  expect: 'ok' | 'reject';
  passed: boolean;
  message: string;
}
type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'failed'; error: string }
  | { status: 'done'; tables: number; indexes: number; steps: StepResult[]; counts: [string, number][]; ms: number };

export function TestPanel({ model }: { model: Model }) {
  const [state, setState] = useState<TestState>({ status: 'idle' });
  useEffect(() => setState({ status: 'idle' }), [model]);
  const ddl = useMemo(() => generateDDL(model, 'sqlite', 'Test'), [model]);

  const run = async () => {
    setState({ status: 'running' });
    let SQL;
    try {
      SQL = await loadSqlEngine();
    } catch (e) {
      setState({ status: 'failed', error: `Le moteur SQLite n’a pas pu démarrer dans ce navigateur (${(e as Error).message}).` });
      return;
    }
    const db = new SQL.Database();
    const t0 = performance.now();
    try {
      try {
        db.exec(ddl);
      } catch (e) {
        setState({ status: 'failed', error: `Création refusée par SQLite : ${(e as Error).message}` });
        return;
      }
      const steps: StepResult[] = sampleSteps(model).map((s) => {
        try {
          db.run(s.sql);
          return { label: s.label, expect: s.expect, passed: s.expect === 'ok', message: s.expect === 'ok' ? 'insérées' : 'acceptée : l’intégrité référentielle n’est pas garantie' };
        } catch (e) {
          const msg = (e as Error).message;
          return { label: s.label, expect: s.expect, passed: s.expect === 'reject', message: s.expect === 'reject' ? `rejetée par SQLite (${msg})` : `erreur : ${msg}` };
        }
      });
      const counts: [string, number][] = model.tables
        .filter((t) => t.columns.length > 0)
        .map((t) => {
          try {
            const r = db.exec(`SELECT COUNT(*) FROM "${t.name.replace(/"/g, '""')}"`);
            return [t.name, Number(r[0]?.values[0]?.[0] ?? 0)] as [string, number];
          } catch {
            return [t.name, 0] as [string, number];
          }
        });
      const tables = Number(db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'")[0]?.values[0]?.[0] ?? 0);
      const indexes = Number(db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL")[0]?.values[0]?.[0] ?? 0);
      setState({ status: 'done', tables, indexes, steps, counts, ms: performance.now() - t0 });
    } finally {
      db.close();
    }
  };

  const allPassed = state.status === 'done' && state.steps.every((s) => s.passed);
  return (
    <div className="md-test">
      <p className="md-note">
        Le script SQLite est exécuté dans une base vide, ici, dans votre navigateur. Trois lignes d’exemple sont insérées dans chaque table (les clés étrangères
        reprennent des valeurs existantes), puis une ligne orpheline, qui doit être refusée avec <code>PRAGMA foreign_keys = ON</code>.
      </p>
      <button type="button" className="md-btn md-btn--primary" onClick={run} disabled={state.status === 'running'}>
        <Icon name="play" size={14} /> {state.status === 'running' ? 'Test en cours…' : 'Tester le schéma dans SQLite'}
      </button>

      <div aria-live="polite">
        {state.status === 'failed' && <p className="md-result md-result--ko">{state.error}</p>}
        {state.status === 'done' && (
          <>
            <p className={`md-result ${allPassed ? 'md-result--ok' : 'md-result--ko'}`}>
              {allPassed
                ? `Schéma valide : ${state.tables} tables et ${state.indexes} index créés, données d’essai insérées, intégrité référentielle vérifiée (${Math.max(1, Math.round(state.ms))} ms).`
                : 'Le schéma est créé, mais au moins un essai n’a pas donné le résultat attendu : voir le détail.'}
            </p>
            <ul className="md-steps">
              {state.steps.map((s, i) => (
                <li key={i} className={s.passed ? 'is-ok' : 'is-ko'}>
                  <span aria-hidden="true">{s.passed ? '✓' : '✗'}</span>
                  <span>
                    <strong>{s.expect === 'reject' ? 'Insertion orpheline' : 'Insertion'}</strong> · {s.label} : {s.message}
                  </span>
                </li>
              ))}
            </ul>
            {state.steps.every((s) => s.expect === 'ok') && <p className="md-note">Aucune clé étrangère : pas de test d’intégrité référentielle possible.</p>}
            <p className="md-note">Lignes par table : {state.counts.map(([n, c]) => `${n} ${c}`).join(' · ')}</p>
          </>
        )}
      </div>
      <details className="md-details">
        <summary>Voir le script SQLite exécuté</summary>
        <SqlCode sql={ddl} />
      </details>
    </div>
  );
}

/* ───────────────────── Assistant de normalisation ───────────────────── */

function Schema({ model, other, side }: { model: Model; other: Model; side: 'before' | 'after' }) {
  return (
    <div className="md-mini">
      {model.tables.map((t) => {
        const twin = other.tables.find((x) => x.name === t.name);
        return (
          <div key={t.id} className="md-mini-table">
            <div className="md-mini-name">
              {t.name}
              {side === 'after' && !twin && <span className="md-pill md-pill--new">nouvelle</span>}
              {side === 'before' && !twin && <span className="md-pill md-pill--gone">remplacée</span>}
            </div>
            <div className="md-mini-cols">
              {t.columns.map((c) => {
                const kept = twin?.columns.some((x) => x.name === c.name);
                const cls = twin && !kept ? (side === 'before' ? ' is-gone' : ' is-new') : '';
                return (
                  <span key={c.id} className={`md-mini-col${cls}${c.pk ? ' is-pk' : ''}`}>
                    {(c.pk || c.fk) && <b>{c.pk ? 'PK' : 'FK'}</b>}
                    {c.name}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NormalizePanel({
  template,
  stage,
  onLoadTableur,
  onApply,
  onShowSql,
}: {
  template: TemplateId | 'import';
  stage: number;
  onLoadTableur: () => void;
  onApply: (stage: number) => void;
  onShowSql: () => void;
}) {
  if (template !== 'tableur') {
    return (
      <div className="md-norm">
        <p>
          L’assistant part d’un export de tableur « une ligne par commande » : produits répétés en colonnes, client recopié dans chaque ligne, total
          calculé. Il le remet en forme en trois étapes, de la 1<sup>re</sup> à la 3<sup>e</sup> forme normale, en montrant le schéma avant et après chacune.
        </p>
        <button type="button" className="md-btn md-btn--primary" onClick={onLoadTableur}>
          Charger le tableur à normaliser
        </button>
      </div>
    );
  }
  const before = stage === 0 ? tableurModel() : NORM_STEPS[stage - 1]!.build();
  const step = NORM_STEPS[stage];
  return (
    <div className="md-norm">
      <ol className="md-norm-progress" aria-label="Étapes de normalisation">
        {NORM_STEPS.map((s, i) => (
          <li key={s.form} className={i < stage ? 'is-done' : i === stage ? 'is-current' : ''} aria-current={i === stage ? 'step' : undefined}>
            <span>{i < stage ? '✓' : i + 1}</span> {s.form}
          </li>
        ))}
      </ol>
      {step ? (
        <>
          <h3 className="md-subh">
            Étape {stage + 1} · {step.form} : {step.title}
          </h3>
          <p>
            <strong>Le problème.</strong> {step.problem}
          </p>
          <p>
            <strong>La correction.</strong> {step.action}
          </p>
          <div className="md-compare">
            <div>
              <h4>Avant</h4>
              <Schema model={before} other={step.build()} side="before" />
            </div>
            <div>
              <h4>Après</h4>
              <Schema model={step.build()} other={before} side="after" />
            </div>
          </div>
          <button type="button" className="md-btn md-btn--primary" onClick={() => onApply(stage + 1)}>
            Appliquer l’étape {stage + 1} ({step.form})
          </button>
          <p className="md-note">Le diagramme est remplacé par le schéma « après » ; « Annuler » revient en arrière.</p>
        </>
      ) : (
        <>
          <p className="md-result md-result--ok">
            Le modèle est en troisième forme normale : quatre tables, chaque information n’est écrite qu’à un seul endroit, et le diagnostic ne relève plus rien.
          </p>
          <div className="md-row">
            <button type="button" className="md-btn md-btn--primary" onClick={onShowSql}>
              Voir le SQL généré
            </button>
            <button type="button" className="md-btn" onClick={() => onApply(0)}>
              Recommencer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
