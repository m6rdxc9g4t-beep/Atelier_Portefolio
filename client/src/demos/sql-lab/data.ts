/**
 * Comptoir Lumen : boutique fictive d'objets pour la maison, générée dans le navigateur.
 * Même graine pour tout le monde : chaque visiteur obtient exactement la même base.
 * Utilisée par les démos « SQL Lab » (SQLite) et « Tableau de bord » (calcul en mémoire).
 */

export const COMPTOIR_SEED = 20251108;

/** Générateur pseudo-aléatoire à graine (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Segment = 'Particulier' | 'Professionnel';
export type Canal = 'Site web' | 'Application' | 'Boutique';
export type Statut = 'livree' | 'annulee' | 'retournee' | 'en_cours';
export type Categorie = 'Luminaires' | 'Textile' | 'Cuisine' | 'Mobilier' | 'Papeterie' | 'Jardin';

export interface Client {
  id: number;
  prenom: string;
  nom: string;
  ville: string;
  region: string;
  date_inscription: string;
  segment: Segment;
}
export interface Produit {
  id: number;
  nom: string;
  categorie: Categorie;
  prix_unitaire: number;
  cout_unitaire: number;
}
export interface Commande {
  id: number;
  client_id: number;
  date_commande: string;
  canal: Canal;
  statut: Statut;
}
export interface Ligne {
  id: number;
  commande_id: number;
  produit_id: number;
  quantite: number;
  remise: number;
}
export interface ComptoirData {
  clients: Client[];
  produits: Produit[];
  commandes: Commande[];
  lignes: Ligne[];
}

export const REGIONS: { nom: string; poids: number; villes: string[] }[] = [
  { nom: 'Île-de-France', poids: 22, villes: ['Paris', 'Boulogne-Billancourt', 'Montreuil', 'Versailles', 'Saint-Denis'] },
  { nom: 'Auvergne-Rhône-Alpes', poids: 14, villes: ['Lyon', 'Grenoble', 'Clermont-Ferrand', 'Annecy', 'Saint-Étienne'] },
  { nom: 'Provence-Alpes-Côte d’Azur', poids: 10, villes: ['Marseille', 'Nice', 'Toulon', 'Aix-en-Provence'] },
  { nom: 'Occitanie', poids: 10, villes: ['Toulouse', 'Montpellier', 'Nîmes', 'Perpignan'] },
  { nom: 'Nouvelle-Aquitaine', poids: 10, villes: ['Bordeaux', 'Limoges', 'Poitiers', 'La Rochelle', 'Pau'] },
  { nom: 'Hauts-de-France', poids: 8, villes: ['Lille', 'Amiens', 'Roubaix', 'Dunkerque'] },
  { nom: 'Grand Est', poids: 8, villes: ['Strasbourg', 'Reims', 'Metz', 'Nancy'] },
  { nom: 'Pays de la Loire', poids: 7, villes: ['Nantes', 'Angers', 'Le Mans', 'Saint-Nazaire'] },
  { nom: 'Bretagne', poids: 6, villes: ['Rennes', 'Brest', 'Quimper', 'Vannes'] },
  { nom: 'Normandie', poids: 5, villes: ['Rouen', 'Caen', 'Le Havre', 'Cherbourg'] },
];

const PRENOMS = ['Camille', 'Léa', 'Manon', 'Chloé', 'Inès', 'Jade', 'Louise', 'Emma', 'Alice', 'Lina', 'Sarah', 'Julie', 'Clara', 'Zoé', 'Anaïs', 'Margaux', 'Hugo', 'Lucas', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Nathan', 'Théo', 'Raphaël', 'Tom', 'Léo', 'Paul', 'Maxime', 'Antoine', 'Thomas', 'Mehdi', 'Yanis', 'Karim', 'Sofiane', 'Nora', 'Amina', 'Élodie', 'Pauline', 'Romain', 'Julien', 'Nicolas', 'Claire', 'Sophie', 'Marc', 'Olivier', 'Isabelle', 'Céline'];
const NOMS = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Lefèvre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas', 'Perrin', 'Morin', 'Mathieu', 'Clément', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine', 'Chevalier', 'Robin', 'Benali', 'Haddad', 'Nguyen', 'Le Gall', 'Kerbrat'];

/** Catalogue : catégorie, marge brute visée, articles (nom, prix TTC). */
export const CATALOGUE: { categorie: Categorie; marge: number; popularite: number; articles: [string, number][] }[] = [
  { categorie: 'Luminaires', marge: 0.52, popularite: 1.1, articles: [['Lampe arc laiton', 189], ['Suspension lin naturel', 129], ['Applique opaline', 79], ['Lampe de bureau Atelier', 95], ['Lampadaire trépied', 159], ['Guirlande guinguette', 39], ['Liseuse cuivre', 69], ['Lampe baladeuse', 45]] },
  { categorie: 'Textile', marge: 0.58, popularite: 1.4, articles: [['Plaid laine mérinos', 89], ['Housse de coussin lin', 29], ['Rideau voile de coton', 49], ['Tapis jute tressé', 149], ['Nappe enduite', 45], ['Torchons, lot de 3', 19], ['Parure percale', 119], ['Jeté de canapé', 65]] },
  { categorie: 'Cuisine', marge: 0.47, popularite: 1.3, articles: [['Cocotte fonte 24 cm', 139], ['Couteau d’office', 35], ['Planche en olivier', 42], ['Moulin à poivre', 38], ['Théière en grès', 49], ['Verres, lot de 6', 32], ['Poêle acier carbone', 55], ['Saladier céramique', 36]] },
  { categorie: 'Mobilier', marge: 0.41, popularite: 0.6, articles: [['Tabouret chêne', 119], ['Étagère murale', 89], ['Console noyer', 349], ['Fauteuil rotin', 289], ['Table basse travertin', 459], ['Banc d’entrée', 199], ['Desserte métal', 129], ['Chaise bistrot', 99]] },
  { categorie: 'Papeterie', marge: 0.63, popularite: 1.0, articles: [['Carnet cuir A5', 29], ['Stylo plume', 59], ['Agenda 2026', 25], ['Coffret de crayons', 22], ['Sous-main liège', 34], ['Encre 50 ml', 14], ['Porte-documents', 79], ['Papier vergé, lot', 18]] },
  { categorie: 'Jardin', marge: 0.55, popularite: 0.9, articles: [['Pot terre cuite', 24], ['Arrosoir zinc', 45], ['Sécateur forgé', 39], ['Jardinière bois', 69], ['Terrarium verre', 55], ['Kit de semis', 19], ['Tablier de jardin', 35], ['Brumisateur laiton', 16]] },
];

