import { store } from './store.js';

export function initDb() {
  // No-op; store uses JSON file
}

export function seedDemo() {
  if (store.clients.length === 0) {
    store.addClient({ name: 'Ministry of Health', contact_name: 'Dr. Sarah Lim', email: 'sarah.lim@moh.gov.my', phone: '+60-3-12345678' });
    store.addClient({ name: 'UTHM', contact_name: 'Prof. Ahmad', email: 'ahmad@uthm.edu.my', phone: '+60-7-4567890' });
    store.addClient({ name: 'Tech Solutions Sdn Bhd', contact_name: 'Lee Ming', email: 'lee@techsolutions.my', phone: '+60-3-9876543' });
  }
  if (store.people.length === 0) {
  const people = [
    { name: 'Ahmad Rizal', email: 'ahmadrizal@company.com', role: 'Developer' },
    { name: 'Siti Nur', email: 'sitinu@company.com', role: 'Analyst' },
    { name: 'Lee Wei Ming', email: 'leeweiming@company.com', role: 'Developer' },
    { name: 'Priya Sharma', email: 'priyasharma@company.com', role: 'Analyst' },
    { name: 'John Tan', email: 'johntan@company.com', role: 'Developer' },
  ];
  people.forEach(p => store.addPerson(p));

  store.addProject({ name: 'Project Alpha', description: 'Main digital transformation', status: 'active', start_date: '2025-01-01', end_date: '2025-06-30', client_id: 1, tags: ['digital-transformation', 'government'] });
  store.addProject({ name: 'Project Beta', description: 'Internal portal upgrade', status: 'active', start_date: '2025-02-01', end_date: '2025-08-31', client_id: 2, tags: ['internal', 'portal'] });

  store.addAssignment({ project_id: 1, person_id: 1, role_in_project: 'Lead', allocation_percent: 80 });
  store.addAssignment({ project_id: 1, person_id: 2, role_in_project: 'Member', allocation_percent: 60 });
  store.addAssignment({ project_id: 2, person_id: 2, role_in_project: 'Member', allocation_percent: 40 });
  store.addAssignment({ project_id: 2, person_id: 3, role_in_project: 'Lead', allocation_percent: 100 });
  store.addAssignment({ project_id: 2, person_id: 4, role_in_project: 'Member', allocation_percent: 50 });

  const today = new Date().toISOString().slice(0, 10);
  store.addActivity({ person_id: 1, project_id: 1, type: 'meeting', title: 'Sprint planning', description: 'Weekly sprint planning', location: 'Meeting room A', start_at: `${today}T09:00:00`, end_at: `${today}T10:30:00` });
  store.addActivity({ person_id: 2, project_id: 1, type: 'meeting', title: 'Stakeholder sync', description: 'Client sync', location: 'UTHM campus', start_at: `${today}T14:00:00`, end_at: `${today}T15:00:00` });
  store.addActivity({ person_id: 3, project_id: 2, type: 'task', title: 'Code review', description: 'Backend PR review', location: 'Remote', start_at: `${today}T11:00:00`, end_at: `${today}T12:00:00` });
  }

  if (store.project_tasks.length === 0 && store.projects.length >= 2) {
    store.addProjectTask({ project_id: 1, name: 'Discovery & design', planned_start_date: '2025-01-01', planned_end_date: '2025-02-15', actual_start_date: '2025-01-01', actual_end_date: '2025-02-20', progress_percent: 100, sort_order: 0, status: 'done' });
    store.addProjectTask({ project_id: 1, name: 'Development phase 1', planned_start_date: '2025-02-16', planned_end_date: '2025-04-30', actual_start_date: '2025-02-21', actual_end_date: null, progress_percent: 60, sort_order: 1, status: 'ongoing' });
    store.addProjectTask({ project_id: 1, name: 'Testing & rollout', planned_start_date: '2025-05-01', planned_end_date: '2025-06-30', actual_start_date: null, actual_end_date: null, progress_percent: 0, sort_order: 2, status: 'new' });
    store.addProjectTask({ project_id: 2, name: 'Requirements', planned_start_date: '2025-02-01', planned_end_date: '2025-03-15', actual_start_date: '2025-02-01', actual_end_date: '2025-03-10', progress_percent: 100, sort_order: 0, status: 'done' });
    store.addProjectTask({ project_id: 2, name: 'Build & integrate', planned_start_date: '2025-03-16', planned_end_date: '2025-07-31', actual_start_date: '2025-03-11', actual_end_date: null, progress_percent: 45, sort_order: 1, status: 'ongoing' });
    store.addProjectTask({ project_id: 2, name: 'Go-live', planned_start_date: '2025-08-01', planned_end_date: '2025-08-31', actual_start_date: null, actual_end_date: null, progress_percent: 0, sort_order: 2, status: 'new' });
  }
}
