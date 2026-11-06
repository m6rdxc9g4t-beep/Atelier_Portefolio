import { formatPeriod, isoWeek, MONTHS_LONG, MONTHS_SHORT, periodStartDay, dayToDate, weekday, WEEKDAYS_LONG, type Series } from './csv';
import { mean, type Analysis, type ModelId } from './model';

/** Explication en langage clair, produite par des règles fixes (aucune IA) à partir des résultats chiffrés. */

/** Nombre au format français, décimales adaptées à l'ordre de grandeur. */
export function fmtNum(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = digits ?? (a >= 100 ? 0 : a >= 10 ? 1 : 2);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtPct(v: number, digits = 1, signed = false): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${signed && v > 0 ? '+' : ''}${s.replace('-', '−')} %`;
}

const PER_YEAR = { day: 365.25, week: 52.18, month: 12 };

/** Libellé calendaire d'une position saisonnière j (comptée depuis le début de la série). */
export function seasonLabel(series: Series, m: number, j: number): string {
  const n = series.values.length;
  const k = Math.max(0, Math.floor((n - 1 - j) / m));
  const p = series.start + j + k * m;
  if (series.freq === 'month') return MONTHS_LONG[p % 12];
  const day = periodStartDay(p, series.freq);
  if (series.freq === 'day') return WEEKDAYS_LONG[weekday(day)];
  const d = dayToDate(day);
  const dom = d.getUTCDate();
  const when = dom <= 10 ? 'début ' : dom <= 20 ? 'mi-' : 'fin ';
  return `la semaine ${isoWeek(day)}, ${when}${MONTHS_LONG[d.getUTCMonth()]}`;
}

/** Libellé court d'une position saisonnière, pour l'axe du profil (semaines : mois au début de chaque mois). */
export function seasonTick(series: Series, m: number, j: number): string {
  const k = Math.max(0, Math.floor((series.values.length - 1 - j) / m));
  const p = series.start + j + k * m;
  if (series.freq === 'month') return MONTHS_SHORT[p % 12];
  const day = periodStartDay(p, series.freq);
  if (series.freq === 'day') return WEEKDAYS_LONG[weekday(day)].slice(0, 3) + '.';
  const d = dayToDate(day);
  return d.getUTCDate() <= 7 ? MONTHS_SHORT[d.getUTCMonth()] : '';
}

export interface Paragraph {
  title: string;
  text: string;
}

export function explain(series: Series, a: Analysis, chosen: ModelId, unit: string): Paragraph[] {
  const out: Paragraph[] = [];
  const y = series.values;
  const n = y.length;
  const u = unit ? ` ${unit}` : '';
  const d = a.decomposition;
  const model = a.models.find((r) => r.id === chosen) ?? a.models[0];
  const best = a.models.find((r) => r.id === a.bestId)!;

  // Tendance
  {
    let first: number;
    let last: number;
    let span: number;
    const t = d?.trend.map((v, i) => [i, v] as const).filter(([, v]) => Number.isFinite(v)) ?? [];
    if (t.length >= 2) {
      [, first] = t[0];
      [, last] = t[t.length - 1];
      span = t[t.length - 1][0] - t[0][0];
    } else {
      const k = Math.max(1, Math.min(a.m, Math.floor(n / 4)));
      first = mean(y.slice(0, k));
      last = mean(y.slice(-k));
      span = n - k;
    }
    const years = span / PER_YEAR[series.freq];
    const growth = first > 0 && last > 0 && years > 0 ? 100 * (Math.pow(last / first, 1 / years) - 1) : NaN;
    let text = `Le niveau de fond passe d’environ ${fmtNum(first)}${u} à ${fmtNum(last)}${u} par période`;
    if (Number.isFinite(growth)) {
      text += Math.abs(growth) < 1 ? ', soit un niveau quasi stable (moins de 1 % par an).' : `, soit ${fmtPct(growth, 1, true)} par an en rythme moyen.`;
    } else text += '.';
    out.push({ title: 'Tendance', text });
  }

  // Saisonnalité
  if (d) {
    const vS = d.shares.seasonal;
    const vR = d.shares.remainder;
    const sharePct = vS + vR > 0 ? (100 * vS) / (vS + vR) : 0;
    const level = mean(d.trend.filter(Number.isFinite));
    const rel = d.figure.map((f) => (d.kind === 'mul' ? 100 * (f - 1) : (100 * f) / level));
    const hi = rel.indexOf(Math.max(...rel));
    const lo = rel.indexOf(Math.min(...rel));
    const unitWord = series.freq === 'month' ? 'mois' : series.freq === 'week' ? 'semaines' : 'jours';
    let text = `Une fois la tendance retirée, la saisonnalité explique environ ${fmtNum(sharePct, 0)} % des variations restantes ; le reste est irrégulier (aléas, promotions, événements). `;
    text +=
      d.seasonalStrength < 0.3
        ? `Ce profil est faible : les écarts entre ${unitWord} sont peu réguliers d’un cycle à l’autre.`
        : `Pic ${series.freq === 'week' ? 'pendant' : 'en'} ${seasonLabel(series, a.m, hi)} (${fmtPct(rel[hi], 0, true)} par rapport à la tendance), creux ${series.freq === 'week' ? 'pendant' : 'en'} ${seasonLabel(series, a.m, lo)} (${fmtPct(rel[lo], 0, true)}).`;
    if (series.freq === 'day') text = text.replace(/en (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/g, 'le $1');
    out.push({ title: 'Saisonnalité', text });
  } else {
    out.push({ title: 'Saisonnalité', text: a.limits[0] ?? 'Pas de saisonnalité estimée sur cette série.' });
  }

  // Modèle retenu
  if (model.backtest && a.plan) {
    const bt = model.backtest.metrics;
    const k = a.plan.origins.length;
    let text = `Validation hors échantillon : ${k} origine${k > 1 ? 's' : ''} glissante${k > 1 ? 's' : ''}, ${a.plan.horizon} périodes prévues à chaque fois sans voir la suite. `;
    if (model.id === best.id) text += `${model.name} y fait l’erreur la plus faible : ${fmtNum(bt.mae)}${u} d’écart absolu moyen par période (sMAPE ${fmtPct(bt.smape)}).`;
    else
      text += `Vous avez choisi ${model.name} (erreur absolue moyenne ${fmtNum(bt.mae)}${u}) ; ${best.name} faisait mieux en validation (${fmtNum(best.backtest!.metrics.mae)}${u}).`;
    if (model.id !== 'snaive' && Number.isFinite(model.gainVsNaive)) {
      text +=
        model.gainVsNaive > 2
          ? ` C’est ${fmtNum(model.gainVsNaive, 0)} % d’erreur en moins que la référence naïve.`
          : ' Il ne fait pas mieux que la référence naïve : répéter le dernier cycle serait aussi bon, la prévision est à prendre avec prudence.';
    }
    const alpha = model.params.find((p) => p.label.startsWith('α'))?.value;
    if (alpha !== undefined) {
      text +=
        alpha < 0.2
          ? ` Avec α = ${fmtNum(alpha, 2)}, le niveau est lissé sur une longue mémoire : ${series.freq === 'month' ? 'un mois atypique' : series.freq === 'week' ? 'une semaine atypique' : 'un jour atypique'} déplace peu la prévision.`
          : alpha > 0.6
            ? ` Avec α = ${fmtNum(alpha, 2)}, le niveau suit de près les dernières observations.`
            : '';
    }
    out.push({ title: 'Modèle', text });
  }

  // Prévision
  {
    const H = a.horizon;
    const lastH = y.slice(-H).reduce((s, v) => s + v, 0);
    const end = formatPeriod(series.start + n + H - 1, series.freq, 'long');
    const g = lastH > 0 ? (100 * (model.total.mean - lastH)) / lastH : NaN;
    let text = `Sur les ${H} prochaines périodes (jusqu’à ${end}), total prévu : ${fmtNum(model.total.mean)}${u}, entre ${fmtNum(model.total.lo80)} et ${fmtNum(model.total.hi80)}${u} dans 80 % des scénarios simulés`;
    text += Number.isFinite(g) && H <= n ? `, soit ${fmtPct(g, 1, true)} par rapport aux ${H} dernières.` : '.';
    out.push({ title: 'Prévision', text });
  }

  // Fiabilité
  {
    const parts: string[] = [];
    const cov = model.backtest?.coverage80;
    if (cov !== undefined && Number.isFinite(cov)) {
      parts.push(`En validation, ${fmtNum(100 * cov, 0)} % des valeurs observées sont tombées dans l’intervalle à 80 %`);
      parts[0] += cov < 0.7 ? ' : les intervalles sont sans doute trop étroits, lisez-les comme un minimum d’incertitude.' : cov > 0.92 ? ' : ils sont plutôt prudents.' : ', ce qui est cohérent avec leur niveau annoncé.';
    }
    if (d) {
      const r = d.remainder.map((v) => (d.kind === 'mul' ? Math.log(v) : v));
      const ok = r.filter(Number.isFinite);
      const sd = Math.sqrt(ok.reduce((s, v) => s + v * v, 0) / Math.max(1, ok.length - 1));
      const out3 = r.map((v, i) => [i, v] as const).filter(([, v]) => Number.isFinite(v) && Math.abs(v) > 3 * sd);
      if (out3.length) {
        const ex = out3.slice(0, 2).map(([i]) => formatPeriod(series.start + i, series.freq));
        parts.push(
          `${out3.length} période${out3.length > 1 ? 's' : ''} s’écarte${out3.length > 1 ? 'nt' : ''} nettement du profil habituel (plus de 3 écarts-types, par exemple ${ex.join(', ')}) : promotions, ruptures ou événements que les modèles ne prévoient pas.`,
        );
      }
    }
    if (series.imputed.length) parts.push(`${series.imputed.length} période${series.imputed.length > 1 ? 's ont été complétées' : ' a été complétée'} par interpolation.`);
    if (parts.length) out.push({ title: 'Fiabilité', text: parts.map((p) => (p.endsWith('.') ? p : `${p}.`)).join(' ') });
  }
  return out;
}
