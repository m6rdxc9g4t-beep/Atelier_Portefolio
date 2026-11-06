import { memo, useState } from 'react';
import {
  CATEGORIES,
  CHANNELS,
  MONITORS,
  PRESETS,
  ewmaVolume,
  expectedOrdersCum,
  compoundPoissonBand,
  cumulative,
  incidentDef,
  kpisAt,
  relChange,
  type Alert,
  type Incident,
  type MonitorId,
  type SimState,
} from './model';
import { ControlChart, useWidth } from './charts';
import { dec1, duration, euros, euros2, hhmm, hhmmss, int, pct, sigma, signedPct, signedPts } from './format';
import { EcrIcon } from './icons';

const MONITOR_LABEL = Object.fromEntries(MONITORS.map((m) => [m.id, m.label])) as Record<MonitorId, string>;

/** Libellé d'un écart : « Commandes en baisse ». */
export const alertTitle = (a: Pick<Alert, 'monitor' | 'dir'>) => `${MONITOR_LABEL[a.monitor]} en ${a.dir < 0 ? 'baisse' : 'hausse'}`;
const tone = (dir: number) => (dir < 0 ? 'down' : 'warn');

/* ───────────── Bandeau d'indicateurs ───────────── */

interface Tile {
  key: string;
  label: string;
  value: string;
  delta: string | null;
  monitor?: MonitorId;
  status?: { text: string; tone: 'down' | 'warn' } | null;
}

export const KpiBand = memo(function KpiBand({ sim }: { sim: SimState }) {
  const m = sim.today.sessions.length;
  const k = kpisAt(sim.today, m);
  const y = sim.yesterday ? kpisAt(sim.yesterday, m) : null;
  const rel = (a: number | null, b: number | null | undefined) => {
    const r = relChange(a, b ?? null);
    return r === null ? null : `${signedPct(r)}`;
  };
  // Position du CA cumulé dans sa bande a priori (95 %).
  const exp = expectedOrdersCum(sim.today.day);
  const band = compoundPoissonBand(exp[m]!);
  const zCa = band.sd > 0 ? (k.revenue - band.mean) / band.sd : 0;
  const statusOf = (id: MonitorId): Tile['status'] => {
    const ms = sim.monitors[id];
    if (ms.openAlert === null) return null;
    const a = sim.alerts.find((x) => x.id === ms.openAlert);
    return a ? { text: `Écart à la ${a.dir < 0 ? 'baisse' : 'hausse'} depuis ${hhmm(a.start)}`, tone: tone(a.dir) } : null;
  };
  const tiles: Tile[] = [
    {
      key: 'ca',
      label: 'CA du jour',
      value: euros(k.revenue),
      delta: rel(k.revenue, y?.revenue),
      status: Math.abs(zCa) > 1.96 ? { text: `${zCa < 0 ? 'Sous' : 'Au-dessus de'} la bande attendue`, tone: zCa < 0 ? 'down' : 'warn' } : null,
    },
    { key: 'orders', label: 'Commandes', value: int(k.orders), delta: rel(k.orders, y?.orders), status: statusOf('orders') },
    { key: 'aov', label: 'Panier moyen', value: k.aov === null ? '—' : euros2(k.aov), delta: rel(k.aov, y?.aov), status: statusOf('aov') },
    {
      key: 'conv',
      label: 'Taux de conversion',
      value: k.conversion === null ? '—' : pct(k.conversion),
      delta: k.conversion !== null && y?.conversion != null ? signedPts(k.conversion - y.conversion) : null,
      status: statusOf('conversion'),
    },
    { key: 'sessions', label: 'Sessions', value: int(k.sessions), delta: rel(k.sessions, y?.sessions), status: statusOf('sessions') },
  ];
  return (
    <section className="ecr-kpis" aria-label="Indicateurs du jour">
      {tiles.map((t) => (
        <div key={t.key} className={`ecr-kpi${t.status ? ` is-${t.status.tone}` : ''}`}>
          <span className="ecr-kpi-label">{t.label}</span>
          <span className="ecr-kpi-value">{t.value}</span>
          <span className="ecr-kpi-delta">{t.delta ? `${t.delta} vs hier, même heure` : 'Pas de veille comparable'}</span>
          {t.status && (
            <span className={`ecr-kpi-status ecr-tone-${t.status.tone}`}>
              <EcrIcon name={t.status.tone === 'down' ? 'arrowDown' : 'arrowUp'} size={13} />
              {t.status.text}
            </span>
          )}
        </div>
      ))}
    </section>
  );
});

/* ───────────── Cartes de contrôle ───────────── */

