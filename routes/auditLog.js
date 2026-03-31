import { Router } from 'express';
import { store } from '../db/store.js';
import { requireAdmin } from '../middleware/requireAuth.js';

export const auditLogRouter = Router();

auditLogRouter.get('/', requireAdmin, (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  res.json(store.listAuditLog({ limit, offset }));
});
