import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** Formule LaTeX rendue par KaTeX (sortie HTML générée par la bibliothèque, entrée = fiches du dépôt). */
export function Formula({ tex, display = true, className = '' }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (!html) return <code className={className}>{tex}</code>;
  return <span className={`formula ${display ? 'formula-block' : ''} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
