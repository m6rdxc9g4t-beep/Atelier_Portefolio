import { useMemo, useState, type ReactNode } from 'react';
import { contributions, fmt, linearPredictor, predictProba, type Block, type LogitModel, type ModelInputs, type Section } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { api } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { BlockView, findSection } from '../../components/Blocks';
import { LineChart } from '../../components/charts';
import { useScrollSpy } from '../editorial/Editorial';
import './style.css';

/* ───────── Données de la fiche ───────── */
interface DecileVar {
  unit: string;
  labels: string[];
  range?: [number, number];
}
interface Chi2 {
  x: string[];
  chi2: number[];
  pValue: number[];
  pValueIsUpperBound: boolean[];
  dependentAt1pct: boolean[];
  cramerV: number[];
}
interface Rates {
  x: string[];
  y?: number[];
  responseRatePct?: number[];
}
interface Stepwise {
  step: number[];
  variable: string[];
  scoreChi2: number[];
  pValue: number[];
  pValueIsUpperBound: boolean[];
}
interface Roc {
  x: number[];
  y: number[];
  auc: number;
}

const NAV = [
  { id: 'fichier', label: 'Le fichier' },
  { id: 'deciles', label: 'Déciles' },
  { id: 'profil', label: 'Qui répond ?' },
  { id: 'score', label: 'Le score' },
  { id: 'validation', label: 'Validation' },
  { id: 'ciblage', label: 'Ciblage' },
];

