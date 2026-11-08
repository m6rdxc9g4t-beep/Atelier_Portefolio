import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import Papa from 'papaparse';
import { Icon } from '../../components/Icon';
import {
  analyze,
  InputError,
  monthOf,
  MONTHS_SHORT,
  optimalPrice,
  outcome,
  readRows,
  SCENARIOS,
  simulate,
  sliderRange,
  toCsv,
  type Analysis,
  type Obs,
  type Scenario,
} from './model';
import { HistoryChart, MarginChart, ScatterChart } from './charts';
import { fmtElast, fmtEur, fmtNum, fmtPct } from './format';

type Source = { kind: 'sim'; scenario: Scenario } | { kind: 'csv'; name: string; obs: Obs[]; skipped: number; columns: { date: string; price: string; qty: string } };

const MAX_BYTES = 8 * 1024 * 1024;
const CONTROLS_LABEL = { mois: 'indicatrices de mois', trimestre: 'indicatrices de trimestre', aucun: 'aucun contrôle saisonnier (historique trop court)' } as const;

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

async function readText(file: File): Promise<string> {
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/i.test(file.name)) throw new InputError('Classeur non pris en charge : enregistrez la feuille au format CSV, puis déposez-la ici.');
  if (file.size > MAX_BYTES) throw new InputError('Fichier trop volumineux (8 Mo au plus) : agrégez-le à la semaine avant de le charger.');
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function EstimateCard({ title, subtitle, e, tone, truth }: { title: string; subtitle: string; e: Analysis['naive']; tone: 'naive' | 'ctrl'; truth: number | null }) {
  const covers = truth !== null && truth >= e.lo && truth <= e.hi;
  return (
    <article className={`elp-est elp-est-${tone}`}>
      <header>
        <span className={`elp-swatch elp-swatch-${tone}`} aria-hidden="true" />
        <h3>{title}</h3>
      </header>
      <p className="elp-est-sub">{subtitle}</p>
      <p className="elp-est-value">
        <span className="elp-est-num">{fmtElast(e.b)}</span>
        <span className="elp-est-unit">élasticité estimée</span>
      </p>
      <dl className="elp-est-stats">
        <div>
          <dt>Intervalle à 95 %</dt>
          <dd>
            [{fmtElast(e.lo)} ; {fmtElast(e.hi)}]
          </dd>
        </div>
        <div>
          <dt>Erreur-type</dt>
          <dd>{fmtNum(e.se, 3)}</dd>
        </div>
        <div>
          <dt>R²</dt>
          <dd>{fmtNum(e.r2, 2)}</dd>
        </div>
        <div>
          <dt>Observations</dt>
          <dd>{e.n}</dd>
        </div>
      </dl>
      {truth !== null && (
        <p className={`elp-truth ${covers ? 'is-ok' : 'is-ko'}`}>
          {covers ? 'L’intervalle contient la vraie valeur.' : `L’intervalle manque la vraie valeur (écart de ${fmtNum(Math.abs(e.b - truth) / e.se, 1)} erreurs-types).`}
        </p>
      )}
    </article>
  );
}