/** Poids saisonnier de chaque mois (janvier → décembre). */
const MONTH_W = [0.8, 0.7, 0.85, 0.95, 1.0, 0.9, 0.75, 0.7, 0.95, 1.05, 1.45, 1.75];
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Période couverte par les commandes. */
export const PERIODE = { debut: '2024-01-01', fin: '2025-12-31' } as const;
export const N_CLIENTS = 420;
export const N_COMMANDES = 2600;

/** Fabrique la base complète (clients, produits, commandes, lignes) à partir de la graine. */
export function generateComptoir(seed = COMPTOIR_SEED): ComptoirData {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  function weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const s = weights.reduce((a, b) => a + b, 0);
    let r = rnd() * s;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  // Clients : région pondérée, ancienneté, segment, et un « appétit » très inégal (quelques gros clients).
  type ClientGen = Client & { w: number; t: number };
  const clients: ClientGen[] = [];
  const regW = REGIONS.map((r) => r.poids);
  const start = Date.UTC(2023, 0, 1);
  const endInsc = Date.UTC(2025, 9, 31);
  for (let i = 1; i <= N_CLIENTS; i++) {
    const reg = weighted(REGIONS, regW);
    const insc = new Date(start + Math.floor(rnd() * ((endInsc - start) / DAY)) * DAY);
    clients.push({
      id: i,
      prenom: pick(PRENOMS),
      nom: pick(NOMS),
      ville: pick(reg.villes),
      region: reg.nom,
      date_inscription: iso(insc),
      segment: rnd() < 0.18 ? 'Professionnel' : 'Particulier',
      w: Math.pow(rnd(), 2.2) * 3 + 0.15,
      t: insc.getTime(),
    });
  }

  // Produits : coût d'achat autour de la marge visée de la catégorie.
  type ProduitGen = Produit & { w: number };
  const produits: ProduitGen[] = [];
  let pid = 1;
  for (const cat of CATALOGUE) {
    for (const [nom, prix] of cat.articles) {
      const cout = Math.round(prix * (1 - cat.marge) * (0.92 + rnd() * 0.16) * 100) / 100;
      produits.push({ id: pid++, nom, categorie: cat.categorie, prix_unitaire: prix, cout_unitaire: cout, w: cat.popularite * (0.5 + rnd()) * (prix > 250 ? 0.45 : 1) });
    }
  }

  // Jours de commande : saisonnalité mensuelle, croissance de 35 % sur deux ans, week-ends et Black Friday.
  const d0 = Date.UTC(2024, 0, 1);
  const nDays = 731;
  const cum: number[] = [];
  let acc = 0;
  for (let k = 0; k < nDays; k++) {
    const d = new Date(d0 + k * DAY);
    let w = MONTH_W[d.getUTCMonth()]! * (1 + (0.35 * k) / nDays);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) w *= 1.25;
    if (d.getUTCMonth() === 10 && d.getUTCDate() >= 24 && d.getUTCDate() <= 30) w *= 2.2;
    acc += w;
    cum.push(acc);
  }
  const sampleDay = () => {
    const r = rnd() * acc;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m]! < r) lo = m + 1;
      else hi = m;
    }
    return lo;
  };

  const cW = clients.map((c) => c.w);
  const pW = produits.map((p) => p.w);
  const commandes: Commande[] = [];
  const lignes: Ligne[] = [];
  let lid = 1;
  const days: number[] = [];
  for (let i = 0; i < N_COMMANDES; i++) days.push(sampleDay());
  days.sort((a, b) => a - b);
  const lastDay = d0 + (nDays - 1) * DAY;
  for (let i = 0; i < N_COMMANDES; i++) {
    const t = d0 + days[i]! * DAY;
    const d = new Date(t);
    let c: ClientGen | null = null;
    for (let k = 0; k < 12; k++) {
      const cand = weighted(clients, cW);
      if (cand.t <= t) {
        c = cand;
        break;
      }
    }
    if (!c) c = clients.reduce((a, b) => (b.t < a.t ? b : a));
    const canal = weighted<Canal>(['Site web', 'Application', 'Boutique'], [58, 22, 20]);
    let statut: Statut;
    if (lastDay - t < 9 * DAY && rnd() < 0.7) statut = 'en_cours';
    else statut = weighted<Statut>(['livree', 'annulee', 'retournee'], [90, 5, 5]);
    const cid = i + 1;
    commandes.push({ id: cid, client_id: c.id, date_commande: iso(d), canal, statut });
    const nl = weighted([1, 2, 3, 4], [45, 30, 17, 8]);
    const used = new Set<number>();
    const bf = d.getUTCMonth() === 10 && d.getUTCDate() >= 24 && d.getUTCDate() <= 30;
    for (let j = 0; j < nl; j++) {
      let p = weighted(produits, pW);
      let guard = 0;
      while (used.has(p.id) && guard++ < 10) p = weighted(produits, pW);
      if (used.has(p.id)) continue;
      used.add(p.id);
      let q = c.segment === 'Professionnel' ? 1 + Math.floor(rnd() * 6) : rnd() < 0.82 ? 1 : 2 + Math.floor(rnd() * 2);
      if (canal === 'Boutique' && rnd() < 0.2) q += 1;
      let remise = 0;
      if (bf) remise = rnd() < 0.7 ? 0.15 : 0;
      else {
        const r = rnd();
        if (r < 0.04) remise = 0.2;
        else if (r < 0.14) remise = 0.1;
      }
      lignes.push({ id: lid++, commande_id: cid, produit_id: p.id, quantite: q, remise });
    }
  }

  return {
    clients: clients.map(({ w: _w, t: _t, ...c }) => c),
    produits: produits.map(({ w: _w, ...p }) => p),
    commandes,
    lignes,
  };
}

