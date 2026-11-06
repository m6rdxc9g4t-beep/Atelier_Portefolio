import { dayNumber, dayToDate, isoWeek, weekday } from './csv';
import { gaussian, mulberry32 } from './model';

/**
 * Jeux d'exemple SIMULÉS (aucune donnée réelle) : générés avec une graine fixe et écrits en CSV « à la française »
 * (point-virgule, virgule décimale, dates JJ/MM/AAAA) pour passer par la même lecture qu'un fichier déposé.
 */
export interface Example {
  id: string;
  label: string;
  /** Une ligne : ce que le jeu illustre. */
  hint: string;
  filename: string;
  unit: string;
  csv: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const frDate = (day: number) => {
  const d = dayToDate(day);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const frNum = (v: number, digits: number) => v.toFixed(digits).replace('.', ',');

/** Commerce de détail : CA mensuel 2019–2025, tendance douce, forte saisonnalité multiplicative (pic de décembre). */
function retail(): string {
  const rand = mulberry32(2019);
  const factors = [0.86, 0.82, 0.95, 0.98, 1.0, 1.02, 0.97, 0.86, 0.96, 1.01, 1.12, 1.45];
  const fm = factors.reduce((s, f) => s + f, 0) / 12;
  const lines = ['Mois;Chiffre d’affaires (k€)'];
  for (let i = 0; i < 84; i++) {
    const y = 2019 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    const level = 120 * Math.pow(1.0045, i);
    const v = level * (factors[i % 12] / fm) * (1 + 0.028 * gaussian(rand));
    lines.push(`01/${pad(m)}/${y};${frNum(v, 1)}`);
  }
  return lines.join('\n');
}

/** Boutique en ligne : commandes hebdomadaires 2022–2025, croissance, soldes, Black Friday, Noël et promotions ponctuelles. */
function ecommerce(): string {
  const rand = mulberry32(2022);
  const start = dayNumber(2022, 1, 3);
  const lines = ['Semaine;Commandes'];
  const promo = new Set<number>();
  for (let k = 0; k < 8; k++) promo.add(10 + Math.floor(rand() * 190));
  for (let i = 0; i < 208; i++) {
    const day = start + 7 * i;
    const w = isoWeek(day);
    let f = 1 + 0.06 * Math.cos((2 * Math.PI * (w - 50)) / 52);
    if (w >= 2 && w <= 5) f *= 1.22;
    if (w >= 26 && w <= 29) f *= 1.18;
    if (w === 47) f *= 1.65;
    if (w >= 49 && w <= 51) f *= 1.3;
    if (w === 52 || w === 1) f *= 0.82;
    if (promo.has(i)) f *= 1.35;
    const level = 820 * Math.pow(1.16, i / 52);
    lines.push(`${frDate(day)};${Math.round(level * f * (1 + 0.045 * gaussian(rand)))}`);
  }
  return lines.join('\n');
}

/** Boulangerie : ventes quotidiennes 2025, cycle hebdomadaire marqué (samedi, dimanche), légère vague annuelle. */
function bakery(): string {
  const rand = mulberry32(2025);
  const wd = [0.78, 0.9, 0.93, 0.95, 1.08, 1.38, 1.24];
  const lines = ['Date;Ventes (€)'];
  const start = dayNumber(2025, 1, 1);
  for (let i = 0; i < 365; i++) {
    const day = start + i;
    const season = 1 + 0.08 * Math.sin((2 * Math.PI * (i - 80)) / 365);
    const v = 640 * (1 + i / 3000) * season * wd[weekday(day)] * (1 + 0.055 * gaussian(rand));
    lines.push(`${frDate(day)};${frNum(v, 2)}`);
  }
  return lines.join('\n');
}

let cache: Example[] | null = null;

export function examples(): Example[] {
  cache ??= [
    {
      id: 'commerce',
      label: 'Commerce, mensuel',
      hint: '7 ans de chiffre d’affaires mensuel, pic de décembre.',
      filename: 'exemple-commerce-mensuel.csv',
      unit: 'k€',
      csv: retail(),
    },
    {
      id: 'ecommerce',
      label: 'E-commerce, hebdo',
      hint: '4 ans de commandes hebdomadaires : soldes, Black Friday, promotions.',
      filename: 'exemple-ecommerce-hebdomadaire.csv',
      unit: 'commandes',
      csv: ecommerce(),
    },
    {
      id: 'boulangerie',
      label: 'Boulangerie, quotidien',
      hint: 'Un an de ventes quotidiennes, cycle de la semaine.',
      filename: 'exemple-boulangerie-quotidien.csv',
      unit: '€',
      csv: bakery(),
    },
  ];
  return cache;
}
