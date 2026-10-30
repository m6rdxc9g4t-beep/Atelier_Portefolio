/**
 * Démo « classez un avis » du projet d'analyse textuelle.
 *
 * - Familles thématiques : dictionnaires repris du code Python du projet
 *   (service_personnel, nourriture, environnement, prix ; sinon « autre »),
 *   la famille retenue est la plus représentée dans l'avis (comme le mode utilisé dans le projet).
 * - Polarité : petit lexique d'opinion français pondéré, avec gestion simple de la négation
 *   et des intensifieurs. C'est une réimplémentation pédagogique et volontairement légère
 *   (sans lemmatisation Stanza ni TextBlob-fr) : elle illustre la logique, pas les chiffres du rapport.
 */

export const FAMILIES: Record<string, string[]> = {
  service_personnel: [
    'serveur', 'serveuse', 'personnel', 'accueil', 'attente', 'équipe', 'service', 'sympathique',
    'directeur', 'manager', 'gentil', 'souriant', 'agréable', 'professionnel', 'courtois', 'aimable',
    'efficace', 'rapide', 'disponible', 'attentionné', 'accueillant', 'respectueux', 'adorable',
  ],
  nourriture: [
    'plat', 'viande', 'poisson', 'frites', 'salade', 'dessert', 'menu', 'buffet', 'nourriture', 'boisson',
    'pain', 'chaud', 'froid', 'cuit', 'cru', 'cuisson', 'sauce', 'goût', 'saveur', 'qualité', 'quantité',
    'portion', 'assiette', 'entrée', 'fromage', 'pâtisserie', 'purée', 'grillé', 'gras',
  ],
  environnement: [
    'salle', 'ambiance', 'bruit', 'table', 'propreté', 'toilettes', 'chaleur', 'lumière', 'cadre', 'calme',
    'bruyant', 'décor', 'décoration', 'musique', 'place', 'file', 'espace', 'chaise', 'déco', 'propre', 'sale',
    'température', 'climatisation', 'chauffage', 'enfant', 'famille',
  ],
  prix: [
    'cher', 'prix', 'coût', 'facture', 'addition', 'promotion', 'tarif', 'budget', 'rapport qualité',
    'abordable', 'gratuit', 'réduction', 'formule', 'offre', 'économique', 'ticket', 'bons', 'promo',
  ],
};

export const FAMILY_LABELS: Record<string, string> = {
  service_personnel: 'Service & personnel',
  nourriture: 'Nourriture',
  environnement: 'Environnement',
  prix: 'Prix',
  autre: 'Autre',
};

/** Lexique d'opinion (−1 … +1). */
const POLARITY: Record<string, number> = {
  bon: 0.6, bonne: 0.6, excellent: 1, excellente: 1, parfait: 1, parfaite: 1, super: 0.8, génial: 0.9,
  délicieux: 0.9, délicieuse: 0.9, savoureux: 0.8, copieux: 0.5, copieuse: 0.5, frais: 0.4, fraîche: 0.4,
  agréable: 0.7, sympathique: 0.7, sympa: 0.6, aimable: 0.7, souriant: 0.7, souriante: 0.7, gentil: 0.6,
  gentille: 0.6, accueillant: 0.7, accueillante: 0.7, chaleureux: 0.7, chaleureuse: 0.7, efficace: 0.6,
  rapide: 0.5, propre: 0.6, calme: 0.4, top: 0.8, recommande: 0.7, recommandé: 0.7, satisfait: 0.6,
  satisfaite: 0.6, correct: 0.3, correcte: 0.3, abordable: 0.5, généreux: 0.6, professionnel: 0.5,
  merci: 0.4, bravo: 0.8, adorable: 0.8, attentionné: 0.6, variété: 0.3, choix: 0.2, chaud: 0.2,
  mauvais: -0.7, mauvaise: -0.7, horrible: -1, immonde: -1, dégueulasse: -1, infect: -1, nul: -0.8,
  nulle: -0.8, décevant: -0.7, décevante: -0.7, déçu: -0.7, déçue: -0.7, sale: -0.8, froid: -0.4,
  froide: -0.4, lent: -0.5, lente: -0.5, cher: -0.4, chère: -0.4, désagréable: -0.8, impoli: -0.8,
  impolie: -0.8, fade: -0.5, sec: -0.4, sèche: -0.4, brûlé: -0.6, cru: -0.4, bruyant: -0.4,
  bruyante: -0.4, catastrophique: -1, pire: -0.9, inadmissible: -0.9, attente: -0.3, vide: -0.3,
  manque: -0.4, rien: -0.2, jamais: -0.3, scandaleux: -0.9, honteux: -0.9, arnaque: -0.9,
  // adjectifs négatifs mis en avant par le rapport
  médiocre: -0.8, immangeable: -1, dommage: -0.5,
};

