import { useState } from 'react';
import { fmt, type Block } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { BlockView, findSection } from '../../components/Blocks';
import { DecisionLab, type Roc, type ThresholdCurve } from './DecisionLab';
import './style.css';

const NAV = [
  { id: 'donnees', label: 'Données' },
  { id: 'modele', label: 'Modèle' },
  { id: 'effets', label: 'Effets' },
  { id: 'decision', label: 'Décision' },
  { id: 'couts', label: 'Coûts' },
  { id: 'bilan', label: 'Bilan' },
];

interface Ame {
  labels: string[];
  values: number[];
}

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const blocks = (id: string, ...types: Block['type'][]) => (findSection(c.sections, id)?.blocks ?? []).filter((b) => !types.length || types.includes(b.type));
  const render = (bs: Block[]) => bs.map((b, i) => <BlockView key={i} block={b} />);

  return (
    <div className="sa">
      <nav className="sa-nav" aria-label="Sections">
        <div className="sa-wrap">
          <span className="sa-brand">
            Score<b>·</b>Auto
          </span>
          <div className="sa-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`}>
                {n.label}
              </a>
            ))}
          </div>
          <BackToPortfolio />
        </div>
      </nav>

      <header className="sa-hero">
        <div className="sa-wrap">
          <div className="sa-kicker">
            {c.course.replace('M2 Économétrie appliquée — ', 'M2 · ')} · {c.date}
          </div>
          <h1>
            Scorer le risque
            <br />
            d’<em>accident</em> responsable
          </h1>
          <p className="sa-lede">{c.subtitle}.</p>
          <div className="sa-authors">{c.authors.join(' · ')}</div>
          <Reveal className="sa-metrics sa-metrics-6">
            {c.kpis.map((k) => (
              <div key={k.label} className="sa-metric">
                <div className="v">
                  <CountUp value={k.value} />
                </div>
                <div className="l">{k.label}</div>
                {k.note && <div className="s">{k.note}</div>}
              </div>
            ))}
          </Reveal>
        </div>
      </header>

      <section className="sa-sec">
        <div className="sa-wrap sa-grid2">
          <div>
            <div className="sa-tag">Contexte</div>
            <h2>Un score lisible par les métiers</h2>
            <div className="blk-stack">{render(blocks('contexte', 'text', 'list'))}</div>
          </div>
          <div className="sa-card">
            <h3>La question</h3>
            <Md as="p" className="sa-lead" text={c.question} />
            <div className="blk-stack">{render(blocks('contexte', 'callout'))}</div>
          </div>
        </div>
      </section>

      <section id="donnees" className="sa-sec">
        <div className="sa-wrap">
          <div className="sa-tag">01 · Données</div>
          <h2>71 196 contrats, corrigés plutôt que supprimés</h2>
          <div className="sa-grid2">
            <div className="blk-stack">{render(blocks('donnees', 'text', 'table', 'callout').slice(0, 3))}</div>
            <div className="blk-stack">{render(blocks('donnees', 'list', 'figure'))}</div>
          </div>
          <div className="sa-grid2 sa-mt">
            <div className="blk-stack">{render(blocks('donnees', 'text', 'callout').slice(2))}</div>
            <div className="blk-stack">{render(blocks('descriptif', 'figure'))}</div>
          </div>
          <h3>Ce que montre la lecture descriptive</h3>
          <div className="blk-stack">{render(blocks('descriptif', 'text', 'table'))}</div>
        </div>
      </section>

      <section id="modele" className="sa-sec">
        <div className="sa-wrap">
          <div className="sa-tag">02 · Modèle</div>
          <h2>Une régression logistique à 11 variables</h2>
          <div className="blk-stack sa-method">{render(blocks('methode'))}</div>
        </div>
      </section>

      <section id="effets" className="sa-sec">
        <div className="sa-wrap">
          <div className="sa-tag">03 · Effets marginaux moyens</div>
          <h2>Qui fait monter le risque ?</h2>
          <div className="sa-grid2">
            <div>
              <AmeChart ame={f.marginal_effects as Ame} />
            </div>
            <div className="blk-stack">{render(blocks('effets', 'text', 'callout'))}</div>
          </div>
          <div className="sa-mt blk-stack">{render(blocks('effets', 'figure'))}</div>
        </div>
      </section>

      <section id="decision" className="sa-sec">
        <div className="sa-wrap">
          <div className="sa-tag">04 · Simulateur de décision</div>
          <h2>Où placer le seuil ?</h2>
          <p className="dim">
            Le modèle donne une probabilité ; la décision dépend du seuil. Déplacez-le, ou partez du coût relatif d’un faux négatif : le portefeuille, la sensibilité et le coût
            espéré se recalculent.
          </p>
          <Reveal>
            <DecisionLab curve={f.threshold_curve as ThresholdCurve} roc={f.roc as Roc} />
          </Reveal>
          <div className="blk-stack sa-mt">{render(blocks('validation', 'text', 'formula', 'table', 'callout'))}</div>
          <Gains f={f} />
          <div className="sa-mt blk-stack">{render(blocks('validation', 'figure'))}</div>
        </div>
      </section>

      <section id="couts" className="sa-sec">
        <div className="sa-wrap">
          <div className="sa-tag">05 · Coûts</div>
          <h2>Seuil statistique ou seuil économique</h2>
          <div className="blk-stack sa-method">{render(blocks('couts'))}</div>
        </div>
      </section>

      <section id="bilan" className="sa-sec">
        <div className="sa-wrap">
          <div className="sa-tag">06 · Bilan</div>
          <h2>Recommandations</h2>
          <div className="sa-grid2">
            <div className="blk-stack">{render(blocks('recommandations', 'text', 'callout'))}</div>
            <div className="sa-steps">
              {(blocks('recommandations', 'list')[0] as Extract<Block, { type: 'list' }> | undefined)?.items.map((it, i) => (
                <div key={i} className="sa-step">
                  <span className="num" />
                  <Md as="p" text={it} />
                </div>
              ))}
            </div>
          </div>
          <h3>À retenir</h3>
          <ul className="sa-concl">
            {c.conclusions.map((t, i) => (
              <Reveal as="li" key={i} delay={i * 50}>
                <Md text={t} />
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <ProjectEnd project={project} />
    </div>
  );
}

/* ───────── Effets marginaux moyens (barres divergentes) ───────── */
function AmeChart({ ame }: { ame: Ame }) {
  const max = Math.max(...ame.values.map(Math.abs));
  const order = ame.values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  return (
    <div className="sa-card">
      <div className="sa-chart-title">Les dix effets les plus forts</div>
      <div className="sa-chart-sub">En points de probabilité, toutes choses égales par ailleurs (taux de base : 13,3 %)</div>
      {order.map(({ v, i }) => (
        <div key={ame.labels[i]} className="sa-driver">
          <span className="dl">{ame.labels[i]}</span>
          <span className="track">
            <span className="mid" />
            <span className={`bar ${v > 0 ? 'pos' : 'neg'}`} style={v > 0 ? { left: '50%', width: `${(v / max) * 50}%` } : { left: `${50 - (Math.abs(v) / max) * 50}%`, width: `${(Math.abs(v) / max) * 50}%` }} />
          </span>
          <span className="dv" style={{ color: v > 0 ? 'var(--c4)' : 'var(--c0)' }}>
            {v > 0 ? '+' : '−'}
            {fmt(Math.abs(v), 1, 1)}
          </span>
        </div>
      ))}
      <div className="sa-scale">
        <span />
        <span className="sc">
          <span>protège</span>
          <span>aggrave</span>
        </span>
        <span />
      </div>
      <p className="sa-cap">Valeurs lues sur la figure des effets marginaux du rapport (≈ ± 0,05 point).</p>
    </div>
  );
}

/* ───────── Courbe de gains (calculée à partir de la ROC test) ───────── */
function Gains({ f }: { f: Record<string, any> }) {
  const g = f.gains_test as { populationShare: number[]; claimsCaptured: number[]; cumulativeLift: number[] };
  const [k, setK] = useState(2);
  return (
    <Reveal className="sa-card sa-mt sa-gains">
      <div className="sa-chart-title">Cibler une part du portefeuille</div>
      <div className="sa-chart-sub">Du plus risqué au moins risqué, échantillon test</div>
      <div className="sa-gains-row" role="listbox" aria-label="Part du portefeuille ciblée">
        {g.populationShare.map((p, i) => (
          <button key={p} role="option" aria-selected={k === i} className={k === i ? 'is-on' : ''} onClick={() => setK(i)} onMouseEnter={() => setK(i)}>
            <span className="bar" style={{ height: `${g.claimsCaptured[i] * 140}px` }} />
            <span className="lab">{fmt(p * 100, 0)} %</span>
          </button>
        ))}
      </div>
      <p className="sa-gains-read" aria-live="polite">
        En ciblant les <b>{fmt(g.populationShare[k] * 100, 0)} %</b> d’assurés au score le plus élevé, on capte environ <b>{fmt(g.claimsCaptured[k] * 100, 0)} %</b> des sinistrés
        (lift ≈ {fmt(g.cumulativeLift[k], 2, 2)}). Point publié par le rapport : 34,7 % du portefeuille pour 68,6 % des sinistres.
      </p>
      <p className="sa-cap">Courbe calculée à partir de la courbe ROC test numérisée et de π = 0,133 (valeurs approchées, hors rapport).</p>
    </Reveal>
  );
}
