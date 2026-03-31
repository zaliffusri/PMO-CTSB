import { app } from '../../backend/server.js';

export default function handler(req, res) {
  try {
    // Vercel serverless routes usually mount at `/api/<something>`.
    // Our Express app expects `/api/...`, so ensure the prefix exists.
    if (req.url && !req.url.startsWith('/api')) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }
    return app.handle(req, res);
  } catch (e) {
    const message = e?.message || 'Internal server error';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}

