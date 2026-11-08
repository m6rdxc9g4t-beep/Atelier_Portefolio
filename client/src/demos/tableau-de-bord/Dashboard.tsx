import { useEffect, useMemo, useState } from 'react';
import type { Canal, Categorie, Segment } from '../sql-lab/data';
import {
  CANAUX,
  CATEGORIES,
  DEFAULT_FILTERS,
  LAST_MONTH,
  REGION_NAMES,
  breakdown,
  buildBase,
  cohorts,
  insights,
  isDefault,
  kpis,
  meanRetention,
  monthLong,
  monthlyKpis,
  periodLabel,
  previousYear,
  relChange,
  topProduits,
  type Filters,
  type Kpis,
} from './model';
import { BarList, CohortHeatmap, MonthlyChart, Sparkline } from './charts';
import { euros, euros2, int, pct, signedPct, signedPts } from './format';

/** Couleurs fixes par valeur : une catégorie ou un canal garde sa teinte dans tous les graphiques. */
const CAT_COLOR: Record<Categorie, string> = {
  Luminaires: 'var(--tdb-s4)',
  Textile: 'var(--tdb-s1)',
  Cuisine: 'var(--tdb-s2)',
  Mobilier: 'var(--tdb-s5)',
  Papeterie: 'var(--tdb-s3)',
  Jardin: 'var(--tdb-s6)',
};
const CANAL_COLOR: Record<Canal, string> = { 'Site web': 'var(--tdb-s1)', Application: 'var(--tdb-s3)', Boutique: 'var(--tdb-s2)' };
const SEGMENT_LABEL: Record<Segment, string> = { Particulier: 'Particuliers', Professionnel: 'Professionnels' };

const MONTH_OPTIONS = Array.from({ length: LAST_MONTH + 1 }, (_, m) => m);
const PERIODS: { id: string; label: string; from: number; to: number }[] = [
  { id: '2024', label: '2024', from: 0, to: 11 },
  { id: '2025', label: '2025', from: 12, to: 23 },
  { id: 'tout', label: '2024 – 2025', from: 0, to: 23 },
];

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

type ListKey = 'regions' | 'canaux' | 'categories';

