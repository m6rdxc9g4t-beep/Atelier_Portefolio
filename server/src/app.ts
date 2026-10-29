import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config.js';
import { projectsRouter } from './routes/projects.js';
import { modelsRouter } from './routes/models.js';
import { contactRouter } from './routes/contact.js';
import { datamindRouter } from './routes/datamind.js';

export function createApp({ serveClient = config.isProd }: { serveClient?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          // Tableaux de bord Power BI publiés sur le web.
          frameSrc: ["'self'", 'https://app.powerbi.com'],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '300kb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  api.use(projectsRouter);
  api.use(modelsRouter);
  api.use(contactRouter);
  api.use(datamindRouter);
  api.use((_req, res) => res.status(404).json({ error: 'Route API inconnue' }));
  app.use('/api', api);

  if (serveClient && fs.existsSync(config.clientDist)) {
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    const indexHtml = path.join(config.clientDist, 'index.html');
    // Application monopage : toute route non-API renvoie index.html.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(indexHtml);
    });
  }

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
    console.error(err);
    res.status(err.status ?? 500).json({ error: 'Erreur interne du serveur' });
  });

  return app;
}
