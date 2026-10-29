import { useState } from 'react';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { fmt } from '@atelier/shared';
import './style.css';

interface StepInfo {
  title: string;
  what: string;
  chomage: string;
  boulangerie: string;
}

/** Résultats par étape, repris des tableaux de la fiche du projet. */
const STEPS: StepInfo[] = [
  {
    title: 'Visualiser',
    what: 'Décomposer la série (STL) : tendance, saisonnalité, résidu.',
    chomage: 'Une tendance nette ; la saisonnalité trimestrielle est trop faible pour peser dans le modèle.',
    boulangerie: 'Tendance et forte saisonnalité annuelle (pic de décembre) ; la variance augmente avec le niveau → passage au **logarithme**.',
  },
  {
    title: 'Stationnariser',
    what: 'Test ADF, puis différenciation simple (d) ou saisonnière (D).',
    chomage: 'ADF en niveau : DF = 1,76, p = 0,677 → racine unitaire. Après **d = 1** : DF = 5,21, p < 0,01.',
    boulangerie: 'ADF sur le log : −10,20, p = 0,01 → **d = 0** ; la saisonnalité est traitée par une différence saisonnière (**D = 1**).',
  },
  {
    title: 'Identifier',
    what: 'ACF / PACF et critère BIC pour choisir les ordres.',
    chomage: '**ARIMA(0,1,3)** : BIC minimal. Les variantes SARIMA n’améliorent pas le critère.',
    boulangerie: '**SARIMA(1,0,2)(0,1,2)[12] + dérive** sur le log : pics ACF/PACF tous les 12 mois.',
  },
  {
    title: 'Valider',
    what: 'Les résidus doivent être un bruit blanc (Ljung–Box).',
    chomage: 'Ljung–Box : **p = 0,534** → résidus compatibles avec un bruit blanc.',
    boulangerie: 'Ljung–Box : **p = 0,383** → résidus validés.',
  },
  {
    title: 'Prévoir',
    what: 'Prévision hors échantillon et mesure de l’erreur (RMSE, MAPE).',
    chomage: '8 trimestres : **MAPE 2,65 %**, RMSE 0,225, U de Theil 1,12 (le benchmark naïf reste compétitif).',
    boulangerie: '12 mois : **MAPE 9,94 %** pour le modèle en log contre 13,60 % en brut (RMSE 25,10 vs 28,03).',
  },
];

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const [step, setStep] = useState(0);
  const acc = c.figures.accuracy.series as { serie: string; horizon: string; mape: number; rmse: number; theilU?: number }[];
  const maxMape = Math.max(...acc.map((a) => a.mape));

  return (
    <div className="ts">
      <nav className="ts-nav">
        <div className="ts-wrap ts-nav-in">
          <span className="ts-brand">
            Box–Jenkins <b>·</b> deux séries
          </span>
          <BackToPortfolio />
        </div>
      </nav>

      <header className="ts-hero">
        <div className="ts-split" aria-hidden>
          <div className="ts-half ts-blue">
            <svg viewBox="0 0 400 200" preserveAspectRatio="none">
              <path d="M0 150 C 60 140, 80 120, 120 118 S 200 70, 240 82 S 330 40, 400 30" />
            </svg>
          </div>
          <div className="ts-half ts-warm">
            <svg viewBox="0 0 400 200" preserveAspectRatio="none">
              <path d="M0 150 q 16 -40 33 0 t 33 -6 t 33 -6 t 33 -6 t 33 -8 t 33 -8 t 33 -8 t 33 -10 t 33 -10 t 33 -10 t 33 -10 t 33 -10" />
            </svg>
          </div>
        </div>
        <div className="ts-wrap ts-hero-in">
          <Reveal className="ts-kicker">{c.course}</Reveal>
          <Reveal as="h1">
            Une méthode,
            <br />
            <em>deux signatures.</em>
          </Reveal>
          <Reveal as="p" className="ts-lede" delay={80}>
            {c.abstract}
          </Reveal>
          <Reveal className="ts-kpis" delay={140}>
            {c.kpis.map((k) => (
              <div key={k.label}>
                <strong>
                  <CountUp value={k.value} />
                </strong>
                <span>{k.label}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </header>

      <section className="ts-wrap ts-section">
        <Reveal className="ts-head">
          <span>01</span>
          <h2>La démarche, pas à pas</h2>
        </Reveal>
        <p className="ts-sub">Choisissez une étape : le même protocole appliqué aux deux séries.</p>
        <div className="ts-steps" role="tablist">
          {STEPS.map((s, i) => (
            <button key={s.title} role="tab" aria-selected={i === step} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} onClick={() => setStep(i)}>
              <span>{i + 1}</span>
              {s.title}
            </button>
          ))}
        </div>
        <div className="ts-step-what">{STEPS[step].what}</div>
        <div className="ts-cols" key={step}>
          <article className="ts-col ts-col-blue">
            <header>
              <small>Série 1 · trimestrielle · 203 obs.</small>
              <h3>Chômage des hommes</h3>
            </header>
            <Md as="p" text={STEPS[step].chomage} />
          </article>
          <article className="ts-col ts-col-warm">
            <header>
              <small>Série 2 · mensuelle · 320 obs.</small>
              <h3>Chiffre d’affaires de la boulangerie</h3>
            </header>
            <Md as="p" text={STEPS[step].boulangerie} />
          </article>
        </div>
        <div className="ts-nav-steps">
          <button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            ← Étape précédente
          </button>
          <button disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>
            Étape suivante →
          </button>
        </div>
      </section>

      <section className="ts-wrap ts-section">
        <Reveal className="ts-head">
          <span>02</span>
          <h2>Erreur de prévision hors échantillon</h2>
        </Reveal>
        <p className="ts-sub">MAPE (erreur absolue moyenne en %) — plus court = meilleur.</p>
        <div className="ts-acc">
          {acc.map((a) => (
            <Reveal key={a.serie} className="ts-acc-row">
              <div className="ts-acc-label">
                <b>{a.serie}</b>
                <small>
                  {a.horizon} · RMSE {fmt(a.rmse, 3, 0)}
                  {a.theilU ? ` · U ${fmt(a.theilU, 2)}` : ''}
                </small>
              </div>
              <div className="ts-acc-track">
                <i className={a.serie.startsWith('Chômage') ? 'blue' : a.serie.includes('log') ? 'warm' : 'grey'} style={{ width: `${(a.mape / maxMape) * 100}%` }} />
              </div>
              <div className="ts-acc-val">{fmt(a.mape, 2)} %</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="ts-wrap ts-section">
        <Reveal className="ts-head">
          <span>03</span>
          <h2>À retenir</h2>
        </Reveal>
        <ul className="ts-take">
          {c.conclusions.map((t, i) => (
            <Reveal as="li" key={i} delay={i * 60}>
              <Md text={t} />
            </Reveal>
          ))}
        </ul>
      </section>

      <ProjectEnd project={project} />
    </div>
  );
}
