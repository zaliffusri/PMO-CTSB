import { app } from '../server.js';
import { captureException } from '../lib/sentry.js';

export default function handler(req, res) {
  // Backend app defines routes under /api/*.
  // Accept both /auth/* and /api/auth/* by prefixing /api when needed.
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  try {
    return app.handle(req, res);
  } catch (err) {
    captureException(err, { path: req.url, method: req.method });
    throw err;
  }
}
