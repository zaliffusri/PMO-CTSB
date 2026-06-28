import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, seedDemo } from './db/schema.js';
import { store } from './db/store.js';
import { publicBrandingPayload } from './routes/settings.js';
import { projectsRouter } from './routes/projects.js';
import { clientsRouter } from './routes/clients.js';
import { peopleRouter } from './routes/people.js';
import { assignmentsRouter } from './routes/assignments.js';
import { activitiesRouter } from './routes/activities.js';
import { availabilityRouter } from './routes/availability.js';
import { projectTasksRouter } from './routes/projectTasks.js';
import { issuesRouter } from './routes/issues.js';
import { notificationsRouter } from './routes/notifications.js';
import { backlogsRouter } from './routes/backlogs.js';
import { projectPhasesRouter } from './routes/projectPhases.js';
import { workPackagesRouter } from './routes/workPackages.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/requireAuth.js';
import { usersRouter } from './routes/users.js';
import { settingsRouter } from './routes/settings.js';
import { auditLogRouter } from './routes/auditLog.js';
import { adminDbRouter } from './routes/adminDb.js';
import { attachmentsRouter } from './routes/attachments.js';

initDb();
// Seed demo data only for local runs that explicitly allow local store.
if (process.env.ALLOW_LOCAL_STORE === '1') {
  seedDemo();
}

export const app = express();
app.use(cors({ origin: true }));
app.options('*', cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/settings/public', (req, res) => res.json(publicBrandingPayload()));
app.use('/api', requireAuth);

app.use('/api/projects', projectsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/people', peopleRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/project-tasks', projectTasksRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/backlogs', backlogsRouter);
app.use('/api/project-phases', projectPhasesRouter);
app.use('/api/work-packages', workPackagesRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/audit-log', auditLogRouter);
app.use('/api/admin/db', adminDbRouter);
app.use('/api/attachments', express.json({ limit: '12mb' }), attachmentsRouter);

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
