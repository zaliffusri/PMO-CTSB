import { app } from '../../server.js';

export default function handler(req, res) {
  // Force this function path to hit Express auth routes.
  // Works even if Vercel strips the /api prefix before invoking handlers.
  const incoming = req.url || '/';
  const clean = incoming.startsWith('/') ? incoming : `/${incoming}`;
  req.url = clean.startsWith('/api/auth') ? clean : `/api/auth${clean}`;
  return app.handle(req, res);
}

