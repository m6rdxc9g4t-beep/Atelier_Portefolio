import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { Icon } from '../../components/Icon';
import {
  DATE_FORMAT_LABEL,
  detectDelimiter,
  FREQ_LABEL,
  formatPeriod,
  guessColumns,
  InputError,
  isoDate,
  prepareSeries,
  SEASON_LENGTH,
  type ColumnGuess,
  type Freq,
  type Note,
  type Prepared,
} from './csv';
import { examples, type Example } from './examples';
import { explain, fmtNum, fmtPct } from './explain';
import { analyze, BOOT_SEED, FINAL_PATHS, type Analysis, type ModelId } from './model';
import { ForecastChart, SeasonProfile, SharesBar, TrendChart } from './charts';
import { Method } from './Method';
import './prevision-ventes.css';

const HORIZONS: Record<Freq, number[]> = { month: [6, 12, 18, 24], week: [8, 13, 26, 52], day: [7, 14, 28, 56] };
const DEFAULT_H: Record<Freq, number> = { month: 12, week: 26, day: 28 };
const UNIT_WORD: Record<Freq, [string, string]> = { month: ['mois', 'mois'], week: ['semaine', 'semaines'], day: ['jour', 'jours'] };
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PERIODS = 2000;

interface Loaded {
  source: { kind: 'example'; example: Example } | { kind: 'file'; name: string };
  rows: string[][];
  delimiter: string;
  guess: ColumnGuess;
}

interface Settings {
  dateCol: number;
  valueCol: number;
  freq: Freq | 'auto';
  horizon: number | null;
}

const DELIM_LABEL: Record<string, string> = { ';': 'point-virgule', ',': 'virgule', '\t': 'tabulation', '|': 'barre verticale' };

/** Découpe un texte CSV (papaparse) et repère les colonnes ; lève une InputError lisible sinon. */
function load(text: string, source: Loaded['source']): Loaded {
  const clean = text.replace(/^﻿/, '');
  if (!clean.trim()) throw new InputError('Le fichier est vide.');
  const delimiter = detectDelimiter(clean);
  const parsed = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: 'greedy' });
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (rows.length < 3) throw new InputError('Le fichier contient moins de trois lignes : il faut un historique (une ligne par date).');
  const guess = guessColumns(rows, delimiter);
  if (!guess || guess.dateCol < 0)
    throw new InputError('Aucune colonne de dates reconnue. Formats acceptés : 2025-03-31, 31/03/2025, 03/2025, 2025-03, « mars 2025 ».');
  if (guess.valueCol < 0) throw new InputError('Aucune colonne numérique trouvée à côté des dates : il faut une colonne de ventes (quantités ou montants).');
  return { source, rows, delimiter, guess };
}

async function readFile(file: File): Promise<string> {
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/i.test(file.name))
    throw new InputError('Classeur non pris en charge : enregistrez la feuille au format CSV (Fichier › Enregistrer sous › CSV), puis déposez-la ici.');
  if (file.size > MAX_BYTES) throw new InputError(`Fichier trop volumineux (${fmtNum(file.size / 1048576, 1)} Mo, 15 Mo au plus) : agrégez-le au jour avant de le charger.`);
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf); // export Excel français
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvNum = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '');

