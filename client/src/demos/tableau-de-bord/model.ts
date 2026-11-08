/**
 * Tableau de bord Comptoir Lumen : agrégats calculés en mémoire sur la base générée du SQL Lab.
 * Fonctions pures, sans dépendance au DOM (testées dans shared/tests/demo-tableau-de-bord.test.ts).
 *
 * Conventions, identiques aux requêtes du SQL Lab :
 * - CA d'une ligne = quantite × prix_unitaire × (1 − remise), sur les commandes au statut « livree » ;
 * - coût d'une ligne = quantite × cout_unitaire ; marge brute = CA − coût ;
 * - une commande est rattachée au mois de sa date de commande.
 */
import {
  CATALOGUE,
  REGIONS,
  generateComptoir,
  montantLigne,
  type Canal,
  type Categorie,
  type ComptoirData,
  type Segment,
  type Statut,
} from '../sql-lab/data';

/* ───────────── Calendrier : 24 mois, de janvier 2024 (0) à décembre 2025 (23) ───────────── */

export const START_YEAR = 2024;
export const N_MONTHS = 24;
export const LAST_MONTH = N_MONTHS - 1;
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const monthYear = (m: number) => START_YEAR + Math.floor(m / 12);
/** « 2025-03 », comme `strftime('%Y-%m', date_commande)` en SQL. */
export const monthKey = (m: number) => `${monthYear(m)}-${String((m % 12) + 1).padStart(2, '0')}`;
/** « mars 2025 ». */
export const monthLong = (m: number) => `${MOIS_LONGS[m % 12]} ${monthYear(m)}`;
/** « mars 25 » (axes). */
export const monthShort = (m: number) => `${MOIS_COURTS[m % 12]} ${String(monthYear(m)).slice(2)}`;
export const monthOfDate = (isoDate: string) => (Number(isoDate.slice(0, 4)) - START_YEAR) * 12 + Number(isoDate.slice(5, 7)) - 1;

/* ───────────── Dimensions ───────────── */

export const CANAUX: Canal[] = ['Site web', 'Application', 'Boutique'];
export const CATEGORIES: Categorie[] = CATALOGUE.map((c) => c.categorie);
export const REGION_NAMES: string[] = REGIONS.map((r) => r.nom);
export const SEGMENTS: Segment[] = ['Particulier', 'Professionnel'];

export type Dim = 'region' | 'canal' | 'categorie' | 'segment';

/* ───────────── Faits : une ligne de commande enrichie ───────────── */

export interface Fact {
  cmd: number;
  client: number;
  month: number;
  canal: Canal;
  statut: Statut;
  region: string;
  segment: Segment;
  categorie: Categorie;
  produit: number;
  quantite: number;
  /** CA de la ligne (remise déduite), compté seulement si la commande est livrée. */
  ca: number;
  /** Coût d'achat de la ligne. */
  cout: number;
}

export interface Base {
  data: ComptoirData;
  facts: Fact[];
  produits: Map<number, { nom: string; categorie: Categorie }>;
}

/** Aplatit la base en lignes enrichies (jointure lignes ⋈ commandes ⋈ clients ⋈ produits). */
export function buildBase(data: ComptoirData = generateComptoir()): Base {
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const produits = new Map(data.produits.map((p) => [p.id, p]));
  const commandes = new Map(data.commandes.map((c) => [c.id, c]));
  const facts: Fact[] = [];
  for (const l of data.lignes) {
    const c = commandes.get(l.commande_id)!;
    const cl = clients.get(c.client_id)!;
    const p = produits.get(l.produit_id)!;
    facts.push({
      cmd: c.id,
      client: cl.id,
      month: monthOfDate(c.date_commande),
      canal: c.canal,
      statut: c.statut,
      region: cl.region,
      segment: cl.segment,
      categorie: p.categorie,
      produit: p.id,
      quantite: l.quantite,
      ca: montantLigne(l, p),
      cout: l.quantite * p.cout_unitaire,
    });
  }
  return { data, facts, produits: new Map(data.produits.map((p) => [p.id, { nom: p.nom, categorie: p.categorie }])) };
}

/* ───────────── Filtres ───────────── */

export interface Filters {
  /** Premier et dernier mois inclus (0 = janvier 2024). */
  from: number;
  to: number;
  /** Listes vides = pas de filtre sur la dimension. */
  regions: string[];
  canaux: Canal[];
  categories: Categorie[];
  segment: Segment | null;
}

export const DEFAULT_FILTERS: Filters = { from: 12, to: 23, regions: [], canaux: [], categories: [], segment: null };

