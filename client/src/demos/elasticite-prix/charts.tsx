import { useId } from 'react';
import { demandAt, formatDay, monthOf, MONTHS_SHORT, outcome, type Analysis, type Obs } from './model';
import { fmtEur, fmtNum } from './format';

function niceStep(range: number, target = 4): number {
  const raw = range / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
function ticks(lo: number, hi: number, target = 4): number[] {
  const step = niceStep(hi - lo || Math.abs(hi) || 1, target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/* ───────────── Historique : prix (ligne) et volumes (barres), haute saison en fond ───────────── */

export function HistoryChart({ obs, highSeason }: { obs: Obs[]; highSeason: (o: Obs) => boolean }) {
  const W = 1040, L = 50, R = 12, T = 10, gap = 18, hP = 110, hQ = 124, B = 24;
  const H = T + hP + gap + hQ + B;
  const n = obs.length;
  const iw = W - L - R;
  const bw = iw / n;
  const x = (i: number) => L + i * bw + bw / 2;
  const prices = obs.map((o) => o.price);
  const pLo = Math.min(...prices) * 0.97, pHi = Math.max(...prices) * 1.02;
  const qHi = Math.max(...obs.map((o) => o.qty)) * 1.05;
  const yP = (p: number) => T + hP - ((p - pLo) / (pHi - pLo)) * hP;
  const q0 = T + hP + gap + hQ;
  const yQ = (q: number) => q0 - (q / qHi) * hQ;
  const pts = obs.map((o, i) => `${x(i).toFixed(1)},${yP(o.price).toFixed(1)}`).join(' ');
  // Repères de mois : premier point de chaque trimestre.
  const marks = obs.map((o, i) => ({ i, m: monthOf(o.day), y: new Date(o.day * 86_400_000).getUTCFullYear() })).filter((d, k, arr) => k === 0 || (d.m !== arr[k - 1]!.m && d.m % 3 === 0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="elp-svg" role="img" aria-label="Historique des prix et des volumes, semaines de haute saison en fond">
      {obs.map((o, i) => (highSeason(o) ? <rect key={`h${i}`} x={L + i * bw} y={T} width={bw} height={hP + gap + hQ} className="elp-high" /> : null))}
      {ticks(pLo, pHi, 3).map((v) => (
        <g key={`p${v}`}>
          <line x1={L} x2={W - R} y1={yP(v)} y2={yP(v)} className="elp-grid" />
          <text x={L - 6} y={yP(v) + 4} textAnchor="end" className="elp-axis">{fmtNum(v, 0)} €</text>
        </g>
      ))}
      <text x={L} y={T + 10} className="elp-axis-title">Prix moyen</text>
      <polyline points={pts} className="elp-price-line" />
      {ticks(0, qHi, 3).map((v) => (
        <g key={`q${v}`}>
          <line x1={L} x2={W - R} y1={yQ(v)} y2={yQ(v)} className="elp-grid" />
          <text x={L - 6} y={yQ(v) + 4} textAnchor="end" className="elp-axis">{fmtNum(v, 0)}</text>
        </g>
      ))}
      <text x={L} y={T + hP + gap + 10} className="elp-axis-title">Unités vendues</text>
      {obs.map((o, i) => (
        <rect key={`q${i}`} x={L + i * bw + bw * 0.15} y={yQ(o.qty)} width={Math.max(1, bw * 0.7)} height={q0 - yQ(o.qty)} className="elp-qty-bar">
          <title>{`Semaine du ${formatDay(o.day)} : ${fmtEur(o.price)}, ${fmtNum(o.qty, 0)} unités`}</title>
        </rect>
      ))}
      {marks.map((d) => (
        <text key={`m${d.i}`} x={L + d.i * bw} y={H - 6} className="elp-axis">
          {MONTHS_SHORT[d.m]} {String(d.y).slice(2)}
        </text>
      ))}
    </svg>
  );
}

/* ───────────── Nuage prix × quantité, avec les deux courbes ajustées ───────────── */

export function ScatterChart({ obs, analysis, highSeason }: { obs: Obs[]; analysis: Analysis; highSeason: (o: Obs) => boolean }) {
  const W = 520, H = 330, L = 52, R = 14, T = 14, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const prices = obs.map((o) => o.price);
  const pLo = Math.min(...prices) * 0.96, pHi = Math.max(...prices) * 1.03;
  const qMax = Math.max(...obs.map((o) => o.qty)) * 1.06;
  const x = (p: number) => L + ((p - pLo) / (pHi - pLo)) * iw;
  const y = (q: number) => T + ih - (q / qMax) * ih;
  const nb = analysis.naive.fit.beta;
  const steps = 40;
  const curve = (f: (p: number) => number) =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const p = pLo + ((pHi - pLo) * k) / steps;
      return `${x(p).toFixed(1)},${y(Math.min(qMax, f(p))).toFixed(1)}`;
    }).join(' ');
  const naive = curve((p) => Math.exp(nb[0]! + nb[1]! * Math.log(p)));
  const controlled = curve((p) => demandAt(analysis, p));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="elp-svg" role="img" aria-label="Quantité vendue selon le prix, avec la courbe naïve et la courbe à saison constante">
      {ticks(0, qMax, 4).map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="elp-grid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="elp-axis">{fmtNum(v, 0)}</text>
        </g>
      ))}
      {ticks(pLo, pHi, 5).map((v) => (
        <text key={`x${v}`} x={x(v)} y={H - B + 18} textAnchor="middle" className="elp-axis">{fmtNum(v, 0)} €</text>
      ))}
      <text x={L + iw / 2} y={H - 4} textAnchor="middle" className="elp-axis-title">Prix</text>
      <text x={L} y={T - 2} className="elp-axis-title">Unités par période</text>
      {obs.map((o, i) => (
        <circle key={i} cx={x(o.price)} cy={y(o.qty)} r={3.4} className={highSeason(o) ? 'elp-pt elp-pt-high' : 'elp-pt'}>
          <title>{`${formatDay(o.day)} : ${fmtEur(o.price)}, ${fmtNum(o.qty, 0)} unités${highSeason(o) ? ' (haute saison)' : ''}`}</title>
        </circle>
      ))}
      <polyline points={naive} className="elp-fit-naive" />
      <polyline points={controlled} className="elp-fit-ctrl" />
    </svg>
  );
}

