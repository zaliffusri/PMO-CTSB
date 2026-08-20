import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, seedDemo } from './db/schema.js';
import { registerApiRoutes } from './routes/registerApi.js';
import { logger } from './lib/logger.js';
import { initSentry, captureException } from './lib/sentry.js';

await initSentry();

initDb();
// Seed demo data only for local runs that explicitly allow local store.
if (process.env.ALLOW_LOCAL_STORE === '1') {
  await seedDemo();
}

export const app = express();
app.use(cors({ origin: true }));
app.options('*', cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    logger.info('http_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - started,
      user_id: req.user?.id,
    });
  });
  next();
});

registerApiRoutes(app);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  captureException(err, {
    path: req.path,
    method: req.method,
    user_id: req.user?.id,
  });
  logger.error('http_error', {
    path: req.path,
    method: req.method,
    status,
    err: err?.message || String(err),
  });
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, './dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(frontendIndexPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(frontendIndexPath);
  });
}

const PORT = process.env.PORT || 3001;
// When hosted as a Vercel serverless function, `process.env.VERCEL` is set and we should not call `app.listen`.
if (!process.env.VERCEL) {
  app.listen(PORT, () => logger.info('api_listen', { port: PORT }));
}