const NEGATIONS = new Set(['pas', 'jamais', 'plus', 'aucun', 'aucune', 'ni', 'sans']);
const INTENSIFIERS: Record<string, number> = { très: 1.5, trop: 1.4, vraiment: 1.4, super: 1.4, hyper: 1.5, assez: 0.8, peu: 0.5 };

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/[’']/g, ' ')
    .replace(/[^a-zàâäçéèêëîïôöùûüÿœæ\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Variantes simples (pluriel / féminin) pour retrouver un mot du lexique sans lemmatiseur. */
function lookup<T>(dict: Record<string, T> | Map<string, T>, word: string): T | undefined {
  const get = (w: string) => (dict instanceof Map ? dict.get(w) : (dict as Record<string, T>)[w]);
  const candidates = [word, word.replace(/s$/, ''), word.replace(/x$/, ''), word.replace(/es$/, ''), word.replace(/e$/, '')];
  for (const c of candidates) {
    const v = get(c);
    if (v !== undefined) return v;
  }
  return undefined;
}

export interface Hit {
  word: string;
  weight: number;
  negated: boolean;
}

export interface Classification {
  family: string;
  familyLabel: string;
  familyCounts: Record<string, number>;
  score: number;
  polarity: 'positif' | 'négatif' | 'neutre';
  hits: Hit[];
  tokens: number;
}

export function classifyReview(text: string, families: Record<string, string[]> = FAMILIES): Classification {
  const tokens = tokenize(text);
  const famIndex = new Map<string, string>();
  for (const [fam, words] of Object.entries(families)) for (const w of words) famIndex.set(w, fam);

  const familyCounts: Record<string, number> = {};
  for (const f of Object.keys(families)) familyCounts[f] = 0;
  const lowered = ` ${tokens.join(' ')} `;
  for (const [fam, words] of Object.entries(families)) {
    for (const w of words) if (w.includes(' ') && lowered.includes(` ${w} `)) familyCounts[fam]++;
  }

  const hits: Hit[] = [];
  let sum = 0;
  // Une négation porte sur le prochain mot d'opinion situé dans les 3 mots suivants, puis s'éteint.
  let negationUntil = -1;
  tokens.forEach((tok, i) => {
    const fam = lookup(famIndex, tok);
    if (fam) familyCounts[fam]++;
    if (NEGATIONS.has(tok)) {
      negationUntil = i + 3;
      return;
    }
    const pol = lookup(POLARITY, tok);
    if (pol === undefined) return;
    const negated = i <= negationUntil;
    negationUntil = -1;
    const prev = tokens[i - 1];
    const boost = prev && INTENSIFIERS[prev] ? INTENSIFIERS[prev] : 1;
    const weight = (negated ? -0.8 : 1) * pol * boost;
    hits.push({ word: tok, weight, negated });
    sum += weight;
  });

  const score = hits.length ? Math.max(-1, Math.min(1, sum / Math.sqrt(hits.length + 1))) : 0;
  const best = Object.entries(familyCounts).sort((a, b) => b[1] - a[1])[0];
  const family = best && best[1] > 0 ? best[0] : 'autre';
  return {
    family,
    familyLabel: FAMILY_LABELS[family] ?? family,
    familyCounts,
    score,
    polarity: score > 0.05 ? 'positif' : score < -0.05 ? 'négatif' : 'neutre',
    hits,
    tokens: tokens.length,
  };
}
