import type { Block, Section } from '@atelier/shared';
import { Md } from './Md';
import { Formula } from './Formula';
import { Reveal } from './Reveal';
import './blocks.css';

/** Rendu d'un bloc de fiche (texte, liste, tableau, formule, figure, encadré). */
export function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return <Md as="p" className="blk-text" text={block.md} />;
    case 'list':
      return (
        <ul className="blk-list">
          {block.items.map((it, i) => (
            <Md key={i} as="li" text={it} />
          ))}
        </ul>
      );
    case 'callout':
      return (
        <div className="blk-callout">
          <Md text={block.md} />
        </div>
      );
    case 'formula':
      return (
        <figure className="blk-formula">
          <Formula tex={block.tex} />
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    case 'figure':
      return (
        <figure className="blk-figure">
          <img src={`/${block.src.replace(/^\//, '')}`} alt={block.caption} loading="lazy" />
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
    case 'table':
      return (
        <figure className="blk-table">
          {block.title && <figcaption className="blk-table-title">{block.title}</figcaption>}
          <div className="blk-table-scroll">
            <table>
              <thead>
                <tr>
                  {block.columns.map((c, i) => (
                    <th key={i} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (j === 0 ? <th key={j} scope="row"><Md text={cell} /></th> : <td key={j}><Md text={cell} /></td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.note && <p className="blk-note">{block.note}</p>}
        </figure>
      );
    default:
      return null;
  }
}

export function SectionBody({ section }: { section: Section }) {
  return (
    <div className="blk-stack">
      {section.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

/** Sections numérotées « 01 · Titre » avec leurs blocs, pour les gabarits éditoriaux. */
export function Sections({ sections, start = 1, skip = [] }: { sections: Section[]; start?: number; skip?: string[] }) {
  return (
    <>
      {sections
        .filter((s) => !skip.includes(s.id))
        .map((s, i) => (
          <section key={s.id} id={s.id} className="blk-section">
            <Reveal className="blk-section-head">
              <span className="blk-section-no">{String(i + start).padStart(2, '0')}</span>
              <h2>{s.title}</h2>
            </Reveal>
            <Reveal>
              <SectionBody section={s} />
            </Reveal>
          </section>
        ))}
    </>
  );
}

export function findSection(sections: Section[], ...ids: string[]): Section | undefined {
  return sections.find((s) => ids.includes(s.id));
}