/** Tableau de bord des ventes de Comptoir Lumen : filtres croisés, indicateurs comparés à N-1, répartitions, cohortes. */
export default function Dashboard() {
  const base = useMemo(() => buildBase(), []);
  const compact = useMedia('(max-width: 640px)');
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);

  const toggle = (key: ListKey, value: string) =>
    setF((cur) => {
      const list = cur[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...cur, [key]: next };
    });
  const setPeriod = (from: number, to: number) => setF((cur) => ({ ...cur, from: Math.min(from, to), to: Math.max(from, to) }));

  const prevF = useMemo(() => previousYear(f), [f]);
  const cur = useMemo(() => kpis(base, f), [base, f]);
  const prev = useMemo(() => (prevF ? kpis(base, prevF) : null), [base, prevF]);
  const months = useMemo(() => monthlyKpis(base, f), [base, f]);
  const monthsPrev = useMemo(() => (prevF ? monthlyKpis(base, prevF) : null), [base, prevF]);
  const byCat = useMemo(() => breakdown(base, f, 'categorie'), [base, f]);
  const byReg = useMemo(() => breakdown(base, f, 'region'), [base, f]);
  const byCanal = useMemo(() => breakdown(base, f, 'canal'), [base, f]);
  const bySeg = useMemo(() => breakdown(base, f, 'segment'), [base, f]);
  const top = useMemo(() => topProduits(base, f, 8), [base, f]);
  const coh = useMemo(() => cohorts(base, f), [base, f]);
  const notes = useMemo(() => insights(base, f, { euros, pct: (v) => pct(v), signedPct: (v) => signedPct(v) }), [base, f]);

  const periodId = PERIODS.find((p) => p.from === f.from && p.to === f.to)?.id ?? null;
  const vsLabel = prevF ? `vs ${periodLabel(prevF)}` : null;
  const ret1 = meanRetention(coh, 1);
  const ret3 = meanRetention(coh, 3);

  return (
    <section className="tdb-tool" aria-label="Tableau de bord des ventes de Comptoir Lumen">
      {/* ── Filtres ── */}
      <div className="tdb-toolbar">
        <div className="tdb-tb-row">
          <span className="tdb-tb-label" id="tdb-l-period">
            Période
          </span>
          <div className="tdb-seg" role="group" aria-labelledby="tdb-l-period">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={periodId === p.id} onClick={() => setPeriod(p.from, p.to)}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="tdb-select">
            <span>du</span>
            <select value={f.from} onChange={(e) => setPeriod(Number(e.target.value), f.to)} aria-label="Premier mois">
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {monthLong(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="tdb-select">
            <span>au</span>
            <select value={f.to} onChange={(e) => setPeriod(f.from, Number(e.target.value))} aria-label="Dernier mois">
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m} disabled={m < f.from}>
                  {monthLong(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="tdb-tb-end">
            <span className="tdb-tb-label" id="tdb-l-seg">
              Clients
            </span>
            <div className="tdb-seg" role="group" aria-labelledby="tdb-l-seg">
              <button type="button" aria-pressed={f.segment === null} onClick={() => setF((c) => ({ ...c, segment: null }))}>
                Tous
              </button>
              {(['Particulier', 'Professionnel'] as Segment[]).map((s) => (
                <button key={s} type="button" aria-pressed={f.segment === s} onClick={() => setF((c) => ({ ...c, segment: s }))}>
                  {SEGMENT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="tdb-tb-row tdb-tb-row-2">
          <ChipGroup label="Canal" values={CANAUX} selected={f.canaux} onToggle={(v) => toggle('canaux', v)} colorOf={(v) => CANAL_COLOR[v as Canal]} />
        </div>
        <div className="tdb-tb-row tdb-tb-row-2">
          <ChipGroup
            label="Catégorie"
            values={CATEGORIES}
            selected={f.categories}
            onToggle={(v) => toggle('categories', v)}
            colorOf={(v) => CAT_COLOR[v as Categorie]}
          />
        </div>
        <div className="tdb-tb-row tdb-tb-row-2">
          <ChipGroup label="Région" values={REGION_NAMES} selected={f.regions} onToggle={(v) => toggle('regions', v)} />
        </div>
        <div className="tdb-tb-row tdb-tb-row-2 tdb-scope">
          <p className="tdb-scope-text" aria-live="polite">
            <span className="tdb-scope-label">Périmètre</span> {scopeText(f)}
            <span className="tdb-scope-count">
              {' '}
              · {int(cur.commandes)} commandes livrées, {int(cur.clients)} clients
            </span>
          </p>
          <button type="button" className="tdb-btn" onClick={() => setF(DEFAULT_FILTERS)} disabled={isDefault(f)}>
            Réinitialiser les filtres
          </button>
        </div>
      </div>

      {/* ── Indicateurs ── */}
      <KpiBand cur={cur} prev={prev} vsLabel={vsLabel} months={months} />

      <div className="tdb-grid">
        <section className="tdb-panel tdb-p-month" aria-labelledby="tdb-h-month">
          <div className="tdb-panel-head">
            <h3 id="tdb-h-month">CA livré par mois</h3>
            <span className="tdb-panel-meta">
              {monthsPrev ? (
                <>
                  <span className="tdb-key tdb-key-cur" aria-hidden="true" /> {periodLabel(f)}{' '}
                  <span className="tdb-key tdb-key-prev" aria-hidden="true" /> un an plus tôt, même périmètre
                </>
              ) : (
                'Pas d’année précédente dans les données pour cette période'
              )}
            </span>
          </div>
          <MonthlyChart
            months={months.map((_, i) => f.from + i)}
            current={months.map((m) => m.ca)}
            previous={monthsPrev ? monthsPrev.map((m) => m.ca) : null}
            compact={compact}
          />
        </section>

        <section className="tdb-panel tdb-p-notes" aria-labelledby="tdb-h-notes">
          <div className="tdb-panel-head">
            <h3 id="tdb-h-notes">Ce que disent les chiffres</h3>
            <span className="tdb-panel-meta">Rédigé à partir du périmètre</span>
          </div>
          <ol className="tdb-notes">
            {notes.map((n) => (
              <li key={n.id}>{n.text}</li>
            ))}
          </ol>
        </section>

        <section className="tdb-panel tdb-p-cat" aria-labelledby="tdb-h-cat">
          <div className="tdb-panel-head">
            <h3 id="tdb-h-cat">Par catégorie</h3>
            <span className="tdb-panel-meta">Clic : filtrer</span>
          </div>
          <BarList rows={byCat} selected={f.categories} onToggle={(k) => toggle('categories', k)} colorOf={(k) => CAT_COLOR[k as Categorie]} label="CA livré par catégorie" />
        </section>

        <section className="tdb-panel tdb-p-reg" aria-labelledby="tdb-h-reg">
          <div className="tdb-panel-head">
            <h3 id="tdb-h-reg">Par région</h3>
            <span className="tdb-panel-meta">Clic : filtrer</span>
          </div>
          <BarList rows={byReg} selected={f.regions} onToggle={(k) => toggle('regions', k)} label="CA livré par région" />
        </section>

        <section className="tdb-panel tdb-p-can" aria-labelledby="tdb-h-can">
          <div className="tdb-panel-head">
            <h3 id="tdb-h-can">Par canal et par clientèle</h3>
            <span className="tdb-panel-meta">Clic : filtrer</span>
          </div>
          <BarList rows={byCanal} selected={f.canaux} onToggle={(k) => toggle('canaux', k)} colorOf={(k) => CANAL_COLOR[k as Canal]} label="CA livré par canal" />
          <div className="tdb-sub-sep" />
          <BarList
            rows={bySeg.map((r) => ({ ...r, key: r.key }))}
            selected={f.segment ? [f.segment] : []}
            onToggle={(k) => setF((c) => ({ ...c, segment: c.segment === k ? null : (k as Segment) }))}
            label="CA livré par type de client"
          />
        </section>

        <section className="tdb-panel tdb-p-top" aria-labelledby="tdb-h-top">
          <div className="tdb-panel-head">
            <h3 id="tdb-h-top">Meilleures ventes</h3>
            <span className="tdb-panel-meta">CA livré, remises déduites</span>
          </div>
          {top.length ? (
            <div className="tdb-table-wrap">
              <table className="tdb-table">
                <thead>
                  <tr>
                    <th scope="col">Produit</th>
                    <th scope="col">Unités</th>
                    <th scope="col">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p, i) => (
                    <tr key={p.id}>
                      <th scope="row">
                        <span className="tdb-rank">{i + 1}</span>
                        <span className="tdb-key" style={{ background: CAT_COLOR[p.categorie] }} aria-hidden="true" />
                        <span className="tdb-prod">
                          {p.nom}
                          <small>{p.categorie}</small>
                        </span>
                      </th>
                      <td>{int(p.unites)}</td>
                      <td>{euros(p.ca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="tdb-empty">Aucune vente sur ce périmètre.</p>
          )}
        </section>

        <section className="tdb-panel tdb-p-coh" aria-labelledby="tdb-h-coh">
          <div className="tdb-panel-head">
            <h3 id="tdb-h-coh">Rétention des nouveaux clients</h3>
            <span className="tdb-panel-meta">
              {ret1 !== null ? `Revenus à +1 mois : ${pct(ret1)}` : ''}
              {ret3 !== null ? ` · à +3 mois : ${pct(ret3)}` : ''}
            </span>
          </div>
          <CohortHeatmap rows={coh} />
        </section>
      </div>
    </section>
  );
}

/* ───────────── Filtres en puces ───────────── */

function ChipGroup({
  label,
  values,
  selected,
  onToggle,
  colorOf,
}: {
  label: string;
  values: readonly string[];
  selected: readonly string[];
  onToggle: (v: string) => void;
  colorOf?: (v: string) => string;
}) {
  const id = `tdb-l-${label.toLowerCase().replace(/[^a-z]/g, '')}`;
  return (
    <div className="tdb-chips" role="group" aria-labelledby={id}>
      <span className="tdb-tb-label" id={id}>
        {label}
        <span className="tdb-chips-state">{selected.length ? ` · ${selected.length}/${values.length}` : ' · toutes'}</span>
      </span>
      {values.map((v) => (
        <button key={v} type="button" className="tdb-chip" aria-pressed={selected.includes(v)} onClick={() => onToggle(v)}>
          {colorOf && <span className="tdb-key" style={{ background: colorOf(v) }} aria-hidden="true" />}
          {v}
        </button>
      ))}
    </div>
  );
}

function listText(sel: readonly string[], all: number, none: string, unit: string) {
  if (!sel.length) return none;
  if (sel.length <= 2) return sel.join(', ');
  return `${sel.length} ${unit} sur ${all}`;
}

function scopeText(f: Filters) {
  return [
    periodLabel(f),
    listText(f.regions, REGION_NAMES.length, 'toutes régions', 'régions'),
    listText(f.canaux, CANAUX.length, 'tous canaux', 'canaux'),
    listText(f.categories, CATEGORIES.length, 'toutes catégories', 'catégories'),
    f.segment ? SEGMENT_LABEL[f.segment].toLowerCase() : 'tous clients',
  ].join(' · ');
}

/* ───────────── Bandeau d'indicateurs ───────────── */

interface Tile {
  key: string;
  label: string;
  value: string;
  delta: string | null;
  /** +1 : une hausse est favorable ; −1 : une baisse est favorable. */
  polarity: 1 | -1;
  sign: number;
  sub?: string;
  spark: (number | null)[];
}

function KpiBand({ cur, prev, vsLabel, months }: { cur: Kpis; prev: Kpis | null; vsLabel: string | null; months: Kpis[] }) {
  const rel = (a: number | null, b: number | null | undefined) => relChange(a, b ?? null);
  const tiles: Tile[] = [];
  const add = (t: Omit<Tile, 'delta' | 'sign'>, change: number | null, asPoints = false) =>
    tiles.push({ ...t, delta: change === null ? null : asPoints ? signedPts(change) : signedPct(change), sign: change === null ? 0 : Math.sign(change) });

  add({ key: 'ca', label: 'Chiffre d’affaires', value: euros(cur.ca), polarity: 1, spark: months.map((m) => m.ca) }, rel(cur.ca, prev?.ca));
  add({ key: 'cmd', label: 'Commandes livrées', value: int(cur.commandes), polarity: 1, spark: months.map((m) => m.commandes) }, rel(cur.commandes, prev?.commandes));
  add({ key: 'panier', label: 'Panier moyen', value: cur.panier === null ? '—' : euros2(cur.panier), polarity: 1, spark: months.map((m) => m.panier) }, rel(cur.panier, prev?.panier));
  add(
    {
      key: 'marge',
      label: 'Marge brute',
      value: euros(cur.marge),
      sub: cur.tauxMarge === null ? undefined : `Taux de marge ${pct(cur.tauxMarge)}`,
      polarity: 1,
      spark: months.map((m) => m.marge),
    },
    rel(cur.marge, prev?.marge),
  );
  add({ key: 'clients', label: 'Clients actifs', value: int(cur.clients), polarity: 1, spark: months.map((m) => m.clients) }, rel(cur.clients, prev?.clients));
  add(
    {
      key: 'retour',
      label: 'Taux de retour',
      value: cur.tauxRetour === null ? '—' : pct(cur.tauxRetour),
      sub: cur.tauxAnnulation === null ? undefined : `Annulations ${pct(cur.tauxAnnulation)}`,
      polarity: -1,
      spark: months.map((m) => m.tauxRetour),
    },
    cur.tauxRetour !== null && prev?.tauxRetour != null ? cur.tauxRetour - prev.tauxRetour : null,
    true,
  );

  return (
    <section className="tdb-kpis" aria-label="Indicateurs du périmètre">
      {tiles.map((t) => {
        const tone = t.sign === 0 ? '' : t.sign * t.polarity > 0 ? ' is-good' : ' is-bad';
        return (
          <div key={t.key} className="tdb-kpi">
            <span className="tdb-kpi-label">{t.label}</span>
            <span className="tdb-kpi-value">{t.value}</span>
            <span className={`tdb-kpi-delta${tone}`}>{t.delta ? `${t.delta} ${vsLabel}` : 'Pas de période comparable'}</span>
            {t.sub && <span className="tdb-kpi-sub">{t.sub}</span>}
            <Sparkline values={t.spark} label={`${t.label}, évolution mois par mois`} />
          </div>
        );
      })}
    </section>
  );
}
