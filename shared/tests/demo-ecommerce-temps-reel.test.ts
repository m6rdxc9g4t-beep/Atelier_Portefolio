import { describe, expect, it } from 'vitest';
import {
  BASKET,
  CATEGORIES,
  FLAGSHIP_ID,
  MEAN_CONV,
  PRESETS,
  SESSIONS_PER_DAY,
  WEEKLY,
  advance,
  basketMoments,
  binomial,
  compoundPoissonBand,
  createSim,
  cumulative,
  drawBasket,
  effectsAt,
  ewmaArl,
  ewmaStep,
  ewmaZ,
  EWMA_ZERO,
  expectedOrdersCum,
  falseAlarmEvery,
  gapThreshold,
  gapZ,
  hourFactor,
  injectIncident,
  kpisAt,
  landing,
  makeRng,
  nextU,
  normCdf,
  normInv,
  poisson,
  relChange,
  sessionRate,
  setPreset,
  simulateMinute,
  type Category,
} from '../../client/src/demos/ecommerce-temps-reel/model';
import { duration, euros, hhmm, hhmmss, signedPct, signedPts } from '../../client/src/demos/ecommerce-temps-reel/format';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
};

describe('aléa à graine', () => {
  it('reproduit la même suite pour la même graine, une autre suite pour une autre graine', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const c = makeRng(43);
    const sa = Array.from({ length: 5 }, () => nextU(a));
    const sb = Array.from({ length: 5 }, () => nextU(b));
    const sc = Array.from({ length: 5 }, () => nextU(c));
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    sa.forEach((u) => expect(u >= 0 && u < 1).toBe(true));
  });

  it('tire une loi de Poisson de moyenne et variance λ (petit et grand λ)', () => {
    for (const lam of [0.3, 3, 45]) {
      const r = makeRng(7);
      const xs = Array.from({ length: 20000 }, () => poisson(r, lam));
      expect(mean(xs)).toBeCloseTo(lam, lam < 1 ? 1 : 0);
      expect(variance(xs) / lam).toBeGreaterThan(0.95);
      expect(variance(xs) / lam).toBeLessThan(1.05);
    }
    expect(poisson(makeRng(1), 0)).toBe(0);
  });

  it('tire une loi binomiale de moyenne np', () => {
    const r = makeRng(9);
    const xs = Array.from({ length: 20000 }, () => binomial(r, 40, 0.03));
    expect(mean(xs)).toBeCloseTo(1.2, 1);
    expect(variance(xs)).toBeCloseTo(40 * 0.03 * 0.97, 1);
  });
});

describe('loi normale', () => {
  it('retrouve les valeurs de table', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normCdf(-3)).toBeCloseTo(0.0013499, 6);
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normInv(0.001)).toBeCloseTo(-3.090232, 5);
    expect(normInv(normCdf(-2.5))).toBeCloseTo(-2.5, 6);
  });
});

describe('profil de trafic', () => {
  it('a un profil horaire de moyenne 1 sur la journée, continu à minuit', () => {
    let s = 0;
    for (let m = 0; m < 1440; m++) s += hourFactor(m + 0.5);
    expect(s / 1440).toBeCloseTo(1, 6);
    expect(hourFactor(0)).toBeCloseTo(hourFactor(1440), 10);
    expect(hourFactor(21 * 60 + 30)).toBeGreaterThan(hourFactor(4 * 60 + 30) * 8);
  });

  it('donne SESSIONS_PER_DAY sessions par jour en moyenne sur la semaine', () => {
    let week = 0;
    for (let m = 0; m < 7 * 1440; m++) week += sessionRate(m);
    expect(week / 7).toBeCloseTo(SESSIONS_PER_DAY, 0);
    // Le dimanche (jour 6) pèse plus que le samedi (jour 5).
    expect(WEEKLY[6]!).toBeGreaterThan(WEEKLY[5]!);
  });
});

