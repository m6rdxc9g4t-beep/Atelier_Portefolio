import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import Diagram from './Diagram';
import Editor from './Editor';
import { DiagnosticsPanel, NormalizePanel, SqlPanel, TestPanel } from './Panels';
import {
  NORM_STEPS,
  TEMPLATES,
  addTable,
  applyAllFixes,
  applyFix,
  diagnose,
  exportModel,
  InputError,
  issueCounts,
  mapTable,
  parseModel,
  tableurModel,
  type Model,
  type Severity,
  type TemplateId,
} from './model';
import './modelisation-donnees.css';

/* ───────────────────── État (avec historique pour « Annuler ») ───────────────────── */

type Source = TemplateId | 'import';
interface State {
  model: Model;
  template: Source;
  /** Étape de l'assistant de normalisation déjà appliquée (0 à 3). */
  stage: number;
  past: { model: Model; template: Source; stage: number }[];
}
type Action =
  | { type: 'update'; fn: (m: Model) => Model; history: boolean }
  | { type: 'snapshot' }
  | { type: 'undo' }
  | { type: 'load'; model: Model; template: Source; stage: number };

const HISTORY = 60;
function reducer(s: State, a: Action): State {
  const snap = { model: s.model, template: s.template, stage: s.stage };
  switch (a.type) {
    case 'update': {
      const next = a.fn(s.model);
      if (next === s.model) return s;
      return { ...s, model: next, past: a.history ? [...s.past.slice(-HISTORY), snap] : s.past };
    }
    case 'snapshot':
      return s.past.at(-1)?.model === s.model ? s : { ...s, past: [...s.past.slice(-HISTORY), snap] };
    case 'undo': {
      const prev = s.past.at(-1);
      return prev ? { ...prev, past: s.past.slice(0, -1) } : s;
    }
    case 'load':
      return { model: a.model, template: a.template, stage: a.stage, past: [...s.past.slice(-HISTORY), snap] };
  }
}

const STORE_KEY = 'atelier:modelisation-donnees:v1';
function loadSaved(): Omit<State, 'past'> | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { model?: unknown; template?: string; stage?: number };
    const model = parseModel(JSON.stringify({ model: o.model }));
    const template: Source = TEMPLATES.some((t) => t.id === o.template) ? (o.template as TemplateId) : 'import';
    return { model, template, stage: Math.min(3, Math.max(0, Number(o.stage) || 0)) };
  } catch {
    return null;
  }
}

