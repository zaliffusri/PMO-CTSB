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
import { persistDataToSupabase } from './runtime/supabaseSync.js';

const ctx = await initDataState();
let store;
const getStore = () => store;
store = Object.assign(
  {},
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
    async persistToSupabase() {
      await persistDataToSupabase(ctx.getData());
    },
  },
);

export { store, resetLocalDemoData };