describe('panier', () => {
  it('a les moments exacts d’une somme aléatoire sur un catalogue jouet', () => {
    // Un seul produit à 10 €, quantité 1 : X = 10·L, L = 1 + Poisson(μ) ⇒ E[X] = 10(1+μ), Var(X) = 100μ.
    const toy: Category[] = [{ id: 'pap', label: 'x', weight: 1, returnRate: 0, products: [{ id: 'p', label: 'p', price: 10, weight: 1 }] }];
    const m = basketMoments(toy, 0.4, [1]);
    expect(m.mean).toBeCloseTo(14, 10);
    expect(m.variance).toBeCloseTo(40, 10);
    expect(m.second).toBeCloseTo(40 + 196, 10);
    expect(m.flagshipShare).toBe(0);
  });

  it('a des moments calculés qui concordent avec la simulation des paniers', () => {
    const r = makeRng(2026);
    const totals: number[] = [];
    let withFlag = 0;
    for (let i = 0; i < 60000; i++) {
      const lines = drawBasket(r);
      totals.push(lines.reduce((s, l) => s + l.price * l.qty, 0));
      if (lines.some((l) => l.productId === FLAGSHIP_ID)) withFlag += 1;
    }
    expect(mean(totals) / BASKET.mean).toBeGreaterThan(0.99);
    expect(mean(totals) / BASKET.mean).toBeLessThan(1.01);
    expect(variance(totals) / BASKET.variance).toBeGreaterThan(0.96);
    expect(variance(totals) / BASKET.variance).toBeLessThan(1.04);
    expect(withFlag / 60000).toBeCloseTo(BASKET.flagshipShare, 2);
    expect(CATEGORIES.some((c) => c.products.some((p) => p.id === FLAGSHIP_ID))).toBe(true);
  });
});

describe('simulation d’une minute', () => {
  it('produit en moyenne λ sessions et λ·conversion commandes', () => {
    const r = makeRng(5);
    const t = 1440 + 20 * 60; // mardi 20 h
    let sessions = 0;
    let orders = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const out = simulateMinute(r, t, effectsAt([], t));
      sessions += out.sessions.reduce((a, b) => a + b, 0);
      orders += out.orders.length;
      expect(out.lost).toBe(0);
    }
    expect(sessions / n / sessionRate(t)).toBeCloseTo(1, 1);
    expect(orders / n / (sessionRate(t) * MEAN_CONV)).toBeGreaterThan(0.95);
    expect(orders / n / (sessionRate(t) * MEAN_CONV)).toBeLessThan(1.05);
  });

  it('applique les incidents : paiement à 10 %, pic de trafic, rupture du produit phare', () => {
    const t = 1440 + 14 * 60;
    const incidents = [
      { id: 1, kind: 'payment' as const, start: t, end: t + 40 },
      { id: 2, kind: 'traffic' as const, start: t, end: t + 60 },
      { id: 3, kind: 'stockout' as const, start: t, end: t + 120 },
    ];
    const fx = effectsAt(incidents, t + 5);
    expect(fx.payment).toBeCloseTo(0.1, 10);
    expect(fx.spikeRate).toBeGreaterThan(0);
    expect(fx.flagshipOut).toBe(true);
    expect(effectsAt(incidents, t + 200)).toEqual({ payment: 1, spikeRate: 0, flagshipOut: false });
    const r = makeRng(11);
    for (let i = 0; i < 300; i++) {
      const out = simulateMinute(r, t, { payment: 1, spikeRate: 0, flagshipOut: true });
      out.orders.forEach((o) => expect(o.lines.some((l) => l.productId === FLAGSHIP_ID)).toBe(false));
    }
  });
});

describe('prévision du CA', () => {
  it('suit un processus de Poisson composé : E = Λ·E[X], Var = Λ·E[X²]', () => {
    const b = compoundPoissonBand(100, { lineMean: 0, lineSq: 0, mean: 50, variance: 400, second: 2900, flagshipShare: 0 });
    expect(b.mean).toBe(5000);
    expect(b.sd).toBeCloseTo(Math.sqrt(290000), 8);
    expect(b.hi - b.mean).toBeCloseTo(1.96 * b.sd, 8);
  });

  it('couvre le CA simulé d’une journée environ 95 fois sur 100', () => {
    const exp = expectedOrdersCum(1);
    const band = compoundPoissonBand(exp[1440]!);
    let inside = 0;
    const days = 120;
    for (let d = 0; d < days; d++) {
      const r = makeRng(1000 + d);
      let ca = 0;
      for (let m = 0; m < 1440; m++) ca += simulateMinute(r, 1440 + m, effectsAt([], 1440 + m)).orders.reduce((s, o) => s + o.total, 0);
      if (ca >= band.lo && ca <= band.hi) inside += 1;
    }
    expect(inside / days).toBeGreaterThan(0.88);
    expect(inside / days).toBeLessThanOrEqual(1);
  });

  it('projette l’atterrissage à partir du CA observé', () => {
    const exp = expectedOrdersCum(1);
    const end = landing(1000, exp, 1440);
    expect(end.mean).toBe(1000);
    expect(end.sd).toBe(0);
    const mid = landing(50000, exp, 720);
    expect(mid.mean).toBeCloseTo(50000 + (exp[1440]! - exp[720]!) * BASKET.mean, 6);
    expect(mid.lo).toBeLessThan(mid.mean);
  });
});

