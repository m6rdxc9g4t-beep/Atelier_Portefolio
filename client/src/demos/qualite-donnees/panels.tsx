import { useId, useState } from 'react';
import { Icon } from '../../components/Icon';
import {
  DIMENSIONS,
  grade,
  RULE_LABEL,
  TYPE_LABEL,
  type CleanOp,
  type CleanOptions,
  type CleanResult,
  type ColumnProfile,
  type Issue,
  type Profile,
  type Table,
} from './model';

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const tidy = (s: string) => s.replace(/ /g, ' ');
export const int = (v: number) => tidy(nf0.format(v));
export const dec1 = (v: number) => tidy(nf1.format(v));
const num = (v: number) => (Number.isFinite(v) ? tidy(nf2.format(v)) : '—');
const pct = (part: number, whole: number) => (whole > 0 ? `${dec1((100 * part) / whole)} %` : '—');
const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n > 1 ? many : one}`;
/** Numéro de ligne dans le fichier (l'en-tête est la ligne 1). */
export const lineNo = (row: number) => row + 2;

const SEVERITY_LABEL = { critique: 'Critique', majeur: 'Majeur', mineur: 'Mineur' } as const;

/* ───────────── Score ───────────── */

export function ScorePanel({ profile, previous }: { profile: Profile; previous: number | null }) {
  const g = grade(profile.score);
  const r = 46;
  const c = 2 * Math.PI * r;
  const delta = previous === null ? null : profile.score - previous;
  return (
    <section className="qd-panel qd-score" aria-labelledby="qd-score-title">
      <div className="qd-score-main">
        <h2 id="qd-score-title" className="qd-eyebrow">
          Score qualité
        </h2>
        <div className={`qd-ring qd-tone-${g.tone}`}>
          <svg viewBox="0 0 110 110" width="132" height="132" aria-hidden="true">
            <circle cx="55" cy="55" r={r} className="qd-ring-track" />
            <circle
              cx="55"
              cy="55"
              r={r}
              className="qd-ring-value"
              strokeDasharray={`${(c * profile.score) / 100} ${c}`}
              transform="rotate(-90 55 55)"
            />
          </svg>
          <p className="qd-ring-label">
            <b>{dec1(profile.score)}</b>
            <span>sur 100</span>
          </p>
        </div>
        <p className={`qd-grade qd-tone-${g.tone}`}>{g.label}</p>
        {delta !== null && (
          <p className="qd-delta">
            <Icon name={delta >= 0 ? 'trending-up' : 'trending-down'} size={14} />
            {delta >= 0 ? '+' : '−'}
            {dec1(Math.abs(delta))} points par rapport au fichier d’origine
          </p>
        )}
      </div>
      <div className="qd-dims">
        {DIMENSIONS.map((d) => {
          const v = profile.scores[d.id];
          const tone = v >= 95 ? 'good' : v >= 80 ? 'warn' : 'bad';
          return (
            <div key={d.id} className="qd-dim">
              <div className="qd-dim-head">
                <span className="qd-dim-name">{d.label}</span>
                <span className="qd-dim-weight">poids {int(d.weight * 100)} %</span>
                <b className={`qd-dim-value qd-tone-${tone}`}>{dec1(v)} %</b>
              </div>
              <div className="qd-bar" role="img" aria-label={`${d.label} : ${dec1(v)} % des ${d.help}`}>
                <span className={`qd-tone-${tone}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
              </div>
              <p className="qd-dim-help">{d.help}</p>
            </div>
          );
        })}
        <dl className="qd-facts">
          <div>
            <dt>Lignes</dt>
            <dd>{int(profile.rows)}</dd>
          </div>
          <div>
            <dt>Colonnes</dt>
            <dd>{int(profile.cols)}</dd>
          </div>
          <div>
            <dt>Cellules vides</dt>
            <dd>{pct(profile.missingCells, profile.cells)}</dd>
          </div>
          <div>
            <dt>Doublons</dt>
            <dd>
              {int(profile.exactDuplicates.length)} exacts · {int(profile.nearDuplicates.length)} quasi
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/* ───────────── Problèmes ───────────── */