/* ───────────── Marge selon le prix, avec bande d'incertitude ───────────── */

export function MarginChart({ analysis, cost, range, price, optimum }: { analysis: Analysis; cost: number; range: [number, number]; price: number; optimum: number | null }) {
  const gid = useId().replace(/:/g, '');
  const W = 620, H = 260, L = 64, R = 16, T = 16, B = 36;
  const iw = W - L - R, ih = H - T - B;
  const steps = 80;
  const pts = Array.from({ length: steps + 1 }, (_, k) => outcome(analysis, range[0] + ((range[1] - range[0]) * k) / steps, cost));
  const yMax = Math.max(...pts.map((p) => p.marginHi), 1) * 1.05;
  const yMin = Math.min(0, ...pts.map((p) => p.marginLo));
  const x = (p: number) => L + ((p - range[0]) / (range[1] - range[0])) * iw;
  const y = (m: number) => T + ih - ((m - yMin) / (yMax - yMin)) * ih;
  const line = pts.map((p) => `${x(p.price).toFixed(1)},${y(p.margin).toFixed(1)}`).join(' ');
  const band = [...pts.map((p) => `${x(p.price).toFixed(1)},${y(p.marginHi).toFixed(1)}`), ...[...pts].reverse().map((p) => `${x(p.price).toFixed(1)},${y(p.marginLo).toFixed(1)}`)].join(' ');
  const cur = outcome(analysis, price, cost);
  const [obsLo, obsHi] = analysis.priceRange;
  const optIn = optimum !== null && optimum >= range[0] && optimum <= range[1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="elp-svg" role="img" aria-label="Marge par période selon le prix, avec sa bande d'incertitude">
      <defs>
        <pattern id={`obs-${gid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" className="elp-observed" />
        </pattern>
      </defs>
      <rect x={x(Math.max(obsLo, range[0]))} y={T} width={Math.max(0, x(Math.min(obsHi, range[1])) - x(Math.max(obsLo, range[0])))} height={ih} fill={`url(#obs-${gid})`} />
      {ticks(yMin, yMax, 4).map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'elp-zero' : 'elp-grid'} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="elp-axis">{fmtNum(v, 0)} €</text>
        </g>
      ))}
      {ticks(range[0], range[1], 6).map((v) => (
        <text key={`x${v}`} x={x(v)} y={H - B + 18} textAnchor="middle" className="elp-axis">{fmtNum(v, 0)} €</text>
      ))}
      <text x={L + iw / 2} y={H - 3} textAnchor="middle" className="elp-axis-title">Prix de vente</text>
      <polygon points={band} className="elp-band" />
      <polyline points={line} className="elp-margin-line" />
      {optIn && optimum !== null && (
        <g>
          <line x1={x(optimum)} x2={x(optimum)} y1={T} y2={T + ih} className="elp-opt-line" />
          <text x={x(optimum) + 5} y={T + 12} className="elp-opt-label">Optimum</text>
        </g>
      )}
      <line x1={x(price)} x2={x(price)} y1={y(cur.margin)} y2={T + ih} className="elp-cur-line" />
      <circle cx={x(price)} cy={y(cur.margin)} r={5} className="elp-cur-dot" />
    </svg>
  );
}
