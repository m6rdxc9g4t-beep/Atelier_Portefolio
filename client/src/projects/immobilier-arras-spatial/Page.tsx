import type { Block, Section } from '@atelier/shared';
import type { ProjectResponse } from '../../api';
import { BlockView, SectionBody, findSection } from '../../components/Blocks';
import { Reveal } from '../../components/Reveal';
import { Md } from '../../components/Md';
import { EdAside, EdCard, EdFindings, EdHero, EdLimits, EdPull, EdSection, EdStats, EditorialPage } from '../editorial/Editorial';
import { CadastreDeco } from './Cadastre';
import { AicDots, CoefPlot, ImpactRing, NeumannBars, SectionMap, SizeSimulator, TestDuel, type CoefPlotData, type SectionItem, type SpatialTest } from './Modules';
import { MoranLab } from './MoranLab';
import './style.css';

const NAV = [
  { id: 'contexte', label: 'Contexte' },
  { id: 'carte', label: 'La carte' },
  { id: 'tests', label: 'Effets spatiaux' },
  { id: 'modeles', label: 'Modèles' },
  { id: 'sdem', label: 'SDEM' },
  { id: 'note', label: 'Note théorique' },
  { id: 'conclusion', label: 'Conclusion' },
];

const only = (s: Section | undefined, keep: (b: Block) => boolean): Section | undefined => s && { ...s, blocks: s.blocks.filter(keep) };

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const f = c.figures as Record<string, any>;
  const sec = (id: string) => findSection(c.sections, id);
  const model = c.model as { prediction?: { ols: any; sdem_sections: any } } | undefined;
  const items = (f.sections_mean_price?.items ?? []) as SectionItem[];
  const desc = f.descriptive_stats ?? {};
  const findBlocks = (id: string, type: Block['type']) => sec(id)?.blocks.filter((b) => b.type === type) ?? [];
  const sdemCoefs = model?.prediction?.sdem_sections;
  const figures = (sec('cartes')?.blocks.filter((b) => b.type === 'figure') ?? []) as Extract<Block, { type: 'figure' }>[];

  return (
    <EditorialPage
      project={project}
      className="ar"
      brand={
        <>
          DVF · <b>Immobilier Arras</b>
        </>
      }
      nav={NAV}
      closing="Une dépendance spatiale forte, captée par l’erreur : ce sont les caractéristiques invisibles du quartier qui se propagent."
    >
      <EdHero
        project={project}
        deco={false}
        kicker="Économétrie spatiale — M2 Économétrie appliquée"
        title={
          <>
            <span className="line">Le prix de l’immobilier</span>
            <span className="line">
              a une <em>géographie</em>
            </span>
          </>
        }
        lede={c.question}
        meta={
          <>
            Données · DVF + cadastre Etalab
            <br />
            Commune d’Arras (62041)
            <br />
            2022 – 2025 · N = 1 549
          </>
        }
      >
        <CadastreDeco points={items.map((s) => [s.x_pct, s.y_pct * 0.7] as [number, number])} />
      </EdHero>

      <EdStats kpis={c.kpis.slice(0, 5)} />

      {/* 01 — contexte & données */}
      <EdSection id="contexte" no={1} title="Contexte & données" sub="Le prix d’un bien dépend-il de son voisinage ?">
        <div className="ed-two">
          <Reveal>
            <SectionBody section={sec('contexte')!} />
            <div className="ar-mt">
              <SectionBody section={only(sec('donnees'), (b) => b.type !== 'table')!} />
            </div>
          </Reveal>
          <div className="ar-asides">
            <EdAside
              title="Échantillon final"
              rows={[
                ['Observations', '1 549'],
                ['Rattachées à une section', '100 %'],
                ['Prix moyen', `${(desc.price_m2_mean ?? 4333.77).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €/m²`],
                ['Prix médian', `${(desc.price_m2_median ?? 2765.96).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €/m²`],
                ['Écart-type', `${(desc.price_m2_sd ?? 3838.5).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €/m²`],
                ['Surface moyenne', '49,5 m²'],
                ['Pièces (moyenne)', '2,14'],
                ['Variable expliquée', 'log(prix/m²)'],
              ]}
            />
            <Reveal className="ar-skew">
              <div className="ar-skew-t">Une distribution asymétrique</div>
              <div className="ar-skew-row">
                <span>Moyenne</span>
                <i style={{ width: `${(4334 / 4334) * 100}%` }} />
                <b>4 334 €</b>
              </div>
              <div className="ar-skew-row med">
                <span>Médiane</span>
                <i style={{ width: `${(2766 / 4334) * 100}%` }} />
                <b>2 766 €</b>
              </div>
              <p>Quelques ventes très chères tirent la moyenne vers le haut : le modèle explique donc le logarithme du prix au m².</p>
            </Reveal>
          </div>
        </div>
      </EdSection>

      {/* 02 — carte */}
      <EdSection id="carte" no={2} title="Des prix qui dessinent des quartiers" sub="DVF géolocalisé + sections cadastrales">
        <Reveal>
          <SectionMap items={items} src={figures[1] ? `/${figures[1].src}` : '/img/immobilier-arras-spatial/fig-2.png'} mean={4334} median={2766} />
        </Reveal>
        <div className="ed-two ar-mt-lg">
          <Reveal>
            {findBlocks('cartes', 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
            {findBlocks('cartes', 'callout').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
          {figures[0] && (
            <Reveal className="ar-fig">
              <BlockView block={figures[0]} />
            </Reveal>
          )}
        </div>
      </EdSection>

      {/* 03 — tests */}
      <EdSection id="tests" no={3} title="Une structure spatiale nette" sub="Du modèle de référence aux tests sur ses résidus">
        <div className="ed-two">
          <Reveal>
            <SectionBody
              section={
                only(
                  sec('methode'),
                  (b) =>
                    (b.type === 'text' && !b.md.includes('matrices de poids') && !b.md.includes('comparés par leur AIC')) ||
                    (b.type === 'formula' && !!b.caption?.startsWith('Modèle de référence')),
                )!
              }
            />
          </Reveal>
          <Reveal className="ar-ols-read">
            <div className="ar-chart-cap">Lecture de l’OLS</div>
            <SectionBody section={only(sec('ols'), (b) => b.type === 'text')!} />
          </Reveal>
        </div>
        <Reveal className="ar-mt">
          <SectionBody section={only(sec('ols'), (b) => b.type === 'table')!} />
        </Reveal>
        <EdCard title="Lag ou erreur ? Les tests de Rao tranchent" sub="Statistiques sur les résidus OLS, selon la matrice de poids" className="ar-mt-lg">
          <TestDuel tests={(f.spatial_tests?.tests ?? []) as SpatialTest[]} />
        </EdCard>
        <Reveal className="ar-mt">
          {findBlocks('tests', 'text').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
          {findBlocks('tests', 'callout').map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Reveal>
        <EdCard title="Laboratoire : l’I de Moran à la main" sub="Peignez une ville fictive et regardez l’indice réagir" className="ar-mt-lg">
          <MoranLab />
        </EdCard>
      </EdSection>

      {/* 04 — modèles */}
      <EdSection id="modeles" no={4} title="Trois modèles spatiaux, deux voisinages" sub="SAR, SEM, SDEM — W kNN et W sections">
        <div className="ar-models">
          {findBlocks('methode', 'formula')
            .filter((b) => b.type === 'formula' && !b.caption?.startsWith('Modèle de référence'))
            .map((b, i) => (
              <Reveal key={i} className="ar-model-card" delay={i * 80}>
                <span className="tag">{['SAR', 'SEM', 'SDEM'][i] ?? ''}</span>
                <BlockView block={b} />
              </Reveal>
            ))}
        </div>
        <div className="ed-two ar-mt-lg">
          <Reveal>
            {findBlocks('methode', 'text')
              .filter((b) => b.type === 'text' && (b.md.includes('matrices de poids') || b.md.includes('comparés par leur AIC')))
              .map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
          </Reveal>
          <Reveal>
            {findBlocks('aic', 'text').map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </Reveal>
        </div>
        <EdCard title="AIC par modèle et par matrice de poids" sub="Diagramme en points — l’échelle commence à 1 950" className="ar-mt">
          <AicDots models={f.aic.models} knn={f.aic.knn} sections={f.aic.sections} />
        </EdCard>
      </EdSection>

      {/* 05 — SDEM */}
      <EdSection id="sdem" no={5} title="Le modèle retenu : SDEM" sub="Spatial Durbin Error Model — W sections">
        <Reveal>
          <SectionBody section={only(sec('sdem'), (b) => b.type === 'formula')!} />
        </Reveal>
        <div className="ed-two ar-mt">
          <Reveal>
            <SectionBody section={only(sec('sdem'), (b) => b.type === 'text')!} />
          </Reveal>
          <div>
            <Reveal className="ar-lambda">
              <span>
                <span className="nocaps">λ</span> — autocorrélation spatiale de l’erreur
              </span>
              <strong>0,774</strong>
              <div className="ar-lambda-bar">
                <i style={{ width: '77.4%' }} />
              </div>
              <small>écart-type 0,021 · z = 37,09 · p &lt; 2,2 × 10⁻¹⁶</small>
            </Reveal>
            {findBlocks('sdem', 'callout').map((b, i) => (
              <Reveal key={i} className="ar-mt">
                <BlockView block={b} />
              </Reveal>
            ))}
          </div>
        </div>
        <EdCard title="Coefficients et intervalles à 95 %" sub="OLS vs SDEM (W sections), hors constante" className="ar-mt-lg">
          <CoefPlot data={f.coef_plot as CoefPlotData} />
        </EdCard>
        <Reveal className="ar-mt">{findBlocks('sdem', 'table').map((b, i) => <BlockView key={i} block={b} />)}</Reveal>
        {model?.prediction && (
          <EdCard title="L’effet de taille, en euros" sub="Lecture des coefficients publiés : prix au m² ajusté selon la surface et les pièces" className="ar-mt-lg">
            <SizeSimulator ols={model.prediction.ols} sdem={model.prediction.sdem_sections} />
          </EdCard>
        )}
        <EdFindings
          items={[
            { title: 'L’effet de taille domine', text: 'À pièces données, +1 % de surface réduit le prix au m² d’environ **0,65 %** : les grands logements sont moins chers au m².' },
            { title: 'La typologie compte', text: 'À surface comparable, une pièce de plus est associée à un log(prix/m²) plus élevé de **0,091**, significatif (p = 0,00038).' },
            { title: 'Le quartier, via l’erreur', text: '**λ = 0,774**, très significatif : les chocs non observés (aménités, accessibilité, bruit) sont fortement corrélés dans l’espace.' },
          ]}
        />
      </EdSection>

      {/* 06 — note théorique */}
      <EdSection id="note" no={6} title="Note théorique : le SDEM et sa matrice d’impacts" sub="Exercice individuel de François Pichon (partie 4)">
        <NoteTheorique section={sec('note-theorique')} lambdaHat={0.77421} sdem={sdemCoefs} />
      </EdSection>

      {/* 07 — conclusion */}
      <EdSection id="conclusion" no={7} title="À retenir" sub="Ce que disent les données d’Arras">
        <EdPull>
          « L’effet spatial s’exprime surtout par <em>l’erreur</em> : ce sont les caractéristiques invisibles du quartier qui se propagent. »
        </EdPull>
        <EdLimits items={c.conclusions} />
      </EdSection>
    </EditorialPage>
  );
}

/** Note théorique : formules par étapes (a)–(d), série de Neumann et matrice d'impacts illustrées. */
function NoteTheorique({ section, lambdaHat, sdem }: { section: Section | undefined; lambdaHat: number; sdem?: { lsurf: number; w_lsurf: number; pieces: number; w_pieces: number } }) {
  if (!section) return null;
  // découpe des blocs en étapes à partir des paragraphes « (a) … », « (b) … »
  const steps: { title: string; blocks: Block[] }[] = [];
  const intro: Block[] = [];
  section.blocks.forEach((b) => {
    const m = b.type === 'text' ? b.md.match(/^\*\*\(([a-d])\)\s*([^*]+)\*\*/) : null;
    if (m) steps.push({ title: `(${m[1]}) ${m[2].replace(/\.$/, '')}`, blocks: [b] });
    else if (steps.length) steps[steps.length - 1].blocks.push(b);
    else intro.push(b);
  });
  return (
    <>
      <Reveal className="ar-note-intro">
        {intro.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </Reveal>
      <div className="ar-steps">
        {steps.map((s, i) => (
          <Reveal key={s.title} className="ar-step" delay={i * 60}>
            <div className="ar-step-head">
              <span>{String.fromCharCode(97 + i)}</span>
              <Md as="div" text={s.title.replace(/^\([a-d]\)\s*/, '')} />
            </div>
            <div className="blk-stack">
              {s.blocks.map((b, k) => (
                <BlockView key={k} block={k === 0 && b.type === 'text' ? { ...b, md: b.md.replace(/^\*\*\([a-d]\)[^*]+\*\*\s*/, '') } : b} />
              ))}
            </div>
            {i === 1 && (
              <div className="ar-step-lab">
                <div className="ar-chart-cap">Propagation d’un choc : poids des ordres de voisinage (calcul)</div>
                <NeumannBars lambdaHat={lambdaHat} />
              </div>
            )}
            {i === 2 && sdem && (
              <div className="ar-step-lab ed-grid2">
                <div>
                  <div className="ar-chart-cap">log(surface) : β = −0,647 ; θ = −0,432</div>
                  <ImpactRing beta={sdem.lsurf} theta={sdem.w_lsurf} label="log(surface)" />
                </div>
                <div>
                  <div className="ar-chart-cap">Pièces : β = 0,091 ; θ = 0,213</div>
                  <ImpactRing beta={sdem.pieces} theta={sdem.w_pieces} label="du nombre de pièces" />
                </div>
              </div>
            )}
          </Reveal>
        ))}
      </div>
    </>
  );
}
