/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse de la démo publique de DataMind (ex. https://demo-datamind.<domaine>), fixée à la construction. */
  readonly VITE_DATAMIND_DEMO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
