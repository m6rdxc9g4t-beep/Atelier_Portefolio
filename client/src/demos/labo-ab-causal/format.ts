/** Mise en forme des nombres à la française (espaces insécables, virgule décimale, signe moins typographique). */

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max = min): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(key, f);
  }
  return f;
}

const MINUS = '−';
const NBSP = ' ';

/** Nombre avec d décimales ; « — » si non fini. */
export function num(x: number, d = 0): string {
  if (!Number.isFinite(x)) return '—';
  const s = nf(d).format(Math.abs(x) < 0.5 * 10 ** -d ? 0 : x);
  return s.replace('-', MINUS);
}

/** Nombre signé (+ / −). */
export function signed(x: number, d = 0): string {
  if (!Number.isFinite(x)) return '—';
  const s = num(x, d);
  return x > 0 && s !== num(0, d) ? `+${s}` : s;
}

/** Proportion → pourcentage (« 4,40 % »). */
export function pct(x: number, d = 1): string {
  return Number.isFinite(x) ? `${num(x * 100, d)}${NBSP}%` : '—';
}

/** Proportion → pourcentage signé. */
export function signedPct(x: number, d = 1): string {
  return Number.isFinite(x) ? `${signed(x * 100, d)}${NBSP}%` : '—';
}

/** Différence de proportions → points de pourcentage signés (« +0,40 pt »). */
export function pts(x: number, d = 2): string {
  return Number.isFinite(x) ? `${signed(x * 100, d)}${NBSP}pt` : '—';
}

/** p-valeur lisible. */
export function pval(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p < 0.0001) return `<${NBSP}0,0001`;
  if (p < 0.01) return num(p, 4);
  return num(p, 3);
}

/** « p = 0,026 » ou « p < 0,0001 ». */
export function pEq(p: number): string {
  const v = pval(p);
  return v.startsWith('<') ? `p${NBSP}${v}` : `p${NBSP}=${NBSP}${v}`;
}

/** Entier avec séparateur de milliers. */
export function int(x: number): string {
  return num(Math.round(x), 0);
}

/** « 3 jours », « 1 jour ». */
export function plural(n: number, one: string, many: string): string {
  return `${int(n)}${NBSP}${Math.abs(n) >= 2 ? many : one}`;
}

export { NBSP };
