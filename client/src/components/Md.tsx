import { Fragment, type ReactNode } from 'react';

/**
 * Mini rendu « markdown » des fiches : **gras** et *italique* uniquement.
 * Le texte est inséré comme du texte React (pas de HTML brut) : aucune injection possible.
 */
export function Md({ text, as: Tag = 'span', className }: { text: string; as?: 'span' | 'p' | 'div' | 'li'; className?: string }) {
  return <Tag className={className}>{renderInline(text)}</Tag>;
}

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={i++}>{protectMath(text.slice(last, m.index))}</Fragment>);
    if (m[1] !== undefined) out.push(<strong key={i++}>{renderInline(m[1])}</strong>);
    else out.push(<em key={i++}>{protectMath(m[2])}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={i++}>{protectMath(text.slice(last))}</Fragment>);
  return out;
}

/**
 * Lettres grecques et symboles indicés (α̂₁, rₜ, x²…) : on les isole dans un <span class="nocaps">
 * pour qu'un text-transform: uppercase du thème ne change pas α en Α ou rₜ en Rₜ.
 */
const MATH = /([A-Za-z\u0370-\u03FF][\u0300-\u036F]*[\u2080-\u209C\u2070-\u207F\u00B2\u00B3\u00B9\u02B0-\u02B8\u02E1-\u02E3]+|[\u0370-\u03FF\u1F00-\u1FFF][\u0300-\u036F]*)/g;

export function protectMath(text: string): ReactNode[] {
  const parts = text.split(MATH);
  return parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="nocaps">{p}</span> : p));
}
