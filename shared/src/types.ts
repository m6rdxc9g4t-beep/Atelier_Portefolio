/**
 * Types du contenu des projets.
 * Les fiches JSON (server/data/projects/*.json) suivent ce schéma :
 * elles sont rédigées à partir des rapports PDF de chaque projet.
 */

export type Level = 'M1' | 'M2' | 'Stage' | 'Perso' | 'Projet';

export interface Kpi {
  value: string;
  label: string;
  note?: string;
}

export type Block =
  | { type: 'text'; md: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; title?: string; columns: string[]; rows: string[][]; note?: string }
  | { type: 'formula'; tex: string; caption?: string }
  | { type: 'figure'; src: string; caption: string }
  | { type: 'callout'; md: string };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

export interface DataDescription {
  source?: string;
  unit?: string;
  period?: string;
  n?: string;
  variables?: { name: string; label: string; type?: string }[];
  cleaning?: string[];
}

export interface CodeSnippet {
  language: 'r' | 'python' | 'sql' | 'ts';
  title: string;
  code: string;
}

/** Fiche complète d'un projet (contenu éditorial + données chiffrées). */
export interface ProjectContent {
  slug: string;
  title: string;
  subtitle: string;
  course: string;
  level: Level;
  date: string;
  authors: string[];
  supervisor?: string | null;
  tools: string[];
  methods: string[];
  abstract: string;
  question: string;
  kpis: Kpi[];
  data?: DataDescription;
  sections: Section[];
  /** Séries chiffrées réutilisées par les graphiques interactifs. */
  figures: Record<string, any>;
  /** Paramètres complets d'un modèle (simulateurs). */
  model?: Record<string, any>;
  conclusions: string[];
  limits: string[];
  codeSnippet?: CodeSnippet;
  changesVsOldSite?: string[];
}

export type Category =
  | 'sante'
  | 'risque'
  | 'temps'
  | 'immobilier'
  | 'micro'
  | 'texte'
  | 'bi'
  | 'ia';

export interface PowerBIPage {
  label: string;
  url: string;
}

/** Métadonnées de présentation (catalogue). */
export interface ProjectMeta {
  slug: string;
  order: number;
  category: Category;
  /** Couleur d'accent de la carte projet. */
  accent: string;
  /** Pictogramme court (emoji) de la carte. */
  icon: string;
  /** Nom du module interactif de la page. */
  interactive: string;
  year: number;
  featured?: boolean;
  /** Rapports téléchargeables (client/public/reports). */
  reports?: { file: string; label: string }[];
  powerbi?: PowerBIPage[];
}

export interface ProjectSummary extends ProjectMeta {
  title: string;
  subtitle: string;
  course: string;
  level: Level;
  date: string;
  authors: string[];
  tools: string[];
  methods: string[];
  kpis: Kpi[];
}

export interface Project extends ProjectSummary {
  content: ProjectContent;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  sante: 'Santé publique',
  risque: 'Scoring & risque',
  temps: 'Séries temporelles & finance',
  immobilier: 'Immobilier & spatial',
  micro: 'Microéconométrie',
  texte: 'Analyse textuelle',
  bi: 'Data-viz & BI',
  ia: 'IA & outils',
};
