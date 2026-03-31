import express from 'express';
import cors from 'cors';
import { initDb, seedDemo } from './db/schema.js';
import { projectsRouter } from './routes/projects.js';
import { clientsRouter } from './routes/clients.js';
import { peopleRouter } from './routes/people.js';
import { assignmentsRouter } from './routes/assignments.js';
import { activitiesRouter } from './routes/activities.js';
import { availabilityRouter } from './routes/availability.js';
import { projectTasksRouter } from './routes/projectTasks.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/requireAuth.js';
import { usersRouter } from './routes/users.js';
import { settingsRouter } from './routes/settings.js';
import { auditLogRouter } from './routes/auditLog.js';

initDb();
seedDemo();

export const app = express();
const originEnv = process.env.FRONTEND_ORIGIN || '';
const allowedOrigins = originEnv
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS blocked by FRONTEND_ORIGIN'));
    },
  }),
);
app.use(express.json());

app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', requireAuth);

app.use('/api/projects', projectsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/people', peopleRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/project-tasks', projectTasksRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/audit-log', auditLogRouter);

const PORT = process.env.PORT || 3001;
// When hosted as a Vercel serverless function, `process.env.VERCEL` is set and we should not call `app.listen`.
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`PMO CTSB API running at http://localhost:${PORT}`));
}