describe('cartes de contrôle', () => {
  it('converge vers la variance asymptotique λ/(2−λ) de l’EWMA', () => {
    let s = EWMA_ZERO;
    for (let i = 0; i < 500; i++) s = ewmaStep(s, { x: 3, mu: 3, v: 4, count: 3 }, 0.1);
    expect(s.V).toBeCloseTo((4 * 0.1) / 1.9, 8);
    expect(ewmaZ(s)).toBe(0);
    s = ewmaStep(s, { x: 3 + 2, mu: 3, v: 4, count: 3 }, 0.1);
    expect(ewmaZ(s)).toBeCloseTo((0.1 * 2) / Math.sqrt(s.V), 8);
  });

  it('retrouve l’ARL de Shewhart quand λ = 1 (370,4 pour L = 3)', () => {
    expect(ewmaArl(1, 3)).toBeCloseTo(1 / (2 * normCdf(-3)), 0);
  });

  it('retrouve la table d’ARL EWMA de Lucas et Saccucci (1990), reprise par Montgomery', () => {
    // (λ, L) : ARL pour un écart δ = 0 et δ = 1 écart-type.
    expect(ewmaArl(0.4, 3.054, 0)).toBeCloseTo(500, -1);
    expect(ewmaArl(0.4, 3.054, 1)).toBeCloseTo(14.3, 0);
    expect(ewmaArl(0.25, 2.998, 0)).toBeCloseTo(500, -1);
    expect(ewmaArl(0.25, 2.998, 1)).toBeCloseTo(11.1, 0);
    expect(ewmaArl(0.1, 2.814, 0)).toBeCloseTo(500, -1);
    expect(ewmaArl(0.1, 2.814, 1)).toBeCloseTo(10.3, 0);
  });

  it('double à peu près l’ARL₀ en surveillance unilatérale, sans changer la détection d’une baisse', () => {
    const two = ewmaArl(0.1, 3.3, 0);
    const one = ewmaArl(0.1, 3.3, 0, 12);
    expect(one / two).toBeGreaterThan(1.9);
    expect(one / two).toBeLessThan(2.1);
    expect(ewmaArl(0.1, 3.3, -1, 12)).toBeCloseTo(ewmaArl(0.1, 3.3, -1), 0);
  });

  it('ordonne les préréglages : moins de fausses alertes coûte un délai de détection plus long', () => {
    const p = [PRESETS.reactive, PRESETS.balanced, PRESETS.cautious];
    const fa = p.map((x) => falseAlarmEvery(x.L, x.lambda).overall);
    const d1 = p.map((x) => ewmaArl(x.lambda, x.L, 1));
    expect(fa[0]!).toBeLessThan(fa[1]!);
    expect(fa[1]!).toBeLessThan(fa[2]!);
    expect(d1[0]!).toBeLessThan(d1[1]!);
    expect(d1[1]!).toBeLessThan(d1[2]!);
  });

  it('teste l’absence de ventes : seuil Λ* tel que e^{−Λ*} = Φ(−L)', () => {
    expect(Math.exp(-gapThreshold(3))).toBeCloseTo(normCdf(-3), 10);
    expect(gapZ(0)).toBe(0);
    expect(gapZ(gapThreshold(3))).toBeCloseTo(-3, 4);
    expect(gapZ(100)).toBe(-6);
  });
});