export default function PrevisionVentes() {
  const EX = useMemo(() => examples(), []);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<ModelId | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useId();

  const applyLoaded = useCallback((l: Loaded) => {
    setLoaded(l);
    setSettings({ dateCol: l.guess.dateCol, valueCol: l.guess.valueCol, freq: 'auto', horizon: null });
    setLoadError(null);
    setChosen(null);
  }, []);

  const pickExample = useCallback(
    (ex: Example) => {
      try {
        applyLoaded(load(ex.csv, { kind: 'example', example: ex }));
      } catch (e) {
        setLoadError((e as Error).message);
      }
    },
    [applyLoaded],
  );

  useEffect(() => {
    pickExample(EX[0]);
  }, [EX, pickExample]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const text = await readFile(file);
      applyLoaded(load(text, { kind: 'file', name: file.name }));
    } catch (e) {
      setLoaded(null);
      setAnalysis(null);
      setLoadError(e instanceof InputError ? e.message : `Lecture impossible : ${(e as Error).message}`);
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const prep = useMemo((): { ok: Prepared; error?: never } | { ok?: never; error: string } | null => {
    if (!loaded || !settings) return null;
    try {
      const p = prepareSeries(loaded.rows, loaded.guess, settings.dateCol, settings.valueCol, loaded.delimiter, settings.freq);
      if (p.series.values.length > MAX_PERIODS) {
        const drop = p.series.values.length - MAX_PERIODS;
        p.series = { ...p.series, start: p.series.start + drop, values: p.series.values.slice(drop), imputed: p.series.imputed.map((i) => i - drop).filter((i) => i >= 0) };
        p.notes.push({ level: 'info', text: `Série longue : seules les ${fmtNum(MAX_PERIODS)} dernières périodes sont modélisées.` });
      }
      return { ok: p };
    } catch (e) {
      return { error: e instanceof InputError ? e.message : `Erreur de lecture : ${(e as Error).message}` };
    }
  }, [loaded, settings]);

  const freq: Freq | null = prep?.ok?.series.freq ?? null;
  const horizon = freq ? (settings?.horizon ?? DEFAULT_H[freq]) : 0;

  useEffect(() => {
    if (!prep?.ok || !freq) {
      setAnalysis(null);
      return;
    }
    setBusy(true);
    setAnalysisError(null);
    const values = prep.ok.series.values;
    // Laisse le navigateur afficher l'état « calcul » avant l'estimation (quelques dizaines de millisecondes).
    const t = window.setTimeout(() => {
      try {
        setAnalysis(analyze(values, SEASON_LENGTH[freq], horizon));
      } catch (e) {
        setAnalysis(null);
        setAnalysisError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [prep, freq, horizon]);

  const series = prep?.ok?.series ?? null;
  const unit = loaded?.source.kind === 'example' ? loaded.source.example.unit : '';
  const model = analysis ? (analysis.models.find((m) => m.id === (chosen ?? analysis.bestId)) ?? analysis.models[0]) : null;
  const paragraphs = useMemo(() => (analysis && series && model ? explain(series, analysis, model.id, unit) : []), [analysis, series, model, unit]);
  const error = loadError ?? prep?.error ?? analysisError;
  const exampleId = loaded?.source.kind === 'example' ? loaded.source.example.id : null;
  const valueName = loaded && settings ? loaded.guess.names[settings.valueCol] : '';

  const exportForecast = () => {
    if (!series || !model || !analysis) return;
    const lines = ['Période;Prévision;Borne basse 80 %;Borne haute 80 %;Borne basse 95 %;Borne haute 95 %'];
    model.band.mean.forEach((v, k) => {
      const b = model.band;
      lines.push([isoDate(series.start + series.values.length + k, series.freq), csvNum(v), csvNum(b.lo80[k]), csvNum(b.hi80[k]), csvNum(b.lo95[k]), csvNum(b.hi95[k])].join(';'));
    });
    const base = loaded?.source.kind === 'file' ? loaded.source.name.replace(/\.[^.]+$/, '') : (exampleId ?? 'serie');
    download(`prevision-${base}-${model.id}.csv`, lines.join('\r\n'));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const set = (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setChosen(null);
  };

  return (
    <main className="demo-page prevision-ventes">
      <div className="wrap">
        <header className="pv-head">
          <h1>Prévoir vos ventes, avec la marge d’erreur et sa justification</h1>
          <p className="sec-lede">
            Chargez l’historique de vos ventes : quatre modèles sont mis à l’épreuve sur les dernières périodes, le plus juste est retenu, et la prévision
            arrive avec ses intervalles à 80 % et 95 % et une lecture en clair.
          </p>
          <ul className="chips pv-skills" aria-label="Compétences mises en œuvre">
            {['Séries temporelles', 'Holt-Winters', 'Validation hors échantillon', 'Intervalles par bootstrap', 'TypeScript dans le navigateur'].map((s) => (
              <li key={s} className="chip">
                {s}
              </li>
            ))}
          </ul>
        </header>

        <section
          className={`pv-tool${dragging ? ' is-drag' : ''}`}
          aria-label="Outil de prévision"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="pv-source">
            <div className="pv-source-pick">
              <span className="pv-label" id={`${ids}-ex`}>
                Exemples simulés
              </span>
              <div className="pv-seg" role="group" aria-labelledby={`${ids}-ex`}>
                {EX.map((ex) => (
                  <button key={ex.id} type="button" aria-pressed={exampleId === ex.id} onClick={() => pickExample(ex)} title={ex.hint}>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pv-drop">
              <input
                ref={fileInput}
                id={`${ids}-file`}
                className="pv-file"
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <label htmlFor={`${ids}-file`} className="btn btn-primary">
                <Icon name="folder-open" />
                {reading ? 'Lecture…' : 'Charger votre CSV'}
              </label>
              <span className="pv-drop-hint">ou glissez-le ici</span>
            </div>
          </div>
          <p className="pv-privacy">
            <Icon name="shield-check" size={14} />
            Le fichier est lu dans votre navigateur : rien n’est envoyé, rien n’est conservé.
          </p>

          {loaded?.source.kind === 'example' && (
            <div className="pv-sim">
              <span>
                <b>Données simulées.</b> {loaded.source.example.hint}
              </span>
              <button type="button" className="pv-link" onClick={() => loaded.source.kind === 'example' && download(loaded.source.example.filename, loaded.source.example.csv)}>
                <Icon name="download" size={14} />
                Télécharger ce CSV
              </button>
            </div>
          )}
          {loaded?.source.kind === 'file' && (
            <div className="pv-sim">
              <span>
                <Icon name="file-text" size={14} /> <b>{loaded.source.name}</b> · {fmtNum(prep?.ok?.rowsUsed ?? 0, 0)} lignes lues
              </span>
            </div>
          )}

          {loaded && settings && (
            <div className="pv-settings">
              <label>
                <span className="pv-label">Colonne des dates</span>
                <select className="pv-select" value={settings.dateCol} onChange={(e) => set({ dateCol: Number(e.target.value) })}>
                  {(loaded.guess.dateCols.length ? loaded.guess.dateCols : [settings.dateCol]).map((j) => (
                    <option key={j} value={j}>
                      {loaded.guess.names[j]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="pv-label">Colonne à prévoir</span>
                <select className="pv-select" value={settings.valueCol} onChange={(e) => set({ valueCol: Number(e.target.value) })}>
                  {loaded.guess.numericCols.map((j) => (
                    <option key={j} value={j}>
                      {loaded.guess.names[j]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="pv-label">Pas de temps</span>
                <select
                  className="pv-select"
                  value={freq ?? 'auto'}
                  disabled={!prep?.ok}
                  onChange={(e) => set({ freq: e.target.value as Freq, horizon: null })}
                >
                  {(['day', 'week', 'month'] as Freq[]).map((f) => (
                    <option key={f} value={f} disabled={!!prep?.ok && ['day', 'week', 'month'].indexOf(f) < ['day', 'week', 'month'].indexOf(prep.ok.rawFreq)}>
                      {FREQ_LABEL[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="pv-label">Horizon</span>
                <select className="pv-select" value={horizon} disabled={!freq} onChange={(e) => set({ horizon: Number(e.target.value) })}>
                  {(freq ? HORIZONS[freq] : []).map((h) => (
                    <option key={h} value={h}>
                      {h} {UNIT_WORD[freq!][h > 1 ? 1 : 0]}
                    </option>
                  ))}
                </select>
              </label>
              {prep?.ok && (
                <p className="pv-detected">
                  Lu : séparateur {DELIM_LABEL[loaded.delimiter] ?? loaded.delimiter}, décimale « {prep.ok.decimal} », dates {DATE_FORMAT_LABEL[prep.ok.dateFormat]}, données au{' '}
                  {FREQ_LABEL[prep.ok.rawFreq].toLowerCase()} · <b>{fmtNum(prep.ok.series.values.length, 0)}</b> périodes, de {formatPeriod(prep.ok.series.start, prep.ok.series.freq)} à{' '}
                  {formatPeriod(prep.ok.series.start + prep.ok.series.values.length - 1, prep.ok.series.freq)}
                </p>
              )}
            </div>
          )}

          {prep?.ok && (prep.ok.notes.length > 0 || (analysis?.limits.length ?? 0) > 0) && <Notes notes={[...prep.ok.notes, ...(analysis?.limits ?? []).map((t): Note => ({ level: 'warn', text: t }))]} />}

          {error && (
            <div className="form-error pv-error" role="alert">
              <Icon name="circle-alert" />
              <div>
                <p>{error}</p>
                <button type="button" className="btn" onClick={() => pickExample(EX[0])}>
                  Revenir à l’exemple
                </button>
              </div>
            </div>
          )}

          {!error && !analysis && (
            <div className="pv-empty" aria-live="polite">
              {busy || reading ? 'Estimation des modèles…' : 'Choisissez un exemple ou chargez un fichier CSV (une colonne de dates, une colonne de ventes).'}
            </div>
          )}

          {!error && analysis && series && model && (
            <div className={`pv-results${busy ? ' is-busy' : ''}`} aria-busy={busy}>
              <section className="pv-panel pv-main" aria-labelledby={`${ids}-chart`}>
                <div className="pv-panel-head">
                  <h2 id={`${ids}-chart`}>
                    Historique et prévision <span>· {model.name}</span>
                  </h2>
                  <div className="pv-legend" aria-hidden="true">
                    <span className="hist">Observé{valueName ? ` (${valueName})` : ''}</span>
                    <span className="fc">Prévision</span>
                    <span className="b80">80 %</span>
                    <span className="b95">95 %</span>
                    {showTest && <span className="test">Test</span>}
                  </div>
                  <label className="pv-check">
                    <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} disabled={!model.backtest} />
                    Montrer le test hors échantillon
                  </label>
                </div>
                <ForecastChart series={series} band={model.band} unit={unit} modelName={model.name} test={showTest && model.backtest ? model.backtest.last : null} />
                {showTest && model.backtest && (
                  <p className="pv-small">
                    Zone grisée : le modèle a été réestimé sans ces {model.backtest.last.forecast.length} périodes, puis comparé à ce qui s’est réellement passé.
                  </p>
                )}
              </section>

              <section className="pv-panel pv-read" aria-labelledby={`${ids}-read`}>
                <div className="pv-panel-head">
                  <h2 id={`${ids}-read`}>Lecture</h2>
                  <span className="pv-meta">générée par règles, sans IA</span>
                </div>
                <div aria-live="polite">
                  {paragraphs.map((p) => (
                    <p key={p.title}>
                      <b>{p.title}.</b> {p.text}
                    </p>
                  ))}
                </div>
              </section>
              <section className="pv-panel" aria-labelledby={`${ids}-models`}>
                <div className="pv-panel-head">
                  <h2 id={`${ids}-models`}>Comparaison hors échantillon</h2>
                  {analysis.plan && (
                    <span className="pv-meta">
                      {analysis.plan.origins.length} origine{analysis.plan.origins.length > 1 ? 's' : ''} × {analysis.plan.horizon} périodes
                    </span>
                  )}
                </div>
                <ModelTable analysis={analysis} chosen={model.id} onChoose={setChosen} name={`${ids}-model`} />
                <p className="pv-small">
                  Erreurs moyennes sur les périodes mises de côté (le modèle ne les a pas vues). Couverture : part des valeurs réelles tombées dans
                  l’intervalle à 80 %. Le modèle à l’erreur absolue moyenne la plus faible est proposé ; cliquez une ligne pour en choisir un autre.
                </p>
              </section>
              {analysis.decomposition && (
                <section className="pv-panel" aria-labelledby={`${ids}-dec`}>
                  <div className="pv-panel-head">
                    <h2 id={`${ids}-dec`}>Décomposition</h2>
                    <span className="pv-meta">{analysis.decomposition.kind === 'mul' ? 'multiplicative' : 'additive'}, moyenne mobile centrée sur {analysis.m} périodes</span>
                  </div>
                  <div className="pv-trio">
                    <figure>
                      <figcaption>Tendance</figcaption>
                      <TrendChart series={series} d={analysis.decomposition} />
                    </figure>
                    <figure>
                      <figcaption>Profil saisonnier, écart à la tendance</figcaption>
                      <SeasonProfile series={series} d={analysis.decomposition} m={analysis.m} />
                    </figure>
                    <figure>
                      <figcaption>Part des variations</figcaption>
                      <SharesBar d={analysis.decomposition} />
                    </figure>
                  </div>
                </section>
              )}

              <section className="pv-panel" aria-labelledby={`${ids}-table`}>
                <div className="pv-panel-head">
                  <h2 id={`${ids}-table`}>Valeurs prévues</h2>
                  <span className="pv-meta">
                    {FINAL_PATHS} trajectoires bootstrap, graine {BOOT_SEED}
                  </span>
                  <button type="button" className="btn pv-export" onClick={exportForecast}>
                    <Icon name="download" />
                    Exporter en CSV
                  </button>
                </div>
                <div className="pv-table-wrap pv-fc-table" tabIndex={0} aria-label="Tableau des valeurs prévues">
                  <table className="pv-table">
                    <thead>
                      <tr>
                        <th scope="col">Période</th>
                        <th scope="col">Prévision</th>
                        <th scope="col">Intervalle 80 %</th>
                        <th scope="col">Intervalle 95 %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.band.mean.map((v, k) => (
                        <tr key={k}>
                          <th scope="row">{formatPeriod(series.start + series.values.length + k, series.freq)}</th>
                          <td>{fmtNum(v)}</td>
                          <td>
                            {fmtNum(model.band.lo80[k])} – {fmtNum(model.band.hi80[k])}
                          </td>
                          <td>
                            {fmtNum(model.band.lo95[k])} – {fmtNum(model.band.hi95[k])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
          {dragging && (
            <div className="pv-dropzone" aria-hidden="true">
              <Icon name="file-text" size={20} />
              Déposez le fichier CSV pour lancer la prévision
            </div>
          )}
        </section>

        <Method />

        <section className="pv-cta">
          <div>
            <h2>Vos ventes dépendent de vos prix, de la météo ou de vos promotions ?</h2>
            <p>Ces variables s’ajoutent au modèle (régression dynamique, ARIMAX). Parlons de vos données.</p>
          </div>
          <div className="pv-cta-actions">
            <Link className="btn btn-primary" to="/#contact">
              Me contacter
              <Icon name="arrow-right" />
            </Link>
            <Link className="btn" to="/cv">
              Voir le CV
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function Notes({ notes }: { notes: Note[] }) {
  return (
    <ul className="pv-notes" aria-label="Remarques sur les données">
      {notes.map((n) => (
        <li key={n.text} className={n.level}>
          <Icon name={n.level === 'warn' ? 'circle-alert' : 'check'} size={14} />
          {n.text}
        </li>
      ))}
    </ul>
  );
}

function ModelTable({ analysis, chosen, onChoose, name }: { analysis: Analysis; chosen: ModelId; onChoose: (id: ModelId) => void; name: string }) {
  return (
    <div className="pv-table-wrap">
      <table className="pv-table pv-models">
        <thead>
          <tr>
            <th scope="col">Modèle</th>
            <th scope="col">MAE</th>
            <th scope="col" className="pv-opt">RMSE</th>
            <th scope="col" className="pv-opt">MAPE</th>
            <th scope="col">sMAPE</th>
            <th scope="col" className="pv-opt">Couv. 80 %</th>
            <th scope="col" title="Variation de la MAE par rapport à la référence naïve">vs naïf</th>
          </tr>
        </thead>
        <tbody>
          {analysis.models.map((r) => {
            const bt = r.backtest?.metrics;
            const sel = r.id === chosen;
            return (
              <tr key={r.id} className={sel ? 'is-sel' : ''} onClick={() => onChoose(r.id)}>
                <th scope="row">
                  <label>
                    <input type="radio" name={name} checked={sel} onChange={() => onChoose(r.id)} />
                    <span>
                      {r.name}
                      {r.id === analysis.bestId && <em>Recommandé</em>}
                      <small>{r.params.map((p) => `${p.label.split(' ')[0]} ${fmtNum(p.value, p.label.startsWith('Pente') ? undefined : p.label === 'Décalage' ? 0 : 2)}`).join(' · ')}</small>
                    </span>
                  </label>
                </th>
                <td>{bt ? fmtNum(bt.mae) : '—'}</td>
                <td className="pv-opt">{bt ? fmtNum(bt.rmse) : '—'}</td>
                <td className="pv-opt">{bt ? fmtPct(bt.mape) : '—'}</td>
                <td>{bt ? fmtPct(bt.smape) : '—'}</td>
                <td className="pv-opt">{r.backtest ? fmtPct(100 * r.backtest.coverage80, 0) : '—'}</td>
                <td>{r.id === 'snaive' ? 'réf.' : fmtPct(-r.gainVsNaive, 0, true)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
