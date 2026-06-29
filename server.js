import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, seedDemo } from './db/schema.js';
import { registerApiRoutes } from './routes/registerApi.js';

initDb();
// Seed demo data only for local runs that explicitly allow local store.
if (process.env.ALLOW_LOCAL_STORE === '1') {
  seedDemo();
}

export const app = express();
app.use(cors({ origin: true }));
app.options('*', cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

registerApiRoutes(app);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  console.error(err);
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
  app.listen(PORT, () => console.log(`PMO CTSB API running at http://localhost:${PORT}`));
}
