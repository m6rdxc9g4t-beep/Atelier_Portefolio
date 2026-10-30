import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Papa from 'papaparse';
import type { ProjectResponse } from '../../api';
import { api, ApiError, useApi } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { HBars, LineChart, VBars } from '../../components/charts';
import { fmt } from '@atelier/shared';
import './style.css';

type Row = Record<string, string>;
interface Msg {
  role: 'user' | 'ai' | 'error' | 'system';
  text: string;
}

const COLORS = ['#00e676', '#69f0ae', '#40c4ff', '#ffb300', '#ff6584', '#c77dff', '#ff9a3c', '#4fc3f7'];

/** Exemple intégré : le tableau par pays du projet SHARE (recours aux soins). */
const SAMPLE_NAME = 'share_recours_soins_pays.csv';
const SAMPLE_CSV = `pays,repondants,consultants_gp,migrants,taux_migrants,recours_gp,log_nb_gp
Autriche,1838,1485,171,9.30,80.8,1.308
Allemagne,2933,2511,548,18.68,85.6,1.302
Suède,2988,1952,251,8.40,65.3,0.713
Pays-Bas,2855,2147,170,5.95,75.2,0.932
Espagne,2333,1942,51,2.19,83.2,1.596
Italie,2496,1939,37,1.48,77.7,1.623
France,2940,2607,439,14.93,88.7,1.450
Danemark,1606,1249,59,3.67,77.8,1.020
Grèce,2663,1715,64,2.40,64.4,1.313
Suisse,957,733,154,16.09,76.6,0.997
Belgique,3637,3224,253,6.96,88.6,1.489`;

function analyse(rows: Row[], fields: string[]) {
  const sample = rows.slice(0, 300);
  const numeric = fields.filter((f) => {
    const vals = sample.map((r) => (r[f] ?? '').trim()).filter((v) => v !== '');
    const ok = vals.filter((v) => Number.isFinite(Number(v.replace(',', '.'))));
    return vals.length > 0 && ok.length / vals.length >= 0.8;
  });
  const categorical = fields.filter((f) => {
    if (numeric.includes(f)) return false;
    const u = new Set(rows.map((r) => r[f]).filter(Boolean)).size;
    return u > 1 && u <= 14;
  });
  const labelField = fields.find((f) => !numeric.includes(f));
  const dateField = fields.find((f) => /(date|mois|jour|month|year|année|annee)/i.test(f));
  return { numeric, categorical, labelField, dateField };
}

const num = (v: string | undefined) => Number(String(v ?? '').replace(',', '.'));

