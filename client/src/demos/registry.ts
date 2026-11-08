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
  /** Famille de compétences : regroupe les démos sur la page /demos. */
  theme: DemoTheme;
  /** Données réelles (publiques) plutôt que simulées. */
  realData?: boolean;
  /** Mise en avant sur la page d'accueil (3 au plus). */
  featured?: boolean;
  Page: LazyExoticComponent<ComponentType>;
}

export type DemoTheme = 'analyse' | 'econometrie' | 'ml' | 'engineering';

/** Familles de démos, dans l'ordre d'affichage de la page /demos. */
export const DEMO_THEMES: { id: DemoTheme; title: string; lede: string }[] = [
  { id: 'analyse', title: 'Analyse et BI', lede: 'Interroger, contrôler et restituer : SQL, qualité des données, tableaux de bord et suivi en temps réel.' },
  { id: 'econometrie', title: 'Économétrie et inférence causale', lede: 'Mesurer un effet plutôt qu’une corrélation : régression et diagnostics, élasticité, tests A/B, contrôle synthétique, prévision.' },
  { id: 'ml', title: 'Machine learning appliqué', lede: 'Des modèles qui débouchent sur une décision chiffrée : churn, segmentation, durée de vie client, attribution.' },
  { id: 'engineering', title: 'Data engineering', lede: 'Ce qui rend l’analyse fiable : modèles de données normalisés, pipelines testés, lignage.' },
];

