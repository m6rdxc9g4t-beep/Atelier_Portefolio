/** Mise en forme française des nombres (espace fine insécable, virgule décimale). */

const cache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(key, f);
  }
  return f;
}

export function fmt(x: number, decimals = 0, minDecimals = decimals): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '—';
  return nf(minDecimals, decimals).format(x);
}

export function fmtPct(x: number, decimals = 1): string {
  return `${fmt(x * 100, decimals)} %`;
}

/** Notation scientifique lisible : 3,789 × 10⁻⁴. */
export function fmtSci(x: number, digits = 3): string {
  if (x === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(x)));
  const mant = x / Math.pow(10, exp);
  const sup: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const e = String(exp)
    .split('')
    .map((c) => sup[c] ?? c)
    .join('');
  return `${fmt(mant, digits, digits)} × 10${e}`;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