const keep = (s: Section | undefined, ok: (b: Block) => boolean) => s?.blocks.filter(ok) ?? [];
const isText = (b: Block) => b.type === 'text' || b.type === 'list' || b.type === 'callout';

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const model = c.model as { logit?: LogitModel; derived?: { examples?: { name: string; inputs: Record<string, number> }[] } };
  const active = useScrollSpy(NAV.map((n) => n.id));
  const sec = (id: string) => findSection(c.sections, id);
  const tables = (id: string) => keep(sec(id), (b) => b.type === 'table');
  const figures = c.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'figure')) as Extract<Block, { type: 'figure' }>[];
  const recos = sec('recommandations')?.blocks.find((b) => b.type === 'list');

  return (
    <div className="sm">
      <nav className="sm-nav" aria-label="Sections du projet">
        <div className="sm-wrap sm-nav-in">
          <span className="sm-brand">
            <i aria-hidden>✉</i> Scoring <b>marketing</b>
          </span>
          <div className="sm-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'is-on' : ''}>
                {n.label}
              </a>
            ))}
          </div>
          <BackToPortfolio />
        </div>
      </nav>

      <header className="sm-hero">
        <div className="sm-wrap sm-hero-grid">
          <div>
            <div className="sm-kicker">
              {c.level} · Scoring · SAS · {c.date}
            </div>
            <h1>
              Qui répondra
              <br />
              au <em>mailing</em> ?
            </h1>
            <p className="sm-lede">{c.subtitle}.</p>
            <div className="sm-question">
              <small>Problématique</small>
              <Md as="p" text={c.question} />
            </div>
            <div className="sm-authors">
              {c.authors.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
          </div>
          <Envelope />
        </div>
      </header>

      <div className="sm-wrap">
        <Reveal className="sm-stamps">
          {c.kpis.slice(0, 5).map((k) => (
            <div key={k.label} className="sm-stamp" title={k.note}>
              <strong>
                <CountUp value={k.value} />
              </strong>
              <span>{k.label}</span>
            </div>
          ))}
        </Reveal>
      </div>

      {/* 01 — le fichier */}
      <Sec id="fichier" no="01" title="Le fichier d’étude" sub="39 779 clients, une cible et 12 variables explicatives">
        <div className="sm-two">
          <Reveal className="blk-stack">
            {[...keep(sec('contexte'), isText), ...keep(sec('donnees'), (b) => b.type === 'text')].map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <Reveal className="sm-card sm-label" delay={80}>
            <div className="sm-label-head">
              <span>Fichier clients</span>
              <b>RETOUR = 1</b>
            </div>
            <p>A répondu au mail du 16/04/2003 (1 = OUI, 0 = NON) : la variable à expliquer.</p>
            <SexBar f={f} />
            <div className="blk-stack sm-small-text">
              {keep(sec('exploration'), (b) => b.type === 'text').map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </div>
          </Reveal>
        </div>
        <div className="sm-grid2 sm-mt">
          {tables('donnees').map((b, i) => (
            <Reveal key={i}>
              <BlockView block={b} />
            </Reveal>
          ))}
          <Reveal delay={80} className="blk-stack">
            {[...keep(sec('codage'), (b) => b.type === 'text'), ...tables('codage')].map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
        </div>
      </Sec>

      {/* 02 — déciles */}
      <Sec id="deciles" no="02" title="Dix classes par variable" sub="Âge, FICO, revenu et montant des commandes découpés en déciles">
        <div className="sm-two">
          <Reveal className="blk-stack">
            {keep(sec('deciles'), (b) => b.type === 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <DecileRuler vars={f.deciles.variables as Record<string, DecileVar>} />
        </div>
      </Sec>

      {/* 03 — profil des répondants */}
      <Sec id="profil" no="03" title="Qui répond au mailing ?" sub="Tris croisés avec la réponse : khi-deux et V de Cramér">
        <div className="sm-two">
          <Reveal className="blk-stack">
            {keep(sec('tris-croises'), (b) => b.type === 'text' || b.type === 'formula').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <CramerChart chi={f.chi2_tests as Chi2} />
        </div>
        <ProfileRates f={f} />
        <Reveal className="blk-stack sm-mt sm-prose">
          {keep(sec('profil'), (b) => b.type === 'text' || b.type === 'callout').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
      </Sec>

      {/* 04 — le score */}
      <Sec id="score" no="04" title="La formule de score" sub="Régression logistique, sélection pas à pas (stepwise) sous SAS">
        <div className="sm-two">
          <Reveal className="blk-stack">
            {keep(sec('modelisation'), (b) => b.type === 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          <StepwiseLadder sw={f.stepwise as Stepwise} />
        </div>
        <Reveal className="blk-stack sm-mt">
          {keep(sec('modelisation'), (b) => b.type === 'table' && b.columns[0] === 'Paramètre').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        <div className="sm-formulas sm-mt">
          {keep(sec('modelisation'), (b) => b.type === 'formula').map((b, i) => (
            <Reveal key={i} delay={i * 80} className="sm-formula">
              <BlockView block={b} />
            </Reveal>
          ))}
        </div>
        {model.logit && <ScoreCalculator logit={model.logit} examples={model.derived?.examples ?? []} slug={project.slug} />}
      </Sec>

      {/* 05 — validation */}
      <Sec id="validation" no="05" title="Le score discrimine-t-il ?" sub="Courbe ROC du modèle final">
        <div className="sm-two">
          <RocChart roc={f.roc_curve as Roc} />
          <Reveal className="blk-stack" delay={80}>
            {keep(sec('validation'), isText).map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
        </div>
      </Sec>

      {/* 06 — ciblage */}
      <Sec id="ciblage" no="06" title="Du score au ciblage" sub="Recommandations opérationnelles du rapport">
        {keep(sec('recommandations'), (b) => b.type === 'text').map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
        {recos?.type === 'list' && (
          <div className="sm-recos">
            {recos.items.map((it, i) => (
              <Reveal key={i} className="sm-reco" delay={i * 70}>
                <span className="sm-reco-no">N° {String(i + 1).padStart(2, '0')}</span>
                <Md as="p" text={it} />
              </Reveal>
            ))}
          </div>
        )}
        <h3 className="sm-h3 sm-mt">Ce qu’il faut retenir</h3>
        <ol className="sm-concl">
          {c.conclusions.map((t, i) => (
            <Reveal as="li" key={i} delay={i * 50}>
              <Md text={t} />
            </Reveal>
          ))}
        </ol>
        {figures.length > 0 && (
          <>
            <h3 className="sm-h3 sm-mt">Les graphiques du rapport</h3>
            <div className="sm-figs">
              {figures.map((b) => (
                <BlockView key={b.src} block={b} />
              ))}
            </div>
          </>
        )}
      </Sec>

      <ProjectEnd project={project} />
    </div>
  );
}

function Sec({ id, no, title, sub, children }: { id: string; no: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="sm-sec">
      <div className="sm-wrap">
        <Reveal className="sm-head">
          <span className="sm-no">{no}</span>
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

/* ───────── En-tête : l'enveloppe du mailing ───────── */
function Envelope() {
  return (
    <div className="sm-envelope" aria-label="Mailing du 16 avril 2003 envoyé à 39 779 clients">
      <div className="sm-env-in">
        <div className="sm-env-top">
          <div className="sm-postmark" aria-hidden>
            <span>16 · IV · 2003</span>
            <small>mailing</small>
          </div>
          <div className="sm-stamp-art" aria-hidden>
            <b>39 779</b>
            <small>clients</small>
          </div>
        </div>
        <div className="sm-address">
          <span>À l’attention de</span>
          <b>Chaque client du fichier</b>
          <span>Objet : offre du 16/04/2003</span>
          <span>Réponse attendue : RETOUR = 1</span>
        </div>
        <div className="sm-env-foot">
          <span>Le score décide qui reçoit le prochain courrier.</span>
        </div>
      </div>
    </div>
  );
}

/* ───────── Tri à plat de SEX ───────── */
function SexBar({ f }: { f: Record<string, any> }) {
  const s = f.sex_frequencies as { x: string[]; y: number[]; percent: number[]; missing: number };
  const total = s.y[0] + s.y[1] + s.missing;
  return (
    <div className="sm-sex" aria-label={`Femmes ${fmt(s.y[0])}, hommes ${fmt(s.y[1])}, non renseigné ${s.missing}`}>
      <div className="sm-sex-bar">
        <i style={{ flex: s.y[0] }} />
        <b style={{ flex: s.y[1] }} />
        <em style={{ flex: Math.max(s.missing, total * 0.004) }} />
      </div>
      <div className="sm-sex-leg">
        <span>
          F · {fmt(s.y[0])} ({fmt(s.percent[0], 2, 2)} %)
        </span>
        <span>
          M · {fmt(s.y[1])} ({fmt(s.percent[1], 2, 2)} %)
        </span>
        <span>non renseigné · {s.missing} → modalité « U »</span>
      </div>
    </div>
  );
}

/* ───────── Déciles ───────── */
const DECILE_TABS: { key: string; label: string; unit: string }[] = [
  { key: 'AGE', label: 'Âge', unit: 'ans' },
  { key: 'FICO', label: 'FICO', unit: 'points' },
  { key: 'INCOME', label: 'Revenu', unit: '' },
  { key: 'VALUE24', label: 'Montant 24 mois', unit: '' },
];

function DecileRuler({ vars }: { vars: Record<string, DecileVar> }) {
  const [key, setKey] = useState('AGE');
  const [hover, setHover] = useState<number | null>(null);
  const v = vars[key];
  const tab = DECILE_TABS.find((t) => t.key === key)!;
  return (
    <Reveal className="sm-card sm-deciles" delay={80}>
      <div className="sm-tabs" role="tablist" aria-label="Variable découpée">
        {DECILE_TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={key === t.key} className={key === t.key ? 'is-on' : ''} onClick={() => setKey(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="sm-ticket" onMouseLeave={() => setHover(null)}>
        {v.labels.map((l, i) => (
          <button key={l} className={`sm-ticket-cell ${hover === i ? 'is-on' : ''}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}>
            <span className="k">t_{key}</span>
            <b>{i + 1}</b>
          </button>
        ))}
      </div>
      <p className="sm-ticket-read" aria-live="polite">
        {hover !== null ? (
          <>
            Classe <b>{hover + 1}</b> : {key} {v.labels[hover]} {tab.unit}
          </>
        ) : (
          <>Survolez une classe pour lire ses bornes. Chaque classe regroupe un dixième des clients.</>
        )}
      </p>
      <div className="sm-bounds">
        {v.labels.map((l, i) => (
          <span key={l} className={hover === i ? 'is-on' : ''}>
            <small>{i + 1}</small> {l}
          </span>
        ))}
      </div>
    </Reveal>
  );
}

/* ───────── V de Cramér ───────── */
function CramerChart({ chi }: { chi: Chi2 }) {
  const [sel, setSel] = useState<number | null>(null);
  const order = chi.x.map((_, i) => i).sort((a, b) => chi.cramerV[b] - chi.cramerV[a]);
  const max = 0.35;
  const i = sel;
  return (
    <Reveal className="sm-card sm-cramer" delay={80}>
      <h4>Intensité de la liaison avec RETOUR</h4>
      <ul onMouseLeave={() => setSel(null)}>
        {order.map((k) => (
          <li key={chi.x[k]} className={`${chi.dependentAt1pct[k] ? 'dep' : ''} ${sel === k ? 'is-on' : ''}`} onMouseEnter={() => setSel(k)} onFocus={() => setSel(k)} tabIndex={0}>
            <span className="nm">{chi.x[k]}</span>
            <span className="tr">
              <i style={{ width: `${(chi.cramerV[k] / max) * 100}%` }} />
            </span>
            <span className="v">{fmt(chi.cramerV[k], 2, 2)}</span>
          </li>
        ))}
      </ul>
      <p className="sm-cramer-read" aria-live="polite">
        {i !== null ? (
          <>
            <b>{chi.x[i]}</b> : khi-deux = {fmt(chi.chi2[i], 2, 2)}, p {chi.pValueIsUpperBound[i] ? '<' : '='} {fmt(chi.pValue[i], 3, 3)} —{' '}
            {chi.dependentAt1pct[i] ? 'dépendance au seuil de 1 %' : 'pas de dépendance au seuil de 1 %'}.
          </>
        ) : (
          <>
            <i className="dot dep" /> dépendance au seuil de 1 % <i className="dot" /> non significatif à 1 % · V de Cramér du tableau du rapport (p. 12)
          </>
        )}
      </p>
    </Reveal>
  );
}

/* ───────── Taux de réponse par profil ───────── */
function ProfileRates({ f }: { f: Record<string, any> }) {
  const tabs = [
    { id: 'age', label: 'Âge', fig: f.response_by_age_group as Rates, title: 'Taux de réponse par tranche d’âge', xl: (x: string) => `${x} ans` },
    { id: 'buy6', label: 'Commandes sur 6 mois', fig: f.response_by_buy6 as Rates, title: 'Taux de réponse selon BUY6', xl: (x: string) => `BUY6 = ${x}` },
    { id: 'buy12', label: 'Commandes sur 12 mois', fig: f.response_by_buy12 as Rates, title: 'Taux de réponse selon BUY12', xl: (x: string) => `BUY12 = ${x}` },
  ];
  const [id, setId] = useState('age');
  const t = tabs.find((x) => x.id === id)!;
  const ys = t.fig.responseRatePct ?? t.fig.y ?? [];
  const max = Math.max(...ys);
  return (
    <Reveal className="sm-card sm-rates sm-mt">
      <div className="sm-rates-head">
        <h4>{t.title}</h4>
        <div className="sm-tabs" role="tablist" aria-label="Variable de profil">
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={id === x.id} className={id === x.id ? 'is-on' : ''} onClick={() => setId(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="sm-rates-bars">
        {t.fig.x.map((x, i) => (
          <div key={x} className={`sm-rate ${ys[i] === max ? 'top' : ''}`}>
            <span className="val">{fmt(ys[i], ys[i] % 1 ? 1 : 0, ys[i] % 1 ? 1 : 0)} %</span>
            <i style={{ height: `${(ys[i] / (max * 1.15)) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="sm-rates-labels" aria-hidden>
        {t.fig.x.map((x) => (
          <span key={x}>{t.xl(x)}</span>
        ))}
      </div>
      <p className="sm-note">
        {id === 'age'
          ? 'Tranches et taux tels qu’écrits dans le tableau de la p. 14 du rapport.'
          : id === 'buy6'
            ? 'Valeurs imprimées sur le graphique 2 du rapport (2 = deux commandes ou plus) ; 68 % des clients n’ont pas commandé dans les 6 derniers mois.'
            : 'Valeurs imprimées sur le graphique 3 du rapport (3 = trois commandes ou plus) : une relation non linéaire.'}
      </p>
    </Reveal>
  );
}

/* ───────── Sélection pas à pas ───────── */
function StepwiseLadder({ sw }: { sw: Stepwise }) {
  const [k, setK] = useState(sw.step.length);
  const max = Math.max(...sw.scoreChi2);
  return (
    <Reveal className="sm-card sm-stepwise" delay={80}>
      <div className="sm-stepwise-head">
        <h4>Les variables entrent une à une</h4>
        <div className="sm-step-ctrl">
          <button onClick={() => setK((x) => Math.max(1, x - 1))} aria-label="Étape précédente">
            ←
          </button>
          <span>
            étape {k} / {sw.step.length}
          </span>
          <button onClick={() => setK((x) => Math.min(sw.step.length, x + 1))} aria-label="Étape suivante">
            →
          </button>
        </div>
      </div>
      <ol>
        {sw.variable.map((v, i) => (
          <li key={v} className={i < k ? 'in' : 'out'} onClick={() => setK(i + 1)}>
            <span className="st">{sw.step[i]}</span>
            <span className="nm">{v}</span>
            <span className="tr">
              <i style={{ width: i < k ? `${(sw.scoreChi2[i] / max) * 100}%` : '0%' }} />
            </span>
            <span className="v">{fmt(sw.scoreChi2[i], 1, 1)}</span>
          </li>
        ))}
      </ol>
      <p className="sm-note">
        Khi-deux du score à l’entrée de chaque variable (sortie SAS).{' '}
        {k < sw.step.length ? `Encore ${sw.step.length - k} variable(s) à entrer.` : 'Sept variables retenues ; aucune n’est retirée.'} Non retenues : INCOME, VALUE24, COA6, LOC,
        SEX.
      </p>
    </Reveal>
  );
}

/* ───────── Calculateur de score ───────── */
const PRESET_NAMES = ['Client type', 'Jeune acheteur', 'Senior non marié'];

function ScoreCalculator({ logit, examples, slug }: { logit: LogitModel; examples: { name: string; inputs: Record<string, number> }[]; slug: string }) {
  const reference: ModelInputs = { AGE: 44, FICO: 695, MARRIED: '1', OWNHOME: '1', BUY6: 0, BUY12: 0, BUY18: 0 };
  const [x, setX] = useState<ModelInputs>({ AGE: 30, FICO: 650, MARRIED: '1', OWNHOME: '0', BUY6: 0, BUY12: 1, BUY18: 2 });
  const [check, setCheck] = useState<string | null>(null);
  const z = linearPredictor(logit, x);
  const p = predictProba(logit, x);
  const contrib = useMemo(() => contributions(logit, x, reference), [logit, x]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxAbs = Math.max(0.5, ...contrib.map((c) => Math.abs(c.delta)));
  const pRef = predictProba(logit, reference);

  /** Fenêtres emboîtées : BUY6 ≤ BUY12 ≤ BUY18. */
  const setBuy = (key: 'BUY6' | 'BUY12' | 'BUY18', v: number) =>
    setX((o) => {
      const n = { ...o, [key]: v } as Record<string, number | string>;
      const b6 = Number(n.BUY6);
      let b12 = Number(n.BUY12);
      let b18 = Number(n.BUY18);
      if (key === 'BUY6') {
        b12 = Math.max(b12, b6);
        b18 = Math.max(b18, b12);
      } else if (key === 'BUY12') {
        b18 = Math.max(b18, b12);
        n.BUY6 = Math.min(b6, b12);
      } else {
        b12 = Math.min(b12, b18);
        n.BUY6 = Math.min(b6, b12);
      }
      return { ...n, BUY12: Math.min(3, b12), BUY18: Math.min(4, b18) };
    });

  const verify = async () => {
    setCheck('…');
    try {
      const r = await api<{ probability: number }>(`/models/${slug}/predict`, { method: 'POST', json: { inputs: x } });
      setCheck(Math.abs(r.probability - p) < 1e-12 ? `✓ L’API renvoie la même probabilité (${fmt(r.probability * 100, 2, 2)} %).` : '⚠ Écart entre navigateur et serveur.');
    } catch {
      setCheck('API indisponible (mode statique).');
    }
  };

  const num = (k: string) => Number(x[k]);
  const counts: { key: 'BUY6' | 'BUY12' | 'BUY18'; label: string; max: number; plus: boolean }[] = [
    { key: 'BUY6', label: 'Commandes sur 6 mois', max: 2, plus: true },
    { key: 'BUY12', label: 'Commandes sur 12 mois', max: 3, plus: true },
    { key: 'BUY18', label: 'Commandes sur 18 mois', max: 4, plus: false },
  ];
  const gaugeAngle = -90 + p * 180;

  return (
    <Reveal className="sm-calc sm-mt">
      <div className="sm-calc-head">
        <div>
          <span className="sm-calc-kicker">Calculateur</span>
          <h3>Noter un client</h3>
          <p>Les coefficients du modèle final du rapport : réglez le profil, le logit z et la probabilité de répondre se recalculent.</p>
        </div>
        <div className="sm-presets" role="group" aria-label="Profils d’exemple">
          {examples.slice(0, 3).map((e, i) => (
            <button
              key={e.name}
              onClick={() =>
                setX({
                  ...Object.fromEntries(Object.entries(e.inputs).map(([k, v]) => [k, k === 'MARRIED' || k === 'OWNHOME' ? String(v) : v])),
                })
              }
            >
              {PRESET_NAMES[i] ?? e.name}
            </button>
          ))}
        </div>
      </div>

      <div className="sm-calc-grid">
        <div className="sm-calc-inputs">
          <label className="sm-range">
            <span>
              Âge <b>{num('AGE')} ans</b>
            </span>
            <input type="range" min={18} max={75} step={1} value={num('AGE')} onChange={(e) => setX((o) => ({ ...o, AGE: Number(e.target.value) }))} />
          </label>
          <label className="sm-range">
            <span>
              Score de crédit FICO <b>{num('FICO')}</b>
            </span>
            <input type="range" min={565} max={810} step={1} value={num('FICO')} onChange={(e) => setX((o) => ({ ...o, FICO: Number(e.target.value) }))} />
          </label>
          {counts.map((cnt) => (
            <div key={cnt.key} className="sm-seg">
              <span>
                {cnt.label} <small>({cnt.key})</small>
              </span>
              <div role="radiogroup" aria-label={cnt.label}>
                {Array.from({ length: cnt.max + 1 }, (_, v) => (
                  <button key={v} role="radio" aria-checked={num(cnt.key) === v} className={num(cnt.key) === v ? 'is-on' : ''} onClick={() => setBuy(cnt.key, v)}>
                    {v === cnt.max && cnt.plus ? `${v}+` : v}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="sm-toggles">
            <div className="sm-seg">
              <span>Situation familiale</span>
              <div role="radiogroup" aria-label="Situation familiale">
                {[
                  ['1', 'Marié(e)'],
                  ['0', 'Non marié(e)'],
                ].map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={x.MARRIED === v} className={x.MARRIED === v ? 'is-on' : ''} onClick={() => setX((o) => ({ ...o, MARRIED: v }))}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm-seg">
              <span>Logement</span>
              <div role="radiogroup" aria-label="Logement">
                {[
                  ['1', 'Propriétaire'],
                  ['0', 'Non propriétaire'],
                ].map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={x.OWNHOME === v} className={x.OWNHOME === v ? 'is-on' : ''} onClick={() => setX((o) => ({ ...o, OWNHOME: v }))}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="sm-note">Fenêtres emboîtées : un achat des 6 derniers mois compte aussi dans BUY12 et BUY18 (BUY6 ≤ BUY12 ≤ BUY18).</p>
        </div>

        <div className="sm-calc-out" aria-live="polite">
          <div className="sm-gauge">
            <svg viewBox="0 0 240 140" aria-hidden>
              <path d="M20 120 A100 100 0 0 1 220 120" className="track" />
              <path d="M20 120 A100 100 0 0 1 220 120" className="fill" pathLength={1} style={{ strokeDasharray: `${p} 1` }} />
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const a = Math.PI * (1 - t);
                return <line key={t} x1={120 + 88 * Math.cos(a)} y1={120 - 88 * Math.sin(a)} x2={120 + 80 * Math.cos(a)} y2={120 - 80 * Math.sin(a)} className="tick" />;
              })}
              <g style={{ transform: `rotate(${gaugeAngle}deg)`, transformOrigin: '120px 120px' }} className="needle">
                <line x1={120} y1={120} x2={120} y2={40} />
                <circle cx={120} cy={120} r={6} />
              </g>
            </svg>
            <div className="sm-gauge-v">
              <b>{fmt(p * 100, 1, 1)} %</b>
              <span>probabilité estimée de répondre</span>
            </div>
          </div>
          <div className="sm-z">
            <span>
              logit z = <b>{fmt(z, 3, 3)}</b>
            </span>
            <span>
              cote p/(1 − p) = <b>{fmt(p / (1 - p), 3, 3)}</b>
            </span>
          </div>
          <div className="sm-contrib">
            <h5>
              Ce qui pèse, par rapport au client de référence <small>({fmt(pRef * 100, 1, 1)} %)</small>
            </h5>
            {contrib.map((cc) => (
              <div key={cc.key} className="sm-contrib-row">
                <span className="nm">{cc.label}</span>
                <span className="bar">
                  <i className={cc.delta >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(cc.delta) / maxAbs) * 50}%`, [cc.delta >= 0 ? 'left' : 'right']: '50%' }} />
                </span>
                <span className={`v ${cc.delta > 0 ? 'pos' : cc.delta < 0 ? 'neg' : ''}`}>
                  {cc.delta > 0 ? '+' : ''}
                  {fmt(cc.delta, 3, 3)}
                </span>
              </div>
            ))}
            <p className="sm-note">
              Écarts de logit (β × écart) par rapport à un client de 44 ans, FICO 695, marié, propriétaire, sans commande. Repère calculé&nbsp;: le fichier répond en moyenne à environ
              13 à 14 % (déduit du graphique BUY6).
            </p>
          </div>
          <button className="sm-api" onClick={verify}>
            Vérifier côté serveur (POST /api/models/{slug}/predict)
          </button>
          {check && <p className="sm-api-msg">{check}</p>}
        </div>
      </div>
      <p className="sm-note sm-calc-foot">
        MARRIED et OWNHOME : la sortie SAS ne donne qu’un paramètre, pour la modalité 0, sans préciser le codage. Lecture retenue ici : indicatrice de la
        modalité 0, la modalité OUI servant de référence. Avec le codage par défaut de PROC LOGISTIC (effets ± 1), l’écart entre les deux modalités serait
        deux fois plus grand. Les commandes entrent comme des nombres, avec un coefficient chacune.
      </p>
    </Reveal>
  );
}

/* ───────── Courbe ROC ───────── */
function RocChart({ roc }: { roc: Roc }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = roc.x.map((v, i) => [v, roc.y[i]] as [number, number]);
  const near = hover === null ? null : pts.reduce((b, pt, i) => (Math.abs(pt[0] - hover) < Math.abs(pts[b][0] - hover) ? i : b), 0);
  return (
    <Reveal className="sm-card sm-roc">
      <div className="sm-roc-head">
        <h4>Courbe ROC</h4>
        <span className="sm-auc">
          AUC = <b>{fmt(roc.auc, 3, 3)}</b>
        </span>
      </div>
      <LineChart
        ariaLabel="Courbe ROC du modèle final, AUC 0,649"
        xDomain={[0, 1]}
        yDomain={[0, 1]}
        width={520}
        height={440}
        margin={{ top: 12, right: 14, bottom: 44, left: 52 }}
        xTicks={[0, 0.25, 0.5, 0.75, 1]}
        yTicks={[0, 0.25, 0.5, 0.75, 1]}
        xFormat={(v) => fmt(v, 2)}
        yFormat={(v) => fmt(v, 2)}
        xLabel="1 − spécificité (faux positifs)"
        yLabel="Sensibilité (vrais positifs)"
        cursorX={hover}
        onHoverX={setHover}
        series={[
          {
            id: 'hasard',
            points: [
              [0, 0],
              [1, 1],
            ],
            color: 'var(--sm-muted)',
            width: 1.2,
            dash: '5 5',
          },
          { id: 'roc', points: pts, color: 'var(--sm-orange)', width: 2.8, smooth: true, area: true, areaOpacity: 0.12 },
        ]}
        markers={near !== null ? [{ x: pts[near][0], y: pts[near][1], color: 'var(--sm-ink)', r: 5 }] : []}
      />
      <p className="sm-roc-read" aria-live="polite">
        {near !== null ? (
          <>
            En acceptant {fmt(pts[near][0] * 100, 0)} % de faux positifs, le score repère ≈ {fmt(pts[near][1] * 100, 0)} % des répondants.
          </>
        ) : (
          <>Survolez la courbe. La diagonale correspond à un ciblage au hasard (AUC = 0,5).</>
        )}
      </p>
      <p className="sm-note">Points relevés sur le graphique du rapport ; aire sous la courbe = 0,6490 (sortie SAS).</p>
    </Reveal>
  );
}
