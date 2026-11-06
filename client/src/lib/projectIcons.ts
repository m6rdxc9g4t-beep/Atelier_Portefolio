import type { IconName } from '../components/Icon';

/**
 * Glyphe à trait de chaque projet data sur les cartes (remplace l'emoji du catalogue dans l'enveloppe du site ;
 * les pages thématisées gardent leurs propres pictogrammes).
 */
const GLYPHS: Record<string, IconName> = {
  'scoring-assurance-auto': 'target',
  'catalogue-netflix': 'clapperboard',
  'avis-clients-flunch': 'message-square',
  'churn-telecom': 'timer',
  'volatilite-sp500-garch': 'trending-down',
  'immobilier-arras-spatial': 'map',
  'offre-travail-selection': 'calculator',
  'leboncoin-vo-powerbi': 'car',
  'stage-ecm': 'briefcase',
  'sante-infantile-inde': 'baby',
  'recours-soins-europe': 'stethoscope',
  'immobilier-maine-et-loire': 'house',
  'scoring-marketing': 'mail',
  'prevision-arima-sarima': 'trending-up',
  'porsche-powerbi': 'gauge',
  datamind: 'sparkles',
};

export function projectGlyph(slug: string): IconName {
  return GLYPHS[slug] ?? 'folder-open';
}
