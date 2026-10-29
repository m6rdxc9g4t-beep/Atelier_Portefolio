import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Racine du paquet serveur (fonctionne depuis src/ en dev et depuis dist/ en production). */
const serverRoot = path.resolve(here, '..');

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  isProd: process.env.NODE_ENV === 'production',
  dataDir: process.env.DATA_DIR ?? path.join(serverRoot, 'data'),
  /** Build du frontend servi en production. */
  clientDist: process.env.CLIENT_DIST ?? path.resolve(serverRoot, '../client/dist'),
  /** Fichier où sont enregistrés les messages du formulaire de contact. */
  messagesFile: process.env.MESSAGES_FILE ?? path.join(serverRoot, 'storage', 'messages.jsonl'),
  /** Clé optionnelle : active l'agent DataMind (proxy vers l'API Claude). */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
};
