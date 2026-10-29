import { useEffect, useState } from 'react';
import { useInView } from './Reveal';

/**
 * Anime la partie numérique d'une valeur affichée (« 7 043 », « 26,5 % », « 0,756 »…)
 * en conservant préfixe, suffixe et nombre de décimales.
 */
export function CountUp({ value, duration = 1200 }: { value: string; duration?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.5);
  const parsed = parse(value);
  const [shown, setShown] = useState(parsed ? format(parsed, 0) : value);

  useEffect(() => {
    if (!parsed || !inView) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(format(parsed, eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value]);

  return <span ref={ref}>{parsed ? shown : value}</span>;
}

interface Parsed {
  prefix: string;
  suffix: string;
  target: number;
  decimals: number;
  grouped: boolean;
}

function parse(v: string): Parsed | null {
  const m = v.match(/^([^\d−-]*)([−-]?)([\d\s  ]+(?:,\d+)?)(.*)$/u);
  if (!m) return null;
  const [, prefix, sign, num, suffix] = m;
  if (/[a-zA-Z]/.test(prefix) && prefix.trim().length > 2) return null;
  const clean = num.replace(/[\s  ]/g, '');
  const target = Number(clean.replace(',', '.')) * (sign ? -1 : 1);
  if (!Number.isFinite(target)) return null;
  return {
    prefix: prefix + (sign ? '−' : ''),
    suffix,
    target: Math.abs(target),
    decimals: clean.includes(',') ? clean.split(',')[1].length : 0,
    grouped: /[\s  ]/.test(num.trim()),
  };
}

function format(p: Parsed, k: number): string {
  const v = p.target * k;
  const s = v.toLocaleString('fr-FR', {
    minimumFractionDigits: p.decimals,
    maximumFractionDigits: p.decimals,
    useGrouping: p.grouped || p.target >= 10000,
  });
  return `${p.prefix}${s}${p.suffix}`;
}
