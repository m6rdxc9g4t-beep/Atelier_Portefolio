import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ProjectResponse } from '../api';

export type ProjectPage = ComponentType<{ project: ProjectResponse }>;

/**
 * Une page thématisée par projet, chargée à la demande (code-splitting : chaque thème
 * embarque ses propres polices et styles). Un projet absent de ce registre utilise la page générique.
 */
export const PROJECT_PAGES: Record<string, LazyExoticComponent<ProjectPage>> = {
  'scoring-assurance-auto': lazy(() => import('./scoring-assurance-auto/Page')),
  'catalogue-netflix': lazy(() => import('./catalogue-netflix/Page')),
  'avis-clients-flunch': lazy(() => import('./avis-clients-flunch/Page')),
  'churn-telecom': lazy(() => import('./churn-telecom/Page')),
  'volatilite-sp500-garch': lazy(() => import('./volatilite-sp500-garch/Page')),
  'immobilier-arras-spatial': lazy(() => import('./immobilier-arras-spatial/Page')),
  'offre-travail-selection': lazy(() => import('./offre-travail-selection/Page')),
  'leboncoin-vo-powerbi': lazy(() => import('./leboncoin-vo-powerbi/Page')),
  'stage-ecm': lazy(() => import('./stage-ecm/Page')),
  'sante-infantile-inde': lazy(() => import('./sante-infantile-inde/Page')),
  'recours-soins-europe': lazy(() => import('./recours-soins-europe/Page')),
  'immobilier-maine-et-loire': lazy(() => import('./immobilier-maine-et-loire/Page')),
  'scoring-marketing': lazy(() => import('./scoring-marketing/Page')),
  'prevision-arima-sarima': lazy(() => import('./prevision-arima-sarima/Page')),
  'porsche-powerbi': lazy(() => import('./porsche-powerbi/Page')),
  datamind: lazy(() => import('./datamind/Page')),
};
