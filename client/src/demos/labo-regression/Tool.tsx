import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { examples, type Example } from './examples';
import { InputError, parseCsv, readFile } from './csv';
import {
  alignDesign,
  buildDesign,
  coefTable,
  diagnose,
  fmtCoef,
  fmtNum,
  fmtP,
  ols,
  stars,
  termLabel,
  type Dataset,
  type Design,
  type Diagnostics,
  type Fit,
  type SeKind,
  type Spec,
} from './model';
import { bpVerdict, cookVerdict, jbVerdict, readCoef, vifVerdict, type Verdict } from './interpret';
import { CooksPlot, QQPlot, ResidualPlot } from './charts';

type Source = { kind: 'example'; ex: Example } | { kind: 'file'; name: string; data: Dataset; notes: string[] };
interface Pinned {
  id: number;
  label: string;
  spec: Spec;
}
interface Estimate {
  design: Design;
  fit: Fit;
  diag: Diagnostics;
}

const MAX_PINNED = 3;
const sameSpec = (a: Spec, b: Spec) => JSON.stringify(a) === JSON.stringify(b);

function estimate(data: Dataset, spec: Spec, withDiag: boolean): Estimate | { error: string } {
  try {
    const design = buildDesign(data, spec);
    if (design.X.length === 0) return { error: 'Aucune ligne complète pour ces variables : vérifiez les valeurs manquantes ou les logarithmes de valeurs négatives.' };
    const fit = ols(design.X, design.y, design.names);
    const diag = withDiag ? diagnose(alignDesign(design, fit), fit) : (null as unknown as Diagnostics);
    return { design, fit, diag };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Spécification par défaut d'un fichier chargé : la première colonne numérique est expliquée par les autres numériques. */
function defaultSpec(data: Dataset): Spec {
  const nums = data.columns.filter((c) => c.kind === 'num');
  const y = nums[0]!.name;
  return { y, logY: false, xs: nums.slice(1, 4).map((c) => ({ col: c.name, fn: 'lin', sq: false })), inter: [] };
}

export function Tool() {
  const EX = useMemo(() => examples(), []);
  const [source, setSource] = useState<Source>({ kind: 'example', ex: EX[0]! });
  const [spec, setSpec] = useState<Spec>(EX[0]!.spec);
  const [seKind, setSeKind] = useState<SeKind>('classic');
  const [pinned, setPinned] = useState<Pinned[]>(() => EX[0]!.presets.map((p, i) => ({ id: i, label: p.label, spec: p.spec })));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [interA, setInterA] = useState('');
  const [interB, setInterB] = useState('');
  const nextId = useRef(10);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useId();

  const data = source.kind === 'example' ? source.ex.data : source.data;
  const focus = source.kind === 'example' ? source.ex.focus : null;
  const numCols = data.columns.filter((c) => c.kind === 'num').map((c) => c.name);

  const pickExample = (ex: Example) => {
    setSource({ kind: 'example', ex });
    setSpec(ex.spec);
    setPinned(ex.presets.map((p) => ({ id: nextId.current++, label: p.label, spec: p.spec })));
    setLoadError(null);
    setInterA('');
    setInterB('');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const { data: d, notes } = parseCsv(await readFile(file));
      setSource({ kind: 'file', name: file.name, data: d, notes });
      setSpec(defaultSpec(d));
      setPinned([]);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof InputError ? e.message : `Lecture impossible : ${(e as Error).message}`);
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const est = useMemo(() => estimate(data, spec, true), [data, spec]);
  const pinnedFits = useMemo(() => pinned.map((p) => ({ p, est: estimate(data, p.spec, false) })), [data, pinned]);

  // Remet les sélecteurs d'interaction sur des variables encore présentes.
  const included = spec.xs.filter((x) => numCols.includes(x.col)).map((x) => x.col);
  useEffect(() => {
    if (!included.includes(interA)) setInterA(included[0] ?? '');
    if (!included.includes(interB) || interB === interA) setInterB(included.find((c) => c !== (included.includes(interA) ? interA : included[0])) ?? '');
  }, [included.join('|'), interA, interB]); // eslint-disable-line react-hooks/exhaustive-deps

  const setY = (y: string) => setSpec((s) => ({ ...s, y, xs: s.xs.filter((x) => x.col !== y), inter: s.inter.filter(([a, b]) => a !== y && b !== y) }));
  const toggleX = (col: string, on: boolean) =>
    setSpec((s) => ({
      ...s,
      xs: on ? [...s.xs, { col, fn: 'lin', sq: false }] : s.xs.filter((x) => x.col !== col),
      inter: on ? s.inter : s.inter.filter(([a, b]) => a !== col && b !== col),
    }));
  const patchX = (col: string, patch: Partial<Spec['xs'][number]>) => setSpec((s) => ({ ...s, xs: s.xs.map((x) => (x.col === col ? { ...x, ...patch } : x)) }));
  const addInter = () => {
    if (!interA || !interB || interA === interB) return;
    setSpec((s) => (s.inter.some(([a, b]) => (a === interA && b === interB) || (a === interB && b === interA)) ? s : { ...s, inter: [...s.inter, [interA, interB]] }));
  };

  const canPin = 'fit' in est && !pinned.some((p) => sameSpec(p.spec, spec)) && pinned.length < MAX_PINNED;
  const pin = () => {
    if (!canPin) return;
    setPinned((ps) => [...ps, { id: nextId.current++, label: `Modèle ${ps.length + 1}`, spec }]);
  };

  const labelOf = (i: number) => (('design' in est ? est.design.rows[i] ?? i : i) + 1).toString();

  return (
    <section
      className={`rg-tool${dragging ? ' is-drag' : ''}`}
      aria-label="Laboratoire de régression"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="rg-source">
        <div className="rg-source-pick">
          <span className="rg-label" id={`${ids}-ex`}>
            Scénarios simulés
          </span>
          <div className="rg-seg" role="group" aria-labelledby={`${ids}-ex`}>
            {EX.map((ex) => (
              <button key={ex.id} type="button" aria-pressed={source.kind === 'example' && source.ex.id === ex.id} onClick={() => pickExample(ex)}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rg-drop">
          <input ref={fileInput} id={`${ids}-file`} className="rg-file" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
          <label htmlFor={`${ids}-file`} className="btn">
            <Icon name="folder-open" />
            {reading ? 'Lecture…' : 'Charger un CSV'}
          </label>
          <span className="rg-drop-hint">ou glissez-le ici</span>
        </div>
      </div>
      <p className="rg-privacy">
        <Icon name="shield-check" size={14} />
        Tout est calculé dans votre navigateur : rien n’est envoyé, rien n’est conservé.
      </p>

      {loadError && (
        <div className="form-error rg-error" role="alert">
          <Icon name="circle-alert" />
          <p>{loadError}</p>
        </div>
      )}

      {source.kind === 'example' ? (
        <div className="rg-scenario">
          <p className="rg-scenario-problem">{source.ex.problem}</p>
          <p>{source.ex.guide}</p>
          <details>
            <summary>Les vraies valeurs de la simulation</summary>
            <p>{source.ex.truth}</p>
          </details>
        </div>
      ) : (
        <div className="rg-scenario">
          <p className="rg-scenario-problem">
            <Icon name="file-text" size={14} /> {source.name} · {data.n.toLocaleString('fr-FR')} lignes, {data.columns.length} colonnes utilisables
          </p>
          {source.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      <div className="rg-main">
        <SpecPanel
          ids={ids}
          data={data}
          spec={spec}
          setY={setY}
          setLogY={(logY) => setSpec((s) => ({ ...s, logY }))}
          toggleX={toggleX}
          patchX={patchX}
          included={included}
          interA={interA}
          interB={interB}
          setInterA={setInterA}
          setInterB={setInterB}
          addInter={addInter}
          removeInter={(i) => setSpec((s) => ({ ...s, inter: s.inter.filter((_, k) => k !== i) }))}
          reset={source.kind === 'example' ? () => setSpec(source.ex.spec) : null}
        />

        <div className="rg-results">
          {'error' in est ? (
            <div className="form-error rg-error" role="alert">
              <Icon name="circle-alert" />
              <p>{est.error}</p>
            </div>
          ) : (
            <Results est={est} spec={spec} seKind={seKind} setSeKind={setSeKind} focus={focus} canPin={canPin} pin={pin} pinnedFull={pinned.length >= MAX_PINNED} alreadyPinned={pinned.some((p) => sameSpec(p.spec, spec))} />
          )}
        </div>
      </div>

      {'fit' in est && (
        <DiagnosticsPanel
          est={est}
          labelOf={labelOf}
          seKind={seKind}
          useRobust={() => setSeKind('robust')}
        />
      )}

      <Compare items={pinnedFits} seKind={seKind} focus={focus} remove={(id) => setPinned((ps) => ps.filter((p) => p.id !== id))} load={(s) => setSpec(s)} />

      {dragging && (
        <div className="rg-dropzone" aria-hidden="true">
          <Icon name="file-text" size={20} />
          Déposez le fichier CSV pour l’analyser
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── Spécification ─────────────────────────── */

function SpecPanel(props: {
  ids: string;
  data: Dataset;
  spec: Spec;
  setY: (y: string) => void;
  setLogY: (b: boolean) => void;
  toggleX: (col: string, on: boolean) => void;
  patchX: (col: string, patch: Partial<Spec['xs'][number]>) => void;
  included: string[];
  interA: string;
  interB: string;
  setInterA: (s: string) => void;
  setInterB: (s: string) => void;
  addInter: () => void;
  removeInter: (i: number) => void;
  reset: (() => void) | null;
}) {
  const { ids, data, spec } = props;
  const nums = data.columns.filter((c) => c.kind === 'num');
  return (
    <aside className="rg-panel rg-spec" aria-labelledby={`${ids}-spec`}>
      <div className="rg-panel-head">
        <h2 id={`${ids}-spec`}>Spécification</h2>
        {props.reset && (
          <button type="button" className="rg-link" onClick={props.reset}>
            Modèle du scénario
          </button>
        )}
      </div>
      <div className="rg-spec-body">
        <label className="rg-field">
          <span className="rg-label">Variable expliquée (Y)</span>
          <select className="rg-select" value={spec.y} onChange={(e) => props.setY(e.target.value)}>
            {nums.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="rg-check">
          <input type="checkbox" checked={spec.logY} onChange={(e) => props.setLogY(e.target.checked)} />
          Prendre le logarithme de Y
        </label>

        <fieldset className="rg-xs">
          <legend className="rg-label">Variables explicatives (X)</legend>
          {data.columns
            .filter((c) => c.name !== spec.y)
            .map((c) => {
              const x = spec.xs.find((v) => v.col === c.name);
              return (
                <div key={c.name} className={`rg-x${x ? ' is-on' : ''}`}>
                  <label className="rg-check">
                    <input type="checkbox" checked={!!x} onChange={(e) => props.toggleX(c.name, e.target.checked)} />
                    <span className="rg-x-name">{c.name}</span>
                  </label>
                  {x && c.kind === 'num' && (
                    <div className="rg-x-opts">
                      <select
                        className="rg-select rg-select-sm"
                        aria-label={`Forme de ${c.name}`}
                        value={x.fn}
                        onChange={(e) => props.patchX(c.name, { fn: e.target.value as 'lin' | 'log' })}
                      >
                        <option value="lin">{c.name}</option>
                        <option value="log">log({c.name})</option>
                      </select>
                      <label className="rg-check rg-check-sm">
                        <input type="checkbox" checked={x.sq} onChange={(e) => props.patchX(c.name, { sq: e.target.checked })} />
                        + carré
                      </label>
                    </div>
                  )}
                  {x && c.kind === 'cat' && (
                    <p className="rg-x-note">
                      {c.levels.length - 1} indicatrice{c.levels.length > 2 ? 's' : ''}, référence « {c.levels[0]} »
                    </p>
                  )}
                </div>
              );
            })}
        </fieldset>

        <div className="rg-inter">
          <span className="rg-label">Interactions</span>
          {spec.inter.length > 0 && (
            <ul className="rg-inter-list">
              {spec.inter.map(([a, b], i) => (
                <li key={`${a}-${b}`}>
                  <span>
                    {a} × {b}
                  </span>
                  <button type="button" onClick={() => props.removeInter(i)} aria-label={`Retirer l’interaction ${a} × ${b}`}>
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {props.included.length >= 2 ? (
            <div className="rg-inter-add">
              <select className="rg-select rg-select-sm" aria-label="Première variable de l’interaction" value={props.interA} onChange={(e) => props.setInterA(e.target.value)}>
                {props.included.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">×</span>
              <select className="rg-select rg-select-sm" aria-label="Seconde variable de l’interaction" value={props.interB} onChange={(e) => props.setInterB(e.target.value)}>
                {props.included
                  .filter((c) => c !== props.interA)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn rg-btn-sm" onClick={props.addInter}>
                Ajouter
              </button>
            </div>
          ) : (
            <p className="rg-x-note">Cochez au moins deux variables numériques.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ─────────────────────────── Résultats ─────────────────────────── */

function Results({
  est,
  spec,
  seKind,
  setSeKind,
  focus,
  canPin,
  pin,
  pinnedFull,
  alreadyPinned,
}: {
  est: Estimate;
  spec: Spec;
  seKind: SeKind;
  setSeKind: (k: SeKind) => void;
  focus: string | null;
  canPin: boolean;
  pin: () => void;
  pinnedFull: boolean;
  alreadyPinned: boolean;
}) {
  const { fit, design } = est;
  const rows = coefTable(fit, seKind);
  const focusName = focus ? spec.xs.find((x) => x.col === focus) : undefined;
  const readName = focusName ? termLabel(focusName) : fit.names[1];
  const readRow = rows.find((r) => r.name === readName);
  const reading = readRow ? readCoef(readRow.name, readRow.beta, spec, design.yName) : null;
  const eq = rows.map((r, j) => `${j === 0 ? fmtCoef(r.beta) : `${r.beta < 0 ? '−' : '+'} ${fmtCoef(Math.abs(r.beta))}·${r.name}`}`).join(' ');
  return (
    <div className="rg-panel">
      <div className="rg-panel-head">
        <h2>Résultats</h2>
        <div className="rg-seg rg-seg-sm" role="group" aria-label="Erreurs-types utilisées pour t, p et l’intervalle">
          <button type="button" aria-pressed={seKind === 'classic'} onClick={() => setSeKind('classic')}>
            Classiques
          </button>
          <button type="button" aria-pressed={seKind === 'robust'} onClick={() => setSeKind('robust')}>
            Robustes HC1
          </button>
        </div>
      </div>
      <p className="rg-eq">
        <span className="rg-eq-y">{design.yName}</span> = {eq}
      </p>
      <dl className="rg-stats">
        <div>
          <dt>N</dt>
          <dd>{fit.n.toLocaleString('fr-FR')}</dd>
        </div>
        <div>
          <dt>R²</dt>
          <dd>{fmtNum(fit.r2, 3)}</dd>
        </div>
        <div>
          <dt>R² ajusté</dt>
          <dd>{fmtNum(fit.adjR2, 3)}</dd>
        </div>
        <div>
          <dt>F global</dt>
          <dd>
            {Number.isFinite(fit.F) ? fmtNum(fit.F, 1) : '–'}
            <small>p {fmtP(fit.Fp).startsWith('<') ? '' : '= '}{fmtP(fit.Fp)}</small>
          </dd>
        </div>
        <div>
          <dt>σ̂ résidus</dt>
          <dd>{fmtCoef(fit.sigma)}</dd>
        </div>
        <div>
          <dt>AIC · BIC</dt>
          <dd>
            {fmtNum(fit.aic, 1)}
            <small>{fmtNum(fit.bic, 1)}</small>
          </dd>
        </div>
      </dl>
      <div className="rg-table-wrap" tabIndex={0} aria-label="Tableau des coefficients">
        <table className="rg-table">
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col">Coefficient</th>
              <th scope="col" className={seKind === 'classic' ? 'is-active' : ''}>
                E.-t. classique
              </th>
              <th scope="col" className={seKind === 'robust' ? 'is-active' : ''}>
                E.-t. robuste
              </th>
              <th scope="col">t</th>
              <th scope="col">p</th>
              <th scope="col">IC à 95 %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, j) => (
              <tr key={r.name} className={focusName && r.name === termLabel(focusName) ? 'is-focus' : ''}>
                <th scope="row">{r.name}</th>
                <td>
                  {fmtCoef(r.beta)}
                  <span className="rg-stars" aria-label={stars(r.p) ? `significatif (${stars(r.p)})` : undefined}>
                    {stars(r.p)}
                  </span>
                </td>
                <td className={seKind === 'classic' ? 'is-active' : ''}>{fmtCoef(fit.seClassic[j]!)}</td>
                <td className={seKind === 'robust' ? 'is-active' : ''}>{fmtCoef(fit.seRobust[j]!)}</td>
                <td>{fmtNum(r.t, 2)}</td>
                <td>{fmtP(r.p)}</td>
                <td className="rg-ci">
                  [{fmtCoef(r.lo)} ; {fmtCoef(r.hi)}]
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rg-results-foot">
        <p className="rg-small">
          *** p &lt; 0,001 · ** p &lt; 0,01 · * p &lt; 0,05 · « · » p &lt; 0,1. t, p et intervalle utilisent les erreurs-types {seKind === 'robust' ? 'robustes (White, HC1)' : 'classiques'}, loi de
          Student à {fit.df.toLocaleString('fr-FR')} degrés de liberté.
        </p>
        {[...design.notes, ...(fit.aliased.length ? [`Retiré${fit.aliased.length > 1 ? 's' : ''} car parfaitement colinéaire${fit.aliased.length > 1 ? 's' : ''} aux autres régresseurs : ${fit.aliased.join(', ')}.`] : [])].map((n) => (
          <p key={n} className="rg-small rg-note">
            <Icon name="circle-alert" size={13} /> {n}
          </p>
        ))}
        {reading && (
          <p className="rg-reading">
            <b>Lecture.</b> {reading}
          </p>
        )}
        <div className="rg-pin">
          <button type="button" className="btn" onClick={pin} disabled={!canPin}>
            Ajouter ce modèle à la comparaison
          </button>
          {!canPin && <span className="rg-small">{alreadyPinned ? 'Ce modèle est déjà dans la comparaison.' : pinnedFull ? `${MAX_PINNED} modèles au plus : retirez-en un ci-dessous.` : ''}</span>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Diagnostics ─────────────────────────── */

const LEVEL_TEXT: Record<Verdict['level'], string> = { ok: 'OK', warn: 'À surveiller', alert: 'Problème' };

function VerdictCard({ title, v, children, action }: { title: string; v: Verdict; children: ReactNode; action?: ReactNode }) {
  return (
    <article className="rg-panel rg-diag">
      <div className="rg-panel-head">
        <h3>{title}</h3>
        <span className={`rg-pill rg-pill-${v.level}`}>
          <span className="rg-sr">{LEVEL_TEXT[v.level]} : </span>
          {v.label}
        </span>
      </div>
      <div className="rg-diag-chart">{children}</div>
      <div className="rg-diag-text">
        <p>{v.text}</p>
        {v.todo && (
          <p>
            <b>Que faire.</b> {v.todo}
          </p>
        )}
        {action}
      </div>
    </article>
  );
}

function DiagnosticsPanel({ est, labelOf, seKind, useRobust }: { est: Estimate; labelOf: (i: number) => string; seKind: SeKind; useRobust: () => void }) {
  const { fit, diag } = est;
  const flagged = useMemo(() => new Set(diag.influential.slice(0, 12)), [diag]);
  const bp = bpVerdict(diag);
  const jb = jbVerdict(diag, fit.n);
  const vv = vifVerdict(diag);
  const cv = cookVerdict(diag, fit.n, (i) => `ligne ${labelOf(i)}`);
  return (
    <section className="rg-diags" aria-labelledby="rg-diag-title">
      <h2 id="rg-diag-title" className="rg-h2">
        Diagnostics du modèle
      </h2>
      <div className="rg-diag-grid">
        <VerdictCard
          title="Résidus et valeurs ajustées"
          v={bp}
          action={
            bp.level === 'alert' && seKind === 'classic' ? (
              <button type="button" className="btn rg-btn-sm" onClick={useRobust}>
                Passer aux erreurs-types robustes
              </button>
            ) : undefined
          }
        >
          <ResidualPlot fit={fit} flagged={flagged} />
          <p className="rg-legend">Traits : ± écart-type des résidus par tranche de valeurs ajustées ; points foncés : observations influentes.</p>
        </VerdictCard>
        <VerdictCard title="Normalité des résidus" v={jb}>
          <QQPlot qq={diag.qq} />
        </VerdictCard>
        <VerdictCard title="Points influents" v={cv}>
          <CooksPlot cooks={diag.cooks} threshold={diag.cooksThreshold} labelOf={labelOf} />
        </VerdictCard>
        <VerdictCard title="Colinéarité (VIF)" v={vv}>
          {diag.vif.length ? (
            <ul className="rg-vif">
              {diag.vif.map((v) => {
                const w = Number.isFinite(v.vif) ? Math.min(100, (Math.log10(Math.max(1, v.vif)) / 2) * 100) : 100;
                return (
                  <li key={v.name}>
                    <span className="rg-vif-name">{v.name}</span>
                    <span className="rg-vif-track" aria-hidden="true">
                      <span className={`rg-vif-bar${v.vif > 10 ? ' is-high' : v.vif > 5 ? ' is-mid' : ''}`} style={{ width: `${w}%` }} />
                      <span className="rg-vif-tick" style={{ left: '35%' }} />
                      <span className="rg-vif-tick" style={{ left: '50%' }} />
                    </span>
                    <span className="rg-vif-val">{Number.isFinite(v.vif) ? fmtNum(v.vif, 1) : '∞'}</span>
                  </li>
                );
              })}
              <li className="rg-vif-scale" aria-hidden="true">
                <span />
                <span className="rg-vif-track">
                  <span style={{ left: '0%' }}>1</span>
                  <span style={{ left: '35%' }}>5</span>
                  <span style={{ left: '50%' }}>10</span>
                  <span style={{ left: '100%' }}>100</span>
                </span>
                <span />
              </li>
            </ul>
          ) : (
            <p className="rg-small">Un seul régresseur : pas de colinéarité possible.</p>
          )}
        </VerdictCard>
      </div>
    </section>
  );
}

/* ─────────────────────────── Comparaison ─────────────────────────── */

function Compare({
  items,
  seKind,
  focus,
  remove,
  load,
}: {
  items: { p: Pinned; est: Estimate | { error: string } }[];
  seKind: SeKind;
  focus: string | null;
  remove: (id: number) => void;
  load: (s: Spec) => void;
}) {
  const ok = items.filter((it): it is { p: Pinned; est: Estimate } => 'fit' in it.est);
  const terms: string[] = [];
  for (const it of ok) for (const n of it.est.fit.names) if (!terms.includes(n)) terms.push(n);
  const focusTerm = focus;
  // Variation du coefficient suivi, entre colonnes qui expliquent la même variable (même Y, même transformation).
  const withFocus = focusTerm ? ok.filter((it) => it.est.fit.names.includes(focusTerm)) : [];
  const lastY = withFocus[withFocus.length - 1]?.est.design.yName;
  const sameY = withFocus.filter((it) => it.est.design.yName === lastY);
  const coefOf = (it: { est: Estimate }) => it.est.fit.beta[it.est.fit.names.indexOf(focusTerm!)]!;
  const first = sameY.length > 1 ? coefOf(sameY[0]!) : null;
  const last = sameY.length > 1 ? coefOf(sameY[sameY.length - 1]!) : null;
  return (
    <section className="rg-compare" aria-labelledby="rg-cmp-title">
      <h2 id="rg-cmp-title" className="rg-h2">
        Modèles côte à côte
      </h2>
      {items.length === 0 ? (
        <p className="rg-empty">Ajoutez le modèle en cours avec « Ajouter ce modèle à la comparaison », modifiez-le, puis ajoutez la nouvelle version.</p>
      ) : (
        <>
          <div className="rg-table-wrap rg-panel" tabIndex={0} aria-label="Comparaison des modèles">
            <table className="rg-table rg-cmp">
              <thead>
                <tr>
                  <th scope="col">Variable</th>
                  {items.map((it) => (
                    <th scope="col" key={it.p.id}>
                      <div className="rg-cmp-head">
                        <button type="button" className="rg-link" onClick={() => load(it.p.spec)} title="Recharger ce modèle dans l’éditeur">
                          {it.p.label}
                        </button>
                        <button type="button" className="rg-x-btn" onClick={() => remove(it.p.id)} aria-label={`Retirer ${it.p.label} de la comparaison`}>
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                      <span className="rg-cmp-y">{'fit' in it.est ? it.est.design.yName : ''}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t} className={t === focusTerm ? 'is-focus' : ''}>
                    <th scope="row">{t}</th>
                    {items.map((it) => {
                      if (!('fit' in it.est)) return <td key={it.p.id}>–</td>;
                      const f = it.est.fit;
                      const j = f.names.indexOf(t);
                      if (j < 0) return <td key={it.p.id} className="rg-cmp-absent" />;
                      const se = seKind === 'robust' ? f.seRobust[j]! : f.seClassic[j]!;
                      const p = coefTable(f, seKind)[j]!.p;
                      return (
                        <td key={it.p.id}>
                          {fmtCoef(f.beta[j]!)}
                          <span className="rg-stars">{stars(p)}</span>
                          <span className="rg-cmp-se">({fmtCoef(se)})</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {(
                  [
                    ['N', (f: Fit) => f.n.toLocaleString('fr-FR')],
                    ['R²', (f: Fit) => fmtNum(f.r2, 3)],
                    ['R² ajusté', (f: Fit) => fmtNum(f.adjR2, 3)],
                    ['AIC', (f: Fit) => fmtNum(f.aic, 1)],
                  ] as const
                ).map(([label, get]) => (
                  <tr key={label} className="rg-cmp-stat">
                    <th scope="row">{label}</th>
                    {items.map((it) => (
                      <td key={it.p.id}>{'fit' in it.est ? get(it.est.fit) : 'error' in it.est ? 'erreur' : ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rg-small">
            Erreurs-types {seKind === 'robust' ? 'robustes (HC1)' : 'classiques'} entre parenthèses. Un clic sur le nom d’un modèle le recharge dans l’éditeur.
            {focusTerm && first !== null && last !== null && Math.abs(last - first) > 1e-12 && (
              <>
                {' '}
                Le coefficient de « {focusTerm} » passe de <b>{fmtCoef(first)}</b> à <b>{fmtCoef(last)}</b> entre les modèles qui expliquent {lastY} ({last > first ? '+' : '−'}
                {fmtNum((Math.abs(last - first) / Math.abs(first)) * 100, 0)} %).
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
