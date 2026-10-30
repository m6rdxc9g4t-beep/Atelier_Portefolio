import { useMemo, useState } from 'react';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import { fmt, type Block } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { Reveal } from '../../components/Reveal';
import { Md } from '../../components/Md';
import { BlockView, findSection } from '../../components/Blocks';
import { HBars } from '../../components/charts';
import { EdCard, EdHero, EdSection, EdStats, EditorialPage } from '../editorial/Editorial';
import { ReviewLab } from './ReviewLab';
import './style.css';

type FamKey = 'service_personnel' | 'nourriture' | 'environnement' | 'prix';

interface Cloud {
  words: string[];
  relSize: number[];
  vertical?: boolean[];
}
interface Afc {
  families: { key: FamKey; label: string; dim1: number; dim2: number }[];
  words: { word: string; dim1: number; dim2: number }[];
}

const FAMS: FamKey[] = ['service_personnel', 'nourriture', 'environnement', 'prix'];
const FAM_COLOR: Record<FamKey, string> = { service_personnel: '#e30613', nourriture: '#b78a2e', environnement: '#2e7d52', prix: '#3b5bdb' };

const NAV = [
  { id: 'corpus', label: 'Corpus' },
  { id: 'polarite', label: 'Polarité' },
  { id: 'nuages', label: 'Nuages' },
  { id: 'familles', label: 'Familles' },
  { id: 'afc', label: 'AFC' },
  { id: 'adjectifs', label: 'Adjectifs' },
  { id: 'axes', label: 'Axes' },
];

