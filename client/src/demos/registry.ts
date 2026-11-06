import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Démos interactives du portfolio (« Vitrine pro » du portail).
 * Chaque démo tourne entièrement dans le navigateur du visiteur : aucun calcul serveur, aucune IA payante.
 * Une démo = un dossier `client/src/demos/<slug>/` dont `index.tsx` exporte la page par défaut.
 */
export interface DemoEntry {
  slug: string;
  title: string;
  /** Une phrase : ce que la démo montre à un recruteur ou à un client. */
  summary: string;
  /** Compétences mises en avant (puces de la carte). */
  skills: string[];
  /** Nom d'icône de `components/Icon`. */
  icon: string;
  Page: LazyExoticComponent<ComponentType>;
}

export const DEMOS: DemoEntry[] = [
  {
    slug: 'observatoire-immobilier',
    title: 'Observatoire immobilier',
    summary: 'Prix au m² des ventes réelles (DVF) par commune, sur carte, avec tendances et estimation de prix.',
    skills: ['Données publiques DVF', 'Cartographie', 'Modèle hédonique'],
    icon: 'map',
    Page: lazy(() => import('./observatoire-immobilier')),
  },
  {
    slug: 'ecommerce-temps-reel',
    title: 'E-commerce en temps réel',
    summary: 'Tableau de bord d’une boutique simulée : flux de commandes, indicateurs, alertes et détection d’anomalies.',
    skills: ['Pilotage temps réel', 'KPI', 'Détection d’anomalies'],
    icon: 'activity',
    Page: lazy(() => import('./ecommerce-temps-reel')),
  },
  {
    slug: 'labo-ab-causal',
    title: 'Labo A/B et inférence causale',
    summary: 'Taille d’échantillon, significativité, puissance et différence de différences, expliquées pas à pas.',
    skills: ['Tests A/B', 'Puissance statistique', 'Diff-in-diff'],
    icon: 'flask',
    Page: lazy(() => import('./labo-ab-causal')),
  },
  {
    slug: 'prevision-ventes',
    title: 'Prévision de ventes',
    summary: 'Charge un CSV (ou un exemple) et obtiens une prévision avec intervalles de confiance et explication.',
    skills: ['Séries temporelles', 'Prévision', 'Validation hors échantillon'],
    icon: 'trending-up',
    Page: lazy(() => import('./prevision-ventes')),
  },
];

export const demoBySlug = (slug: string | undefined) => DEMOS.find((d) => d.slug === slug);
