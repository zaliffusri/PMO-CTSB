/**
 * Store facade — repository composer.
 * Production: repositories query Supabase/Postgres directly (stateless).
 * Local (ALLOW_LOCAL_STORE without Supabase): in-memory via dataState.
 */
import { initDataState, resetLocalDemoData } from './runtime/dataState.js';
import { createClientsRepository } from './repositories/clientsRepository.js';
import { createPeopleRepository } from './repositories/peopleRepository.js';
import { createProjectsRepository } from './repositories/projectsRepository.js';
import { createAssignmentsRepository } from './repositories/assignmentsRepository.js';
import { createActivitiesRepository } from './repositories/activitiesRepository.js';
import { createProjectTasksRepository } from './repositories/projectTasksRepository.js';
import { createAuthRepository } from './repositories/authRepository.js';
import { createSettingsRepository } from './repositories/settingsRepository.js';
import { createIssuesRepository } from './repositories/issuesRepository.js';
import { createNotificationsRepository } from './repositories/notificationsRepository.js';
import { createBacklogsRepository } from './repositories/backlogsRepository.js';
import { createDeliveryRepository } from './repositories/deliveryRepository.js';
import { createAttachmentsRepository } from './repositories/attachmentsRepository.js';
import { purgeProjectFromSupabase, hasSupabaseClient } from './runtime/supabaseSync.js';
import { mergeRepositories } from './runtime/mergeRepositories.js';

const ctx = await initDataState();
let store;
const getStore = () => store;

store = mergeRepositories(
  createClientsRepository(ctx, getStore),
  createPeopleRepository(ctx, getStore),
  createProjectsRepository(ctx, getStore),
  createAssignmentsRepository(ctx, getStore),
  createActivitiesRepository(ctx, getStore),
  createProjectTasksRepository(ctx, getStore),
  createAuthRepository(ctx, getStore),
  createSettingsRepository(ctx, getStore),
  createIssuesRepository(ctx, getStore),
  createNotificationsRepository(ctx, getStore),
  createBacklogsRepository(ctx, getStore),
  createDeliveryRepository(ctx, getStore),
  createAttachmentsRepository(ctx, getStore),
  {
    /**
     * No-op in DB mode (writes already durable).
     * Kept so existing route contracts that call persistToSupabase() do not break.
     */
    async persistToSupabase() {
      return true;
    },
    async persistProjectById() {
      return true;
    },
    async persistAssignmentsToSupabase() {
      return true;
    },
    async persistUsersToSupabase() {
      return true;
    },
    async persistNotificationsToSupabase() {
      return true;
    },
    async purgeProjectFromSupabase(projectId) {
      if (!hasSupabaseClient()) return;
      await purgeProjectFromSupabase(projectId);
    },
    async reloadFromSupabase() {
      return ctx.reloadFromSupabase();
    },
  },
);

export { store, resetLocalDemoData };
