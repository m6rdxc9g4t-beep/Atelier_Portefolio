import type { ReactNode } from 'react';
import type { ProjectResponse } from '../api';
import { HBars, LineChart, VBars, niceTicks } from './charts';
import { Md } from './Md';
import './results.css';

/**
 * « Résultats & tests en graphiques » : visualise, en pied de page projet, des séries chiffrées
 * déjà présentes dans la fiche (content.figures) mais pas encore mises en image sur la page.
 * Aucun chiffre n'est ajouté : chaque panneau reprend une donnée de la fiche et cite sa source.
 * Les valeurs lues sur un graphique du rapport (approx) sont signalées comme telles.
 */

type Fig = Record<string, any>;

interface Panel {
  id: string;
  title: string;
  /** Ce que montre le panneau (souvent la description de la donnée dans la fiche). */
  caption?: string;
  note?: string;
  approx?: boolean;
  wide?: boolean;
  body: ReactNode;
}

const ACCENT = 'var(--pe-accent, currentColor)';
const MUTED = 'var(--pe-muted, #97a1ad)';

const num = (v: number, d = 2) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
const pct = (v: number, d = 1) => `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: d })} %`;
const pctRaw = (v: number, d = 1) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: d })} %`;

/* ───────────── Petites briques visuelles ───────────── */

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="rg-legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

function Table({ columns, rows, align }: { columns: string[]; rows: ReactNode[][]; align?: ('l' | 'r' | 'c')[] }) {
  return (
    <div className="rg-table-wrap">
      <table className="rg-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={`a-${align?.[i] ?? 'l'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={`a-${align?.[j] ?? 'l'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Verdict({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={`rg-verdict ${ok ? 'is-ok' : 'is-ko'}`}>{children}</span>;
}

/** Barre empilée à 100 % (parts d'un tout). */
function SplitBar({ parts }: { parts: { label: string; value: number; display: string; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="rg-split">
      <div className="rg-split-bar">
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label} : ${p.display}`} />
        ))}
      </div>
      <div className="rg-split-legend">
        {parts.map((p) => (
          <div key={p.label}>
            <i style={{ background: p.color }} />
            <b>{p.display}</b> <span>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barres verticales groupées (deux séries ou plus). */
function GroupedBars({
  labels,
  series,
  ariaLabel,
  yFormat = (v) => num(v, 0),
}: {
  labels: string[];
  series: { name: string; values: number[]; color: string }[];
  ariaLabel: string;
  yFormat?: (v: number) => string;
}) {
  const W = 720;
  const H = 300;
  const m = { top: 22, right: 12, bottom: 46, left: 56 };
  const max = Math.max(...series.flatMap((s) => s.values)) * 1.1;
  const ticks = niceTicks(0, max, 4);
  const y = (v: number) => H - m.bottom - (v / max) * (H - m.top - m.bottom);
  const band = (W - m.left - m.right) / labels.length;
  const bw = (band * 0.72) / series.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={ariaLabel}>
      <g className="chart-grid">
        {ticks.map((t) => (
          <line key={t} x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      <g className="chart-axis">
        {ticks.map((t) => (
          <text key={t} x={m.left - 8} y={y(t) + 4} textAnchor="end">
            {yFormat(t)}
          </text>
        ))}
        {labels.map((l, i) => (
          <text key={l} className="vbar-label" x={m.left + band * i + band / 2} y={H - m.bottom + 18} textAnchor="middle">
            {l}
          </text>
        ))}
      </g>
      {labels.map((l, i) =>
        series.map((s, j) => {
          const x = m.left + band * i + band * 0.14 + bw * j;
          const v = s.values[i];
          return (
            <g key={`${l}-${s.name}`}>
              <rect x={x} y={y(v)} width={bw - 2} height={y(0) - y(v)} fill={s.color} rx={2}>
                <title>{`${l} — ${s.name} : ${yFormat(v)}`}</title>
              </rect>
              <text className="vbar-value" x={x + (bw - 2) / 2} y={y(v) - 5} textAnchor="middle">
                {yFormat(v)}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}

/** Boîtes à moustaches verticales (quartiles publiés ou lus sur le graphique du rapport). */
function BoxPlots({
  labels,
  low,
  q1,
  med,
  q3,
  high,
  ariaLabel,
  yFormat = (v) => num(v, 0),
  xLabel,
  width = 720,
}: {
  width?: number;
  labels: string[];
  low: number[];
  q1: number[];
  med: number[];
  q3: number[];
  high: number[];
  ariaLabel: string;
  yFormat?: (v: number) => string;
  xLabel?: string;
}) {
  const W = width;
  const H = 300;
  const m = { top: 16, right: 12, bottom: xLabel ? 52 : 40, left: 64 };
  const max = Math.max(...high) * 1.06;
  const min = Math.min(0, ...low);
  const ticks = niceTicks(min, max, 4);
  const y = (v: number) => H - m.bottom - ((v - min) / (max - min)) * (H - m.top - m.bottom);
  const band = (W - m.left - m.right) / labels.length;
  const bw = Math.min(46, band * 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={ariaLabel}>
      <g className="chart-grid">
        {ticks.map((t) => (
          <line key={t} x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      <g className="chart-axis">
        {ticks.map((t) => (
          <text key={t} x={m.left - 8} y={y(t) + 4} textAnchor="end">
            {yFormat(t)}
          </text>
        ))}
        {labels.map((l, i) => (
          <text key={l} className="vbar-label" x={m.left + band * i + band / 2} y={H - m.bottom + 18} textAnchor="middle">
            {l}
          </text>
        ))}
        {xLabel && (
          <text className="chart-label" x={(m.left + W - m.right) / 2} y={H - 8} textAnchor="middle">
            {xLabel}
          </text>
        )}
      </g>
      {labels.map((l, i) => {
        const cx = m.left + band * i + band / 2;
        return (
          <g key={l} className="rg-box">
            <title>{`${l} — min ${yFormat(low[i])}, Q1 ${yFormat(q1[i])}, médiane ${yFormat(med[i])}, Q3 ${yFormat(q3[i])}, max ${yFormat(high[i])}`}</title>
            <line x1={cx} x2={cx} y1={y(high[i])} y2={y(q3[i])} stroke={MUTED} />
            <line x1={cx} x2={cx} y1={y(q1[i])} y2={y(low[i])} stroke={MUTED} />
            <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(high[i])} y2={y(high[i])} stroke={MUTED} />
            <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(low[i])} y2={y(low[i])} stroke={MUTED} />
            <rect x={cx - bw / 2} y={y(q3[i])} width={bw} height={Math.max(1, y(q1[i]) - y(q3[i]))} fill={ACCENT} fillOpacity={0.22} stroke={ACCENT} rx={3} />
            <line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(med[i])} y2={y(med[i])} stroke={ACCENT} strokeWidth={2.6} />
          </g>
        );
      })}
    </svg>
  );
}

/** Matrice de confusion en taux (lignes = classe réelle). */
function Confusion({ tpr, fnr, tnr, fpr }: { tpr: number; fnr: number; tnr: number; fpr: number }) {
  const cell = (v: number, good: boolean, label: string) => (
    <div className={`rg-cm-cell ${good ? 'is-good' : 'is-bad'}`} style={{ ['--a' as string]: v }}>
      <b>{pct(v)}</b>
      <small>{label}</small>
    </div>
  );
  return (
    <div className="rg-cm">
      <div />
      <div className="rg-cm-h">Prédit « à risque »</div>
      <div className="rg-cm-h">Prédit « sans risque »</div>
      <div className="rg-cm-h rg-cm-row">Sinistré</div>
      {cell(tpr, true, 'vrais positifs (sensibilité)')}
      {cell(fnr, false, 'faux négatifs')}
      <div className="rg-cm-h rg-cm-row">Non sinistré</div>
      {cell(fpr, false, 'faux positifs')}
      {cell(tnr, true, 'vrais négatifs (spécificité)')}
    </div>
  );
}

/* ───────────── Recettes par projet (données de la fiche uniquement) ───────────── */

const RECIPES: Record<string, (f: Fig) => Panel[]> = {
  'scoring-assurance-auto': (f) => {
    const out: Panel[] = [];
    const c = f.confusion_test;
    if (c?.rates)
      out.push({
        id: 'confusion',
        title: 'Matrice de confusion — échantillon test',
        caption: c.description,
        note: `Part des contrats classés « à risque » : ${pct(c.shareFlagged)} · VPP ≈ ${pct(c.ppv, 0)} · VPN ${pct(c.npvRange[0], 0)} à ${pct(c.npvRange[1], 0)}.`,
        body: <Confusion tpr={c.rates.truePositiveRate} fnr={c.rates.falseNegativeRate} tnr={c.rates.trueNegativeRate} fpr={c.rates.falsePositiveRate} />,
      });
    const t = f.target_split;
    if (t?.values)
      out.push({
        id: 'cible',
        title: 'Déséquilibre de la cible',
        caption: t.description,
        body: (
          <SplitBar
            parts={t.labels.map((l: string, i: number) => ({ label: l, value: t.values[i], display: pct(t.values[i]), color: i === 1 ? ACCENT : MUTED }))}
          />
        ),
      });
    return out;
  },

  'catalogue-netflix': (f) => {
    const out: Panel[] = [];
    const r = f.repartition_type;
    if (r?.values)
      out.push({
        id: 'type',
        title: 'Films et séries dans le catalogue',
        caption: r.description,
        body: <SplitBar parts={r.labels.map((l: string, i: number) => ({ label: l, value: r.values[i], display: `${num(r.values[i], 0)} (${pctRaw(r.pct[i])})`, color: i === 0 ? ACCENT : MUTED }))} />,
      });
    const s = f.duree_films_seuil_90;
    if (s?.pct)
      out.push({
        id: 'seuil90',
        title: 'Films autour de 90 minutes',
        caption: s.description,
        note: s.note,
        body: <SplitBar parts={s.labels.map((l: string, i: number) => ({ label: l, value: s.pct[i], display: pctRaw(s.pct[i]), color: i === 0 ? ACCENT : MUTED }))} />,
      });
    const d = f.titres_par_decennie;
    if (d?.labels)
      out.push({
        id: 'decennies',
        title: 'Titres par période de sortie',
        caption: d.description,
        note: d.note,
        approx: true,
        wide: true,
        body: (
          <>
            <Legend items={[{ label: 'Films', color: ACCENT }, { label: 'Séries', color: MUTED }]} />
            <GroupedBars
              labels={d.labels}
              ariaLabel="Nombre de films et de séries par période de sortie"
              series={[
                { name: 'Films', values: d.films.y, color: ACCENT },
                { name: 'Séries', values: d.series.y, color: MUTED },
              ]}
            />
          </>
        ),
      });
    return out;
  },

  'avis-clients-flunch': (f) => {
    const out: Panel[] = [];
    const s = f.sentiment;
    if (s?.counts)
      out.push({
        id: 'polarite',
        title: 'Polarité des avis',
        caption: `${s.description} Source : ${s.source}.`,
        body: <SplitBar parts={s.labels.map((l: string, i: number) => ({ label: l, value: s.counts[i], display: `${num(s.counts[i], 0)} (${pctRaw(s.percent[i], 0)})`, color: i === 0 ? ACCENT : MUTED }))} />,
      });
    const a = f.afcInertia;
    if (a?.percent)
      out.push({
        id: 'afc',
        title: 'AFC : inertie des deux premiers axes',
        caption: `${a.description} Source : ${a.source}.`,
        body: (
          <>
            <HBars data={a.labels.map((l: string, i: number) => ({ label: l, value: a.percent[i], display: pctRaw(a.percent[i]), color: ACCENT }))} max={100} />
            <p className="rg-kpi">
              Cumul des deux axes : <b>{pctRaw(a.cumulative)}</b>
            </p>
          </>
        ),
      });
    return out;
  },

  'churn-telecom': (f) => {
    const out: Panel[] = [];
    const k = f.km_published;
    if (k?.x)
      out.push({
        id: 'km-ic',
        title: 'Survie de Kaplan–Meier et intervalle de confiance',
        caption: `${k.description} Repères publiés aux mois ${k.x.join(', ')}.`,
        wide: true,
        body: (
          <>
            <Legend items={[{ label: 'S(t) estimée', color: ACCENT }, { label: 'Intervalle de confiance', color: MUTED }]} />
            <LineChart
              ariaLabel="Courbe de survie de Kaplan-Meier avec intervalle de confiance, repères publiés"
              xDomain={[0, 72]}
              yDomain={[0.5, 1]}
              xLabel="Ancienneté (mois)"
              yLabel="Probabilité d’être encore abonné"
              yFormat={(v) => pct(v, 0)}
              series={[
                { id: 'lo', points: k.x.map((x: number, i: number) => [x, k.lower[i]]), color: MUTED, width: 1.2, dash: '4 4' },
                { id: 'hi', points: k.x.map((x: number, i: number) => [x, k.upper[i]]), color: MUTED, width: 1.2, dash: '4 4' },
                { id: 's', points: [[0, 1], ...k.x.map((x: number, i: number) => [x, k.y[i]])], color: ACCENT, width: 2.6, dots: true },
              ]}
              markers={[{ x: 72, y: k.y[k.y.length - 1], color: ACCENT, r: 0, label: pct(k.y[k.y.length - 1]), dx: -10, dy: -22, anchor: 'end' }]}
            />
          </>
        ),
      });
    const h = f.hazard_published;
    if (h?.x)
      out.push({
        id: 'hasard',
        title: 'Hasard discret : risque de départ par mois',
        caption: `${h.description} Événements / effectif à risque.`,
        body: (
          <VBars
            ariaLabel="Hasard discret mensuel publié"
            data={h.x.map((x: number, i: number) => ({ label: `mois ${x}`, value: h.y[i], display: pct(h.y[i], 2), color: ACCENT }))}
            yFormat={(v) => pct(v, 1)}
            width={480}
            height={280}
          />
        ),
      });
    const c = f.censoring_summary;
    if (c?.n)
      out.push({
        id: 'censure',
        title: 'Événements et censure',
        caption: `${c.description} ${num(c.n, 0)} clients.`,
        body: (
          <SplitBar
            parts={[
              { label: 'départs observés', value: c.events, display: `${num(c.events, 0)} (${pctRaw(c.event_rate_pct, 2)})`, color: ACCENT },
              { label: 'observations censurées', value: c.censored, display: `${num(c.censored, 0)} (${pctRaw(c.censoring_rate_pct, 2)})`, color: MUTED },
            ]}
          />
        ),
      });
    return out;
  },

  'volatilite-sp500-garch': (f) => {
    const out: Panel[] = [];
    const t = f.tests;
    if (t?.ljung_box)
      out.push({
        id: 'tests',
        title: 'Tests de stationnarité et d’autocorrélation',
        caption: t.description,
        wide: true,
        body: (
          <Table
            columns={['Test', 'Série', 'Statistique / p-value', 'Décision']}
            align={['l', 'c', 'r', 'l']}
            rows={[
              ['ADF (H₀ : racine unitaire)', 'rₜ', `${num(t.adf_returns.statistic, 3)} · p = ${t.adf_returns.p_value.toExponential(2).replace('.', ',')}`, <Verdict ok>{t.adf_returns.decision}</Verdict>],
              ...t.ljung_box.map((l: any) => [
                `Ljung–Box (h = ${l.h})`,
                l.label,
                l.p_value !== null ? `p = ${num(l.p_value, 4)}` : `p < ${String(l.p_value_upper).replace('.', ',')}`,
                <Verdict ok={l.decision.startsWith('non-rejet')}>{l.decision}</Verdict>,
              ]),
            ]}
          />
        ),
      });
    const e = f.existence_conditions_arch1;
    if (e?.x)
      out.push({
        id: 'moments',
        title: 'ARCH(1) : quels moments existent ?',
        caption: e.description,
        wide: true,
        body: (
          <LineChart
            ariaLabel="Condition d'existence des moments d'un ARCH(1) selon l'ordre"
            xDomain={[2, 10]}
            yDomain={[0, 2]}
            xTicks={e.x}
            xFormat={(v) => `2r = ${v}`}
            yFormat={(v) => num(v, 1)}
            height={260}
            hlines={[{ y: e.threshold, label: 'seuil = 1', color: MUTED }]}
            series={[{ id: 'c', points: e.x.map((x: number, i: number) => [x, e.y[i]]), color: ACCENT, dots: true }]}
            markers={e.x.map((x: number, i: number) => ({ x, y: e.y[i], r: 0, label: num(e.y[i], 3), color: e.y[i] < e.threshold ? ACCENT : MUTED, dx: 0, dy: -14, anchor: 'middle' as const }))}
          />
        ),
      });
    return out;
  },

  'offre-travail-selection': (f) => {
    const out: Panel[] = [];
    const a = f.aic_probit;
    if (a?.y)
      out.push({
        id: 'aic',
        title: 'Sélection du probit : l’AIC baisse à chaque variable',
        caption: a.description,
        note: a.note,
        wide: true,
        body: (
          <Table
            columns={['Modèle', 'Degrés de liberté', 'AIC']}
            align={['l', 'r', 'r']}
            rows={a.x.map((x: string, i: number) => [
              x,
              a.df[i],
              i === a.y.length - 1 ? <b>{num(a.y[i], 2)}</b> : num(a.y[i], 2),
            ])}
          />
        ),
      });
    const w = f.wage_by_diploma;
    if (w?.median)
      out.push({
        id: 'salaire-diplome',
        title: 'Salaire selon le diplôme (femmes en emploi)',
        caption: w.description,
        note: w.note,
        approx: w.approx,
        wide: true,
        body: <BoxPlots labels={w.x} low={w.lowerWhisker} q1={w.q1} med={w.median} q3={w.q3} high={w.upperWhisker} xLabel="Code diplôme" ariaLabel="Boîtes à moustaches du salaire par diplôme" />,
      });
    const g = f.age_by_work;
    if (g?.median)
      out.push({
        id: 'age-emploi',
        title: 'Âge selon le statut d’emploi',
        caption: g.description,
        note: g.note,
        approx: g.approx,
        body: <BoxPlots labels={g.x} low={g.min} q1={g.q1} med={g.median} q3={g.q3} high={g.max} yFormat={(v) => `${num(v, 0)} ans`} width={480} ariaLabel="Boîtes à moustaches de l'âge selon l'emploi" />,
      });
    const c = f.correlations_employed;
    if (c?.y)
      out.push({
        id: 'correlations',
        title: 'Corrélations avec le salaire',
        caption: c.description,
        note: c.note,
        body: <HBars data={c.x.map((x: string, i: number) => ({ label: x, value: c.y[i], display: `r ≈ ${num(c.y[i], 2)}`, note: `p ${c.p[i]}`, color: ACCENT }))} max={1} />,
      });
    return out;
  },

  'recours-soins-europe': (f) => {
    const m = f.intensite_modeles;
    if (!m?.specification) return [];
    return [
      {
        id: 'emboitement',
        title: 'Modèles emboîtés M1 → M4 : variables ajoutées',
        caption: `${m.description}. ${m.specification.note}`,
        wide: true,
        body: (
          <Table
            columns={['Variable', ...m.models]}
            align={['l', 'c', 'c', 'c', 'c']}
            rows={[
              ...m.specification.variables.map((v: string, i: number) => [v, ...m.specification.inclus[i].map((x: number) => (x ? <span className="rg-check">✓</span> : <span className="rg-dash">·</span>))]),
              [<b>Observations — généraliste</b>, ...m.gp.N.map((n: number) => num(n, 0))],
              [<b>Observations — hôpital</b>, ...m.hosp.N.map((n: number) => num(n, 0))],
            ]}
          />
        ),
      },
    ];
  },

  'immobilier-maine-et-loire': (f) => {
    const b = f.bornes_filtrage_iqr;
    if (!b?.rows) return [];
    const fmt = (v: number) => num(v, 0);
    return [
      {
        id: 'iqr',
        title: 'Filtrage des valeurs extrêmes (écart interquartile)',
        caption: b.description,
        wide: true,
        body: (
          <Table
            columns={['Type de bien', 'Variable', 'Bornes brutes (Q1 − 1,5 IQR ; Q3 + 1,5 IQR)', 'Bornes retenues']}
            align={['l', 'l', 'r', 'r']}
            rows={b.rows.map((r: any) => [r.type, r.variable, `[${fmt(r.brut[0])} ; ${fmt(r.brut[1])}]`, <b>{`[${fmt(r.retenu[0])} ; ${fmt(r.retenu[1])}]`}</b>])}
          />
        ),
      },
    ];
  },

  'scoring-marketing': (f) => {
    const out: Panel[] = [];
    const p = f.profile_summary;
    if (p?.strongImpact)
      out.push({
        id: 'profil',
        title: 'Liaisons avec la réponse au mailing',
        caption: p.description,
        wide: true,
        body: (
          <div className="rg-two">
            <div>
              <h4>Impact marqué</h4>
              <div className="rg-chips is-strong">
                {p.strongImpact.map((v: string) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
            </div>
            <div>
              <h4>Impact faible ou nul</h4>
              <div className="rg-chips">
                {p.weakOrNoImpact.map((v: string) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
            </div>
          </div>
        ),
      });
    const q = f.qualitative_coding;
    if (q?.rows)
      out.push({
        id: 'codage',
        title: 'Recodage des variables qualitatives',
        caption: q.description,
        wide: true,
        body: <Table columns={['Variable', 'Modalités initiales', 'Recodage', 'Pourquoi']} rows={q.rows.map((r: any) => [<code>{r.variable}</code>, r.initial, r.recode, r.comment])} />,
      });
    const d = f.variable_dictionary;
    if (d?.rows)
      out.push({
        id: 'dictionnaire',
        title: 'Dictionnaire des variables',
        caption: d.description,
        wide: true,
        body: <Table columns={['Variable', 'Libellé', 'Type', 'Modalités', 'Rôle']} rows={d.rows.map((r: string[]) => [<code>{r[0]}</code>, r[1], r[2], r[3], r[4]])} />,
      });
    return out;
  },

  'prevision-arima-sarima': (f) => {
    const a = f.accuracy;
    if (!a?.series) return [];
    return [
      {
        id: 'mape',
        title: 'Erreur de prévision hors échantillon (MAPE)',
        caption: a.description,
        body: <HBars data={a.series.map((s: any) => ({ label: s.serie, value: s.mape, display: pctRaw(s.mape, 2), note: `horizon ${s.horizon}`, color: ACCENT }))} />,
      },
      {
        id: 'erreurs',
        title: 'Toutes les mesures d’erreur',
        caption: 'MAPE, RMSE et U de Theil, sur l’échantillon de test.',
        body: (
          <Table
            columns={['Série et modèle', 'Horizon', 'MAPE', 'RMSE', 'U de Theil']}
            align={['l', 'l', 'r', 'r', 'r']}
            rows={a.series.map((s: any) => [s.serie, s.horizon, pctRaw(s.mape, 2), num(s.rmse, 3), s.theilU !== undefined ? num(s.theilU, 2) : '—'])}
          />
        ),
      },
    ];
  },

  'leboncoin-vo-powerbi': (f) => {
    const d = f.decodage;
    if (!d) return [];
    const blocks = [
      ['Carburant', d.carburant],
      ['Boîte de vitesses', d.boite],
      ['Type de vendeur', d.vendeur],
    ].filter(([, v]) => v) as [string, any][];
    return [
      {
        id: 'decodage',
        title: 'Décodage des variables brutes (couche Silver)',
        caption: 'Correspondance entre les codes de l’extraction et les libellés utilisés dans le modèle.',
        wide: true,
        body: (
          <div className="rg-three">
            {blocks.map(([name, v]) => (
              <Table
                key={name}
                columns={[`${name} (${v.source})`, 'Libellé']}
                rows={[...Object.entries(v.codes).map(([k, lab]) => [<code>{k}</code>, lab as string]), [<i>autre valeur</i>, v.autre]]}
              />
            ))}
          </div>
        ),
      },
    ];
  },
};

export function ResultsGallery({ project }: { project: ProjectResponse }) {
  const recipe = RECIPES[project.slug];
  const figures = project.content.figures ?? {};
  const panels = recipe ? recipe(figures) : [];
  if (panels.length === 0) return null;
  return (
    <section className="rg" aria-labelledby="rg-title">
      <h2 className="pe-h" id="rg-title">
        Résultats &amp; tests en graphiques
      </h2>
      <p className="rg-intro">Les chiffres du rapport, mis en image : aucune valeur n’est ajoutée, chaque panneau reprend une donnée de l’étude.</p>
      <div className="rg-grid">
        {panels.map((p) => (
          <figure key={p.id} className={`rg-panel ${p.wide ? 'is-wide' : ''}`}>
            <h3>{p.title}</h3>
            <div className="rg-body">{p.body}</div>
            {(p.caption || p.note) && (
              <figcaption>
                {p.caption && <Md as="span" text={p.caption} />}
                {p.approx && <span className="rg-approx">valeurs lues sur le graphique du rapport</span>}
                {p.note && <Md as="span" className="rg-note" text={p.note} />}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
