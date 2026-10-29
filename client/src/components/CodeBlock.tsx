import { Fragment, useMemo, useState } from 'react';
import type { CodeSnippet } from '@atelier/shared';

const KEYWORDS: Record<string, string[]> = {
  r: ['function', 'if', 'else', 'for', 'in', 'while', 'return', 'library', 'TRUE', 'FALSE', 'NULL', 'NA', 'next', 'break'],
  python: ['def', 'return', 'if', 'elif', 'else', 'for', 'in', 'while', 'import', 'from', 'as', 'with', 'lambda', 'True', 'False', 'None', 'and', 'or', 'not', 'try', 'except', 'class'],
  sql: ['SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'JOIN', 'LEFT', 'ON', 'AS', 'COUNT', 'DISTINCT', 'UNION', 'ALL', 'CREATE', 'TABLE'],
  ts: ['const', 'let', 'function', 'return', 'if', 'else', 'for', 'of', 'import', 'from', 'export', 'type', 'interface'],
};

/** Coloration syntaxique minimale (commentaires, chaînes, nombres, mots-clés). */
function highlight(code: string, language: string) {
  const kw = new Set(KEYWORDS[language] ?? []);
  const re = /(#[^\n]*|--[^\n]*|\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_][\w.]*)(\s*\()?|([<>=!]=?|<-|\|>|%>%|[+\-*/])/g;
  const out: { cls?: string; text: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push({ text: code.slice(last, m.index) });
    if (m[1]) {
      // « -- » n'est un commentaire qu'en SQL
      if (m[1].startsWith('--') && language !== 'sql') out.push({ text: m[1] });
      else if (m[1].startsWith('//') && language !== 'ts') out.push({ text: m[1] });
      else out.push({ cls: 'tk-com', text: m[1] });
    } else if (m[2]) out.push({ cls: 'tk-str', text: m[2] });
    else if (m[3]) out.push({ cls: 'tk-num', text: m[3] });
    else if (m[4]) {
      out.push({ cls: kw.has(m[4]) ? 'tk-kw' : m[5] ? 'tk-fn' : undefined, text: m[4] });
      if (m[5]) out.push({ text: m[5] });
    } else if (m[6]) out.push({ cls: 'tk-op', text: m[6] });
    last = re.lastIndex;
  }
  if (last < code.length) out.push({ text: code.slice(last) });
  return out;
}

export function CodeBlock({ snippet, className = '' }: { snippet: CodeSnippet; className?: string }) {
  const tokens = useMemo(() => highlight(snippet.code, snippet.language), [snippet]);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* presse-papiers indisponible */
    }
  };
  return (
    <figure className={`codeblock ${className}`}>
      <figcaption>
        <span className="codeblock-lang">{snippet.language === 'r' ? 'R' : snippet.language === 'python' ? 'Python' : snippet.language.toUpperCase()}</span>
        <span className="codeblock-title">{snippet.title}</span>
        <button type="button" onClick={copy} className="codeblock-copy">
          {copied ? 'Copié ✓' : 'Copier'}
        </button>
      </figcaption>
      <pre>
        <code>
          {tokens.map((t, i) => (t.cls ? <span key={i} className={t.cls}>{t.text}</span> : <Fragment key={i}>{t.text}</Fragment>))}
        </code>
      </pre>
    </figure>
  );
}
