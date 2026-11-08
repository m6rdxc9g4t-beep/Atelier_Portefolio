import { useId, useMemo, useState } from "react";
import {
  attributeAll,
  CHANNELS,
  economics,
  MODELS,
  N_PARCOURS,
  PANIER_MOYEN,
  reallocation,
  simulate,
  SPECS,
  topPaths,
  type ModelId,
  type Opportunism,
} from "./model";
import {
  AttributionBars,
  ErrorRanking,
  PathList,
  ReallocationBars,
} from "./charts";
import { eur, eurSigned, n0, pct, pts, ptsAbs, ratio } from "./format";

const OPPORTUNISM: { value: Opportunism; label: string }[] = [
  { value: "faible", label: "Rares" },
  { value: "moyen", label: "Fréquentes" },
  { value: "fort", label: "Systématiques" },
];
const MAX_COMPARED = 4;
const VERDICT_THRESHOLD = 2.5;

export default function Tool() {
  const [opportunism, setOpportunism] = useState<Opportunism>("moyen");
  const [halfLife, setHalfLife] = useState(7);
  const [compared, setCompared] = useState<ModelId[]>([
    "dernier",
    "lineaire",
    "markov",
    "shapley",
  ]);
  const [detail, setDetail] = useState<ModelId>("dernier");
  const oppId = useId();
  const hlId = useId();
  const detailId = useId();

  const sim = useMemo(() => simulate(opportunism), [opportunism]);
  const results = useMemo(() => attributeAll(sim, halfLife), [sim, halfLife]);
  const paths = useMemo(() => topPaths(sim.journeys, 10), [sim]);
  const byId = (id: ModelId) => results.find((r) => r.id === id)!;
  const shown = compared.map(byId);
  const detailModel = byId(detail);
  const eco = economics(detailModel, sim);
  const realloc = reallocation(detailModel, sim);
  const best = [...results].sort((a, b) => a.error - b.error)[0]!;
  const totalBudget = SPECS.reduce((a, s) => a + s.budget, 0);
  const baselineShare = sim.truth.baseline / sim.truth.expected;

  const over = [...eco].sort((a, b) => b.deviation - a.deviation)[0]!;
  const under = [...eco].sort((a, b) => a.deviation - b.deviation)[0]!;
  const biggestShift = [...realloc].sort((a, b) => b.gap - a.gap)[0]!;
  const detailLabel = MODELS.find((m) => m.id === detail)!.label;

  const toggleCompared = (id: ModelId) =>
    setCompared((cur) =>
      cur.includes(id)
        ? cur.length > 1
          ? cur.filter((x) => x !== id)
          : cur
        : cur.length < MAX_COMPARED
          ? [...cur, id]
          : cur,
    );

  return (
    <div className="atb-tool">
      <section
        className="atb-panel atb-controls"
        aria-label="Réglages de la simulation"
      >
        <div className="atb-field">
          <span id={oppId} className="atb-label-txt">
            Visites opportunistes juste avant l’achat
          </span>
          <div className="atb-seg" role="group" aria-labelledby={oppId}>
            {OPPORTUNISM.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={o.value === opportunism}
                onClick={() => setOpportunism(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="atb-hint">
            Direct et Affiliation captent l’acheteur déjà décidé : ils ne
            causent aucune vente.
          </span>
        </div>
        <div className="atb-field">
          <label htmlFor={hlId} className="atb-range-head">
            <span className="atb-label-txt">
              Demi-vie de la décroissance temporelle
            </span>
            <output htmlFor={hlId}>
              {halfLife} jour{halfLife > 1 ? "s" : ""}
            </output>
          </label>
          <input
            id={hlId}
            type="range"
            min={1}
            max={14}
            step={1}
            value={halfLife}
            onChange={(e) => setHalfLife(Number(e.target.value))}
            className="atb-range"
          />
          <span className="atb-hint">
            Un contact plus ancien d’une demi-vie compte deux fois moins.
          </span>
        </div>
        <div className="atb-field atb-field-wide">
          <span className="atb-label-txt">
            Modèles comparés (jusqu’à {MAX_COMPARED})
          </span>
          <div
            className="atb-toggles"
            role="group"
            aria-label="Modèles comparés sur le graphique"
          >
            {MODELS.map((m) => {
              const on = compared.includes(m.id);
              const slot = compared.indexOf(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && compared.length >= MAX_COMPARED}
                  title={
                    !on && compared.length >= MAX_COMPARED
                      ? `Retirez d’abord un modèle (${MAX_COMPARED} au plus)`
                      : undefined
                  }
                  onClick={() => toggleCompared(m.id)}
                  className="atb-toggle"
                >
                  {on && (
                    <span
                      className={`atb-swatch atb-s${slot + 1}`}
                      aria-hidden="true"
                    />
                  )}
                  {m.short}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <ul className="atb-kpis" aria-label="Chiffres de la simulation">
        <li className="atb-kpi">
          <span className="atb-kpi-label">Parcours simulés</span>
          <span className="atb-kpi-value">{n0(N_PARCOURS)}</span>
          <span className="atb-kpi-sub">
            {CHANNELS.length} canaux, budget {eur(totalBudget)}
          </span>
        </li>
        <li className="atb-kpi">
          <span className="atb-kpi-label">Conversions</span>
          <span className="atb-kpi-value">{n0(sim.conversions)}</span>
          <span className="atb-kpi-sub">
            taux de {pct(sim.conversions / N_PARCOURS)}, panier{" "}
            {eur(PANIER_MOYEN)}
          </span>
        </li>
        <li className="atb-kpi">
          <span className="atb-kpi-label">
            Auraient eu lieu sans aucun canal
          </span>
          <span className="atb-kpi-value">{pct(baselineShare)}</span>
          <span className="atb-kpi-sub">
            mais chaque modèle doit les attribuer à quelqu’un
          </span>
        </li>
        <li className="atb-kpi">
          <span className="atb-kpi-label">Modèle le plus fidèle ici</span>
          <span className="atb-kpi-value atb-kpi-value-sm">
            {MODELS.find((m) => m.id === best.id)!.label}
          </span>
          <span className="atb-kpi-sub">
            encore{" "}
            {best.error.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}{" "}
            points d’écart à la vérité
          </span>
        </li>
      </ul>

      <div className="atb-grid2">
        <section
          className="atb-panel atb-span2"
          aria-labelledby="atb-bars-title"
        >
          <header className="atb-head">
            <h2 id="atb-bars-title">Qui reçoit le mérite des ventes ?</h2>
            <ul className="atb-legend" aria-label="Légende">
              {shown.map((r, k) => (
                <li key={r.id}>
                  <span
                    className={`atb-swatch atb-s${k + 1}`}
                    aria-hidden="true"
                  />
                  {MODELS.find((m) => m.id === r.id)!.short}
                </li>
              ))}
              <li>
                <span className="atb-swatch-truth" aria-hidden="true" />
                Effet réel
              </li>
            </ul>
          </header>
          <p className="atb-panel-lede">
            Part des conversions donnée à chaque canal. Le trait vertical marque
            la part réellement causée : c’est la vérité de la simulation,
            qu’aucune donnée réelle ne montre directement.
          </p>
          <AttributionBars results={shown} truth={sim.truth.share} />
        </section>

        <section className="atb-panel" aria-labelledby="atb-rank-title">
          <header className="atb-head">
            <h2 id="atb-rank-title">Écart à l’effet réel</h2>
          </header>
          <p className="atb-panel-lede">
            Points de mérite mal placés, sur 100. Cliquez sur un modèle pour le
            détailler ci-dessous.
          </p>
          <ErrorRanking
            results={results}
            selected={detail}
            onSelect={setDetail}
          />
        </section>

        <section className="atb-panel" aria-labelledby="atb-paths-title">
          <header className="atb-head">
            <h2 id="atb-paths-title">Chemins les plus fréquents</h2>
          </header>
          <p className="atb-panel-lede">
            Canaux successifs (répétitions fusionnées) et taux de conversion de
            chaque chemin.
          </p>
          <PathList paths={paths} />
        </section>
      </div>

      <section className="atb-panel" aria-labelledby="atb-detail-title">
        <header className="atb-head">
          <h2 id="atb-detail-title">Les canaux vus par un modèle</h2>
          <div className="atb-select">
            <label htmlFor={detailId}>Modèle</label>
            <select
              id={detailId}
              value={detail}
              onChange={(e) => setDetail(e.target.value as ModelId)}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </header>
        {over.deviation > VERDICT_THRESHOLD ? (
          <p className="atb-insight">
            Avec le modèle « {detailLabel} », {CHANNELS[over.channel]} reçoit{" "}
            {ptsAbs(over.deviation)} de mérite en trop
            {SPECS[over.channel]!.opportunist
              ? ", alors qu’il ne provoque aucune vente"
              : ""}
            , et {CHANNELS[under.channel]} {ptsAbs(under.deviation)} de moins
            que ce qu’il cause vraiment.
          </p>
        ) : (
          <p className="atb-insight">
            Avec le modèle « {detailLabel} », chaque canal reste à moins de{" "}
            {VERDICT_THRESHOLD.toLocaleString("fr-FR")} points de sa part
            réelle.
          </p>
        )}
        <div className="atb-table-wrap">
          <table className="atb-table">
            <caption className="atb-sr">
              Économie de chaque canal selon le modèle {detailLabel}, comparée à
              l’effet réel
            </caption>
            <thead>
              <tr>
                <th scope="col">Canal</th>
                <th scope="col" className="is-num">
                  Budget
                </th>
                <th scope="col" className="is-num">
                  Conversions attribuées
                </th>
                <th scope="col" className="is-num">
                  Coût par conversion
                </th>
                <th scope="col" className="is-num">
                  ROAS apparent
                </th>
                <th scope="col" className="is-num">
                  ROAS réel
                </th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {eco.map((e) => {
                const verdict =
                  e.deviation > VERDICT_THRESHOLD
                    ? "over"
                    : e.deviation < -VERDICT_THRESHOLD
                      ? "under"
                      : "ok";
                return (
                  <tr key={e.channel}>
                    <th scope="row">{CHANNELS[e.channel]}</th>
                    <td className="is-num">
                      {e.budget > 0 ? eur(e.budget) : "—"}
                    </td>
                    <td className="is-num">{n0(e.credited)}</td>
                    <td className="is-num">
                      {e.cpa === null ? "—" : eur(e.cpa)}
                    </td>
                    <td className="is-num">
                      {e.roas === null ? "—" : ratio(e.roas)}
                    </td>
                    <td className="is-num">
                      {e.trueRoas === null ? "—" : ratio(e.trueRoas)}
                    </td>
                    <td>
                      <span className={`atb-pill atb-pill-${verdict}`}>
                        {verdict === "over"
                          ? "Surévalué"
                          : verdict === "under"
                            ? "Sous-évalué"
                            : "Juste"}{" "}
                        {verdict !== "ok" && (
                          <span className="atb-pill-dev">
                            {pts(e.deviation)}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="atb-note">
          ROAS = chiffre d’affaires attribué ÷ budget, avec un panier moyen de{" "}
          {eur(PANIER_MOYEN)}. Le ROAS réel ne compte que les ventes que le
          canal a provoquées. Verdict « Juste » à moins de{" "}
          {VERDICT_THRESHOLD.toLocaleString("fr-FR")} points de la part réelle.
        </p>

        <h3 className="atb-subtitle">Si le budget suivait ce modèle</h3>
        <p className="atb-panel-lede">
          Les {eur(totalBudget)} de budget payant répartis au prorata des
          conversions attribuées, comparés à une répartition au prorata des
          ventes réellement causées. À droite, l’argent que le modèle enverrait
          en trop ; à gauche, celui qu’il retirerait à tort.
        </p>
        <ReallocationBars rows={realloc} />
        {biggestShift.gap > 0 && (
          <p className="atb-insight">
            Suivre « {detailLabel} » enverrait {eurSigned(biggestShift.gap)} de
            plus vers {CHANNELS[biggestShift.channel]}
            {SPECS[biggestShift.channel]!.opportunist
              ? ", un canal qui ne provoque aucune vente"
              : ""}
            .
          </p>
        )}
      </section>
    </div>
  );
}
