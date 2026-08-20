import { ZodError } from 'zod';

/**
 * Validate req.body (or a custom source) with a Zod schema.
 * On failure returns 400 with field errors — does not throw into Express error handler.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.body ?? {});
      req.body = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: err.issues.map((i) => ({
            path: i.path.join('.') || '(root)',
            message: i.message,
          })),
        });
      }
      return res.status(400).json({ error: err?.message || 'Invalid request body' });
    }
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query ?? {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Invalid query',
          details: err.issues.map((i) => ({
            path: i.path.join('.') || '(root)',
            message: i.message,
          })),
        });
      }
      return res.status(400).json({ error: err?.message || 'Invalid query' });
    }
  };
}