export function passDims(f: Fact, flt: Filters, ignore?: Dim): boolean {
  if (ignore !== 'region' && flt.regions.length && !flt.regions.includes(f.region)) return false;
  if (ignore !== 'canal' && flt.canaux.length && !flt.canaux.includes(f.canal)) return false;
  if (ignore !== 'categorie' && flt.categories.length && !flt.categories.includes(f.categorie)) return false;
  if (ignore !== 'segment' && flt.segment && f.segment !== flt.segment) return false;
  return true;
}

/** Décale la période d'un an en arrière ; null si elle sort des données (avant janvier 2024). */
export function previousYear(flt: Filters): Filters | null {
  if (flt.from - 12 < 0) return null;
  return { ...flt, from: flt.from - 12, to: flt.to - 12 };
}

/* ───────────── Indicateurs ───────────── */

export interface Kpis {
  ca: number;
  cout: number;
  marge: number;
  /** Marge / CA ; null sans CA. */
  tauxMarge: number | null;
  commandes: number;
  panier: number | null;
  clients: number;
  /** Commandes retournées / (livrées + retournées) ; null sans commande expédiée. */
  tauxRetour: number | null;
  /** Commandes annulées / toutes les commandes passées. */
  tauxAnnulation: number | null;
  retournees: number;
  annulees: number;
  passees: number;
}

/**
 * Indicateurs sur un périmètre. Une commande compte dans le périmètre si au moins une de ses lignes y entre
 * (avec un filtre de catégorie, seules les lignes de la catégorie entrent dans le CA).
 */
export function kpis(base: Base, flt: Filters): Kpis {
  let ca = 0;
  let cout = 0;
  const livrees = new Set<number>();
  const clients = new Set<number>();
  const retournees = new Set<number>();
  const annulees = new Set<number>();
  const passees = new Set<number>();
  for (const f of base.facts) {
    if (f.month < flt.from || f.month > flt.to || !passDims(f, flt)) continue;
    passees.add(f.cmd);
    if (f.statut === 'livree') {
      ca += f.ca;
      cout += f.cout;
      livrees.add(f.cmd);
      clients.add(f.client);
    } else if (f.statut === 'retournee') retournees.add(f.cmd);
    else if (f.statut === 'annulee') annulees.add(f.cmd);
  }
  const expediees = livrees.size + retournees.size;
  return {
    ca,
    cout,
    marge: ca - cout,
    tauxMarge: ca > 0 ? (ca - cout) / ca : null,
    commandes: livrees.size,
    panier: livrees.size ? ca / livrees.size : null,
    clients: clients.size,
    tauxRetour: expediees ? retournees.size / expediees : null,
    tauxAnnulation: passees.size ? annulees.size / passees.size : null,
    retournees: retournees.size,
    annulees: annulees.size,
    passees: passees.size,
  };
}

/** Indicateurs mois par mois sur la période (une entrée par mois, de `from` à `to`). */
export function monthlyKpis(base: Base, flt: Filters): Kpis[] {
  const out: Kpis[] = [];
  for (let m = flt.from; m <= flt.to; m++) out.push(kpis(base, { ...flt, from: m, to: m }));
  return out;
}

/** Variation relative (b → a) ; null si la base est nulle ou absente. */
export function relChange(a: number | null, b: number | null | undefined): number | null {
  if (a === null || b === null || b === undefined || b === 0) return null;
  return a / b - 1;
}

/* ───────────── Répartitions ───────────── */

export interface BreakdownRow {
  key: string;
  ca: number;
  commandes: number;
  share: number;
}

const dimOf = (f: Fact, dim: Dim): string =>
  dim === 'region' ? f.region : dim === 'canal' ? f.canal : dim === 'categorie' ? f.categorie : f.segment;

export const DIM_VALUES: Record<Dim, readonly string[]> = {
  region: REGION_NAMES,
  canal: CANAUX,
  categorie: CATEGORIES,
  segment: SEGMENTS,
};

/**
 * CA livré par valeur d'une dimension, sur la période et les autres filtres (le filtre de la dimension
 * elle-même est ignoré, pour voir les valeurs non retenues). Trié par CA décroissant.
 */