const TABS = [
  { id: 'diag', label: 'Diagnostic' },
  { id: 'edit', label: 'Édition' },
  { id: 'sql', label: 'SQL' },
  { id: 'test', label: 'Test' },
  { id: 'norm', label: 'Normaliser' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function Tool() {
  const [initial] = useState(loadSaved);
  const [state, dispatch] = useReducer(reducer, null, (): State => ({ ...(initial ?? { model: TEMPLATES[0]!.build(), template: 'comptoir', stage: 0 }), past: [] }));
  const { model, template, stage } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('diag');
  const [notice, setNotice] = useState(initial ? 'Modèle restauré depuis votre navigateur (enregistré automatiquement).' : '');
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const issues = useMemo(() => diagnose(model), [model]);
  const counts = issueCounts(issues);
  const severityByTable = useMemo(() => {
    const m = new Map<string, Severity>();
    for (const i of issues) if (!m.has(i.tableId)) m.set(i.tableId, i.severity); // déjà triés par gravité
    return m;
  }, [issues]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ model, template, stage }));
    } catch {
      /* stockage indisponible : le modèle vit seulement le temps de la visite */
    }
  }, [model, template, stage]);
  useEffect(() => {
    if (selectedId && !model.tables.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [model, selectedId]);

  const update = (fn: (m: Model) => Model, history = true) => dispatch({ type: 'update', fn, history });
  const load = (m: Model, t: Source, st = 0, msg = '') => {
    dispatch({ type: 'load', model: m, template: t, stage: st });
    setSelectedId(null);
    setNotice(msg);
  };
  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) setTab('edit');
  };
  const undo = () => {
    dispatch({ type: 'undo' });
    setNotice('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      e.preventDefault();
      undo();
    }
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = TABS.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([exportModel(model)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-relationnel.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Modèle exporté (modele-relationnel.json).');
  };
  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2_000_000) return setNotice('Fichier trop volumineux (2 Mo au maximum).');
    try {
      load(parseModel(await file.text()), 'import', 0, `Modèle « ${file.name} » importé.`);
    } catch (err) {
      setNotice(err instanceof InputError ? err.message : 'Ce fichier n’a pas pu être lu.');
    }
  };

  const title = template === 'import' ? 'Modèle importé' : TEMPLATES.find((t) => t.id === template)!.label;

  return (
    <section className="md-tool" aria-label="Outil de modélisation" onKeyDown={onKeyDown}>
      <div className="md-toolbar">
        <div className="md-tb-group" role="group" aria-label="Modèle de départ">
          <span className="md-tb-label">Partir de</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="md-chip"
              aria-pressed={template === t.id}
              title={t.description}
              onClick={() => load(t.build(), t.id, 0, `${t.label} : ${t.description}`)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="md-tb-group md-tb-end">
          <button type="button" className="md-btn" onClick={undo} disabled={state.past.length === 0}>
            Annuler
          </button>
          <button
            type="button"
            className="md-btn"
            onClick={() => {
              const r = addTable(model);
              update(() => r.model);
              select(r.tableId);
            }}
          >
            + Table
          </button>
          <button type="button" className="md-btn" onClick={exportJson}>
            Exporter
          </button>
          <button type="button" className="md-btn" onClick={() => fileRef.current?.click()}>
            Importer
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="md-sr" tabIndex={-1} aria-hidden="true" onChange={importJson} />
        </div>
      </div>
      <p className="md-notice" role="status">
        {notice}
      </p>

      <div className="md-body">
        <div className="md-canvas-col">
          <div className="md-canvas" tabIndex={-1}>
            <Diagram
              model={model}
              selectedId={selectedId}
              severityByTable={severityByTable}
              onSelect={select}
              onMoveStart={() => dispatch({ type: 'snapshot' })}
              onMove={(id, x, y) => update((m) => mapTable(m, id, (t) => ({ ...t, x, y })), false)}
            />
          </div>
          <div className="md-legend" aria-label="Lecture du diagramme">
            <span>
              <svg width="30" height="14" aria-hidden="true">
                <path d="M2,7H28M2,1L14,7M2,13L14,7" className="md-link-mark" />
              </svg>
              plusieurs
            </span>
            <span>
              <svg width="30" height="14" aria-hidden="true">
                <path d="M2,7H28M10,1V13M15,1V13" className="md-link-mark" />
              </svg>
              un et un seul
            </span>
            <span>
              <svg width="30" height="14" aria-hidden="true">
                <path d="M2,7H28M10,1V13" className="md-link-mark" />
                <circle cx="19" cy="7" r="3.6" className="md-link-zero" />
              </svg>
              zéro ou un
            </span>
            <span className="md-legend-hint">Glissez les tables, ou sélectionnez-en une avec Tab et déplacez-la aux flèches.</span>
          </div>
        </div>

        <div className="md-side">
          <div className="md-tabs" role="tablist" aria-label="Panneaux">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`md-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-controls={`md-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
                {t.id === 'diag' && issues.length > 0 && (
                  <span className={`md-count md-count--${counts.error ? 'error' : counts.warning ? 'warning' : 'info'}`}>{issues.length}</span>
                )}
              </button>
            ))}
          </div>
          {TABS.map((t) => (
            <div key={t.id} id={`md-panel-${t.id}`} role="tabpanel" aria-labelledby={`md-tab-${t.id}`} hidden={tab !== t.id} className="md-panel">
              {tab === t.id && t.id === 'diag' && (
                <DiagnosticsPanel
                  issues={issues}
                  template={template}
                  onFix={(f) => update((m) => applyFix(m, f))}
                  onFixAll={() => update(applyAllFixes)}
                  onShow={(id) => select(id)}
                  onOpenNormalize={() => setTab('norm')}
                />
              )}
              {tab === t.id && t.id === 'edit' && (
                <Editor
                  model={model}
                  selectedId={selectedId}
                  onSelect={select}
                  onAddTable={() => {
                    const r = addTable(model);
                    update(() => r.model);
                    select(r.tableId);
                  }}
                  onChange={update}
                  onSnapshot={() => dispatch({ type: 'snapshot' })}
                />
              )}
              {tab === t.id && t.id === 'sql' && <SqlPanel model={model} title={title} />}
              {tab === t.id && t.id === 'test' && <TestPanel model={model} />}
              {tab === t.id && t.id === 'norm' && (
                <NormalizePanel
                  template={template}
                  stage={stage}
                  onLoadTableur={() => load(tableurModel(), 'tableur', 0)}
                  onApply={(st) => load(st === 0 ? tableurModel() : NORM_STEPS[st - 1]!.build(), 'tableur', st, st === 0 ? 'Tableur rechargé.' : `Étape ${st} appliquée (${NORM_STEPS[st - 1]!.form}).`)}
                  onShowSql={() => setTab('sql')}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Page ───────────────────── */

/** Démo « Modélisation de données » : dessiner un schéma relationnel, le diagnostiquer, le normaliser, générer et tester son SQL. */
export default function ModelisationDonnees() {
  return (
    <main className="demo-page modelisation-donnees">
      <div className="wrap">
        <Link to="/demos" className="md-back">
          <Icon name="arrow-left" size={14} /> Démos
        </Link>
        <header className="md-hero">
          <h1>Dessinez un modèle de données, l’outil en vérifie la conception</h1>
          <p className="sec-lede">
            Tables, clés et relations sur un diagramme qu’on manipule. Un diagnostic relit le modèle en continu (clés manquantes, formes normales,
            montants en flottant, index oubliés), puis le SQL est généré pour trois moteurs et testé pour de vrai dans SQLite.
          </p>
          <ul className="md-skills" aria-label="Compétences mobilisées">
            {['Modélisation relationnelle', 'Formes normales', 'SQL DDL multi-moteurs', 'Intégrité référentielle', 'SQLite en WebAssembly'].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="md-disclaimer">
            <Icon name="shield-check" size={14} />
            Tout se passe dans votre navigateur : le modèle est enregistré sur votre appareil, rien n’est envoyé.
          </p>
        </header>
      </div>

      <div className="md-tool-wrap">
        <Tool />
      </div>

      <div className="wrap">
        <section className="md-method" aria-labelledby="md-method-h">
          <h2 id="md-method-h">Méthode</h2>
          <p className="md-method-lede">
            Les formes normales ont une idée simple : chaque fait n’est écrit qu’à un seul endroit. Sinon, une mise à jour oubliée laisse deux versions
            contradictoires. L’exemple suivi est celui de l’assistant, un export de ventes « une ligne par commande ».
          </p>
          <div className="md-method-cols">
            <div>
              <h3>1FN : une valeur par case</h3>
              <p>
                Pas de liste dans une cellule ni de colonnes numérotées. <code>produit1, produit2, produit3</code> limite une commande à trois articles et
                oblige à lire trois colonnes pour une seule question.
              </p>
              <p className="md-ex">
                Correction : une table <code>lignes (num_commande, produit, quantite)</code>, une ligne par article.
              </p>
            </div>
            <div>
              <h3>2FN : dépendre de toute la clé</h3>
              <p>
                Quand la clé est composée, chaque colonne doit dépendre des deux parties. Dans <code>lignes</code>, le prix ne dépend que du produit, pas de la
                commande : il serait recopié à chaque vente.
              </p>
              <p className="md-ex">
                Correction : <code>produits (id, nom, prix_unitaire)</code>, et <code>lignes</code> pointe vers le produit.
              </p>
            </div>
            <div>
              <h3>3FN : ne dépendre que de la clé</h3>
              <p>
                Aucune colonne ne doit dépendre d’une autre colonne non clé. <code>client_ville</code> dans <code>commandes</code> dépend du client : un
                déménagement imposerait de réécrire tout l’historique.
              </p>
              <p className="md-ex">
                Correction : <code>clients (id, nom, ville, email)</code>, et <code>commandes.client_id</code> en clé étrangère.
              </p>
            </div>
          </div>
          <div className="md-method-cols md-method-cols--2">
            <div>
              <h3>Le diagnostic</h3>
              <p>
                Contrôles structurels exacts (clé primaire, cible et type des clés étrangères, unicité de la colonne visée, doublons de noms) et
                heuristiques sur les noms : colonnes numérotées pour la 1FN, préfixe d’une autre entité (<code>client_</code>, <code>produit_</code>…) pour
                la 3FN, montants en <code>REAL</code>, dates en texte, clés étrangères sans index. Chaque correction automatisable s’applique en un clic et
                s’annule.
              </p>
            </div>
            <div>
              <h3>Le SQL, puis le test</h3>
              <p>
                Les tables sont créées après celles qu’elles référencent (tri topologique ; les cycles sont signalés). Types, auto-incrément et options
                changent selon le moteur. Le script SQLite est exécuté dans le navigateur (SQLite compilé en WebAssembly) avec des données d’essai, puis une
                insertion orpheline vérifie que les clés étrangères sont réellement appliquées.
              </p>
            </div>
          </div>
          <div className="md-limits">
            <h3>Limites</h3>
            <ul>
              <li>
                Une dépendance fonctionnelle est une règle métier, pas une propriété des noms : les heuristiques peuvent manquer un cas (une colonne mal
                nommée) ou en signaler un à tort. La 2FN n’est montrée que dans l’assistant.
              </li>
              <li>
                Seul SQLite est réellement exécuté. Les scripts PostgreSQL et MySQL suivent leurs syntaxes, mais n’ont pas tourné ici : à valider sur une base
                de recette.
              </li>
              <li>
                Pas de contraintes <code>CHECK</code>, de vues, de déclencheurs ni d’actions <code>ON DELETE</code> ; les types sont volontairement réduits à
                neuf.
              </li>
              <li>
                Normaliser n’est pas toujours le but : un entrepôt de données en étoile dénormalise volontairement ses dimensions pour l’analyse.
              </li>
            </ul>
          </div>
        </section>

        <aside className="md-cta">
          <div>
            <strong>Une base à concevoir, un export Excel à transformer en vrai modèle, un schéma à relire ?</strong>
            <span>Je modélise les données avec les équipes métier, j’écris le SQL et je documente les choix.</span>
          </div>
          <div className="md-cta-actions">
            <Link to="/cv" className="btn btn-ghost">
              Voir le CV
            </Link>
            <Link to="/#contact" className="btn btn-primary">
              Me contacter <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
