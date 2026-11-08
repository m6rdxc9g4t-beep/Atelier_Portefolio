import { useMemo, useState } from 'react';
import { generateComptoir } from '../sql-lab/data';
import { ElbowChart, familyOf, RfMatrix, Scatter, SilhouetteChart } from './charts';
import { dec2, days, euros, int, med, pct } from './format';
import {
  K_MAX,
  K_MIN,
  profileClusters,
  projectCentroid,
  REFERENCE_DATE,
  RFM_SEGMENTS,
  rfmSegmentOf,
  rfMatrix,
  segment,
  type ClientRfm,
  type RfmSegment,
} from './model';

type Selection = { kind: 'rfm'; name: RfmSegment } | { kind: 'cluster'; index: number };

const PAGE = 25;
const refLabel = new Date(`${REFERENCE_DATE}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function Segmentation() {
  // Tout le calcul (RFM, k-means pour k = 2 … 8, silhouettes, ACP) est fait une fois, au chargement.
  const seg = useMemo(() => segment(generateComptoir()), []);
  const { clients } = seg;
  const [k, setK] = useState(seg.bestK);
  const [selection, setSelection] = useState<Selection>({ kind: 'rfm', name: 'Champions' });
  const [showAll, setShowAll] = useState(false);

  const res = seg.byK.get(k)!;
  const profiles = useMemo(() => profileClusters(clients, res), [clients, res]);
  const centroids2d = useMemo(() => res.centroids.map((c) => projectCentroid(seg.pca, seg.z, c)), [res, seg]);
  const matrix = useMemo(() => rfMatrix(clients), [clients]);
  const caTotal = useMemo(() => clients.reduce((s, c) => s + c.montant, 0), [clients]);

  const segStats = useMemo(() => {
    const m = new Map<RfmSegment, { n: number; ca: number }>();
    for (const c of clients) {
      const e = m.get(c.segment) ?? { n: 0, ca: 0 };
      e.n += 1;
      e.ca += c.montant;
      m.set(c.segment, e);
    }
    return m;
  }, [clients]);

  // Segment RFM le plus fréquent dans chaque groupe : le pont entre les deux méthodes.
  const dominantRfm = useMemo(
    () =>
      profiles.map((p) => {
        const count = new Map<RfmSegment, number>();
        clients.forEach((c, i) => {
          if (res.labels[i] === p.index) count.set(c.segment, (count.get(c.segment) ?? 0) + 1);
        });
        const [name, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0]!;
        return { name, share: n / p.size };
      }),
    [profiles, clients, res],
  );

  const members = useMemo(() => {
    const idx: number[] = [];
    clients.forEach((c, i) => {
      if (selection.kind === 'rfm' ? c.segment === selection.name : res.labels[i] === selection.index) idx.push(i);
    });
    return idx.sort((a, b) => clients[b]!.montant - clients[a]!.montant);
  }, [clients, selection, res]);
  const highlight = useMemo(() => new Set(members), [members]);

  const select = (s: Selection) => {
    setSelection(s);
    setShowAll(false);
  };
  const changeK = (next: number) => {
    setK(next);
    if (selection.kind === 'cluster' && selection.index >= next) select({ kind: 'cluster', index: 0 });
  };

  // Le meilleur k selon la silhouette, et un éventuel k presque aussi bon mais plus détaillé.
  const sil = (kk: number) => seg.silhouettes.find((s) => s.k === kk)!.value;
  const runnerUp = seg.silhouettes.filter((s) => s.k > seg.bestK && sil(seg.bestK) - s.value < 0.03).map((s) => s.k)[0];

  const selTitle =
    selection.kind === 'rfm'
      ? `Segment RFM « ${selection.name} »`
      : `Groupe ${selection.index + 1} · ${profiles[selection.index]!.name}`;
  const selRule = selection.kind === 'rfm' ? RFM_SEGMENTS.find((s) => s.name === selection.name)! : null;
  const shown = showAll ? members : members.slice(0, PAGE);

  return (
    <div className="seg-tool">
      {/* ───── 1. RFM ───── */}
      <section className="seg-panel" aria-labelledby="seg-rfm-title">
        <div className="seg-panel-head">
          <h2 id="seg-rfm-title">
            <span className="seg-step">1</span>Scores RFM
          </h2>
          <span className="seg-meta">
            {int(clients.length)} clients avec au moins une commande livrée · récence au {refLabel}
          </span>
        </div>
        <div className="seg-rfm">
          <div className="seg-rfm-matrix">
            <RfMatrix
              matrix={matrix}
              segmentAt={rfmSegmentOf}
              selected={selection.kind === 'rfm' ? selection.name : null}
              onSelect={(name) => select({ kind: 'rfm', name })}
            />
            <p className="seg-note">
              Chaque case compte les clients d’un couple de scores. Le montant (M) départage à l’intérieur d’un segment ; il n’entre pas
              dans la grille, comme dans la segmentation RFM classique.
            </p>
          </div>
          <div className="seg-rfm-list">
            <table className="seg-segtable">
              <caption className="seg-sr">Segments RFM : effectif et part du chiffre d’affaires</caption>
              <thead>
                <tr>
                  <th scope="col">Segment</th>
                  <th scope="col" className="is-num">
                    Clients
                  </th>
                  <th scope="col" className="is-num">
                    Part du CA
                  </th>
                </tr>
              </thead>
              <tbody>
                {RFM_SEGMENTS.map((s) => {
                  const st = segStats.get(s.name) ?? { n: 0, ca: 0 };
                  const on = selection.kind === 'rfm' && selection.name === s.name;
                  return (
                    <tr key={s.name} className={on ? 'is-on' : ''}>
                      <th scope="row">
                        <button type="button" className={`seg-segbtn seg-fam-${s.family}`} aria-pressed={on} onClick={() => select({ kind: 'rfm', name: s.name })}>
                          <span className="seg-swatch" aria-hidden="true" />
                          <span className="seg-segname">{s.name}</span>
                          <span className="seg-rule">{s.rule}</span>
                        </button>
                      </th>
                      <td className="is-num">{int(st.n)}</td>
                      <td className="is-num seg-sharecell">
                        <span className="seg-sharebar" style={{ width: `${Math.max(2, (st.ca / caTotal) * 100)}%` }} aria-hidden="true" />
                        <span>{pct(st.ca / caTotal)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ───── 2. k-means ───── */}
      <section className="seg-panel" aria-labelledby="seg-km-title">
        <div className="seg-panel-head">
          <h2 id="seg-km-title">
            <span className="seg-step">2</span>Groupes trouvés par k-means
          </h2>
          <span className="seg-meta">récence, log(1 + fréquence), log(montant), standardisés · {res.converged ? `convergé en ${res.iterations} itérations` : 'non convergé'}</span>
        </div>

        <div className="seg-kpick">
          <div className="seg-krange">
            <div className="seg-krange-head">
              <label htmlFor="seg-k">Nombre de groupes</label>
              <output htmlFor="seg-k">k = {k}</output>
            </div>
            <input
              id="seg-k"
              type="range"
              className="seg-range"
              min={K_MIN}
              max={K_MAX}
              step={1}
              value={k}
              onChange={(e) => changeK(Number(e.target.value))}
              style={{ ['--seg-fill' as string]: `${((k - K_MIN) / (K_MAX - K_MIN)) * 100}%` }}
              aria-describedby="seg-k-help"
            />
            <div className="seg-kticks" aria-hidden="true">
              {Array.from({ length: K_MAX - K_MIN + 1 }, (_, i) => K_MIN + i).map((kk) => (
                <span key={kk} className={kk === seg.bestK ? 'is-best' : ''}>
                  {kk}
                </span>
              ))}
            </div>
            <p id="seg-k-help" className="seg-note">
              La meilleure silhouette est obtenue pour <strong>k = {seg.bestK}</strong> ({dec2(sil(seg.bestK))}), proposé par défaut.
              {runnerUp !== undefined && (
                <>
                  {' '}
                  k = {runnerUp} en est très proche ({dec2(sil(runnerUp))}) et sépare un groupe de plus :{' '}
                  <button type="button" className="seg-link" onClick={() => changeK(runnerUp)}>
                    essayer k = {runnerUp}
                  </button>
                  .
                </>
              )}
            </p>
          </div>
          <figure className="seg-mini">
            <figcaption>Coude : inertie intra-groupes</figcaption>
            <ElbowChart points={seg.inertia} k={k} />
          </figure>
          <figure className="seg-mini">
            <figcaption>Silhouette moyenne (★ = meilleure)</figcaption>
            <SilhouetteChart points={seg.silhouettes} k={k} bestK={seg.bestK} />
          </figure>
        </div>

        <div className="seg-map">
          <figure className="seg-map-plot">
            <figcaption>
              Les clients sur le plan de l’ACP ({pct(seg.pca.explained[0]! + seg.pca.explained[1]!)} de la variance) ; le numéro marque le
              centre de chaque groupe. Les points de la sélection en cours restent pleins.
            </figcaption>
            <Scatter
              coords={seg.pca.coords}
              labels={res.labels}
              clients={clients}
              centroids={centroids2d}
              explained={seg.pca.explained}
              highlight={highlight}
            />
            <Loadings components={seg.pca.components} />
          </figure>
          <ol className="seg-cards" aria-label="Portraits des groupes">
            {profiles.map((p, g) => {
              const on = selection.kind === 'cluster' && selection.index === g;
              return (
                <li key={g}>
                  <button type="button" className={`seg-card seg-c${g}${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => select({ kind: 'cluster', index: g })}>
                    <span className="seg-card-head">
                      <span className="seg-card-num">{g + 1}</span>
                      <span className="seg-card-name">{p.name}</span>
                      <span className="seg-card-size">
                        {int(p.size)} clients · {pct(p.shareCA)} du CA
                      </span>
                    </span>
                    <span className="seg-card-stats">
                      <span>
                        <em>Récence</em>
                        {days(p.medRecence)}
                      </span>
                      <span>
                        <em>Commandes</em>
                        {med(p.medFrequence)}
                      </span>
                      <span>
                        <em>Montant</em>
                        {euros(p.medMontant)}
                      </span>
                    </span>
                    <span className="seg-card-facts">
                      {p.regions.map((r) => `${r.region} ${pct(r.share)}`).join(' · ')} · {p.canal.canal} {pct(p.canal.share)} des commandes ·{' '}
                      {pct(p.sharePro)} de pros · RFM : {dominantRfm[g]!.name} {pct(dominantRfm[g]!.share)}
                    </span>
                    <span className="seg-card-reco">{p.recommendation}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ───── 3. Clients de la sélection ───── */}
      <section className="seg-panel" aria-labelledby="seg-list-title" aria-live="polite">
        <div className="seg-panel-head">
          <h2 id="seg-list-title">
            <span className={`seg-dot-title ${selection.kind === 'cluster' ? `seg-c${selection.index}` : `seg-fam-${familyOf(selection.name)}`}`} aria-hidden="true" />
            {selTitle}
          </h2>
          <span className="seg-meta">
            {int(members.length)} client{members.length > 1 ? 's' : ''} · {euros(members.reduce((s, i) => s + clients[i]!.montant, 0))} de CA · triés par CA
          </span>
        </div>
        {selRule && <p className="seg-action">Règle : {selRule.rule}. Action type : {selRule.action}</p>}
        {members.length === 0 ? (
          <p className="seg-empty">Aucun client dans ce segment pour l’instant.</p>
        ) : (
          <div className="seg-table-wrap">
            <table className="seg-clients">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Ville</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="is-num">
                    Récence
                  </th>
                  <th scope="col" className="is-num">
                    Commandes
                  </th>
                  <th scope="col" className="is-num">
                    CA livré
                  </th>
                  <th scope="col" className="is-num">
                    R-F-M
                  </th>
                  <th scope="col">Segment RFM</th>
                  <th scope="col" className="is-num">
                    Groupe
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <ClientRow key={clients[i]!.id} c={clients[i]!} group={res.labels[i]!} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {members.length > PAGE && (
          <div className="seg-more">
            <button type="button" className="seg-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? `Afficher les ${PAGE} premiers` : `Afficher les ${int(members.length)} clients`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ClientRow({ c, group }: { c: ClientRfm; group: number }) {
  return (
    <tr>
      <td>{c.nom}</td>
      <td>
        {c.ville} <span className="seg-faint">{c.region}</span>
      </td>
      <td>{c.type === 'Professionnel' ? 'Pro' : 'Particulier'}</td>
      <td className="is-num">{days(c.recence)}</td>
      <td className="is-num">{int(c.frequence)}</td>
      <td className="is-num">{euros(c.montant)}</td>
      <td className="is-num seg-mono">
        {c.r}-{c.f}-{c.m}
      </td>
      <td>
        <span className={`seg-tag seg-fam-${familyOf(c.segment)}`}>{c.segment}</span>
      </td>
      <td className="is-num">
        <span className={`seg-gnum seg-c${group}`}>{group + 1}</span>
      </td>
    </tr>
  );
}

/** Poids des variables dans les deux composantes : ce que les axes du nuage veulent dire. */
function Loadings({ components }: { components: number[][] }) {
  const names = ['récence', 'fréquence', 'montant'];
  return (
    <dl className="seg-loadings">
      {[0, 1].map((c) => (
        <div key={c}>
          <dt>Composante {c + 1}</dt>
          <dd>
            {components[c]!.map((w, j) => (
              <span key={j}>
                {w >= 0 ? '+' : '−'}
                {dec2(Math.abs(w))} {names[j]}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
