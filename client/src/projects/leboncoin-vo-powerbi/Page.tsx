import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import type { ProjectResponse } from '../../api';
import { BackToPortfolio, ProjectEnd } from '../../components/ProjectEnd';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { Md } from '../../components/Md';
import { SectionBody, findSection } from '../../components/Blocks';
import { PowerBIEmbed } from '../../components/PowerBIEmbed';
import { StarSchema, type Table } from './StarSchema';
import { QualityTester } from './QualityTester';
import './style.css';

/** Schéma repris du notebook Databricks du projet (architecture médaillon bronze → silver). */
const NOTEBOOK_SCHEMA: { fact: Table; dimensions: Table[] } = {
  fact: {
    name: 'fact_listing',
    role: 'une ligne = une annonce',
    columns: ['listing_id', 'date_id', 'vehicle_id', 'seller_id', 'location_id', 'price_eur', 'mileage_km', 'posted_ts', 'is_suspicious_price'],
  },
  dimensions: [
    { name: 'dim_vehicle', key: 'vehicle_id', role: 'le véhicule', columns: ['vehicle_id', 'brand', 'model', 'registration_year', 'fuel_label', 'gearbox_label', 'horsepower', 'critair'] },
    { name: 'dim_seller', key: 'seller_id', role: 'le vendeur', columns: ['seller_id', 'seller_label', 'store_name', 'rating_score', 'rating_count'] },
    { name: 'dim_location', key: 'location_id', role: 'le lieu', columns: ['location_id', 'postal_code', 'city', 'department_code'] },
    { name: 'dim_date', key: 'date_id', role: 'la date de publication', columns: ['date_id', 'date', 'year', 'month', 'week_of_year', 'year_month'] },
  ],
};

interface StarFigure {
  facts?: { name: string; columns: string[] }[];
  dimensions?: { name: string; key: string; columns: string[] }[];
}

function schemaFrom(fig: StarFigure | undefined) {
  if (!fig?.facts?.length || !fig.dimensions?.length) return NOTEBOOK_SCHEMA;
  const roles: Record<string, string> = Object.fromEntries(NOTEBOOK_SCHEMA.dimensions.map((d) => [d.name, d.role ?? '']));
  return {
    fact: { name: fig.facts[0].name, columns: fig.facts[0].columns, role: NOTEBOOK_SCHEMA.fact.role },
    dimensions: fig.dimensions.slice(0, 6).map((d) => ({ ...d, role: roles[d.name] })),
  };
}

interface Layer {
  couche: string;
  table: string;
  role: string;
}
interface Rule {
  prix_max_eur: number;
  regex: string;
  mots_cles: string[];
}

