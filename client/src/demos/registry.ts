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
    summary: 'Chargez un CSV (ou un exemple) et obtenez une prévision avec ses intervalles et son explication.',
    skills: ['Séries temporelles', 'Prévision', 'Validation hors échantillon'],
    icon: 'trending-up',
    Page: lazy(() => import('./prevision-ventes')),
  },
  {
    slug: 'sql-lab',
    title: 'SQL Lab',
    summary: 'Une vraie base SQLite dans le navigateur : écrivez vos requêtes sur deux ans de ventes et relevez neuf défis corrigés automatiquement.',
    skills: ['SQL analytique', 'Fonctions de fenêtre', 'Modèle de ventes'],
    icon: 'database',
    Page: lazy(() => import('./sql-lab')),
  },
  {
    slug: 'qualite-donnees',
    title: 'Qualité des données',
    summary: 'Déposez un CSV : profil de chaque colonne, doublons même déguisés, score sur 100 et nettoyage téléchargeable.',
    skills: ['Profilage de données', 'Statistiques robustes', 'Dédoublonnage'],
    icon: 'shield-check',
    Page: lazy(() => import('./qualite-donnees')),
  },
  {
    slug: 'tableau-de-bord',
    title: 'Tableau de bord des ventes',
    summary: 'Deux ans de ventes d’une boutique, filtrées en un clic et comparées à l’année précédente à périmètre égal, cohortes comprises.',
    skills: ['Définition de KPI', 'Comparaison à périmètre égal', 'Analyse de cohortes'],
    icon: 'layout-dashboard',
    Page: lazy(() => import('./tableau-de-bord')),
  },
  {
    slug: 'modelisation-donnees',
    title: 'Modélisation de données',
    summary: 'Dessinez un schéma relationnel : diagnostic des formes normales, SQL pour PostgreSQL, SQLite et MySQL, testé en direct dans SQLite.',
    skills: ['Modélisation relationnelle', 'Formes normales', 'SQL DDL'],
    icon: 'network',
    Page: lazy(() => import('./modelisation-donnees')),
  },
];

export const demoBySlug = (slug: string | undefined) => DEMOS.find((d) => d.slug === slug);
