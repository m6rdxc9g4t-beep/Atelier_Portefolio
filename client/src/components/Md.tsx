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
    if (m.index > last) out.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) out.push(<strong key={i++}>{renderInline(m[1])}</strong>);
    else out.push(<em key={i++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return out;
}
