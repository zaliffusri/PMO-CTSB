/**
 * Central API route registration — keeps server.js focused on bootstrap only.
 */
import express from 'express';
import { authRouter } from './auth.js';
import { projectsRouter } from './projects.js';
import { clientsRouter } from './clients.js';
import { peopleRouter } from './people.js';
import { assignmentsRouter } from './assignments.js';
import { activitiesRouter } from './activities.js';
import { availabilityRouter } from './availability.js';
import { projectTasksRouter } from './projectTasks.js';
import { issuesRouter } from './issues.js';
import { notificationsRouter } from './notifications.js';
import { backlogsRouter } from './backlogs.js';
import { projectPhasesRouter } from './projectPhases.js';
import { workPackagesRouter } from './workPackages.js';
import { usersRouter } from './users.js';
import { settingsRouter, publicBrandingPayload } from './settings.js';
import { auditLogRouter } from './auditLog.js';
import { adminDbRouter } from './adminDb.js';
import { attachmentsRouter } from './attachments.js';
import { requireAuth } from '../middleware/requireAuth.js';

export { publicBrandingPayload };

export function registerApiRoutes(app, { jsonLimitAttachments = '12mb' } = {}) {
  app.use('/api/auth', authRouter);
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/settings/public', async (req, res) => res.json(await publicBrandingPayload()));

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
  app.use('/api/attachments', express.json({ limit: jsonLimitAttachments }), attachmentsRouter);
}