describe('moteur de la boutique', () => {
  it('est reproductible et ne modifie pas l’état reçu', () => {
    const a = createSim(123);
    const b = createSim(123);
    expect(kpisAt(a.today, 1440)).toEqual(kpisAt(b.today, 1440));
    const before = JSON.stringify(a);
    const next = advance(a, 30);
    expect(JSON.stringify(a)).toBe(before);
    expect(next.minute).toBe(a.minute + 30);
    expect(next.today.orders.length).toBe(a.today.orders.length + 30);
    expect(kpisAt(createSim(124).today, 1440)).not.toEqual(kpisAt(a.today, 1440));
  });

  it('démarre un mardi à 11 h avec la veille complète et un journal vide', () => {
    const s = createSim();
    expect(s.minute).toBe(1440 + 660);
    expect(s.yesterday?.sessions.length).toBe(1440);
    expect(s.today.sessions.length).toBe(660);
    expect(s.alerts.filter((a) => a.end !== null)).toEqual([]);
    const k = kpisAt(s.yesterday!, 1440);
    expect(k.sessions / SESSIONS_PER_DAY).toBeGreaterThan(0.9);
    expect(k.conversion!).toBeCloseTo(MEAN_CONV, 2);
  });

  it('détecte une panne de paiement et la rattache à l’incident', () => {
    let s = injectIncident(createSim(), 'payment');
    const inc = s.incidents[0]!;
    expect(injectIncident(s, 'payment')).toBe(s); // pas deux fois le même incident en cours
    s = advance(s, 60);
    const linked = s.alerts.filter((a) => a.incidentId === inc.id);
    expect(linked.map((a) => a.monitor)).toContain('orders');
    linked.forEach((a) => expect(a.dir).toBe(-1));
    // Première détection : bien avant la fin de la panne (40 min).
    expect(Math.min(...linked.map((a) => a.start)) - inc.start).toBeLessThan(25);
  });

  it('détecte un pic de trafic (hausse des sessions) et une rupture (absence de ventes du produit phare)', () => {
    const base = createSim();
    const t = advance(injectIncident(base, 'traffic'), 30);
    expect(t.alerts.some((a) => a.monitor === 'sessions' && a.dir === 1 && a.incidentId !== null)).toBe(true);
    const r = advance(injectIncident(base, 'stockout'), 90);
    expect(r.alerts.some((a) => a.monitor === 'flagship' && a.incidentId !== null)).toBe(true);
  });

  it('ne rattache aucune alerte quand aucun incident n’est injecté', () => {
    const s = advance(createSim(77), 3 * 1440);
    s.alerts.forEach((a) => expect(a.incidentId).toBeNull());
  });

  it('recalcule les cartes quand la sensibilité change', () => {
    const s = createSim();
    const p = setPreset(s, 'reactive');
    expect(p.preset).toBe('reactive');
    expect(p.monitors.sessions.history.length).toBe(s.monitors.sessions.history.length);
    expect(p.monitors.flagship).toBe(s.monitors.flagship);
    expect(setPreset(s, 'balanced')).toBe(s);
  });
});

describe('indicateurs et mise en forme', () => {
  it('calcule les cumuls et les variations', () => {
    const day = { day: 0, sessions: [100, 100, 200], orders: [2, 3, 5], revenue: [100, 200, 300] };
    expect(kpisAt(day, 2)).toEqual({ revenue: 300, orders: 5, sessions: 200, aov: 60, conversion: 0.025 });
    expect(kpisAt({ day: 0, sessions: [], orders: [], revenue: [] }, 10).aov).toBeNull();
    expect(relChange(110, 100)).toBeCloseTo(0.1, 10);
    expect(relChange(1, 0)).toBeNull();
    expect(cumulative([1, 2, 3])).toEqual([0, 1, 3, 6]);
  });

  it('formate à la française', () => {
    expect(hhmm(1440 + 14 * 60 + 5)).toBe('14:05');
    expect(hhmmss((1440 + 9 * 60) * 60 + 7)).toBe('09:00:07');
    expect(euros(104321)).toBe('104 321 €');
    expect(signedPct(0.042)).toBe('+4,2 %');
    expect(signedPct(-0.008)).toBe('−0,8 %');
    expect(signedPts(0.0012)).toBe('+0,12 pt');
    expect(duration(45)).toBe('45 min');
    expect(duration(80)).toBe('1 h 20');
    expect(duration(13 * 60)).toBe('13 h');
  });
});
