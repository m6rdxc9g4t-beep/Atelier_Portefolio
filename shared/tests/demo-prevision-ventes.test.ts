import { describe, expect, it } from 'vitest';
import {
  analyze,
  backtestPlan,
  bandFromPaths,
  centeredMA,
  decompose,
  fitHW,
  fitRegression,
  fitSeasonalNaive,
  hwFilter,
  hwForecast,
  metrics,
  mulberry32,
  nelderMead,
  ols,
  quantileSorted,
  type HWState,
} from '../../client/src/demos/prevision-ventes/model';
import {
  detectDateFormat,
  detectDecimal,
  detectDelimiter,
  guessColumns,
  inferFrequency,
  InputError,
  interpolate,
  isoWeek,
  dayNumber,
  parseDate,
  parseNumber,
  periodOf,
  prepareSeries,
} from '../../client/src/demos/prevision-ventes/csv';
import { examples } from '../../client/src/demos/prevision-ventes/examples';
import { explain } from '../../client/src/demos/prevision-ventes/explain';

/** AirPassengers (Box & Jenkins), 1949–1952 : série de manuel. */
const AIR = [
  112, 118, 132, 129, 121, 135, 148, 148, 136, 119, 104, 118, 115, 126, 141, 135, 125, 149, 170, 170, 158, 133, 114, 140, 145, 150, 178, 163, 172,
  178, 199, 199, 184, 162, 146, 166, 171, 180, 193, 181, 183, 218, 230, 242, 209, 191, 172, 194,
];

const close = (a: number[], b: number[], tol: number) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], tol));

describe('métriques d’erreur (calcul à la main)', () => {
  it('MAE, RMSE, MAPE, sMAPE', () => {
    // erreurs 10, −10, −30 : MAE = 50/3 ; RMSE = √(1100/3) ; MAPE = (10 % + 5 % + 10 %)/3 ;
    // sMAPE = (20/210 + 20/390 + 60/630)/3.
    const m = metrics([100, 200, 300], [110, 190, 330]);
    expect(m.mae).toBeCloseTo(50 / 3, 10);
    expect(m.rmse).toBeCloseTo(Math.sqrt(1100 / 3), 10);
    expect(m.mape).toBeCloseTo(25 / 3, 10);
    expect(m.smape).toBeCloseTo((100 * (20 / 210 + 20 / 390 + 60 / 630)) / 3, 10);
  });
  it('MAPE non définie dès qu’une valeur observée est nulle', () => {
    expect(Number.isNaN(metrics([0, 10], [1, 10]).mape)).toBe(true);
    expect(metrics([0, 10], [1, 10]).smape).toBeCloseTo(100, 10);
  });
});