export default function Tool() {
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>({ kind: 'sim', scenario: SCENARIOS[0]! });
  const [reveal, setReveal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showCoefs, setShowCoefs] = useState(false);

  const obs = useMemo(() => (source.kind === 'sim' ? simulate(source.scenario) : source.obs), [source]);
  const result = useMemo((): { ok: Analysis } | { error: string } => {
    try {
      return { ok: analyze(obs) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [obs]);
  const analysis = 'ok' in result ? result.ok : null;

  const defaultCost = source.kind === 'sim' ? source.scenario.unitCost : analysis ? Math.round(analysis.refPrice * 0.5 * 100) / 100 : 1;
  const [costText, setCostText] = useState(String(defaultCost).replace('.', ','));
  const [price, setPrice] = useState(analysis?.refPrice ?? 1);
  useEffect(() => {
    setCostText(String(defaultCost).replace('.', ','));
    if (analysis) setPrice(analysis.refPrice);
    setReveal(false);
    // Réinitialise seulement quand la source change.
  }, [source]);

  const parsedCost = Number(costText.replace(/\s/g, '').replace(',', '.'));
  const cost = Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : defaultCost;
  const unit = source.kind === 'sim' ? 'semaine' : 'période';
  const truth = source.kind === 'sim' && reveal ? source.scenario.trueElasticity : null;

  const highSeason = useMemo(() => {
    if (!analysis) return () => false;
    const mean = analysis.monthEffect.reduce((s, v) => s + v, 0) / 12;
    const high = analysis.monthEffect.map((v) => analysis.controls !== 'aucun' && v - mean >= 0.25);
    return (o: Obs) => high[monthOf(o.day)]!;
  }, [analysis]);
  const highMonths = analysis ? MONTHS_SHORT.filter((_, m) => highSeason({ day: Math.floor(Date.UTC(2025, m, 15) / 86_400_000), price: 1, qty: 1 })) : [];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = (await readText(file)).replace(/^﻿/, '');
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
      const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
      const r = readRows(rows);
      analyze(r.obs); // valide tôt pour afficher l'erreur à côté du bouton
      setSource({ kind: 'csv', name: file.name, ...r });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const range = analysis ? sliderRange(analysis) : ([0, 1] as [number, number]);
  const ctrl = analysis?.controlled;
  const optimum = ctrl ? optimalPrice(cost, ctrl.b) : null;
  const optLo = ctrl ? optimalPrice(cost, ctrl.lo) : null;
  const optHi = ctrl ? optimalPrice(cost, ctrl.hi) : null;
  const current = analysis ? outcome(analysis, analysis.refPrice, cost) : null;
  const chosen = analysis ? outcome(analysis, price, cost) : null;
  const optInRange = optimum !== null && analysis !== null && optimum >= analysis.priceRange[0] * 0.9 && optimum <= analysis.priceRange[1] * 1.1;
  const biasPct = analysis ? (analysis.naive.b - analysis.controlled.b) / Math.abs(analysis.controlled.b) : 0;

  return (
    <section
      className={`elp-tool${dragging ? ' is-drag' : ''}`}
      aria-label="Estimation de l’élasticité et simulateur de prix"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* ── Source ── */}
      <div className="elp-source">
        <div className="elp-source-pick">
          <span className="elp-label" id={`${ids}-cat`}>
            Catégorie simulée (Comptoir Lumen)
          </span>
          <div className="elp-seg" role="group" aria-labelledby={`${ids}-cat`}>
            {SCENARIOS.map((s) => (
              <button key={s.categorie} type="button" aria-pressed={source.kind === 'sim' && source.scenario.categorie === s.categorie} onClick={() => setSource({ kind: 'sim', scenario: s })}>
                {s.categorie}
              </button>
            ))}
          </div>
        </div>
        <div className="elp-drop">
          <input ref={fileInput} id={`${ids}-file`} className="elp-file" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
          <label htmlFor={`${ids}-file`} className="btn">
            <Icon name="folder-open" />
            Charger votre CSV
          </label>
          <span className="elp-drop-hint">date ; prix ; quantité</span>
        </div>
      </div>
      <p className="elp-privacy">
        <Icon name="shield-check" size={14} />
        Le fichier est lu dans votre navigateur : rien n’est envoyé, rien n’est conservé.
      </p>
      {loadError && (
        <p className="elp-alert" role="alert">
          {loadError}
        </p>
      )}
      {source.kind === 'sim' ? (
        <div className="elp-note">
          <span>
            <b>Données simulées, 104 semaines.</b> {source.scenario.hint}
          </span>
          <button type="button" className="elp-link" onClick={() => download(`elasticite-${source.scenario.categorie.toLowerCase()}.csv`, toCsv(obs))}>
            <Icon name="download" size={14} />
            Télécharger ce CSV
          </button>
        </div>
      ) : (
        <div className="elp-note">
          <span>
            <Icon name="file-text" size={14} /> <b>{source.name}</b> · {obs.length} périodes lues
            {source.skipped > 0 ? `, ${source.skipped} lignes ignorées` : ''} · colonnes « {source.columns.date} », « {source.columns.price} », « {source.columns.qty} »
          </span>
        </div>
      )}

      {'error' in result && (
        <p className="elp-alert" role="alert">
          {result.error}
        </p>
      )}

      {analysis && ctrl && current && chosen && (
        <>
          {/* ── Les données ── */}
          <div className="elp-card">
            <div className="elp-card-head">
              <h2>Ce que montrent les données</h2>
              <p>
                Prix moyen et unités vendues par {unit}.
                {highMonths.length > 0 && (
                  <>
                    {' '}
                    En fond, la haute saison estimée ({highMonths.join(', ')}) : c’est aussi là que tombent la plupart des promotions.
                  </>
                )}
              </p>
            </div>
            <HistoryChart obs={obs} highSeason={highSeason} />
          </div>

          {/* ── Estimations ── */}
          <div className="elp-card">
            <div className="elp-card-head">
              <h2>Deux régressions, deux réponses</h2>
              <p>
                Même formule log-log, mais seule la seconde neutralise la saison et la tendance ({CONTROLS_LABEL[analysis.controls]}
                {analysis.trend ? ', tendance linéaire' : ''}).
              </p>
            </div>
            <div className="elp-est-grid">
              <EstimateCard title="Régression naïve" subtitle="ln Q = a + b · ln P" e={analysis.naive} tone="naive" truth={truth} />
              <EstimateCard title="Avec saison et tendance" subtitle="ln Q = a + b · ln P + saison + tendance" e={ctrl} tone="ctrl" truth={truth} />
              <div className="elp-est-side">
                <ScatterChart obs={obs} analysis={analysis} highSeason={highSeason} />
                <ul className="elp-legend">
                  <li>
                    <span className="elp-key elp-key-pt" /> {unit}
                  </li>
                  <li>
                    <span className="elp-key elp-key-high" /> haute saison
                  </li>
                  <li>
                    <span className="elp-key elp-key-naive" /> courbe naïve
                  </li>
                  <li>
                    <span className="elp-key elp-key-ctrl" /> courbe à saison constante
                  </li>
                </ul>
              </div>
            </div>
            <div className="elp-reading">
              {Math.abs(biasPct) >= 0.1 ? (
                <p>
                  <b>La régression naïve {biasPct < 0 ? 'surestime' : 'sous-estime'} la sensibilité au prix de {fmtNum(Math.abs(biasPct) * 100, 0)} %.</b> Les semaines de
                  promotion sont aussi des semaines de forte demande (corrélation entre le prix et l’effet saison : {fmtNum(analysis.corrPriceSeason, 2)}). Sans contrôle,
                  la régression attribue au prix une partie du surcroît de ventes qui vient de la saison.
                </p>
              ) : (
                <p>
                  <b>Les deux estimations sont proches.</b> Ici, les variations de prix sont peu liées à la saison : la régression naïve n’est pas trompée.
                </p>
              )}
              <p>
                {ctrl.hi < -1 ? (
                  <>
                    Avec ε = {fmtElast(ctrl.b)}, une hausse de prix de 1 % fait perdre environ {fmtNum(Math.abs(ctrl.b), 1)} % de volume : la demande est <b>élastique</b>,
                    une baisse de prix augmente le chiffre d’affaires.
                  </>
                ) : ctrl.lo > -1 ? (
                  <>
                    Avec ε = {fmtElast(ctrl.b)}, une hausse de prix de 1 % ne fait perdre qu’environ {fmtNum(Math.abs(ctrl.b), 1)} % de volume : la demande est{' '}
                    <b>inélastique</b>, une hausse de prix augmente le chiffre d’affaires.
                  </>
                ) : (
                  <>
                    L’intervalle contient −1 : on ne peut pas dire si une hausse de prix augmente ou réduit le chiffre d’affaires.
                  </>
                )}
              </p>
              {source.kind === 'sim' && (
                <button type="button" className="btn" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
                  {reveal ? `Vraie élasticité : ${fmtElast(source.scenario.trueElasticity, 1)}` : 'Révéler la vraie élasticité'}
                </button>
              )}
            </div>
            <div className="elp-coefs">
              <button type="button" className="elp-link" aria-expanded={showCoefs} onClick={() => setShowCoefs((v) => !v)}>
                {showCoefs ? 'Masquer' : 'Voir'} tous les coefficients de la régression contrôlée
              </button>
              {showCoefs && (
                <div className="elp-coefs-wrap">
                  <table className="elp-table">
                    <thead>
                      <tr>
                        <th scope="col">Variable</th>
                        <th scope="col" className="is-num">
                          Coefficient
                        </th>
                        <th scope="col" className="is-num">
                          Erreur-type
                        </th>
                        <th scope="col" className="is-num">
                          t
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ctrl.fit.names.map((n, j) => (
                        <tr key={n} className={j === 1 ? 'is-key' : ''}>
                          <th scope="row">{n}</th>
                          <td className="is-num">{fmtElast(ctrl.fit.beta[j]!, 3)}</td>
                          <td className="is-num">{fmtNum(ctrl.fit.se[j]!, 3)}</td>
                          <td className="is-num">{fmtElast(ctrl.fit.beta[j]! / ctrl.fit.se[j]!, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="elp-small">Les mois sont comparés à {analysis.controls === 'aucun' ? 'la moyenne' : 'la première saison observée'} ; la tendance est exprimée par an, en log.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Simulateur ── */}
          <div className="elp-card">
            <div className="elp-card-head">
              <h2>Simuler un prix</h2>
              <p>
                Volume, chiffre d’affaires et marge attendus par {unit} moyenne de l’année récente, d’après l’élasticité contrôlée. La bande reprend l’intervalle à 95 %.
              </p>
            </div>
            <div className="elp-sim-controls">
              <div className="elp-field">
                <label htmlFor={`${ids}-price`}>
                  Prix de vente : <b>{fmtEur(price)}</b>
                  <span className="elp-small"> (prix actuel {fmtEur(analysis.refPrice)})</span>
                </label>
                <input
                  id={`${ids}-price`}
                  type="range"
                  min={range[0]}
                  max={range[1]}
                  step={(range[1] - range[0]) / 400}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </div>
              <div className="elp-field elp-field-cost">
                <label htmlFor={`${ids}-cost`}>Coût unitaire (€)</label>
                <input id={`${ids}-cost`} type="text" inputMode="decimal" value={costText} onChange={(e) => setCostText(e.target.value)} />
              </div>
              <div className="elp-sim-buttons">
                <button type="button" className="btn" onClick={() => setPrice(analysis.refPrice)}>
                  Prix actuel
                </button>
                {optimum !== null && (
                  <button type="button" className="btn btn-primary" onClick={() => setPrice(Math.min(range[1], Math.max(range[0], optimum)))}>
                    Aller au prix optimal
                  </button>
                )}
              </div>
            </div>

            <div className="elp-kpis">
              {(
                [
                  ['Volume', chosen.qty, current.qty, `${fmtNum(chosen.qtyLo, 0)} à ${fmtNum(chosen.qtyHi, 0)}`, (v: number) => `${fmtNum(v, 0)} u.`],
                  ['Chiffre d’affaires', chosen.revenue, current.revenue, `${fmtEur(chosen.price * chosen.qtyLo, 0)} à ${fmtEur(chosen.price * chosen.qtyHi, 0)}`, (v: number) => fmtEur(v, 0)],
                  ['Marge brute', chosen.margin, current.margin, `${fmtEur(chosen.marginLo, 0)} à ${fmtEur(chosen.marginHi, 0)}`, (v: number) => fmtEur(v, 0)],
                ] as const
              ).map(([label, v, ref, band, fmt]) => (
                <div className="atelier-kpi elp-kpi" key={label}>
                  <span className="elp-kpi-label">
                    {label} / {unit}
                  </span>
                  <span className="elp-kpi-value">{fmt(v)}</span>
                  <span className={`elp-kpi-delta ${ref > 0 && Math.abs(v / ref - 1) > 0.0005 ? (v > ref ? 'is-up' : 'is-down') : ''}`}>
                    {ref > 0 && Math.abs(v / ref - 1) > 0.0005 ? `${fmtPct(v / ref - 1)} vs prix actuel` : 'au prix actuel'}
                  </span>
                  <span className="elp-kpi-band">95 % : {band}</span>
                </div>
              ))}
            </div>

            <div className="elp-sim-grid">
              <div>
                <MarginChart analysis={analysis} cost={cost} range={range} price={price} optimum={optimum} />
                <ul className="elp-legend">
                  <li>
                    <span className="elp-key elp-key-ctrl" /> marge attendue
                  </li>
                  <li>
                    <span className="elp-key elp-key-band" /> intervalle à 95 %
                  </li>
                  <li>
                    <span className="elp-key elp-key-observed" /> prix déjà observés
                  </li>
                </ul>
              </div>
              <div className="elp-optimum">
                <h3>Prix qui maximise la marge</h3>
                {optimum !== null ? (
                  <>
                    <p className="elp-opt-value">{fmtEur(optimum)}</p>
                    <p>
                      p* = c · ε / (1 + ε) = {fmtNum(cost)} × {fmtElast(ctrl.b)} / ({fmtElast(1 + ctrl.b)})
                    </p>
                    <p className="elp-small">
                      {optLo !== null && optHi !== null
                        ? `Selon l’intervalle de l’élasticité : de ${fmtEur(Math.min(optLo, optHi))} à ${fmtEur(Math.max(optLo, optHi))}.`
                        : 'L’intervalle de l’élasticité touche la zone inélastique : la borne haute de ce prix n’est pas définie.'}
                    </p>
                    {!optInRange && (
                      <p className="elp-warn">
                        Ce prix sort de la plage déjà pratiquée ({fmtEur(analysis.priceRange[0], 0)} à {fmtEur(analysis.priceRange[1], 0)}) : c’est une extrapolation. À tester
                        progressivement plutôt qu’à appliquer d’un coup.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="elp-warn">
                    Demande inélastique (ε ≥ −1) : dans ce modèle, monter le prix augmente toujours la marge, il n’y a pas d’optimum. En réalité, l’élasticité finit par
                    changer quand on s’éloigne des prix observés : le modèle ne doit pas servir au-delà.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