const blocksOf = (b: Block[] | undefined, ...types: Block['type'][]) => (b ?? []).filter((x) => types.includes(x.type));

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const sec = (id: string) => findSection(c.sections, id)?.blocks;
  const prep = blocksOf(sec('donnees'), 'list')[0];
  const fig = (n: number) => c.sections.flatMap((s) => s.blocks).find((b) => b.type === 'figure' && b.src.endsWith(`fig-${n}.png`));
  const polarity = c.model as { polarity?: Record<string, string[]> } | undefined;

  return (
    <EditorialPage
      project={project}
      className="fl"
      brand={
        <>
          <span className="fl-pill">avis</span> <b>Analyse textuelle</b>
        </>
      }
      nav={NAV}
      closing={<>Le service fait revenir les clients ; l’assiette décide de ce qu’ils écrivent.</>}
    >
      <EdHero
        project={project}
        kicker={`${c.course} · ${c.date}`}
        title={
          <>
            <span className="line">Ce que disent</span>
            <span className="line">
              <em>24 800 avis</em>
            </span>
            <span className="line">de clients.</span>
          </>
        }
        lede={c.subtitle + '.'}
        meta={<>{c.tools.slice(0, 4).join(' · ')}</>}
        deco={false}
      >
        <div className="fl-plate" aria-hidden />
      </EdHero>
      <EdStats kpis={c.kpis.slice(0, 5)} />

      {/* 01 — corpus */}
      <EdSection id="corpus" no={1} title="Du commentaire brut au lemme" sub="24 800 avis nettoyés avant toute analyse">
        <div className="ed-two">
          <div className="blk-stack">
            {blocksOf(sec('contexte'), 'text', 'list').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          <EdCard title="La question" sub="Problématique du projet">
            <Md as="p" className="fl-question" text={c.question} />
          </EdCard>
        </div>
        {prep?.type === 'list' && (
          <Reveal className="fl-flow fl-flow-5">
            {prep.items.map((it, i) => (
              <div key={i} className="fl-step">
                <div className="k">Étape {i + 1}</div>
                <div className="dash" />
                <Md as="p" text={it} />
              </div>
            ))}
          </Reveal>
        )}
        <div className="fl-mt">
          {blocksOf(sec('donnees'), 'callout').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      </EdSection>

      {/* 02 — polarité */}
      <EdSection id="polarite" no={2} title="Deux avis sur trois sont positifs" sub="Un score de −1 à 1 par avis">
        <Reveal className="fl-split">
          <div className="fl-stack" role="img" aria-label="67 % d'avis positifs, 33 % d'avis négatifs">
            <i style={{ flex: 67, background: '#2e7d52' }}>16 621 positifs · 67 %</i>
            <i style={{ flex: 33, background: 'var(--ed-accent)' }}>8 179 négatifs · 33 %</i>
          </div>
        </Reveal>
        <div className="ed-two fl-mt">
          <div className="blk-stack">
            {blocksOf(sec('polarite'), 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
            {blocksOf(sec('polarite'), 'formula').map((b, i) => (
              <BlockView key={`f${i}`} block={b} />
            ))}
          </div>
          <div className="fl-receipts">
            {(f.scoreExamples.items as { score: number; label: string; text: string }[]).map((ex) => (
              <Reveal key={ex.score} className={`fl-receipt ${ex.score < 0 ? 'neg' : 'pos'}`}>
                <div className="fl-receipt-head">
                  <span>Avis lemmatisé</span>
                  <b>
                    score {ex.score > 0 ? '+' : '−'}
                    {Math.abs(ex.score)}
                  </b>
                </div>
                <p>« {ex.text} »</p>
                <div className="fl-receipt-foot">{ex.label}</div>
              </Reveal>
            ))}
            <p className="fl-note">Les deux exemples extrêmes cités par le rapport, reproduits tels quels (fautes comprises).</p>
          </div>
        </div>
        <h3 className="fl-h3">À vous : classez un avis</h3>
        <p className="fl-lab-intro">
          Démo simplifiée : les familles reprennent le dictionnaire du code du projet (<code>dico_fam</code>) ; la polarité suit un petit lexique d’adjectifs tirés du rapport.
          Ce n’est pas le score textblob-fr du projet, seulement une illustration de la démarche.
        </p>
        <ReviewLab />
      </EdSection>

      {/* 03 — nuages */}
      <EdSection id="nuages" no={3} title="Les mots qui reviennent" sub="Nuages de mots : global, positifs, négatifs">
        <WordClouds f={f} />
        <div className="ed-two fl-mt">
          <div className="blk-stack">
            {blocksOf(sec('nuages'), 'text', 'list').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          {fig(1) && <BlockView block={fig(1)!} />}
        </div>
      </EdSection>

      {/* 04 — familles */}
      <EdSection id="familles" no={4} title="Quatre familles thématiques" sub="Service, nourriture, environnement, prix">
        <div className="blk-stack fl-intro">
          {blocksOf(sec('familles'), 'text').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
        <Families f={f} />
        <div className="ed-two fl-mt">
          <div className="blk-stack">
            {blocksOf(sec('familles'), 'list').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          {fig(2) && <BlockView block={fig(2)!} />}
        </div>
      </EdSection>

      {/* 05 — AFC */}
      <EdSection id="afc" no={5} title="Une carte des mots et des familles" sub="Analyse factorielle des correspondances · 72,2 % de l’inertie">
        <div className="ed-two">
          <AfcMap afc={f.afcCoordinates as Afc} />
          <div className="blk-stack">
            {blocksOf(sec('afc'), 'text', 'list', 'callout').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
        </div>
      </EdSection>

      {/* 06 — adjectifs */}
      <EdSection id="adjectifs" no={6} title="Les adjectifs trahissent le ressenti" sub="Fréquence relative, l’adjectif n° 1 de chaque famille = 100">
        <Adjectives f={f} polarity={polarity?.polarity} />
        <div className="ed-two fl-mt">
          <div className="blk-stack">
            {blocksOf(sec('adjectifs'), 'text', 'callout').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          {fig(4) && <BlockView block={fig(4)!} />}
        </div>
      </EdSection>

      {/* 07 — axes d'amélioration */}
      <EdSection id="axes" no={7} title="Les axes d’amélioration" sub="Ce que Flunch peut faire de ces avis">
        <div className="ed-two">
          <div className="blk-stack">
            {blocksOf(sec('conclusion'), 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          <Reveal className="fl-menu">
            <div className="fl-menu-head">
              <span>Au menu des priorités</span>
            </div>
            {(blocksOf(sec('conclusion'), 'list')[0] as Extract<Block, { type: 'list' }> | undefined)?.items.map((it, i) => (
              <div key={i} className="fl-menu-row">
                <span className="n">{i + 1}</span>
                <Md as="p" text={it} />
              </div>
            ))}
          </Reveal>
        </div>
        <h3 className="fl-h3">En bref</h3>
        <ol className="fl-concl">
          {c.conclusions.map((t, i) => (
            <Reveal as="li" key={i} delay={i * 40}>
              <Md text={t} />
            </Reveal>
          ))}
        </ol>
      </EdSection>
    </EditorialPage>
  );
}

/* ───────── Nuages de mots (tailles relatives mesurées sur les images du rapport) ───────── */
function WordClouds({ f }: { f: Record<string, any> }) {
  const tabs = [
    { id: 'wordcloudGlobal', label: 'Tous les avis' },
    { id: 'wordcloudPositive', label: 'Avis positifs' },
    { id: 'wordcloudNegative', label: 'Avis négatifs' },
  ];
  const [tab, setTab] = useState(tabs[0].id);
  const cloud = f[tab] as Cloud;
  // ordre « nuage » : le plus gros au centre, les autres de part et d'autre
  const order = useMemo(() => {
    const idx = cloud.words.map((_, i) => i);
    const out: number[] = [];
    idx.forEach((i, k) => (k % 2 === 0 ? out.push(i) : out.unshift(i)));
    return out;
  }, [cloud]);
  return (
    <Reveal>
      <div className="fl-tabs" role="tablist" aria-label="Nuage affiché">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={`fl-cloud ${tab === 'wordcloudNegative' ? 'is-neg' : tab === 'wordcloudPositive' ? 'is-pos' : ''}`} aria-label="Nuage de mots">
        {order.map((i) => (
          <span
            key={`${tab}-${cloud.words[i]}`}
            style={{ fontSize: `${14 + cloud.relSize[i] * 46}px`, opacity: 0.55 + cloud.relSize[i] * 0.45 }}
            title={`taille relative ${fmt(cloud.relSize[i], 2, 2)}`}
          >
            {cloud.words[i]}
          </span>
        ))}
      </div>
      <p className="fl-note">Tailles relatives mesurées sur les nuages du rapport (indicateur visuel de fréquence, pas un effectif).</p>
    </Reveal>
  );
}

/* ───────── Mots les plus fréquents par famille ───────── */
function Families({ f }: { f: Record<string, any> }) {
  const [fam, setFam] = useState<FamKey>('service_personnel');
  const s = f.familyTopWords.series[fam] as { label: string; words: string[]; counts: number[] };
  const tone = (f.families.tone as string[])[(f.families.keys as string[]).indexOf(fam)];
  return (
    <Reveal className="fl-fam">
      <div className="fl-tabs" role="tablist" aria-label="Famille thématique">
        {FAMS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={fam === k}
            className={fam === k ? 'is-on' : ''}
            style={fam === k ? { background: FAM_COLOR[k], borderColor: FAM_COLOR[k] } : undefined}
            onClick={() => setFam(k)}
          >
            {f.familyTopWords.series[k].label}
          </button>
        ))}
      </div>
      <div className="fl-fam-grid">
        <div className="fl-fam-card" style={{ ['--fam' as string]: FAM_COLOR[fam] }}>
          <span className="lab">Famille</span>
          <strong>{s.label}</strong>
          <span className="lab">Tonalité dans le rapport</span>
          <em>{tone}</em>
          <span className="lab">Mot n° 1</span>
          <b>
            {s.words[0]} · ≈ {fmt(s.counts[0])}
          </b>
        </div>
        <HBars
          className="fl-hbars"
          data={s.words.slice(0, 12).map((w, i) => ({ label: w, value: s.counts[i], display: `≈ ${fmt(s.counts[i])}`, color: w === 'bon' ? '#c9bfae' : FAM_COLOR[fam] }))}
        />
      </div>
      <p className="fl-note">Occurrences lues sur le graphique du rapport (valeurs approchées) ; « bon », omniprésent, est grisé.</p>
    </Reveal>
  );
}

/* ───────── Carte de l'AFC ───────── */
function AfcMap({ afc }: { afc: Afc }) {
  const [hover, setHover] = useState<string | null>(null);
  // mots superposés sur le graphique du rapport : regroupés en un seul point
  const groups = useMemo(() => {
    const m = new Map<string, { dim1: number; dim2: number; words: string[] }>();
    afc.words.forEach((w) => {
      const k = `${w.dim1}|${w.dim2}`;
      const g = m.get(k) ?? { dim1: w.dim1, dim2: w.dim2, words: [] };
      g.words.push(w.word);
      m.set(k, g);
    });
    return [...m.values()];
  }, [afc]);
  const all = [...groups, ...afc.families];
  const xs = all.map((p) => p.dim1);
  const ys = all.map((p) => p.dim2);
  const [x0, x1] = [Math.min(...xs) - 0.25, Math.max(...xs) + 0.25];
  const [y0, y1] = [Math.min(...ys) - 0.2, Math.max(...ys) + 0.2];
  const W = 560;
  const H = 440;
  const X = (v: number) => 30 + ((v - x0) / (x1 - x0)) * (W - 60);
  const Y = (v: number) => 20 + ((y1 - v) / (y1 - y0)) * (H - 50);
  const active = groups.find((g) => g.words.join() === hover);
  // étiquettes : on n'affiche que celles qui ne se chevauchent pas (les autres apparaissent au survol)
  const labelled = useMemo(() => {
    const placed: { x: number; y: number }[] = afc.families.map((fm) => ({ x: X(fm.dim1), y: Y(fm.dim2) + 18 }));
    const keep = new Set<string>();
    [...groups]
      .sort((a, b) => b.words.length - a.words.length)
      .forEach((g) => {
        const p = { x: X(g.dim1), y: Y(g.dim2) };
        if (placed.every((q) => Math.abs(q.x - p.x) > 64 || Math.abs(q.y - p.y) > 14)) {
          keep.add(g.words.join());
          placed.push(p);
        }
      });
    return keep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, afc]);
  return (
    <Reveal className="fl-afc">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="AFC mots × familles, axes 1 et 2">
        <line x1={X(x0)} x2={X(x1)} y1={Y(0)} y2={Y(0)} className="ax" />
        <line x1={X(0)} x2={X(0)} y1={Y(y0)} y2={Y(y1)} className="ax" />
        <text x={X(x1) - 4} y={Y(0) - 6} textAnchor="end" className="axl">
          Axe 1 · 39 %
        </text>
        <text x={X(0) + 6} y={Y(y1) + 12} className="axl">
          Axe 2 · 33,2 %
        </text>
        {groups.map((g) => {
          const k = g.words.join();
          return (
            <g key={k} className={`w ${hover === k ? 'on' : ''}`} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(k)} onBlur={() => setHover(null)}>
              <circle cx={X(g.dim1)} cy={Y(g.dim2)} r={4 + Math.min(g.words.length, 8)} />
              {(labelled.has(k) || hover === k) && (
                <text x={X(g.dim1) + 10 + Math.min(g.words.length, 8)} y={Y(g.dim2) + 4} className={hover === k ? 'top' : ''}>
                  {g.words[0]}
                  {g.words.length > 1 ? ` +${g.words.length - 1}` : ''}
                </text>
              )}
            </g>
          );
        })}
        {afc.families.map((fm) => (
          <g key={fm.key} className="fam">
            <path d={`M${X(fm.dim1)} ${Y(fm.dim2) - 10} l9 15 h-18 z`} fill={FAM_COLOR[fm.key]} />
            <text x={X(fm.dim1)} y={Y(fm.dim2) + 22} textAnchor="middle" fill={FAM_COLOR[fm.key]}>
              {fm.label}
            </text>
          </g>
        ))}
      </svg>
      <p className="fl-afc-read" aria-live="polite">
        {active ? (
          <>
            <b>{active.words.join(', ')}</b> — coordonnées ≈ ({fmt(active.dim1, 2, 2)} ; {fmt(active.dim2, 2, 2)})
          </>
        ) : (
          <>Survolez un point : les mots superposés sur la carte du rapport sont regroupés. Coordonnées lues sur le graphique (≈ ± 0,01).</>
        )}
      </p>
    </Reveal>
  );
}

/* ───────── Adjectifs par famille ───────── */
function Adjectives({ f, polarity }: { f: Record<string, any>; polarity?: Record<string, string[]> }) {
  const pos = new Set([...(polarity?.positiveCited ?? []), ...(polarity?.positiveOther ?? [])]);
  const neg = new Set([...(polarity?.negativeCited ?? []), ...(polarity?.negativeOther ?? [])]);
  const color = (w: string) => (pos.has(w) ? '#2e7d52' : neg.has(w) ? 'var(--ed-accent)' : '#b9ad99');
  return (
    <Reveal className="fl-adj">
      {FAMS.map((k) => {
        const s = f.adjectivesByFamily.series[k] as { label: string; words: string[]; relFreq: number[] };
        return (
          <div key={k} className="fl-adj-col">
            <h4 style={{ color: FAM_COLOR[k] }}>{s.label}</h4>
            <ul>
              {s.words.slice(0, 10).map((w, i) => (
                <li key={w} title={`indice ≈ ${fmt(s.relFreq[i], 1)}`}>
                  <span className="w">{w}</span>
                  <span className="bar">
                    <i style={{ width: `${s.relFreq[i]}%`, background: color(w) }} />
                  </span>
                  <span className="v">{fmt(s.relFreq[i], 0)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="fl-note fl-adj-legend">
        <i style={{ background: '#2e7d52' }} /> positif <i style={{ background: 'var(--ed-accent)' }} /> négatif <i style={{ background: '#b9ad99' }} /> neutre ou mitigé — indices lus sur le
        graphique du rapport ; couleur selon le sens usuel de l’adjectif.
      </p>
    </Reveal>
  );
}