export const MonitorPanel = memo(function MonitorPanel({ sim }: { sim: SimState }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const { L } = PRESETS[sim.preset];
  return (
    <div className="ecr-monitors">
      {MONITORS.map((def, i) => {
        const ms = sim.monitors[def.id];
        const last = ms.history[ms.history.length - 1];
        const open = ms.openAlert === null ? null : sim.alerts.find((a) => a.id === ms.openAlert) ?? null;
        const idle = def.method === 'ewma' && ewmaVolume(ms.ewma) < 4;
        const meta =
          def.method === 'gap'
            ? `Absence de ventes · Λ = ${dec1(ms.gap)}`
            : `EWMA · ${def.sides === 'both' ? 'hausse et baisse' : 'baisse seulement'}`;
        return (
          <div key={def.id} className="ecr-mon">
            <div className="ecr-mon-head">
              <span className="ecr-mon-name">{def.label}</span>
              {open ? (
                <span className={`ecr-mon-state ecr-tone-${tone(open.dir)}`}>
                  Écart à la {open.dir < 0 ? 'baisse' : 'hausse'} depuis {hhmm(open.start)}
                </span>
              ) : idle ? (
                <span className="ecr-mon-state ecr-muted">En veille : volume attendu trop faible</span>
              ) : (
                <span className="ecr-mon-state ecr-faint">{meta}</span>
              )}
            </div>
            <div className="ecr-mon-chart" ref={i === 0 ? ref : undefined}>
              <ControlChart def={def} state={ms} L={L} sim={sim} width={width} axis={i === MONITORS.length - 1} />
            </div>
            <span className={`ecr-mon-z${open ? ` ecr-tone-${tone(open.dir)}` : ''}`}>{last ? sigma(last.z) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
});

/* ───────────── Journal : incidents injectés et alertes ───────────── */

type JournalItem = { kind: 'alert'; t: number; alert: Alert } | { kind: 'incident'; t: number; incident: Incident };

export const AlertsPanel = memo(function AlertsPanel({ sim, falseEvery }: { sim: SimState; falseEvery: number | null }) {
  const items: JournalItem[] = [
    ...sim.alerts.map((a) => ({ kind: 'alert' as const, t: a.start, alert: a })),
    ...sim.incidents.map((i) => ({ kind: 'incident' as const, t: i.start - 0.5, incident: i })),
  ].sort((a, b) => b.t - a.t);
  const incidentById = new Map(sim.incidents.map((i) => [i.id, i]));

  if (items.length === 0) {
    return (
      <div className="ecr-empty">
        <p>Aucune alerte : les cinq indicateurs restent dans leur bande attendue.</p>
        <p className="ecr-muted">Injectez un incident pour mesurer le temps que met la surveillance à le repérer.</p>
      </div>
    );
  }
  return (
    <ol className="ecr-journal">
      {items.slice(0, 14).map((it) => {
        if (it.kind === 'incident') {
          const inc = it.incident;
          const def = incidentDef(inc.kind);
          const linked = sim.alerts.filter((a) => a.incidentId === inc.id).sort((a, b) => a.start - b.start);
          const first = linked[0];
          const running = sim.minute < inc.end;
          return (
            <li key={`i${inc.id}`} className="ecr-jr ecr-jr-inc">
              <span className="ecr-jr-time">{hhmm(inc.start)}</span>
              <div className="ecr-jr-body">
                <span className="ecr-jr-title">Incident injecté : {def.label.toLowerCase()}</span>
                <span className="ecr-jr-meta">
                  {def.detail} {running ? `Encore ${duration(inc.end - sim.minute)}.` : `Terminé à ${hhmm(inc.end)}.`}
                </span>
                <span className="ecr-jr-meta">
                  {first ? (
                    <>
                      Détecté en <b>{duration(first.start - inc.start)}</b> ({MONITOR_LABEL[first.monitor].toLowerCase()})
                    </>
                  ) : running || sim.minute < inc.end + 30 ? (
                    `Pas encore détecté (${duration(sim.minute - inc.start)} écoulées).`
                  ) : (
                    'Non détecté : l’écart est resté dans le bruit attendu.'
                  )}
                </span>
              </div>
            </li>
          );
        }
        const a = it.alert;
        const inc = a.incidentId === null ? null : incidentById.get(a.incidentId);
        const isOpen = a.end === null;
        return (
          <li key={`a${a.id}`} className={`ecr-jr${isOpen ? ` is-open ecr-tone-${tone(a.dir)}` : ''}`}>
            <span className="ecr-jr-time">{hhmm(a.start)}</span>
            <div className="ecr-jr-body">
              <span className="ecr-jr-title">
                <i className={`ecr-dot${isOpen ? '' : ' is-past'}`} aria-hidden="true" />
                {alertTitle(a)}
              </span>
              <span className="ecr-jr-meta">
                {isOpen ? `En cours depuis ${duration(sim.minute - a.start)}` : `Résolue à ${hhmm(a.end!)}, après ${duration(a.end! - a.start)}`} · pic{' '}
                {sigma(a.peak)}
              </span>
              <span className="ecr-jr-meta">
                {inc
                  ? `Liée à : ${incidentDef(inc.kind).label.toLowerCase()} (injectée à ${hhmm(inc.start)}).`
                  : `Aucun incident injecté : fausse alerte probable${falseEvery ? ` (une toutes les ${duration(falseEvery)} en moyenne avec ce réglage)` : ''}.`}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
});

/* ───────────── Flux des dernières commandes ───────────── */

export const FeedPanel = memo(function FeedPanel({ sim, rows }: { sim: SimState; rows: number }) {
  const channelLabel = Object.fromEntries(CHANNELS.map((c) => [c.id, c.label]));
  const feed = sim.feed.slice(0, rows);
  if (feed.length === 0) return <div className="ecr-empty ecr-muted">Aucune commande pour l’instant.</div>;
  return (
    <ul className="ecr-feed" aria-label="Dernières commandes et retours">
      {feed.map((e) => (
        <li key={e.key} className={`ecr-feed-row${e.kind === 'return' ? ' is-return' : ''}`}>
          <span className="ecr-feed-time">{hhmmss(e.t)}</span>
          <span className="ecr-feed-main">
            <span className="ecr-feed-label">{e.label}</span>
            <span className="ecr-feed-sub">
              {e.ref}
              {e.kind === 'return' ? ' · retour reçu' : e.channel ? ` · ${channelLabel[e.channel]}` : ''}
            </span>
          </span>
          <span className="ecr-feed-amount">{euros2(e.amount)}</span>
        </li>
      ))}
    </ul>
  );
});

/* ───────────── Ventilation par canal ou par catégorie ───────────── */

export const BreakdownPanel = memo(function BreakdownPanel({ sim }: { sim: SimState }) {
  const [view, setView] = useState<'channel' | 'category'>('channel');
  const totalRevenue = CHANNELS.reduce((s, c) => s + sim.channels[c.id].revenue, 0);
  const catRevenue = CATEGORIES.reduce((s, c) => s + sim.categories[c.id].revenue, 0);
  const rows =
    view === 'channel'
      ? CHANNELS.map((c, i) => ({ id: c.id, label: c.label, slot: i + 1, share: totalRevenue ? sim.channels[c.id].revenue / totalRevenue : 0 }))
      : CATEGORIES.map((c, i) => ({ id: c.id, label: c.label, slot: i + 1, share: catRevenue ? sim.categories[c.id].revenue / catRevenue : 0 }));
  const cumToday = cumulative(sim.today.revenue);
  return (
    <>
      <div className="ecr-panel-head">
        <h3>Ventilation du jour</h3>
        <div className="ecr-seg" role="group" aria-label="Ventiler par">
          <button type="button" aria-pressed={view === 'channel'} onClick={() => setView('channel')}>
            Canal
          </button>
          <button type="button" aria-pressed={view === 'category'} onClick={() => setView('category')}>
            Catégorie
          </button>
        </div>
      </div>
      <div className="ecr-stack" role="img" aria-label={`Part du CA par ${view === 'channel' ? 'canal' : 'catégorie'} : ${rows.map((r) => `${r.label} ${pct(r.share, 0)}`).join(', ')}`}>
        {rows.map((r) => (
          <span key={r.id} className={`ecr-s${r.slot}`} style={{ flexGrow: r.share || 0.0001 }} />
        ))}
      </div>
      <div className="ecr-table-wrap">
        {view === 'channel' ? (
          <table className="ecr-table">
            <thead>
              <tr>
                <th scope="col">Canal</th>
                <th scope="col" className="ecr-hide-sm">Sessions</th>
                <th scope="col">Conversion</th>
                <th scope="col" className="ecr-hide-sm">Commandes</th>
                <th scope="col">CA</th>
                <th scope="col">Part du CA</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((c, i) => {
                const a = sim.channels[c.id];
                return (
                  <tr key={c.id}>
                    <th scope="row">
                      <i className={`ecr-key ecr-s${i + 1}`} aria-hidden="true" />
                      {c.label}
                    </th>
                    <td className="ecr-hide-sm">{int(a.sessions)}</td>
                    <td>{a.sessions ? pct(a.orders / a.sessions) : '—'}</td>
                    <td className="ecr-hide-sm">{int(a.orders)}</td>
                    <td>{euros(a.revenue)}</td>
                    <td>{totalRevenue ? pct(a.revenue / totalRevenue, 1) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="ecr-table">
            <thead>
              <tr>
                <th scope="col">Catégorie</th>
                <th scope="col" className="ecr-hide-sm">Articles</th>
                <th scope="col">CA</th>
                <th scope="col">Part du CA</th>
                <th scope="col">Retours</th>
                <th scope="col" className="ecr-hide-sm">Remboursé</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c, i) => {
                const a = sim.categories[c.id];
                return (
                  <tr key={c.id}>
                    <th scope="row">
                      <i className={`ecr-key ecr-s${i + 1}`} aria-hidden="true" />
                      {c.label}
                    </th>
                    <td className="ecr-hide-sm">{int(a.units)}</td>
                    <td>{euros(a.revenue)}</td>
                    <td>{catRevenue ? pct(a.revenue / catRevenue, 1) : '—'}</td>
                    <td>{int(a.returns)}</td>
                    <td className="ecr-hide-sm">{euros(a.refunded)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="ecr-note ecr-muted">
        CA brut des commandes du jour ({euros(cumToday[cumToday.length - 1]!)}), hors retours. Les retours reçus concernent des commandes des jours précédents.
      </p>
    </>
  );
});