export function breakdown(base: Base, flt: Filters, dim: Dim): BreakdownRow[] {
  const ca = new Map<string, number>();
  const cmds = new Map<string, Set<number>>();
  for (const v of DIM_VALUES[dim]) {
    ca.set(v, 0);
    cmds.set(v, new Set());
  }
  let total = 0;
  for (const f of base.facts) {
    if (f.statut !== 'livree' || f.month < flt.from || f.month > flt.to || !passDims(f, flt, dim)) continue;
    const k = dimOf(f, dim);
    ca.set(k, (ca.get(k) ?? 0) + f.ca);
    cmds.get(k)!.add(f.cmd);
    total += f.ca;
  }
  return [...ca.entries()]
    .map(([key, v]) => ({ key, ca: v, commandes: cmds.get(key)!.size, share: total > 0 ? v / total : 0 }))
    .sort((a, b) => b.ca - a.ca || a.key.localeCompare(b.key, 'fr'));
}

export interface ProduitRow {
  id: number;
  nom: string;
  categorie: Categorie;
  ca: number;
  unites: number;
}

/** Produits classés par CA livré sur le périmètre complet. */
export function topProduits(base: Base, flt: Filters, n = 8): ProduitRow[] {
  const acc = new Map<number, ProduitRow>();
  for (const f of base.facts) {
    if (f.statut !== 'livree' || f.month < flt.from || f.month > flt.to || !passDims(f, flt)) continue;
    let row = acc.get(f.produit);
    if (!row) {
      const p = base.produits.get(f.produit)!;
      row = { id: f.produit, nom: p.nom, categorie: p.categorie, ca: 0, unites: 0 };
      acc.set(f.produit, row);
    }
    row.ca += f.ca;
    row.unites += f.quantite;
  }
  return [...acc.values()].sort((a, b) => b.ca - a.ca || a.id - b.id).slice(0, n);
}

/* ───────────── Cohortes de rétention ───────────── */

export const COHORT_HORIZON = 12;

export interface CohortRow {
  /** Mois de première commande livrée (cohorte). */
  month: number;
  size: number;
  /** Part des clients de la cohorte actifs k mois après (k = 0 … 11) ; null au-delà des données. */
  rates: (number | null)[];
  counts: (number | null)[];
}

/**
 * Cohortes : chaque client est rattaché au mois de sa première commande livrée sur tout l'historique
 * (filtres de dimensions appliqués). On garde les cohortes nées dans la période ; la case (c, k) donne la
 * part de la cohorte qui a reçu au moins une commande livrée au mois c + k.
 */
export function cohorts(base: Base, flt: Filters): CohortRow[] {
  const active = new Map<number, Set<number>>();
  for (const f of base.facts) {
    if (f.statut !== 'livree' || !passDims(f, flt)) continue;
    let s = active.get(f.client);
    if (!s) active.set(f.client, (s = new Set()));
    s.add(f.month);
  }
  const rows = new Map<number, { size: number; counts: number[] }>();
  for (const months of active.values()) {
    const first = Math.min(...months);
    if (first < flt.from || first > flt.to) continue;
    let r = rows.get(first);
    if (!r) rows.set(first, (r = { size: 0, counts: new Array(COHORT_HORIZON).fill(0) }));
    r.size++;
    for (let k = 0; k < COHORT_HORIZON; k++) if (months.has(first + k)) r.counts[k]!++;
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, r]) => {
      const counts = r.counts.map((c, k) => (month + k > LAST_MONTH ? null : c));
      return { month, size: r.size, counts, rates: counts.map((c) => (c === null ? null : c / r.size)) };
    });
}

/** Rétention moyenne à k mois, pondérée par la taille des cohortes observables. */
export function meanRetention(rows: CohortRow[], k: number): number | null {
  let n = 0;
  let a = 0;
  for (const r of rows) {
    const c = r.counts[k];
    if (c === null || c === undefined) continue;
    n += r.size;
    a += c;
  }
  return n ? a / n : null;
}

/* ───────────── Constats rédigés ───────────── */

export interface Insight {
  id: string;
  text: string;
}

/** Part du CA réalisée par les 10 % de clients les plus dépensiers du périmètre. */
export function topDecileShare(base: Base, flt: Filters): { share: number; clients: number } | null {
  const byClient = new Map<number, number>();
  for (const f of base.facts) {
    if (f.statut !== 'livree' || f.month < flt.from || f.month > flt.to || !passDims(f, flt)) continue;
    byClient.set(f.client, (byClient.get(f.client) ?? 0) + f.ca);
  }
  const v = [...byClient.values()].sort((a, b) => b - a);
  if (v.length < 10) return null;
  const n = Math.ceil(v.length / 10);
  const total = v.reduce((s, x) => s + x, 0);
  const top = v.slice(0, n).reduce((s, x) => s + x, 0);
  return total > 0 ? { share: top / total, clients: n } : null;
}

export interface InsightFormat {
  euros: (v: number) => string;
  pct: (v: number) => string;
  signedPct: (v: number) => string;
}