describe('outils numériques', () => {
  it('quantiles de type 7 (valeurs de numpy.quantile)', () => {
    const s = [3, 1, 4, 1, 5, 9, 2, 6].sort((a, b) => a - b);
    close([0.025, 0.1, 0.5, 0.9, 0.975].map((p) => quantileSorted(s, p)), [1, 1, 3.5, 6.9, 8.475], 10);
  });
  it('Nelder-Mead retrouve le minimum de Rosenbrock (1, 1)', () => {
    const r = nelderMead(([x, y]) => 100 * (y - x * x) ** 2 + (1 - x) ** 2, [-1.2, 1], { maxIter: 2000, tol: 1e-14 });
    expect(r.x[0]).toBeCloseTo(1, 3);
    expect(r.x[1]).toBeCloseTo(1, 3);
  });
  it('MCO : exemple de manuel y = 2,2 + 0,6 x', () => {
    const b = ols([1, 2, 3, 4, 5].map((x) => [1, x]), [2, 4, 5, 4, 5])!;
    expect(b[0]).toBeCloseTo(2.2, 10);
    expect(b[1]).toBeCloseTo(0.6, 10);
  });
  it('générateur reproductible', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('Holt-Winters : valeurs de référence statsmodels 0.15 (initialisation connue, paramètres fixés)', () => {
  // ExponentialSmoothing(air, trend='add', seasonal=…, seasonal_periods=12, initialization_method='known',
  // initial_level=126, initial_trend=1, initial_seasonal=…).fit(0.3, 0.1, 0.2, optimized=False)
  const p = { alpha: 0.3, beta: 0.1, gamma: 0.2 };
  it('additif', () => {
    const raw = [-14, -8, 6, 3, -5, 9, 22, 22, 10, -7, -22, -8];
    const mu = raw.reduce((s, v) => s + v, 0) / 12;
    const init: HWState = { level: 126, trend: 1, season: raw.map((v) => v - mu) };
    const { fitted, state } = hwFilter(AIR, p, 'add', init);
    close(fitted.slice(0, 3), [112.33333333, 119.22333333, 133.80963333], 6);
    expect(fitted[47]).toBeCloseTo(200.048471003464, 8);
    expect(AIR.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0)).toBeCloseTo(2664.562590022675, 6);
    close(hwForecast(state, 'add', 11, 48), [198.19015, 205.717774, 222.408606, 215.648126, 213.927549, 232.754967, 247.539805, 249.766058, 232.603086, 215.204299, 200.944237], 5);
  });
  it('multiplicatif', () => {
    const init: HWState = { level: 126, trend: 1, season: [0.9, 0.94, 1.04, 1.01, 0.96, 1.07, 1.17, 1.17, 1.07, 0.94, 0.83, 0.92] };
    const { fitted, state } = hwFilter(AIR, p, 'mul', init);
    close(fitted.slice(0, 3), [114.3, 119.52726667, 132.64558519], 6);
    expect(AIR.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0)).toBeCloseTo(1786.2017647636294, 6);
    close(hwForecast(state, 'mul', 11, 48), [194.766915, 204.851553, 228.826681, 218.820216, 215.118546, 242.683095, 266.110203, 269.924421, 245.602194, 217.76862, 193.948662], 5);
  });
  it('reproduit exactement une série « tendance linéaire + saison » sans bruit', () => {
    const s = [5, -3, 8, -10];
    const y = Array.from({ length: 40 }, (_, t) => 50 + 2 * t + s[t % 4]);
    const m = fitHW(y, 4, 'add', { alpha: 0.4, beta: 0.2, gamma: 0.3 });
    m.fitted.slice(4).forEach((v, i) => expect(v).toBeCloseTo(y[i + 4], 8));
    close(m.forecast(6), Array.from({ length: 6 }, (_, k) => 50 + 2 * (40 + k) + s[(40 + k) % 4]), 8);
    const f = [1.1, 0.8, 1.3, 0.8];
    const ym = Array.from({ length: 40 }, (_, t) => (100 + 3 * t) * f[t % 4]);
    const mm = fitHW(ym, 4, 'mul', { alpha: 0.4, beta: 0.2, gamma: 0.3 });
    close(mm.forecast(4), Array.from({ length: 4 }, (_, k) => (100 + 3 * (40 + k)) * f[(40 + k) % 4]), 2); // init. approchée en multiplicatif : convergence
  });
  it('l’estimation par Nelder-Mead fait au moins aussi bien que des paramètres raisonnables fixés', () => {
    const fittedSSE = (kind: 'add' | 'mul', prm?: { alpha: number; beta: number; gamma: number }) => {
      const m = fitHW(AIR, 12, kind, prm);
      return AIR.reduce((s, v, i) => (Number.isNaN(m.fitted[i]) ? s : s + (v - m.fitted[i]) ** 2), 0);
    };
    for (const kind of ['add', 'mul'] as const) expect(fittedSSE(kind)).toBeLessThanOrEqual(fittedSSE(kind, p) + 1e-6);
    const prm = fitHW(AIR, 12, 'mul').params.map((q) => q.value);
    prm.forEach((v) => {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    });
  });
});

describe('références et régression', () => {
  it('naïf saisonnier : répète le dernier cycle', () => {
    const m = fitSeasonalNaive([1, 2, 3, 4, 5, 6, 7, 8], 4);
    expect(m.forecast(6)).toEqual([5, 6, 7, 8, 5, 6]);
    expect(fitSeasonalNaive([1, 2, 3], 1).forecast(2)).toEqual([3, 3]);
  });
  it('régression tendance + indicatrices : récupère une série déterministe', () => {
    const s = [0, 4, -2];
    const y = Array.from({ length: 30 }, (_, t) => 10 + 0.5 * t + s[t % 3]);
    const m = fitRegression(y, 3);
    close(m.fitted, y, 8);
    close(m.forecast(3), [25, 29.5, 24], 8);
    expect(m.params[0].value).toBeCloseTo(0.5, 8);
  });
});

describe('intervalles bootstrap', () => {
  it('reproductibles à graine égale et ordonnés', () => {
    const y = examples()[0].csv.split('\n').slice(1).map((l) => Number(l.split(';')[1].replace(',', '.')));
    const m = fitHW(y, 12, 'mul');
    const a = bandFromPaths(m.forecast(12), m.simulate(12, 400, mulberry32(1)));
    const b = bandFromPaths(m.forecast(12), m.simulate(12, 400, mulberry32(1)));
    expect(a).toEqual(b);
    a.mean.forEach((v, k) => {
      expect(a.lo95[k]).toBeLessThanOrEqual(a.lo80[k]);
      expect(a.lo80[k]).toBeLessThan(v);
      expect(v).toBeLessThan(a.hi80[k]);
      expect(a.hi80[k]).toBeLessThanOrEqual(a.hi95[k]);
    });
    // l'incertitude croît avec l'horizon
    expect(a.hi95[11] - a.lo95[11]).toBeGreaterThan(a.hi95[0] - a.lo95[0]);
  });
  it('sur un bruit blanc gaussien, l’intervalle à 80 % du naïf couvre environ 80 % des cas', () => {
    const rand = mulberry32(3);
    const g = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
    const y = Array.from({ length: 400 }, () => 100 + 5 * g());
    const r = analyze(y, 1, 20);
    const reg = r.models.find((x) => x.id === 'reg')!;
    // bande à 80 % de la régression ≈ ±1,28 σ (σ = 5)
    expect(reg.band.hi80[0] - reg.band.lo80[0]).toBeGreaterThan(2 * 1.1 * 5);
    expect(reg.band.hi80[0] - reg.band.lo80[0]).toBeLessThan(2 * 1.5 * 5);
  });
});

describe('validation hors échantillon', () => {
  it('origines glissantes', () => {
    expect(backtestPlan(84, 12, 24)).toEqual({ origins: [60, 66, 72], horizon: 12 });
    expect(backtestPlan(40, 12, 24)).toEqual({ origins: [28], horizon: 12 });
    expect(backtestPlan(20, 12, 24)).toBeNull();
  });
  it('sur l’exemple mensuel saisonnier, un lissage bat la référence naïve', () => {
    const y = examples()[0].csv.split('\n').slice(1).map((l) => Number(l.split(';')[1].replace(',', '.')));
    const a = analyze(y, 12, 12);
    expect(a.seasonal).toBe(true);
    expect(a.models.map((m) => m.id)).toEqual(['snaive', 'hw-add', 'hw-mul', 'reg']);
    const best = a.models.find((m) => m.id === a.bestId)!;
    expect(best.id).not.toBe('snaive');
    expect(best.gainVsNaive).toBeGreaterThan(0);
    expect(a.decomposition!.seasonalStrength).toBeGreaterThan(0.6);
  });
  it('série courte : pas de saisonnalité ; trop courte : erreur', () => {
    const a = analyze(Array.from({ length: 20 }, (_, t) => 10 + t), 12, 6);
    expect(a.seasonal).toBe(false);
    expect(a.limits[0]).toMatch(/deux cycles/);
    expect(() => analyze([1, 2, 3], 12, 6)).toThrow(/trop courte/);
  });
  it('valeurs négatives : pas de multiplicatif ni de MAPE', () => {
    const y = Array.from({ length: 60 }, (_, t) => -5 + Math.sin(t) * 20 + (t % 12));
    const a = analyze(y, 12, 12);
    expect(a.models.some((m) => m.id === 'hw-mul')).toBe(false);
    a.models.forEach((m) => expect(Number.isNaN(m.backtest!.metrics.mape)).toBe(true));
  });
});

describe('décomposition classique (valeurs statsmodels seasonal_decompose)', () => {
  it('moyenne mobile centrée 2×12', () => {
    close(centeredMA(AIR, 12).slice(6, 9), [126.79166667, 127.25, 127.95833333], 6);
  });
  it('indices saisonniers additifs et multiplicatifs', () => {
    close(decompose(AIR, 12, 'add').figure, [-12.905093, -7.016204, 9.331019, -3.68287, -5.293981, 14.372685, 26.608796, 24.928241, 10.219907, -12.68287, -30.93287, -12.946759], 5);
    close(decompose(AIR, 12, 'mul').figure, [0.913766, 0.954163, 1.058586, 0.979352, 0.965312, 1.083287, 1.182226, 1.169258, 1.068604, 0.915405, 0.795296, 0.914745], 5);
  });
});

describe('lecture du CSV', () => {
  it('séparateur', () => {
    expect(detectDelimiter('Date;Ventes\n01/01/2024;1,5\n02/01/2024;2,5')).toBe(';');
    expect(detectDelimiter('date,sales\n2024-01-01,"1,5"\n2024-01-02,2.5')).toBe(',');
    expect(detectDelimiter('date\tsales\n2024-01-01\t3')).toBe('\t');
  });
  it('nombres français et anglais', () => {
    expect(parseNumber('1 234,56 €', ',')).toBeCloseTo(1234.56, 10);
    expect(parseNumber('1 234,5', ',')).toBeCloseTo(1234.5, 10);
    expect(parseNumber('1.234,5', ',')).toBeCloseTo(1234.5, 10);
    expect(parseNumber('1,234.56', '.')).toBeCloseTo(1234.56, 10);
    expect(parseNumber('(120)', '.')).toBe(-120);
    expect(parseNumber('−12,5', ',')).toBe(-12.5);
    expect(parseNumber('n/a', '.')).toBeNull();
    expect(detectDecimal(['12,5', '13,75'], ',')).toBe(',');
    expect(detectDecimal(['12.5', '1,234.5'], ';')).toBe('.');
    expect(detectDecimal(['1,234', '2,000'], ',')).toBe('.');
  });
  it('dates : formats et détection', () => {
    expect(parseDate('2024-03-31', 'iso')).toBe(dayNumber(2024, 3, 31));
    expect(parseDate('2024-03-31T10:00:00Z', 'iso')).toBe(dayNumber(2024, 3, 31));
    expect(parseDate('31/03/2024', 'dmy')).toBe(dayNumber(2024, 3, 31));
    expect(parseDate('31/02/2024', 'dmy')).toBeNull();
    expect(parseDate('03/31/24', 'mdy')).toBe(dayNumber(2024, 3, 31));
    expect(parseDate('03/2024', 'my')).toBe(dayNumber(2024, 3, 1));
    expect(parseDate('2024-03', 'ym')).toBe(dayNumber(2024, 3, 1));
    expect(parseDate('déc. 2024', 'monthname')).toBe(dayNumber(2024, 12, 1));
    expect(parseDate('Jan-24', 'monthname')).toBe(dayNumber(2024, 1, 1));
    expect(detectDateFormat(['13/01/2024', '14/01/2024']).format).toBe('dmy');
    expect(detectDateFormat(['01/13/2024', '01/14/2024']).format).toBe('mdy');
    const amb = detectDateFormat(['01/02/2024', '02/02/2024']);
    expect(amb.format).toBe('dmy');
    expect(amb.ambiguous).toBe(true);
  });
  it('semaines ISO et périodes', () => {
    expect(isoWeek(dayNumber(2024, 12, 30))).toBe(1);
    expect(isoWeek(dayNumber(2021, 1, 3))).toBe(53);
    expect(periodOf(dayNumber(2024, 3, 31), 'month')).toBe(2024 * 12 + 2);
    expect(periodOf(dayNumber(2024, 1, 1), 'week')).toBe(periodOf(dayNumber(2024, 1, 7), 'week'));
    expect(inferFrequency([dayNumber(2024, 1, 1), dayNumber(2024, 2, 1), dayNumber(2024, 3, 1)])).toBe('month');
  });
  it('colonnes, en-tête, doublons, trous, période incomplète', () => {
    const rows = [
      ['Magasin', 'Date', 'Quantité', 'Montant'],
      ['A', '30/12/2024', '3', '10,5'],
      ['A', '31/12/2024', '1', '4'],
      ['A', '02/01/2025', '2', '6'],
      ['B', '02/01/2025', '1', '2'],
      ['A', '03/01/2025', '1', '1,5'],
    ];
    const g = guessColumns(rows, ';')!;
    expect(g.hasHeader).toBe(true);
    expect(g.dateCol).toBe(1);
    expect(g.valueCol).toBe(2); // « Quantité » repérée par son nom
    const p = prepareSeries(rows, g, 1, 3, ';', 'auto');
    expect(p.rawFreq).toBe('day');
    expect(p.series.values).toEqual([10.5, 4, 6, 8, 1.5]); // 01/01 interpolé, 02/01 additionné
    expect(p.notes.map((n) => n.text).join(' ')).toMatch(/double/);
    expect(p.notes.map((n) => n.text).join(' ')).toMatch(/interpolation/);
    expect(interpolate([1, null, null, 4])).toEqual([1, 2, 3, 4]);
  });
  it('agrégation au mois et période de bord incomplète écartée', () => {
    const rows: string[][] = [];
    for (let d = dayNumber(2024, 1, 1); d <= dayNumber(2024, 4, 10); d++) rows.push([new Date(d * 864e5).toISOString().slice(0, 10), '1']);
    const g = guessColumns(rows, ',')!;
    expect(g.hasHeader).toBe(false);
    const p = prepareSeries(rows, g, 0, 1, ',', 'month');
    expect(p.series.values).toEqual([31, 29, 31]);
    expect(p.notes.some((n) => /incomplète/.test(n.text))).toBe(true);
  });
  it('erreurs claires', () => {
    const g = guessColumns([['date', 'v'], ['2024-01-01', 'x']], ',')!;
    expect(() => prepareSeries([['date', 'v'], ['2024-01-01', 'x']], g, 0, 1, ',', 'auto')).toThrow(InputError);
    const rows = [['date', 'v'], ['2024-01-01', '1'], ['2024-02-01', '2']];
    expect(() => prepareSeries(rows, guessColumns(rows, ',')!, 0, 1, ',', 'day')).toThrow(/impossible de les détailler/);
  });
});

describe('exemples simulés et explication', () => {
  it('chaque exemple se lit et produit une explication', () => {
    for (const ex of examples()) {
      const rows = ex.csv.split('\n').map((l) => l.split(';'));
      const g = guessColumns(rows, ';')!;
      const p = prepareSeries(rows, g, g.dateCol, g.valueCol, ';', 'auto');
      expect(p.notes.filter((n) => n.level === 'warn')).toEqual([]);
      const m = { day: 7, week: 52, month: 12 }[p.series.freq];
      const a = analyze(p.series.values, m, p.series.freq === 'month' ? 12 : p.series.freq === 'week' ? 26 : 28);
      expect(a.seasonal).toBe(true);
      const text = explain(p.series, a, a.bestId, ex.unit);
      expect(text.map((t) => t.title)).toEqual(['Tendance', 'Saisonnalité', 'Modèle', 'Prévision', 'Fiabilité']);
      if (ex.id === 'commerce') expect(text[1].text).toMatch(/Pic en décembre/);
      if (ex.id === 'boulangerie') expect(text[1].text).toMatch(/Pic le samedi/);
    }
  });
});

describe('cas particuliers de lecture', () => {
  it('jour de fermeture hebdomadaire : compté à zéro, pas interpolé', () => {
    const rows: string[][] = [['Date', 'Ventes']];
    for (let d = dayNumber(2025, 1, 6); d < dayNumber(2025, 3, 31); d++) {
      if (new Date(d * 864e5).getUTCDay() === 0) continue; // fermé le dimanche
      rows.push([new Date(d * 864e5).toISOString().slice(0, 10), '100']);
    }
    const p = prepareSeries(rows, guessColumns(rows, ',')!, 0, 1, ',', 'auto');
    expect(p.series.imputed).toEqual([]);
    expect(p.series.values.filter((v) => v === 0).length).toBe(11); // 11 dimanches entre le 6/1 et le 29/3
    expect(p.notes.some((n) => /dimanche/.test(n.text))).toBe(true);
  });
  it('JJ/MM ou MM/JJ ambigus : la lecture la plus régulière l’emporte, sans alerte', () => {
    const rows = [['Mois', 'CA'], ...Array.from({ length: 24 }, (_, i) => [`01/${String((i % 12) + 1).padStart(2, '0')}/${2024 + Math.floor(i / 12)}`, '10'])];
    const p = prepareSeries(rows, guessColumns(rows, ';')!, 0, 1, ';', 'auto');
    expect(p.rawFreq).toBe('month');
    expect(p.notes.some((n) => /ambiguës/.test(n.text))).toBe(false);
  });
});