export default function Page({ project }: { project: ProjectResponse }) {
  const c = project.content;
  const schema = schemaFrom(c.figures.starSchema as StarFigure | undefined);
  const pipeline = (c.figures.pipeline as Layer[] | undefined) ?? [];
  const rule = c.figures.regle_qualite as Rule;
  const blocks = (id: string) => findSection(c.sections, id)?.blocks ?? [];
  return (
    <div className="lbc">
      <header className="lbc-top">
        <div className="lbc-wrap lbc-top-in">
          <span className="lbc-brand">
            <i>VO</i> Marché de l’occasion · Lille
          </span>
          <div className="lbc-search" aria-hidden>
            🔍 Rechercher « véhicule d’occasion, région lilloise »
          </div>
          <BackToPortfolio />
        </div>
      </header>

      <div className="lbc-wrap">
        <section className="lbc-hero">
          <div>
            <div className="lbc-crumbs">
              Accueil › Véhicules › <b>Architecture décisionnelle</b>
            </div>
            <Reveal as="h1">
              {c.title.split('—')[0]}
              <span>{c.title.includes('—') ? `— ${c.title.split('—').slice(1).join('—')}` : ''}</span>
            </Reveal>
            <Reveal as="p" className="lbc-lede" delay={80}>
              {c.abstract}
            </Reveal>
          </div>
          <Reveal className="lbc-ad" delay={120}>
            <div className="lbc-ad-img" aria-hidden>
              <span>Projet · {c.level}</span>
              🚗
            </div>
            <div className="lbc-ad-body">
              <h3>{c.subtitle}</h3>
              <div className="lbc-ad-price">Power BI · PySpark</div>
              <div className="lbc-ad-meta">
                {c.tools.slice(0, 5).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="lbc-ad-foot">
                <span>{c.authors.join(' · ')}</span>
                <span>{c.date}</span>
              </div>
            </div>
          </Reveal>
        </section>

        <Reveal className="lbc-kpis">
          {c.kpis.slice(0, 4).map((k) => (
            <div key={k.label} className="lbc-kpi" title={k.note}>
              <strong>
                <CountUp value={k.value} />
              </strong>
              <span>{k.label}</span>
            </div>
          ))}
        </Reveal>

        <section className="lbc-sec lbc-context">
          <div className="lbc-grid2">
            <Reveal className="lbc-panel">
              <h3 className="lbc-h3">Le projet</h3>
              <SectionBody section={{ id: 'contexte', title: '', blocks: blocks('contexte') }} />
            </Reveal>
            <Reveal className="lbc-panel lbc-question">
              <h3 className="lbc-h3">La question</h3>
              <Md as="p" text={c.question} />
            </Reveal>
          </div>
        </section>

        <section className="lbc-sec">
          <h2>Du fichier brut au modèle en étoile</h2>
          <p className="lbc-sub">Le pipeline du notebook Databricks (architecture médaillon) : chaque couche écrit une table Delta, chaque table a une clé stable.</p>
          <div className="lbc-pipeline">
            {pipeline.map((st, i) => (
              <Reveal key={st.couche} className="lbc-stage" delay={i * 60}>
                <small>{st.couche}</small>
                <h4>
                  <code>{st.table}</code>
                </h4>
                <p>{st.role}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="lbc-panel lbc-mt">
            <SectionBody section={{ id: 'pipeline-details', title: '', blocks: blocks('pipeline').filter((b) => b.type !== 'table' || b.title !== 'Couches de données') }} />
          </Reveal>
        </section>

        <section className="lbc-sec">
          <h2>Repérer les annonces non comparables</h2>
          <p className="lbc-sub">La règle is_suspicious_price du notebook, appliquée en direct : saisissez une annonce.</p>
          <div className="lbc-grid2">
            <Reveal className="lbc-panel">
              <SectionBody section={{ id: 'qualite', title: '', blocks: blocks('qualite') }} />
            </Reveal>
            <QualityTester rule={rule} />
          </div>
        </section>

        <section className="lbc-sec">
          <h2>Le schéma en étoile</h2>
          <p className="lbc-sub">Survolez une dimension : sa clé s’allume dans la table de faits.</p>
          <Reveal className="lbc-panel">
            <StarSchema fact={schema.fact} dimensions={schema.dimensions} />
          </Reveal>
        </section>

        <section className="lbc-sec">
          <h2>Le modèle et ses contrôles</h2>
          <div className="lbc-grid2">
            <Reveal className="lbc-panel">
              <SectionBody section={{ id: 'etoile', title: '', blocks: blocks('etoile').filter((b) => b.type !== 'table') }} />
            </Reveal>
            <Reveal className="lbc-panel">
              <h3 className="lbc-h3">Contrôles avant Power BI</h3>
              <SectionBody section={{ id: 'controles', title: '', blocks: blocks('controles') }} />
            </Reveal>
          </div>
        </section>

        <section className="lbc-sec">
          <h2>Ce que montrent les analyses</h2>
          <Reveal className="lbc-panel">
            <SectionBody section={{ id: 'resultats', title: '', blocks: blocks('resultats') }} />
          </Reveal>
        </section>

        {project.powerbi && (
          <section className="lbc-sec">
            <h2>Les tableaux de bord</h2>
            <p className="lbc-sub">Le rapport Power BI publié : deux pages interactives.</p>
            <PowerBIEmbed pages={project.powerbi} title={c.title} />
          </section>
        )}

        <section className="lbc-sec">
          <h2>Conclusions</h2>
          <ul className="lbc-list">
            {c.conclusions.map((t, i) => (
              <Reveal as="li" key={i} delay={i * 50}>
                <Md text={t} />
              </Reveal>
            ))}
          </ul>
        </section>
      </div>

      <ProjectEnd project={project} />
    </div>
  );
}