/** Deux ou trois constats factuels, chiffrés, tirés du périmètre filtré. */
export function insights(base: Base, flt: Filters, fmt: InsightFormat): Insight[] {
  const out: Insight[] = [];
  const cur = kpis(base, flt);
  if (cur.commandes === 0) return [{ id: 'vide', text: 'Aucune commande livrée sur ce périmètre : élargissez les filtres.' }];

  // 1. Évolution sur un an, et la valeur de dimension qui y contribue le plus.
  const prevF = previousYear(flt);
  if (prevF) {
    const prev = kpis(base, prevF);
    const ch = relChange(cur.ca, prev.ca);
    if (ch !== null) {
      let best: { dim: Dim; key: string; delta: number } | null = null;
      for (const dim of ['categorie', 'region', 'canal'] as Dim[]) {
        const b0 = new Map(breakdown(base, prevF, dim).map((r) => [r.key, r.ca]));
        for (const r of breakdown(base, flt, dim)) {
          const selected =
            (dim === 'categorie' && (!flt.categories.length || flt.categories.includes(r.key as Categorie))) ||
            (dim === 'region' && (!flt.regions.length || flt.regions.includes(r.key))) ||
            (dim === 'canal' && (!flt.canaux.length || flt.canaux.includes(r.key as Canal)));
          if (!selected) continue;
          const d = r.ca - (b0.get(r.key) ?? 0);
          if (!best || Math.abs(d) > Math.abs(best.delta)) best = { dim, key: r.key, delta: d };
        }
      }
      const up = ch >= 0;
      const driver =
        best && Math.sign(best.delta) === Math.sign(cur.ca - prev.ca)
          ? `, ${up ? 'porté' : 'freiné'} d’abord par ${dimPhrase(best.dim, best.key)} (${best.delta >= 0 ? '+' : '−'}${fmt.euros(Math.abs(best.delta))})`
          : '';
      out.push({ id: 'evolution', text: `Le CA ${up ? 'progresse' : 'recule'} de ${fmt.pct(Math.abs(ch))} sur un an à périmètre égal${driver}.` });
    }
  }

  // 2. Mois le plus fort de la période.
  if (flt.to > flt.from) {
    const months = monthlyKpis(base, flt);
    let bi = 0;
    months.forEach((m, i) => {
      if (m.ca > months[bi]!.ca) bi = i;
    });
    const mean = months.reduce((s, m) => s + m.ca, 0) / months.length;
    const peak = months[bi]!;
    if (mean > 0)
      out.push({
        id: 'pic',
        text: `Le mois le plus fort est ${monthLong(flt.from + bi)} : ${fmt.euros(peak.ca)}, soit ${fmt.signedPct(peak.ca / mean - 1)} par rapport à la moyenne mensuelle de la période.`,
      });
  }

  // 3. Concentration de la clientèle, sinon poids de la première catégorie.
  const dec = topDecileShare(base, flt);
  if (dec)
    out.push({
      id: 'concentration',
      text: `Les 10 % de clients les plus dépensiers (${dec.clients}) réalisent ${fmt.pct(dec.share)} du CA.`,
    });
  else {
    const top = breakdown(base, flt, 'categorie').find((r) => !flt.categories.length || flt.categories.includes(r.key as Categorie));
    if (top) out.push({ id: 'categorie', text: `${top.key} pèse ${fmt.pct(top.share)} du CA (${fmt.euros(top.ca)}).` });
  }
  return out.slice(0, 3);
}

function dimPhrase(dim: Dim, key: string): string {
  if (dim === 'categorie') return `la catégorie ${key}`;
  if (dim === 'canal') return key === 'Boutique' ? 'la boutique' : key === 'Application' ? 'l’application' : 'le site web';
  return `la région ${key}`;
}

/* ───────────── Libellé du périmètre ───────────── */

export function periodLabel(flt: Filters): string {
  if (flt.from === 0 && flt.to === LAST_MONTH) return '2024 et 2025';
  if (flt.from % 12 === 0 && flt.to === flt.from + 11) return String(monthYear(flt.from));
  if (flt.from === flt.to) return monthLong(flt.from);
  return `${monthLong(flt.from)} → ${monthLong(flt.to)}`;
}

export function isDefault(flt: Filters): boolean {
  return (
    flt.from === DEFAULT_FILTERS.from &&
    flt.to === DEFAULT_FILTERS.to &&
    !flt.regions.length &&
    !flt.canaux.length &&
    !flt.categories.length &&
    flt.segment === null
  );
}
