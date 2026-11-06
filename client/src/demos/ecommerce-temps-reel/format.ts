/** Mise en forme française des nombres et des heures simulées (fonctions pures). */

import { DAY_NAMES } from './model';

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Espace fine insécable avant les unités et comme séparateur de milliers (rendu homogène d'un navigateur à l'autre). */
const tidy = (s: string) => s.replace(/[   ]/g, ' ').replace('-', '−');

export const int = (v: number) => tidy(nf0.format(v));
export const dec1 = (v: number) => tidy(nf1.format(v));
export const euros = (v: number) => `${tidy(nf0.format(v))} €`;
export const euros2 = (v: number) => `${tidy(nf2.format(v))} €`;
/** Milliers d'euros, une décimale : « 104,3 k€ ». */
export const keuros = (v: number) => `${tidy(nf1.format(v / 1000))} k€`;
export const pct = (v: number, digits = 2) =>
  `${tidy(new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v * 100))} %`;

/** Variation signée : « +4,2 % », « −0,8 % ». */
export function signedPct(v: number, digits = 1): string {
  const s = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v) * 100);
  const sign = Math.abs(v) * 100 < 0.5 * 10 ** -digits ? '±' : v > 0 ? '+' : '−';
  return `${sign}${tidy(s)} %`;
}

/** Écart en points de pourcentage : « +0,12 pt ». */
export function signedPts(v: number, digits = 2): string {
  const s = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v) * 100);
  const sign = Math.abs(v) * 100 < 0.5 * 10 ** -digits ? '±' : v > 0 ? '+' : '−';
  return `${sign}${tidy(s)} pt`;
}

/** Valeur z signée : « −4,8 σ ». */
export const sigma = (z: number) => `${z >= 0 ? '+' : '−'}${tidy(nf1.format(Math.abs(z)))} σ`;

const pad = (n: number) => String(n).padStart(2, '0');

/** Heure d'une minute absolue : « 14:05 ». */
export function hhmm(absMinute: number): string {
  const m = ((Math.floor(absMinute) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Heure d'une seconde absolue : « 14:05:32 ». */
export function hhmmss(absSecond: number): string {
  const s = ((Math.floor(absSecond) % 86400) + 86400) % 86400;
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Jour de la semaine d'une minute absolue (minute 0 = lundi 00:00). */
export const dayName = (absMinute: number) => DAY_NAMES[Math.floor(absMinute / 1440) % 7]!;

/** Durée en minutes simulées, lisible : « 45 min », « 3 h », « 1 h 20 », « 2,5 j ». */
export function duration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m === 0 || h >= 10 ? `${Math.round(minutes / 60)} h` : `${h} h ${pad(m)}`;
  }
  return `${tidy(nf1.format(minutes / 1440))} j`;
}