export default function Page({ project }: { project: ProjectResponse }) {
  const { data: status } = useApi<{ enabled: boolean; model: string | null }>('/datamind/status');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tab, setTab] = useState<'chat' | 'charts' | 'table'>('charts');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const groups = project.content.figures.quickPrompts as { label: string; items: [string, string][] }[];

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [msgs, busy]);

  const load = useCallback((text: string, name: string) => {
    const res = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
    setRows(res.data);
    setFields(res.meta.fields ?? []);
    setFileName(name);
    setTab('charts');
    setMsgs([{ role: 'system', text: `📂 ${name} chargé : ${res.data.length} lignes × ${(res.meta.fields ?? []).length} colonnes.` }]);
    setHistory([]);
  }, []);

  const onFile = (f: File) => {
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) return;
    if (f.size > 5_000_000) {
      setMsgs([{ role: 'error', text: 'Fichier trop volumineux pour la démo (5 Mo maximum).' }]);
      return;
    }
    f.text().then((t) => load(t, f.name));
  };

  const info = useMemo(() => (rows ? analyse(rows, fields) : null), [rows, fields]);

  const ask = async (question: string) => {
    if (!rows || !question.trim() || busy) return;
    const preview = JSON.stringify(rows.slice(0, 30));
    const context = history.length === 0 ? `Fichier CSV « ${fileName} » : ${rows.length} lignes, colonnes : ${fields.join(', ')}.\nColonnes numériques détectées : ${info?.numeric.join(', ') || 'aucune'}.\nAperçu (30 premières lignes) : ${preview}\n\n` : '';
    const next = [...history, { role: 'user' as const, content: `${context}[QUESTION]\n${question}` }];
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    setTab('chat');
    if (!status?.enabled) {
      setMsgs((m) => [...m, { role: 'system', text: "L'agent IA n'est pas activé sur ce serveur (clé d'API absente) : la question n'a pas été envoyée. L'exploration et les graphiques restent disponibles." }]);
      return;
    }
    setBusy(true);
    try {
      const { text } = await api<{ text: string }>('/datamind/chat', { method: 'POST', json: { messages: next } });
      setHistory([...next, { role: 'assistant', content: text }]);
      setMsgs((m) => [...m, { role: 'ai', text }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'error', text: e instanceof ApiError ? e.message : "Impossible de contacter l'agent." }]);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div className="dm">
      <header className="dm-top">
        <div className="dm-logo">
          <span className="dm-hex">⬡</span>
          <div>
            <b>DataMind</b>
            <small>Data analyst agent · v2</small>
          </div>
        </div>
        <div className="dm-top-right">
          {fileName && rows && <span className="dm-pill">✓ {fileName} · {rows.length} lignes</span>}
          <span className={`dm-pill ${status?.enabled ? '' : 'dm-pill-off'}`}>{status?.enabled ? `● agent en ligne` : '○ agent hors ligne'}</span>
          <BackToPortfolio />
        </div>
      </header>

      <section className="dm-intro">
        <div className="dm-badge" aria-hidden>
          <span>Data analyst agent</span>
          <b>v2.0 // portfolio</b>
          <i>● prêt</i>
        </div>
        <div>
          <h1>{project.content.title}</h1>
          <p>{project.content.abstract}</p>
        </div>
      </section>

      <div className="dm-body">
        <aside className="dm-side">
          <div className="dm-side-label">&gt; Charger un CSV</div>
          <div
            className={`dm-drop ${drag ? 'is-drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <div className="dm-drop-ic">📊</div>
            <div>{rows ? `✓ ${fileName}` : 'Glissez un CSV ici'}</div>
            {!rows && <small>ou cliquez pour parcourir — rien n’est envoyé tant que vous ne questionnez pas l’agent</small>}
          </div>
          <button className="dm-sample" onClick={() => load(SAMPLE_CSV, SAMPLE_NAME)}>
            → Essayer avec un exemple (SHARE, 11 pays)
          </button>
          {rows && (
            <div className="dm-meta">
              <div>
                <span>Lignes</span>
                <b>{fmt(rows.length)}</b>
              </div>
              <div>
                <span>Colonnes</span>
                <b>{fields.length}</b>
              </div>
            </div>
          )}
          <div className="dm-prompts">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="dm-side-label">
                  <i>//</i> {g.label}
                </div>
                {g.items.map(([label, prompt]) => (
                  <button key={label} disabled={!rows} onClick={() => ask(prompt)} title={prompt}>
                    → {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <main className="dm-main">
          <div className="dm-tabs" role="tablist">
            {(
              [
                ['charts', '📈 Visualisations'],
                ['chat', '💬 Agent'],
                ['table', '🗂 Données'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {!rows ? (
            <div className="dm-empty">
              <div className="dm-empty-ic">⬡</div>
              <p>Chargez un fichier CSV (ou l’exemple) pour démarrer l’analyse.</p>
            </div>
          ) : tab === 'charts' ? (
            <Charts rows={rows} fields={fields} info={info!} />
          ) : tab === 'table' ? (
            <div className="dm-table">
              <table>
                <thead>
                  <tr>
                    {fields.map((f) => (
                      <th key={f}>{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      {fields.map((f) => (
                        <td key={f}>{r[f]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && <p className="dm-note">200 premières lignes sur {fmt(rows.length)}.</p>}
            </div>
          ) : (
            <div className="dm-chat">
              <div className="dm-msgs">
                {msgs.map((m, i) => (
                  <div key={i} className={`dm-msg dm-${m.role}`}>
                    <div className="dm-who">{m.role === 'user' ? '// vous' : m.role === 'ai' ? '// datamind' : m.role === 'error' ? '// erreur' : '// système'}</div>
                    <div className="dm-bubble">{m.text}</div>
                  </div>
                ))}
                {busy && (
                  <div className="dm-msg dm-ai">
                    <div className="dm-who">// datamind</div>
                    <div className="dm-bubble dm-typing">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
              <form
                className="dm-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
              >
                <span>$</span>
                <textarea
                  rows={1}
                  value={input}
                  placeholder="Posez votre question sur les données…"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      ask(input);
                    }
                  }}
                />
                <button type="submit" disabled={busy || !input.trim()}>
                  RUN ▶
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      <ProjectEnd project={project} showCode={false} />
    </div>
  );
}

function Charts({ rows, fields, info }: { rows: Row[]; fields: string[]; info: ReturnType<typeof analyse> }) {
  const { numeric, categorical, labelField, dateField } = info;
  const cards = numeric.slice(0, 4).map((f, i) => {
    const vals = rows.map((r) => num(r[f])).filter(Number.isFinite);
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1));
    return { f, mean, sd, min: Math.min(...vals), max: Math.max(...vals), color: COLORS[i % COLORS.length] };
  });

  const first = numeric[0];
  const byLabel =
    labelField && first && new Set(rows.map((r) => r[labelField])).size === rows.length
      ? rows
          .map((r, i) => ({ label: r[labelField], value: num(r[first]), color: COLORS[i % COLORS.length] }))
          .filter((d) => Number.isFinite(d.value))
          .sort((a, b) => b.value - a.value)
          .slice(0, 14)
      : null;

  const cat = categorical.find((c) => !(byLabel && c === labelField));
  const byCat =
    cat && first
      ? Object.entries(
          rows.reduce<Record<string, number>>((acc, r) => {
            const v = num(r[first]);
            if (r[cat] && Number.isFinite(v)) acc[r[cat]] = (acc[r[cat]] ?? 0) + v;
            return acc;
          }, {}),
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }))
      : null;

  const timeSeries =
    dateField && first
      ? Object.entries(
          rows.reduce<Record<string, number>>((acc, r) => {
            const k = String(r[dateField] ?? '').slice(0, 7);
            const v = num(r[first]);
            if (k && Number.isFinite(v)) acc[k] = (acc[k] ?? 0) + v;
            return acc;
          }, {}),
        ).sort((a, b) => a[0].localeCompare(b[0]))
      : null;

  const scatter = numeric.length >= 2 ? { x: numeric[1], y: numeric[numeric.length >= 3 ? 2 : 0] } : null;
  const pts = scatter ? rows.map((r) => [num(r[scatter.x]), num(r[scatter.y])] as [number, number]).filter((p) => p.every(Number.isFinite)) : [];
  const corr = pts.length > 2 ? pearson(pts) : null;

  return (
    <div className="dm-charts">
      <div className="dm-cards">
        {cards.map((c) => (
          <div key={c.f} className="dm-card" style={{ borderLeftColor: c.color }}>
            <span>{c.f}</span>
            <b>{fmt(c.mean, 2, 0)}</b>
            <small>
              σ {fmt(c.sd, 2, 0)} · min {fmt(c.min, 2, 0)} · max {fmt(c.max, 2, 0)}
            </small>
          </div>
        ))}
        <div className="dm-card">
          <span>Dataset</span>
          <b>{fmt(rows.length)}</b>
          <small>
            {fields.length} colonnes · {numeric.length} numériques · {categorical.length} catégorielles
          </small>
        </div>
      </div>
      <div className="dm-grid">
        {byLabel && (
          <div className="dm-panel">
            <div className="dm-panel-t">▸ {first} par {labelField}</div>
            <HBars data={byLabel.map((d) => ({ ...d }))} format={(v) => fmt(v, 2, 0)} />
          </div>
        )}
        {byCat && (
          <div className="dm-panel">
            <div className="dm-panel-t">▸ Somme de {first} par {cat}</div>
            <VBars data={byCat} ariaLabel={`Somme de ${first} par ${cat}`} yFormat={(v) => fmt(v)} rotateLabels height={260} />
          </div>
        )}
        {timeSeries && timeSeries.length > 1 && (
          <div className="dm-panel">
            <div className="dm-panel-t">▸ Évolution de {first}</div>
            <LineChart
              ariaLabel={`Évolution de ${first}`}
              series={[{ id: 'ts', color: '#00e676', points: timeSeries.map(([, v], i) => [i, v]), dots: true }]}
              xDomain={[0, timeSeries.length - 1]}
              yDomain={[Math.min(...timeSeries.map((t) => t[1])) * 0.95, Math.max(...timeSeries.map((t) => t[1])) * 1.05]}
              xFormat={(i) => timeSeries[Math.round(i)]?.[0] ?? ''}
              height={260}
            />
          </div>
        )}
        {scatter && pts.length > 2 && (
          <div className="dm-panel">
            <div className="dm-panel-t">
              ▸ {scatter.y} selon {scatter.x} · r = {fmt(corr ?? 0, 2)}
            </div>
            <LineChart
              ariaLabel={`${scatter.y} selon ${scatter.x}`}
              series={[]}
              xDomain={pad(pts.map((p) => p[0]))}
              yDomain={pad(pts.map((p) => p[1]))}
              xFormat={(v) => fmt(v, 1)}
              yFormat={(v) => fmt(v, 1)}
              markers={pts.map(([x, y]) => ({ x, y, r: 4, color: '#69f0ae' }))}
              height={260}
              xLabel={scatter.x}
              yLabel={scatter.y}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function pad(v: number[]): [number, number] {
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const m = (hi - lo) * 0.08 || 1;
  return [lo - m, hi + m];
}

function pearson(p: [number, number][]) {
  const n = p.length;
  const mx = p.reduce((a, b) => a + b[0], 0) / n;
  const my = p.reduce((a, b) => a + b[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of p) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}
