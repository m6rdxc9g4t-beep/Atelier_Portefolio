import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { Icon } from '../../components/Icon';
import { Formula } from '../../components/Formula';
import { examples, type Example } from './examples';
import {
  cleanTable,
  DEFAULT_CLEAN,
  detectDelimiter,
  DIMENSIONS,
  InputError,
  MAD_Z,
  profileTable,
  tableFromRows,
  toCsv,
  type CleanOptions,
  type Structure,
  type Table,
} from './model';
import { CleanPanel, ColumnsPanel, int, IssuesPanel, ScorePanel } from './panels';
import './qualite-donnees.css';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 100_000;
const DELIM_LABEL: Record<string, string> = { ';': 'point-virgule', ',': 'virgule', '\t': 'tabulation', '|': 'barre verticale' };
const ALL_ON: CleanOptions = { trim: true, na: true, categories: true, dates: true, numbers: true, postal: true, dropExact: true };

type Source = { kind: 'example'; example: Example } | { kind: 'file'; name: string } | { kind: 'cleaned'; from: string };

interface Loaded {
  source: Source;
  table: Table;
  structure: Structure;
  truncated: number;
  /** Score du fichier d'origine, quand on analyse sa version nettoyée. */
  previous: number | null;
}

function parse(text: string): { table: Table; structure: Structure; truncated: number } {
  const clean = text.replace(/^﻿/, '');
  if (!clean.trim()) throw new InputError('Le fichier est vide.');
  const delimiter = detectDelimiter(clean);
  const parsed = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: 'greedy' });
  let rows = parsed.data.filter((r) => Array.isArray(r));
  let truncated = 0;
  if (rows.length - 1 > MAX_ROWS) {
    truncated = rows.length - 1 - MAX_ROWS;
    rows = rows.slice(0, MAX_ROWS + 1);
  }
  const { table, structure } = tableFromRows(rows, delimiter);
  if (table.header.length < 2 && table.rows.length > 0)
    throw new InputError('Une seule colonne lue : le séparateur n’a pas été reconnu. Séparateurs acceptés : point-virgule, virgule, tabulation, barre verticale.');
  return { table, structure, truncated };
}