export function IssuesPanel({ profile, table, open, onToggle }: { profile: Profile; table: Table; open: string | null; onToggle: (id: string) => void }) {
  const ids = useId();
  const counts = { critique: 0, majeur: 0, mineur: 0 };
  profile.issues.forEach((i) => counts[i.severity]++);
  return (
    <section className="qd-panel" aria-labelledby={`${ids}-t`}>
      <div className="qd-panel-head">
        <h2 id={`${ids}-t`}>Problèmes détectés</h2>
        <span className="qd-meta">
          {counts.critique} critique{counts.critique > 1 ? 's' : ''} · {counts.majeur} majeur{counts.majeur > 1 ? 's' : ''} · {counts.mineur} mineur
          {counts.mineur > 1 ? 's' : ''}
        </span>
      </div>
      {profile.issues.length === 0 ? (
        <p className="qd-empty">
          <Icon name="check" size={16} /> Aucun problème détecté par les règles de la démo.
        </p>
      ) : (
        <ul className="qd-issues">
          {profile.issues.map((issue) => {
            const isOpen = open === issue.id;
            const panelId = `${ids}-${issue.id}`;
            return (
              <li key={issue.id} className={`qd-issue sev-${issue.severity}${isOpen ? ' is-open' : ''}`}>
                <button type="button" className="qd-issue-btn" aria-expanded={isOpen} aria-controls={panelId} onClick={() => onToggle(issue.id)}>
                  <span className={`qd-sev sev-${issue.severity}`}>{SEVERITY_LABEL[issue.severity]}</span>
                  <span className="qd-issue-text">
                    <span className="qd-issue-title">
                      {issue.column !== undefined && <code>{table.header[issue.column]}</code>}
                      {issue.title}
                    </span>
                    <span className="qd-issue-detail">{issue.detail}</span>
                  </span>
                  <span className="qd-issue-count">{plural(issue.count, issue.dimension === 'unicite' || issue.dimension === 'structure' ? 'ligne' : 'cellule')}</span>
                  <Icon name="arrow-right" size={14} className="qd-chev" />
                </button>
                {isOpen && (
                  <div id={panelId} className="qd-issue-body">
                    {issue.examples.length > 0 && (
                      <p className="qd-examples">
                        Exemples :{' '}
                        {issue.examples.map((e) => (
                          <code key={e}>{e}</code>
                        ))}
                      </p>
                    )}
                    {issue.rows.length > 0 && <RowsTable issue={issue} profile={profile} table={table} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const SHOW_ROWS = 8;

function RowsTable({ issue, profile, table }: { issue: Issue; profile: Profile; table: Table }) {
  const rows = issue.rows.slice(0, SHOW_ROWS);
  const dup = issue.dimension === 'unicite';
  return (
    <>
      <div className="qd-table-wrap" tabIndex={0} role="region" aria-label={`Lignes concernées : ${issue.title}`}>
        <table className="qd-table qd-rows">
          <thead>
            <tr>
              <th scope="col">Ligne</th>
              {dup && <th scope="col">Doublon de</th>}
              {table.header.map((h, j) => (
                <th key={h} scope="col" className={j === issue.column ? 'is-hit' : ''}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th scope="row">{int(lineNo(r))}</th>
                {dup && <td>{profile.duplicateOf.has(r) ? `ligne ${int(lineNo(profile.duplicateOf.get(r)!))}` : '—'}</td>}
                {table.rows[r]!.map((v, j) => (
                  <td key={j} className={j === issue.column ? 'is-hit' : ''}>
                    {v === '' ? <span className="qd-null">vide</span> : <span className="qd-cell">{v.replace(/ /g, ' ')}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="qd-small">
        {issue.count > SHOW_ROWS ? `${SHOW_ROWS} premières lignes sur ${int(issue.count)}.` : `${plural(rows.length, 'ligne')} concernée${rows.length > 1 ? 's' : ''}.`} Numéros de ligne
        du fichier, en-tête compris.
      </p>
    </>
  );
}

/* ───────────── Colonnes ───────────── */

export function ColumnsPanel({ profile }: { profile: Profile }) {
  return (
    <section className="qd-panel" aria-labelledby="qd-cols-title">
      <div className="qd-panel-head">
        <h2 id="qd-cols-title">Profil des colonnes</h2>
        <span className="qd-meta">type déduit des valeurs, pas de l’en-tête</span>
      </div>
      <div className="qd-cols">
        {profile.columns.map((c) => (
          <ColumnCard key={c.index} c={c} />
        ))}
      </div>
    </section>
  );
}

function ColumnCard({ c }: { c: ColumnProfile }) {
  const filled = c.n - c.missing;
  const fillPct = c.n ? (100 * filled) / c.n : 0;
  const flags: { label: string; n: number; tone: 'bad' | 'warn' }[] = [
    { label: 'invalides', n: c.invalid, tone: 'bad' as const },
    { label: 'aberrantes', n: c.outliers, tone: 'warn' as const },
    { label: 'écritures divergentes', n: c.inconsistent, tone: 'warn' as const },
    { label: 'espaces en trop', n: c.straySpaces, tone: 'warn' as const },
  ].filter((f) => f.n > 0);
  return (
    <article className="qd-col">
      <header className="qd-col-head">
        <h3>
          <code>{c.name}</code>
        </h3>
        <span className={`qd-type t-${c.type}`}>{TYPE_LABEL[c.type]}</span>
        {c.idLike && <span className="qd-type t-id">identifiant</span>}
      </header>
      <div className="qd-fill">
        <span>Remplissage</span>
        <div className="qd-bar qd-bar-thin" role="img" aria-label={`${dec1(fillPct)} % de cellules renseignées`}>
          <span className={fillPct >= 95 ? 'qd-tone-good' : fillPct >= 80 ? 'qd-tone-warn' : 'qd-tone-bad'} style={{ width: `${fillPct}%` }} />
        </div>
        <b>{dec1(fillPct)} %</b>
      </div>
      <p className="qd-col-line">
        {plural(c.distinct, 'valeur distincte', 'valeurs distinctes')}
        {c.type !== 'empty' && c.type !== 'category' && c.type !== 'text' && c.share < 1 && <> · {dec1(100 * c.share)} % au format</>}
      </p>

      {c.numeric && (
        <>
          <Histogram c={c} />
          <dl className="qd-stats">
            <div>
              <dt>min</dt>
              <dd>{num(c.numeric.min)}</dd>
            </div>
            <div>
              <dt>médiane</dt>
              <dd>{num(c.numeric.median)}</dd>
            </div>
            <div>
              <dt>max</dt>
              <dd>{num(c.numeric.max)}</dd>
            </div>
          </dl>
        </>
      )}
      {c.dates && c.dates.min && (
        <p className="qd-col-line">
          Du <b>{c.dates.min.slice(0, 10)}</b> au <b>{c.dates.max.slice(0, 10)}</b>
          <br />
          {c.dates.formats.map((f, k) => (
            <span key={f.fmt} className={k === 0 ? 'qd-fmt' : 'qd-fmt is-minor'}>
              {f.fmt} · {int(f.count)}
            </span>
          ))}
        </p>
      )}
      {!c.numeric && !c.dates && c.top.length > 0 && <TopValues c={c} />}

      {flags.length > 0 ? (
        <ul className="qd-flags">
          {flags.map((f) => (
            <li key={f.label} className={`qd-tone-${f.tone}`}>
              {int(f.n)} {f.label}
            </li>
          ))}
        </ul>
      ) : (
        c.type !== 'empty' && (
          <p className="qd-ok">
            <Icon name="check" size={13} /> Rien à signaler
          </p>
        )
      )}
    </article>
  );
}

function Histogram({ c }: { c: ColumnProfile }) {
  const h = c.numeric!;
  const max = Math.max(1, ...h.bins);
  const W = 220;
  const H = 46;
  const bw = W / h.bins.length;
  return (
    <figure className="qd-hist">
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={`Répartition de ${c.name} entre ${num(h.binLo)} et ${num(h.binHi)}`}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="qd-hist-axis" />
        {h.bins.map((b, k) => {
          const bh = b === 0 ? 0 : Math.max(1.5, (b / max) * H);
          return <rect key={k} x={k * bw + 1} y={H - bh} width={bw - 2} height={bh} rx="1.5" className="qd-hist-bar" />;
        })}
        <text x="0" y={H + 12} className="qd-hist-tick">
          {num(h.binLo)}
        </text>
        <text x={W} y={H + 12} textAnchor="end" className="qd-hist-tick">
          {num(h.binHi)}
        </text>
        {h.binLog && (
          <text x={W / 2} y={H + 12} textAnchor="middle" className="qd-hist-tick">
            échelle log
          </text>
        )}
      </svg>
      <figcaption>
        {c.outliers > 0 ? (
          <>
            + {plural(c.outliers, 'valeur')} hors de cette plage ({RULE_LABEL[h.rule.method].split(',')[0]})
          </>
        ) : h.rule.method === 'none' ? (
          c.idLike ? 'Identifiant : pas de recherche d’aberrations' : 'Trop peu de valeurs pour juger les aberrations'
        ) : (
          'Aucune valeur aberrante'
        )}
      </figcaption>
    </figure>
  );
}

function TopValues({ c }: { c: ColumnProfile }) {
  const filled = c.n - c.missing;
  const max = c.top[0]?.count ?? 1;
  const variantOf = new Set((c.variants ?? []).flatMap((v) => v.forms.slice(1).map((f) => f.value)));
  return (
    <ul className="qd-top" aria-label={`Valeurs les plus fréquentes de ${c.name}`}>
      {c.top.slice(0, c.type === 'text' || c.type === 'email' ? 3 : 5).map((t) => (
        <li key={t.value}>
          <span className={`qd-top-label${variantOf.has(t.value.trim()) ? ' is-variant' : ''}`} title={t.value}>
            {t.value}
          </span>
          <span className="qd-top-bar" aria-hidden="true">
            <span style={{ width: `${(100 * t.count) / max}%` }} />
          </span>
          <span className="qd-top-n">{pct(t.count, filled)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Nettoyage ───────────── */

const OPS: { id: keyof CleanOptions; label: string; help: string }[] = [
  { id: 'trim', label: 'Espaces', help: 'en début et fin supprimés, doublés réduits' },
  { id: 'na', label: 'Valeurs « NA », « null »', help: 'remplacées par une cellule vide' },
  { id: 'categories', label: 'Catégories', help: 'chaque variante ramenée à l’écriture la plus fréquente' },
  { id: 'dates', label: 'Dates', help: 'converties au format ISO AAAA-MM-JJ' },
  { id: 'numbers', label: 'Nombres', help: 'un seul séparateur décimal, sans symbole ni espace' },
  { id: 'postal', label: 'Codes postaux', help: 'zéro initial rétabli (1000 → 01000)' },
  { id: 'dropExact', label: 'Doublons exacts', help: 'lignes identiques après corrections supprimées' },
];

export function CleanPanel({
  opts,
  setOpts,
  result,
  potential,
  table,
  onDownload,
  onReanalyse,
  nearDuplicates,
  csv,
}: {
  opts: CleanOptions;
  setOpts: (o: CleanOptions) => void;
  result: CleanResult;
  /** Effet de chaque opération quand toutes sont cochées (pour afficher ce qu'elle changerait). */
  potential: CleanResult;
  table: Table;
  onDownload: () => void;
  onReanalyse: () => void;
  nearDuplicates: number;
  /** Texte CSV de la version nettoyée (bouton Copier). */
  csv: string;
}) {
  const ids = useId();
  const [copied, setCopied] = useState<'ok' | 'ko' | null>(null);
  const changes = result.preview.flatMap((p) =>
    p.changed.map((ch, j) => (ch ? { row: p.row, col: table.header[j]!, before: p.before[j]!, after: p.after[j]! } : null)).filter((x) => x !== null),
  );
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('ko');
    }
    window.setTimeout(() => setCopied(null), 2200);
  };
  const countFor = (id: keyof CleanOptions) => (id === 'dropExact' ? potential.removedRows : potential.changes[id as CleanOp]);
  return (
    <section className="qd-panel qd-clean" aria-labelledby={`${ids}-t`}>
      <div className="qd-panel-head">
        <h2 id={`${ids}-t`}>Nettoyage proposé</h2>
        <span className="qd-meta">corrections sans risque, appliquées dans votre navigateur</span>
      </div>
      <div className="qd-clean-grid">
        <fieldset className="qd-ops">
          <legend className="qd-sr">Corrections à appliquer</legend>
          {OPS.map((o) => {
            const n = countFor(o.id);
            return (
              <label key={o.id} className={n === 0 ? 'is-idle' : ''}>
                <input type="checkbox" checked={opts[o.id]} onChange={(e) => setOpts({ ...opts, [o.id]: e.target.checked })} />
                <span>
                  <b>{o.label}</b> {o.help}
                </span>
                <span className="qd-op-n">{n === 0 ? '—' : o.id === 'dropExact' ? plural(n, 'ligne') : plural(n, 'cellule')}</span>
              </label>
            );
          })}
          {nearDuplicates > 0 && (
            <p className="qd-small">
              Les {int(nearDuplicates)} quasi-doublons ne sont pas supprimés : ils demandent un arbitrage (quelle fiche garder, quel identifiant conserver).
            </p>
          )}
        </fieldset>
        <div className="qd-preview">
          <p className="qd-clean-sum">
            <b>{plural(result.changedCells, 'cellule corrigée', 'cellules corrigées')}</b>
            {result.removedRows > 0 && <> · {plural(result.removedRows, 'ligne supprimée', 'lignes supprimées')}</>} · {plural(result.table.rows.length, 'ligne')} au final
          </p>
          {changes.length > 0 ? (
            <div className="qd-table-wrap" tabIndex={0} role="region" aria-label="Aperçu des corrections">
              <table className="qd-table qd-diff">
                <thead>
                  <tr>
                    <th scope="col">Ligne</th>
                    <th scope="col">Colonne</th>
                    <th scope="col">Avant</th>
                    <th scope="col">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.slice(0, 10).map((c) => (
                    <tr key={`${c.row}-${c.col}`}>
                      <th scope="row">{int(lineNo(c.row))}</th>
                      <td>
                        <code>{c.col}</code>
                      </td>
                      <td className="qd-before">{c.before === '' ? <span className="qd-null">vide</span> : <span className="qd-cell">«{c.before.replace(/ /g, ' ')}»</span>}</td>
                      <td className="qd-after">{c.after === '' ? <span className="qd-null">vide</span> : <span className="qd-cell">«{c.after}»</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="qd-empty">Aucune correction avec ces options.</p>
          )}
          <div className="qd-actions">
            <button type="button" className="btn btn-primary" onClick={onDownload}>
              <Icon name="download" />
              Télécharger le CSV nettoyé
            </button>
            <button type="button" className="btn" onClick={() => void copy(csv)}>
              {copied === 'ok' ? 'Copié' : copied === 'ko' ? 'Copie refusée' : 'Copier le CSV'}
            </button>
            <button type="button" className="btn" onClick={onReanalyse}>
              <Icon name="search" />
              Analyser la version nettoyée
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