export const DEMOS: DemoEntry[] = [
  {
    slug: 'observatoire-immobilier',
    title: 'Observatoire immobilier',
    summary: 'Prix au m² des ventes réelles (DVF) par commune, sur carte, avec tendances et estimation de prix.',
    skills: ['Données publiques DVF', 'Cartographie', 'Modèle hédonique'],
    icon: 'map',
    theme: 'econometrie',
    realData: true,
    Page: lazy(() => import('./observatoire-immobilier')),
  },
  {
    slug: 'ecommerce-temps-reel',
    title: 'E-commerce en temps réel',
    summary: 'Tableau de bord d’une boutique simulée : flux de commandes, indicateurs, alertes et détection d’anomalies.',
    skills: ['Pilotage temps réel', 'KPI', 'Détection d’anomalies'],
    icon: 'activity',
    theme: 'analyse',
    Page: lazy(() => import('./ecommerce-temps-reel')),
  },
  {
    slug: 'labo-ab-causal',
    title: 'Labo A/B et inférence causale',
    summary: 'Taille d’échantillon, significativité, puissance et différence de différences, expliquées pas à pas.',
    skills: ['Tests A/B', 'Puissance statistique', 'Diff-in-diff'],
    icon: 'flask',
    theme: 'econometrie',
    Page: lazy(() => import('./labo-ab-causal')),
  },
  {
    slug: 'prevision-ventes',
    title: 'Prévision de ventes',
    summary: 'Chargez un CSV (ou un exemple) et obtenez une prévision avec ses intervalles et son explication.',
    skills: ['Séries temporelles', 'Prévision', 'Validation hors échantillon'],
    icon: 'trending-up',
    theme: 'econometrie',
    Page: lazy(() => import('./prevision-ventes')),
  },
  {
    slug: 'sql-lab',
    title: 'SQL Lab',
    summary: 'Une vraie base SQLite dans le navigateur : écrivez vos requêtes sur deux ans de ventes et relevez neuf défis corrigés automatiquement.',
    skills: ['SQL analytique', 'Fonctions de fenêtre', 'Modèle de ventes'],
    icon: 'database',
    theme: 'analyse',
    featured: true,
    Page: lazy(() => import('./sql-lab')),
  },
  {
    slug: 'qualite-donnees',
    title: 'Qualité des données',
    summary: 'Déposez un CSV : profil de chaque colonne, doublons même déguisés, score sur 100 et nettoyage téléchargeable.',
    skills: ['Profilage de données', 'Statistiques robustes', 'Dédoublonnage'],
    icon: 'shield-check',
    theme: 'analyse',
    Page: lazy(() => import('./qualite-donnees')),
  },
  {
    slug: 'tableau-de-bord',
    title: 'Tableau de bord des ventes',
    summary: 'Deux ans de ventes d’une boutique, filtrées en un clic et comparées à l’année précédente à périmètre égal, cohortes comprises.',
    skills: ['Définition de KPI', 'Comparaison à périmètre égal', 'Analyse de cohortes'],
    icon: 'layout-dashboard',
    theme: 'analyse',
    Page: lazy(() => import('./tableau-de-bord')),
  },
  {
    slug: 'modelisation-donnees',
    title: 'Modélisation de données',
    summary: 'Dessinez un schéma relationnel : diagnostic des formes normales, SQL pour PostgreSQL, SQLite et MySQL, testé en direct dans SQLite.',
    skills: ['Modélisation relationnelle', 'Formes normales', 'SQL DDL'],
    icon: 'network',
    theme: 'engineering',
    Page: lazy(() => import('./modelisation-donnees')),
  },
  {
    slug: 'segmentation-clients',
    title: 'Segmentation clients',
    summary: 'Les clients d’une boutique regroupés deux fois, par scores RFM puis par k-means, avec un portrait et une action marketing par groupe.',
    skills: ['Segmentation RFM', 'Clustering k-means', 'ACP'],
    icon: 'users',
    theme: 'ml',
    Page: lazy(() => import('./segmentation-clients')),
  },
  {
    slug: 'elasticite-prix',
    title: 'Élasticité-prix',
    summary: 'Mesurez la sensibilité au prix sans vous laisser piéger par la saison, puis trouvez le prix qui maximise la marge.',
    skills: ['Économétrie appliquée', 'Biais de variable omise', 'Tarification'],
    icon: 'tag',
    theme: 'econometrie',
    featured: true,
    Page: lazy(() => import('./elasticite-prix')),
  },
  {
    slug: 'score-churn',
    title: 'Score de churn',
    summary: 'Une régression logistique écrite à la main prédit qui va résilier ; ROC, calibration, puis un seuil de contact choisi en euros.',
    skills: ['Régression logistique', 'Évaluation d’un classifieur', 'Décision au coût'],
    icon: 'target',
    theme: 'ml',
    featured: true,
    Page: lazy(() => import('./score-churn')),
  },
  {
    slug: 'labo-regression',
    title: 'Labo de régression',
    summary: 'Moindres carrés écrits à la main : erreurs-types robustes, diagnostics expliqués et modèles côte à côte pour voir un biais apparaître.',
    skills: ['Économétrie', 'Erreurs-types robustes', 'Diagnostics de modèle'],
    icon: 'chart-scatter',
    theme: 'econometrie',
    Page: lazy(() => import('./labo-regression')),
  },
  {
    slug: 'attribution-marketing',
    title: 'Attribution marketing',
    summary: 'Sept modèles d’attribution, du dernier clic aux valeurs de Shapley, confrontés à l’effet réel de chaque canal, et le budget qu’ils déplaceraient.',
    skills: ['Attribution multi-touch', 'Chaînes de Markov', 'Valeurs de Shapley'],
    icon: 'route',
    theme: 'ml',
    Page: lazy(() => import('./attribution-marketing')),
  },
  {
    slug: 'pipeline-donnees',
    title: 'Pipeline de données',
    summary: 'Un projet à la dbt exécuté dans le navigateur : staging, marts, tests de données et lignage. Un doublon à la source fait échouer les tests jusqu’au mart, à vous de le corriger.',
    skills: ['Analytics engineering', 'Tests de données', 'Lignage'],
    icon: 'workflow',
    theme: 'engineering',
    Page: lazy(() => import('./pipeline-donnees')),
  },
  {
    slug: 'impact-sans-temoin',
    title: 'Impact sans groupe témoin',
    summary: 'Une campagne lancée dans une seule ville : un contrôle synthétique reconstruit ce qui se serait passé sans elle, des placebos disent si l’écart est réel.',
    skills: ['Contrôle synthétique', 'Différence de différences', 'Tests par permutation'],
    icon: 'crosshair',
    theme: 'econometrie',
    Page: lazy(() => import('./impact-sans-temoin')),
  },
  {
    slug: 'duree-vie-client',
    title: 'Durée de vie client',
    summary: 'Kaplan-Meier, log-rank et modèle de Cox écrits à la main : combien de temps restent les abonnés, ce qui les fait partir, et ce que vaut chaque profil en euros.',
    skills: ['Analyse de survie', 'Modèle de Cox', 'Valeur vie client'],
    icon: 'hourglass',
    theme: 'ml',
    Page: lazy(() => import('./duree-vie-client')),
  },
];

export const demoBySlug = (slug: string | undefined) => DEMOS.find((d) => d.slug === slug);