async function readFile(file: File): Promise<string> {
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/i.test(file.name))
    throw new InputError('Classeur non pris en charge : enregistrez la feuille au format CSV (Fichier › Enregistrer sous › CSV), puis déposez-la ici.');
  if (file.size > MAX_BYTES) throw new InputError(`Fichier trop volumineux (${(file.size / 1048576).toFixed(1).replace('.', ',')} Mo, 15 Mo au plus).`);
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf); // export Excel français
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Démo « Qualité des données » : profil, doublons, score et nettoyage d'un CSV, entièrement dans le navigateur. */
export default function QualiteDonnees() {
  const EX = useMemo(() => examples(), []);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [opts, setOpts] = useState<CleanOptions>(DEFAULT_CLEAN);
  const fileInput = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const ids = useId();

  const apply = useCallback((text: string, source: Source, previous: number | null = null) => {
    try {
      const p = parse(text);
      setLoaded({ source, ...p, previous });
      setError(null);
      setOpenIssue(null);
    } catch (e) {
      setError(e instanceof InputError ? e.message : `Lecture impossible : ${(e as Error).message}`);
    }
  }, []);

  const pickExample = useCallback((ex: Example) => apply(ex.csv, { kind: 'example', example: ex }), [apply]);

  useEffect(() => {
    pickExample(EX[0]!);
  }, [EX, pickExample]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      apply(await readFile(file), { kind: 'file', name: file.name });
    } catch (e) {
      setError(e instanceof InputError ? e.message : `Lecture impossible : ${(e as Error).message}`);
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const profile = useMemo(() => (loaded ? profileTable(loaded.table, loaded.structure) : null), [loaded]);
  useEffect(() => {
    if (profile && openIssue === null && profile.issues.length) setOpenIssue(profile.issues[0]!.id);
    // Ouvre le premier problème à chaque nouveau fichier (pas quand l'utilisateur referme).
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const potential = useMemo(() => (loaded && profile ? cleanTable(loaded.table, profile, ALL_ON) : null), [loaded, profile]);
  const result = useMemo(() => (loaded && profile ? cleanTable(loaded.table, profile, opts) : null), [loaded, profile, opts]);
  const cleanedCsv = useMemo(() => (result ? toCsv(result.table) : ''), [result]);

  const baseName = !loaded
    ? 'donnees'
    : loaded.source.kind === 'example'
      ? loaded.source.example.filename.replace(/\.csv$/, '')
      : loaded.source.kind === 'file'
        ? loaded.source.name.replace(/\.[^.]+$/, '')
        : loaded.source.from;

  const reanalyse = () => {
    if (!loaded || !profile || !result) return;
    apply(cleanedCsv, { kind: 'cleaned', from: `${baseName}-nettoye` }, loaded.previous ?? profile.score);
    results.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const exampleId = loaded?.source.kind === 'example' ? loaded.source.example.id : null;

  return (
    <main className="demo-page qualite-donnees">
      <div className="wrap">
        <header className="qd-head">
          <h1>Ce que vaut vraiment un fichier, avant de bâtir un tableau de bord dessus</h1>
          <p className="sec-lede">
            Déposez un CSV : chaque colonne est typée et profilée, les valeurs invalides, aberrantes ou écrites de dix façons sont repérées, les doublons
            aussi, même déguisés. Un score sur 100 résume l’état du fichier, et un nettoyage sans risque se télécharge en un clic.
          </p>
          <ul className="chips qd-skills" aria-label="Compétences mises en œuvre">
            {['Profilage de données', 'Statistiques robustes', 'Dédoublonnage', 'Règles de validation', 'TypeScript dans le navigateur'].map((s) => (
              <li key={s} className="chip">
                {s}
              </li>
            ))}
          </ul>
        </header>

        <section
          className={`qd-tool${dragging ? ' is-drag' : ''}`}
          aria-label="Outil d’analyse de la qualité"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="qd-source">
            <div className="qd-source-pick">
              <span className="qd-label" id={`${ids}-ex`}>
                Exemples simulés
              </span>
              <div className="qd-seg" role="group" aria-labelledby={`${ids}-ex`}>
                {EX.map((ex) => (
                  <button key={ex.id} type="button" aria-pressed={exampleId === ex.id} onClick={() => pickExample(ex)} title={ex.hint}>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="qd-drop">
              <input
                ref={fileInput}
                id={`${ids}-file`}
                className="qd-file"
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <label htmlFor={`${ids}-file`} className="btn btn-primary">
                <Icon name="folder-open" />
                {reading ? 'Lecture…' : 'Analyser votre CSV'}
              </label>
              <span className="qd-drop-hint">ou glissez-le ici</span>
            </div>
          </div>
          <p className="qd-privacy">
            <Icon name="shield-check" size={14} />
            Le fichier est lu dans votre navigateur : rien n’est envoyé, rien n’est conservé.
          </p>

          {loaded && (
            <div className="qd-sim">
              <span>
                {loaded.source.kind === 'example' && (
                  <>
                    <b>Données simulées.</b> {loaded.source.example.hint}
                  </>
                )}
                {loaded.source.kind === 'file' && (
                  <>
                    <Icon name="file-text" size={14} /> <b>{loaded.source.name}</b>
                  </>
                )}
                {loaded.source.kind === 'cleaned' && (
                  <>
                    <Icon name="sparkles" size={14} /> <b>Version nettoyée</b> du fichier précédent
                  </>
                )}
                {' '}
                <span className="qd-sim-meta">
                  · {int(loaded.table.rows.length)} lignes × {loaded.table.header.length} colonnes, séparateur {DELIM_LABEL[loaded.table.delimiter] ?? loaded.table.delimiter}
                  {loaded.truncated > 0 && ` (les ${int(loaded.truncated)} dernières lignes ignorées au-delà de ${int(MAX_ROWS)})`}
                </span>
              </span>
              {loaded.source.kind === 'example' && (
                <button type="button" className="qd-link" onClick={() => loaded.source.kind === 'example' && download(loaded.source.example.filename, loaded.source.example.csv)}>
                  <Icon name="download" size={14} />
                  Télécharger ce CSV
                </button>
              )}
              {loaded.source.kind === 'cleaned' && exampleId === null && (
                <button type="button" className="qd-link" onClick={() => pickExample(EX[0]!)}>
                  Revenir aux exemples
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="form-error qd-error" role="alert">
              <Icon name="circle-alert" />
              <div>
                <p>{error}</p>
                <button type="button" className="btn" onClick={() => pickExample(EX[0]!)}>
                  Revenir à l’exemple
                </button>
              </div>
            </div>
          )}

          {loaded && profile && result && potential && (
            <div className="qd-results" ref={results}>
              <ScorePanel profile={profile} previous={loaded.previous} />
              <IssuesPanel profile={profile} table={loaded.table} open={openIssue} onToggle={(id) => setOpenIssue((o) => (o === id ? null : id))} />
              <ColumnsPanel profile={profile} />
              <CleanPanel
                opts={opts}
                setOpts={setOpts}
                result={result}
                potential={potential}
                table={loaded.table}
                csv={cleanedCsv}
                nearDuplicates={profile.nearDuplicates.length}
                onDownload={() => download(`${baseName}-nettoye.csv`, cleanedCsv)}
                onReanalyse={reanalyse}
              />
            </div>
          )}
          {dragging && (
            <div className="qd-dropzone" aria-hidden="true">
              <Icon name="file-text" size={20} />
              Déposez le fichier CSV pour l’analyser
            </div>
          )}
        </section>

        <Method />

        <section className="qd-cta">
          <div>
            <h2>Vos données alimentent des décisions ?</h2>
            <p>Ces contrôles s’automatisent à chaque chargement, avec des règles propres à votre métier et une alerte quand le score baisse.</p>
          </div>
          <div className="qd-cta-actions">
            <Link className="btn btn-primary" to="/#contact">
              Parlons de votre besoin
              <Icon name="arrow-right" />
            </Link>
            <Link className="btn" to="/cv">
              Voir le CV
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function Method() {
  return (
    <section className="qd-method" aria-labelledby="qd-method-title">
      <h2 id="qd-method-title">Méthode</h2>
      <div className="qd-method-grid">
        <article>
          <h3>Typer chaque colonne par ses valeurs</h3>
          <p>
            L’en-tête ne fait pas foi : chaque valeur renseignée est testée (e-mail, code postal, date, nombre, oui / non). La colonne prend le premier
            type que respectent au moins 60 % de ses valeurs (80 % pour un nombre, 90 % pour un booléen) ; les autres valeurs deviennent des{' '}
            <b>invalides</b>. Un texte qui se répète (au plus 5 % de valeurs distinctes, entre 12 et 60) devient une <b>catégorie</b>.
          </p>
          <p>
            Les nombres se lisent à la française (1&nbsp;250,50&nbsp;€) comme à l’anglaise (1,250.50) ; les dates dans sept formats, avec contrôle du
            calendrier (le 31 avril est invalide). « NA », « null » ou « - » comptent comme des cellules vides.
          </p>
        </article>
        <article>
          <h3>Des aberrations jugées de façon robuste</h3>
          <p>
            La moyenne et l’écart-type sont tirés par les valeurs extrêmes qu’on cherche justement à repérer. On leur préfère la médiane et l’écart
            absolu médian (MAD), insensibles à ces valeurs : c’est le score z modifié d’Iglewicz et Hoaglin (1993).
          </p>
          <Formula tex={String.raw`z_i = \frac{0{,}6745\,(x_i - \tilde x)}{\operatorname{MAD}}, \qquad \operatorname{MAD} = \text{méd}_i\,|x_i - \tilde x|, \qquad |z_i| > ${String(MAD_Z).replace('.', '{,}')}`} />
          <p>
            Pour un montant (presque toujours positif, à longue traîne), la règle s’applique au logarithme : sinon chaque grosse commande passerait pour
            une erreur. Quand plus de la moitié des valeurs sont égales (MAD nul), on se rabat sur les quartiles :{' '}
            <Formula display={false} tex={String.raw`[Q_1 - 3\,\mathrm{IQR},\; Q_3 + 3\,\mathrm{IQR}]`} />.
          </p>
        </article>
        <article>
          <h3>Doublons, même déguisés</h3>
          <p>
            Un <b>doublon exact</b> reprend une ligne précédente caractère pour caractère. Un <b>quasi-doublon</b> lui est identique une fois chaque cellule
            ramenée à une forme canonique : minuscules, sans accents ni espaces superflus, dates en ISO, nombres en valeur. Les colonnes d’identifiant
            (un entier unique et croissant, ou nommé id, ref…) sont mises de côté, puisqu’une ressaisie reçoit justement un nouvel identifiant.
          </p>
          <p>
            Chaque ligne est réduite à sa clé et rangée dans une table de hachage : le coût reste proportionnel au nombre de lignes, sans comparer
            toutes les paires (20 000 lignes s’analysent en une fraction de seconde).
          </p>
        </article>
        <article>
          <h3>Un score sur 100, ligne par ligne</h3>
          <p>
            Chaque dimension compte la part des lignes qui n’ont <b>aucun</b> défaut de ce type : une fiche client avec un e-mail faux est inutilisable pour
            un envoi, même si ses neuf autres champs sont justes. Le score combine les quatre dimensions :
          </p>
          <Formula
            tex={String.raw`S = ${DIMENSIONS.map((d) => `${String(d.weight).replace('.', '{,}')}\\,${d.id === 'completude' ? 'C' : d.id === 'validite' ? 'V' : d.id === 'unicite' ? 'U' : 'H'}`).join(' + ')}`}
          />
          <p>
            C : lignes sans cellule vide ; V : sans valeur invalide ni aberrante ; U : qui ne sont pas des doublons ; H : sans écriture divergente (format de
            date minoritaire, séparateur décimal minoritaire, variante de casse, espaces en trop). Au-dessus de 90, le fichier est exploitable en l’état.
          </p>
        </article>
      </div>
      <div className="qd-limits">
        <h3>Limites</h3>
        <ul>
          <li>
            Les règles sont génériques : elles ne savent pas qu’une température ne dépasse pas 60 °C ou qu’un client ne peut pas s’inscrire après sa
            première commande. Ces règles métier s’ajoutent au cas par cas.
          </li>
          <li>
            Une aberration statistique n’est pas forcément une erreur (un très gros client existe) : elle est signalée pour vérification, jamais
            corrigée automatiquement.
          </li>
          <li>
            Les quasi-doublons supposent des valeurs identiques après normalisation ; « Jean Dupont » et « J. Dupont » ou une faute de frappe demandent une
            comparaison approchée (distance d’édition, phonétique), plus coûteuse.
          </li>
          <li>
            Une date 03/04/2025 est lue jour en premier, à la française. Seule une date dont le premier nombre dépasse 12 trahit un format américain.
          </li>
        </ul>
      </div>
    </section>
  );
}
