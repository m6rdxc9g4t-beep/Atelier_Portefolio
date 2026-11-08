import type { Dataset, Spec } from './model';
import { rng } from './stats';

export interface Example {
  id: string;
  label: string;
  /** Problème illustré, en une phrase. */
  problem: string;
  /** Ce qu'il faut regarder, en deux ou trois phrases. */
  guide: string;
  /** Variable dont on suit le coefficient d'un modèle à l'autre. */
  focus: string;
  data: Dataset;
  /** Modèle ouvert par défaut. */
  spec: Spec;
  /** Modèles comparés côte à côte à l'ouverture. */
  presets: { label: string; spec: Spec }[];
  /** Vraies valeurs de simulation, pour juger les estimations. */
  truth: string;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Salaires : rendement de l'éducation, profil d'expérience concave, écart femmes-hommes, variance qui grandit avec l'expérience. */
function salaires(): Example {
  const r = rng(4101);
  const n = 600;
  const education: number[] = [];
  const experience: number[] = [];
  const femme: number[] = [];
  const salaire: number[] = [];
  for (let i = 0; i < n; i++) {
    const educ = Math.max(9, Math.min(20, Math.round(13 + 2.4 * r.normal())));
    const exp = Math.max(0, Math.min(42, Math.round(16 + 10 * r.normal())));
    const f = r.uniform() < 0.48 ? 1 : 0;
    const sd = 0.1 + 0.011 * exp;
    const lw = 6.55 + 0.075 * educ + 0.032 * exp - 0.0005 * exp * exp - 0.13 * f + sd * r.normal();
    education.push(educ);
    experience.push(exp);
    femme.push(f);
    salaire.push(Math.round(Math.exp(lw)));
  }
  const base: Spec = { y: 'salaire', logY: true, xs: [], inter: [] };
  return {
    id: 'salaires',
    label: 'Salaires',
    problem: 'Hétéroscédasticité : la dispersion des salaires augmente avec l’expérience.',
    guide:
      'Le modèle de Mincer explique le logarithme du salaire mensuel par l’éducation, l’expérience et son carré. Le test de Breusch-Pagan rejette nettement une variance constante : les erreurs-types classiques sont alors fausses, les robustes (HC1) les remplacent. Comparez aussi le modèle en niveau et le modèle en logarithme : le second se lit en pourcentage.',
    focus: 'education',
    data: {
      n,
      columns: [
        { name: 'salaire', kind: 'num', values: salaire },
        { name: 'education', kind: 'num', values: education },
        { name: 'experience', kind: 'num', values: experience },
        { name: 'femme', kind: 'num', values: femme },
      ],
    },
    spec: { ...base, xs: [{ col: 'education', fn: 'lin', sq: false }, { col: 'experience', fn: 'lin', sq: true }, { col: 'femme', fn: 'lin', sq: false }] },
    presets: [
      { label: 'Salaire en niveau', spec: { ...base, logY: false, xs: [{ col: 'education', fn: 'lin', sq: false }, { col: 'experience', fn: 'lin', sq: false }] } },
      { label: 'Mincer', spec: { ...base, xs: [{ col: 'education', fn: 'lin', sq: false }, { col: 'experience', fn: 'lin', sq: true }] } },
      { label: 'Mincer + sexe', spec: { ...base, xs: [{ col: 'education', fn: 'lin', sq: false }, { col: 'experience', fn: 'lin', sq: true }, { col: 'femme', fn: 'lin', sq: false }] } },
    ],
    truth: 'Valeurs simulées : +7,5 % de salaire par année d’études, expérience +0,032 et −0,0005 au carré, écart femmes −0,13 en logarithme ; écart-type du bruit de 0,10 + 0,011 × expérience.',
  };
}

/** Ventes : deux budgets publicitaires fixés ensemble, donc presque parfaitement corrélés. */
function ventes(seed = 4122): Example {
  const r = rng(seed);
  const n = 120;
  const tv: number[] = [];
  const web: number[] = [];
  const total: number[] = [];
  const prix: number[] = [];
  const ventesV: number[] = [];
  for (let i = 0; i < n; i++) {
    const budget = 20 + 30 * r.uniform();
    const partTv = 0.5 + 0.012 * r.normal();
    const t = budget * partTv;
    const w = budget - t;
    const p = round(18 + 2.5 * r.normal(), 2);
    const v = 400 + 6 * t + 6 * w - 14 * p + 35 * r.normal();
    tv.push(round(t, 2));
    web.push(round(w, 2));
    total.push(round(t + w, 2));
    prix.push(p);
    ventesV.push(Math.round(v));
  }
  const base: Spec = { y: 'ventes', logY: false, xs: [], inter: [] };
  return {
    id: 'ventes',
    label: 'Ventes et publicité',
    problem: 'Multicolinéarité : les budgets télé et web bougent ensemble.',
    guide:
      'Chaque semaine, le budget publicitaire (en milliers d’euros) est partagé à peu près moitié-moitié entre télé et web. Pris séparément, leurs effets sont imprécis (erreurs-types énormes, VIF au-delà de 10) alors que le modèle explique très bien les ventes. Regroupés en un budget total, l’effet devient net.',
    focus: 'pub_tv',
    data: {
      n,
      columns: [
        { name: 'ventes', kind: 'num', values: ventesV },
        { name: 'pub_tv', kind: 'num', values: tv },
        { name: 'pub_web', kind: 'num', values: web },
        { name: 'budget_total', kind: 'num', values: total },
        { name: 'prix', kind: 'num', values: prix },
      ],
    },
    spec: { ...base, xs: [{ col: 'pub_tv', fn: 'lin', sq: false }, { col: 'pub_web', fn: 'lin', sq: false }, { col: 'prix', fn: 'lin', sq: false }] },
    presets: [
      { label: 'Télé seule', spec: { ...base, xs: [{ col: 'pub_tv', fn: 'lin', sq: false }, { col: 'prix', fn: 'lin', sq: false }] } },
      { label: 'Télé + web', spec: { ...base, xs: [{ col: 'pub_tv', fn: 'lin', sq: false }, { col: 'pub_web', fn: 'lin', sq: false }, { col: 'prix', fn: 'lin', sq: false }] } },
      { label: 'Budget total', spec: { ...base, xs: [{ col: 'budget_total', fn: 'lin', sq: false }, { col: 'prix', fn: 'lin', sq: false }] } },
    ],
    truth: 'Valeurs simulées : +6 ventes par millier d’euros, en télé comme en web ; −14 ventes par euro de prix ; bruit d’écart-type 35.',
  };
}

/** Formation : les plus aptes se forment davantage ; oublier l'aptitude gonfle l'effet de la formation. */
function formation(): Example {
  const r = rng(4103);
  const n = 500;
  const heures: number[] = [];
  const aptitude: number[] = [];
  const productivite: number[] = [];
  const anciennete: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = r.normal();
    const h = Math.max(0, 20 + 8 * a + 6 * r.normal());
    const anc = Math.max(0, Math.round(8 + 5 * r.normal()));
    const p = 60 + 0.5 * h + 6 * a + 0.4 * anc + 5 * r.normal();
    aptitude.push(round(a, 3));
    heures.push(round(h, 1));
    anciennete.push(anc);
    productivite.push(round(p, 1));
  }
  const base: Spec = { y: 'productivite', logY: false, xs: [], inter: [] };
  return {
    id: 'formation',
    label: 'Formation et productivité',
    problem: 'Biais de variable omise : l’aptitude pousse à la fois la formation et la productivité.',
    guide:
      'On veut l’effet d’une heure de formation sur un score de productivité. Les salariés les plus aptes suivent davantage de formations : sans l’aptitude dans le modèle, la formation reçoit le mérite de l’aptitude et son coefficient est presque doublé. Il revient près de la vraie valeur (0,5) quand on ajoute l’aptitude.',
    focus: 'heures_formation',
    data: {
      n,
      columns: [
        { name: 'productivite', kind: 'num', values: productivite },
        { name: 'heures_formation', kind: 'num', values: heures },
        { name: 'aptitude', kind: 'num', values: aptitude },
        { name: 'anciennete', kind: 'num', values: anciennete },
      ],
    },
    spec: { ...base, xs: [{ col: 'heures_formation', fn: 'lin', sq: false }, { col: 'anciennete', fn: 'lin', sq: false }] },
    presets: [
      { label: 'Sans aptitude', spec: { ...base, xs: [{ col: 'heures_formation', fn: 'lin', sq: false }, { col: 'anciennete', fn: 'lin', sq: false }] } },
      { label: 'Avec aptitude', spec: { ...base, xs: [{ col: 'heures_formation', fn: 'lin', sq: false }, { col: 'anciennete', fn: 'lin', sq: false }, { col: 'aptitude', fn: 'lin', sq: false }] } },
    ],
    truth: 'Valeurs simulées : +0,5 point de productivité par heure de formation, +6 par écart-type d’aptitude, +0,4 par année d’ancienneté ; la formation augmente de 8 heures par écart-type d’aptitude.',
  };
}

export function examples(): Example[] {
  return [salaires(), ventes(), formation()];
}