/** Montant TTC d'une ligne, remise déduite. Même formule que `CA_SQL` côté SQLite. */
export const montantLigne = (l: Ligne, p: Produit) => l.quantite * p.prix_unitaire * (1 - l.remise);
export const CA_SQL = 'l.quantite * p.prix_unitaire * (1 - l.remise)';

export const SCHEMA_SQL = `CREATE TABLE clients (
  id INTEGER PRIMARY KEY, prenom TEXT, nom TEXT, ville TEXT, region TEXT,
  date_inscription TEXT, segment TEXT
);
CREATE TABLE produits (
  id INTEGER PRIMARY KEY, nom TEXT, categorie TEXT,
  prix_unitaire REAL, cout_unitaire REAL
);
CREATE TABLE commandes (
  id INTEGER PRIMARY KEY, client_id INTEGER REFERENCES clients(id),
  date_commande TEXT, canal TEXT, statut TEXT
);
CREATE TABLE lignes (
  id INTEGER PRIMARY KEY, commande_id INTEGER REFERENCES commandes(id),
  produit_id INTEGER REFERENCES produits(id), quantite INTEGER, remise REAL
);
CREATE INDEX ix_lignes_commande ON lignes(commande_id);
CREATE INDEX ix_commandes_client ON commandes(client_id);`;
