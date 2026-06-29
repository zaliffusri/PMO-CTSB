import { hashPassword } from '../lib/auth.js';
import { templateForClassification } from '../lib/phaseConstants.js';
import { seedBulkVolumeData } from './demoSeedBulk.js';

export const DEMO_SEED_VERSION = 10;

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoRange(startDayOffset, endDayOffset, startHour = 9, endHour = 17) {
  const start = new Date();
  start.setDate(start.getDate() + startDayOffset);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + endDayOffset);
  end.setHours(endHour, 0, 0, 0);
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function isoAt(dayOffsetDays, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Rich calendar spread across the current month for demos and UI testing. */
function seedCalendarActivities(store, ctx) {
  const {
    p1, p2, p3, p4, p5, p6,
    projPortal, projApi, projMaint, projMigration, projTender,
  } = ctx;
  const add = (row) => store.addActivity(row);

  // —— Past two weeks ——
  add({
    person_id: p1,
    project_id: projPortal,
    type: 'meeting',
    title: 'Sprint review with DBKL',
    description: 'Fortnightly demo and backlog grooming.',
    location: 'DBKL HQ',
    start_at: isoAt(-12, 10, 0),
    end_at: isoAt(-12, 11, 30),
  });
  add({
    person_id: p2,
    project_id: projPortal,
    type: 'urs',
    title: 'URS sign-off — licensing module',
    location: 'MBSA',
    start_at: isoAt(-11, 9, 30),
    end_at: isoAt(-11, 12, 0),
  });
  add({
    person_id: p3,
    project_id: projApi,
    type: 'fat',
    title: 'FAT session — MOH API gateway',
    location: 'MOH Putrajaya',
    start_at: isoAt(-10, 14, 0),
    end_at: isoAt(-10, 17, 0),
  });
  add({
    person_id: p4,
    project_id: projPortal,
    type: 'uat',
    title: 'UAT cycle 1 — citizen payments',
    location: 'MSC Office',
    start_at: isoAt(-9, 9, 0),
    end_at: isoAt(-9, 12, 0),
  });
  add({
    person_id: p5,
    project_id: projTender,
    type: 'tender',
    title: 'Smart City RFP — solution design',
    location: 'NUSAJAYA',
    start_at: isoAt(-8, 10, 0),
    end_at: isoAt(-8, 16, 0),
  });
  add({
    person_id: p6,
    project_id: projMaint,
    type: 'task',
    title: 'DBKL L3 — weekend incident review',
    location: 'Remote',
    start_at: isoAt(-7, 9, 0),
    end_at: isoAt(-7, 10, 30),
  });
  add({
    person_id: p1,
    project_id: projPortal,
    type: 'demo',
    title: 'Portal demo for MBSA steering',
    location: 'MBSA',
    start_at: isoAt(-6, 15, 0),
    end_at: isoAt(-6, 16, 30),
  });
  add({
    person_id: p2,
    project_id: projMigration,
    type: 'meeting',
    title: 'UTHM data mapping workshop',
    location: 'UTHM Parit Raja',
    start_at: isoAt(-5, 10, 0),
    end_at: isoAt(-5, 12, 0),
  });

  // Busy day (tests "+N more" in calendar UI)
  const busyDay = -4;
  add({ person_id: p1, project_id: projPortal, type: 'meeting', title: 'Daily stand-up', location: 'MSC Office', start_at: isoAt(busyDay, 9, 0), end_at: isoAt(busyDay, 9, 15) });
  add({ person_id: p2, project_id: projPortal, type: 'meeting', title: 'CR review with client', location: 'DBKL HQ', start_at: isoAt(busyDay, 10, 0), end_at: isoAt(busyDay, 11, 0) });
  add({ person_id: p3, project_id: projApi, type: 'meeting', title: 'API security review', location: 'MSC Office', start_at: isoAt(busyDay, 11, 30), end_at: isoAt(busyDay, 12, 30) });
  add({ person_id: p4, project_id: projPortal, type: 'uat', title: 'UAT defect triage', location: 'MSC Office', start_at: isoAt(busyDay, 14, 0), end_at: isoAt(busyDay, 15, 30) });
  add({ person_id: p5, project_id: projPortal, type: 'training', title: 'End-user training — DBKL clerks', location: 'DBKL HQ', start_at: isoAt(busyDay, 15, 30), end_at: isoAt(busyDay, 17, 0) });

  add({
    person_id: p3,
    project_id: projApi,
    type: 'task',
    title: 'MOH API load test analysis',
    location: 'Remote',
    start_at: isoAt(-3, 9, 0),
    end_at: isoAt(-3, 12, 0),
  });
  add({
    person_id: p4,
    project_id: projPortal,
    type: 'uat',
    title: 'UAT cycle 2 — complaints module',
    location: 'MSC Office',
    start_at: isoAt(-2, 9, 0),
    end_at: isoAt(-2, 17, 0),
  });
  add({
    person_id: p1,
    project_id: projPortal,
    type: 'meeting',
    title: 'Sprint review with DBKL',
    description: 'Fortnightly demo and backlog grooming.',
    location: 'DBKL HQ',
    start_at: isoAt(-1, 10, 0),
    end_at: isoAt(-1, 11, 30),
  });
  add({
    person_id: p5,
    project_id: projTender,
    type: 'meeting',
    title: 'Pre-sales technical Q&A',
    location: 'MSC Office',
    start_at: isoAt(-1, 14, 0),
    end_at: isoAt(-1, 15, 0),
  });

  // —— Today & near future ——
  add({
    person_id: p2,
    project_id: projPortal,
    type: 'meeting',
    title: 'URS clarification — licensing module',
    location: 'MBSA',
    start_at: isoAt(0, 14, 0),
    end_at: isoAt(0, 15, 0),
  });
  add({
    person_id: p3,
    project_id: projApi,
    type: 'task',
    title: 'MOH API load test analysis',
    location: 'Remote',
    start_at: isoAt(0, 9, 0),
    end_at: isoAt(0, 12, 0),
  });
  add({
    person_id: p4,
    project_id: projPortal,
    type: 'demo',
    title: 'Sprint demo — payment & licensing',
    location: 'MSC Office',
    start_at: isoAt(0, 10, 0),
    end_at: isoAt(0, 11, 0),
  });
  add({
    person_id: p6,
    project_id: projMaint,
    type: 'meeting',
    title: 'Weekly support sync',
    location: 'MSC Office',
    start_at: isoAt(0, 16, 0),
    end_at: isoAt(0, 16, 45),
  });

  add({
    person_id: p6,
    project_id: projMaint,
    type: 'task',
    title: 'L3 support — ticket queue review',
    location: 'MSC Office',
    start_at: isoAt(1, 9, 0),
    end_at: isoAt(1, 10, 0),
  });
  add({
    person_id: p1,
    project_id: projPortal,
    type: 'fat',
    title: 'FAT — citizen portal payments',
    location: 'DBKL HQ',
    start_at: isoAt(1, 10, 30),
    end_at: isoAt(1, 16, 0),
  });
  add({
    person_id: p2,
    project_id: projMigration,
    type: 'other',
    title: 'Data cleansing — batch 4 validation',
    location: 'Remote',
    start_at: isoAt(1, 13, 0),
    end_at: isoAt(1, 17, 0),
  });

  add({
    person_id: p5,
    project_id: projTender,
    type: 'meeting',
    title: 'Smart City RFP technical workshop',
    location: 'NUSAJAYA',
    start_at: isoAt(2, 10, 0),
    end_at: isoAt(2, 16, 0),
  });
  add({
    person_id: p3,
    project_id: projApi,
    type: 'go-live',
    title: 'MOH API — production cutover rehearsal',
    location: 'MOH Putrajaya',
    start_at: isoAt(2, 8, 0),
    end_at: isoAt(2, 12, 0),
  });

  // Multi-day outstation (spans cells across the week)
  const outstation = isoRange(3, 5, 8, 18);
  add({
    person_id: p1,
    project_id: projPortal,
    type: 'task',
    title: 'On-site deployment — MBSA',
    description: 'Production release and hypercare.',
    location: 'MBSA Shah Alam',
    ...outstation,
  });
  add({
    person_id: p3,
    project_id: projPortal,
    type: 'task',
    title: 'On-site deployment — MBSA',
    description: 'Production release and hypercare.',
    location: 'MBSA Shah Alam',
    ...outstation,
  });

  add({
    person_id: p4,
    project_id: projPortal,
    type: 'training',
    title: 'Admin training — portal back-office',
    location: 'DBKL HQ',
    start_at: isoAt(6, 9, 0),
    end_at: isoAt(6, 17, 0),
  });
  add({
    person_id: p2,
    project_id: projPortal,
    type: 'uat',
    title: 'UAT sign-off meeting',
    location: 'DBKL HQ',
    start_at: isoAt(7, 14, 0),
    end_at: isoAt(7, 15, 30),
  });
  add({
    person_id: p5,
    project_id: projTender,
    type: 'tender',
    title: 'RFP submission deadline support',
    location: 'MSC Office',
    start_at: isoAt(8, 9, 0),
    end_at: isoAt(8, 18, 0),
  });
  add({
    person_id: p6,
    project_id: projMaint,
    type: 'meeting',
    title: 'DBKL SLA monthly review',
    location: 'DBKL HQ',
    start_at: isoAt(9, 10, 0),
    end_at: isoAt(9, 11, 30),
  });
  add({
    person_id: p1,
    project_id: projPortal,
    type: 'go-live',
    title: 'PBT Portal — go-live readiness review',
    location: 'MSC Office',
    start_at: isoAt(10, 9, 0),
    end_at: isoAt(10, 11, 0),
  });
  add({
    person_id: p3,
    project_id: projApi,
    type: 'go-live',
    title: 'MOH API — production go-live',
    location: 'MOH Putrajaya',
    start_at: isoAt(12, 6, 0),
    end_at: isoAt(12, 14, 0),
  });
  add({
    person_id: p2,
    project_id: projMigration,
    type: 'meeting',
    title: 'UTHM migration steering committee',
    location: 'UTHM Parit Raja',
    start_at: isoAt(14, 10, 0),
    end_at: isoAt(14, 12, 0),
  });
  add({
    person_id: p4,
    project_id: projPortal,
    type: 'other',
    title: 'Post go-live hypercare stand-up',
    location: 'Remote',
    start_at: isoAt(15, 9, 0),
    end_at: isoAt(15, 9, 30),
  });
  add({
    person_id: p5,
    project_id: projTender,
    type: 'demo',
    title: 'Smart City — client solution demo',
    location: 'Putrajaya',
    start_at: isoAt(18, 14, 0),
    end_at: isoAt(18, 16, 0),
  });
}


function ensureUser(store, { name, email, role, password }) {
  const existing = store.findUserByEmail(email);
  if (existing) return existing.id;
  return store.addUser({
    name,
    email,
    role,
    password_hash: hashPassword(password),
  });
}

/**
 * Populate local store with a rich government/PBT-style demo portfolio.
 */
export function runRichDemoSeed(store) {
  const adminId = ensureUser(store, {
    name: 'Admin User',
    email: 'admin@pmo.local',
    role: 'admin',
    password: 'admin123',
  });
  const pmoId = ensureUser(store, {
    name: 'Nurul PMO',
    email: 'pmo@pmo.local',
    role: 'pmo',
    password: 'pmo123',
  });
  ensureUser(store, {
    name: 'Finance Officer',
    email: 'finance@pmo.local',
    role: 'finance',
    password: 'finance123',
  });
  ensureUser(store, {
    name: 'Ahmad Rizal',
    email: 'ahmadrizal@company.com',
    role: 'user',
    password: 'user123',
  });

  const mohId = store.findOrCreateClient('Ministry of Health');
  const dbklId = store.findOrCreateClient('DBKL');
  const mbsaId = store.findOrCreateClient('MBSA (Shah Alam)');
  const uthmId = store.findOrCreateClient('UTHM');

  const p1 = store.addPerson({ name: 'Ahmad Rizal', email: 'ahmadrizal@company.com', role: 'Developer' });
  const p2 = store.addPerson({ name: 'Siti Nur', email: 'sitinu@company.com', role: 'Business Analyst' });
  const p3 = store.addPerson({ name: 'Lee Wei Ming', email: 'leeweiming@company.com', role: 'Developer' });
  const p4 = store.addPerson({ name: 'Priya Sharma', email: 'priyasharma@company.com', role: 'QA Engineer' });
  const p5 = store.addPerson({ name: 'John Tan', email: 'johntan@company.com', role: 'Tech Lead' });
  const p6 = store.addPerson({ name: 'Farah Ilyana', email: 'farah@company.com', role: 'Support Engineer' });

  const projPortal = store.addProject({
    name: 'PBT Citizen Portal Phase 2',
    description: 'New citizen services portal for local authority — online payments, complaints, and licensing.',
    engagement_type: 'contract',
    classification: null,
    status: 'active',
    start_date: dayOffset(-120),
    end_date: dayOffset(90),
  });
  store.setProjectClients(projPortal, [dbklId, mbsaId]);

  const projApi = store.addProject({
    name: 'MOH Health API Gateway',
    description: 'National health data exchange API integration with agency systems.',
    engagement_type: 'letter_of_offer',
    classification: 'API Integration',
    status: 'active',
    start_date: dayOffset(-60),
    end_date: dayOffset(120),
  });
  store.setProjectClients(projApi, [mohId]);

  const projMaint = store.addProject({
    name: 'DBKL Core System Maintenance 2026',
    description: 'Annual maintenance and L3 support for legacy council systems.',
    engagement_type: 'contract',
    classification: 'Maintenance & Support',
    status: 'active',
    start_date: dayOffset(-30),
    end_date: dayOffset(335),
  });
  store.setProjectClients(projMaint, [dbklId]);

  const projMigration = store.addProject({
    name: 'UTHM Student Records Migration',
    description: 'Migrate legacy student data to the new SIS platform.',
    engagement_type: 'purchase_order',
    classification: 'Data Migration',
    status: 'on-hold',
    start_date: dayOffset(-14),
    end_date: dayOffset(180),
  });
  store.setProjectClients(projMigration, [uthmId]);

  const projTender = store.addProject({
    name: 'Smart City RFP — Pre-sales',
    description: 'Tender preparation and solution design for smart city initiative.',
    engagement_type: 'tender',
    classification: 'Pre-Sales / Tender',
    status: 'active',
    start_date: dayOffset(-7),
    end_date: dayOffset(45),
  });
  store.setProjectClients(projTender, [dbklId]);

  const projects = [
    { id: projApi, classification: 'API Integration' },
    { id: projMaint, classification: 'Maintenance & Support' },
    { id: projMigration, classification: 'Data Migration' },
    { id: projTender, classification: 'Pre-Sales / Tender' },
  ];

  for (const { id, classification } of projects) {
    const template = templateForClassification(classification);
    store.initProjectPhasesFromTemplate(id, template);
  }

  const maintPhases = store.project_phases.filter((ph) => ph.project_id === projMaint);
  const maintOnboarding = maintPhases.find((ph) => ph.phase_key === 'onboarding');
  const maintPeriod = maintPhases.find((ph) => ph.phase_key === 'maintenance');
  if (maintOnboarding) {
    store.updateProjectPhase(maintOnboarding.id, {
      status: 'completed',
      progress_percent: 100,
      completed_date: dayOffset(-45),
      payment_amount: 25000,
      payment_status: 'paid',
      paid_date: dayOffset(-40),
      invoice_no: 'INV-2026-014',
      invoice_date: dayOffset(-42),
    });
  }
  if (maintPeriod) {
    store.updateProjectPhase(maintPeriod.id, {
      status: 'in_progress',
      progress_percent: 35,
      payment_amount: 120000,
      payment_status: 'invoiced',
      invoice_no: 'INV-2026-028',
      invoice_date: dayOffset(-10),
      target_date: dayOffset(275),
    });
  }

  const projMaint2025 = store.addProject({
    name: 'MBSA IT Support 2025',
    description: 'Annual L2/L3 support — contract ended, pending renewal discussion.',
    engagement_type: 'contract',
    classification: 'Maintenance & Support',
    status: 'completed',
    start_date: dayOffset(-400),
    end_date: dayOffset(-35),
  });
  store.setProjectClients(projMaint2025, [mbsaId]);
  store.initProjectPhasesFromTemplate(projMaint2025, templateForClassification('Maintenance & Support'));
  for (const ph of store.project_phases.filter((p) => p.project_id === projMaint2025)) {
    if (ph.payment_status === 'not_applicable') {
      store.updateProjectPhase(ph.id, { status: 'completed', progress_percent: 100 });
      continue;
    }
    store.updateProjectPhase(ph.id, {
      status: 'completed',
      progress_percent: 100,
      completed_date: dayOffset(-60),
      payment_amount: ph.phase_key === 'maintenance' ? 96000 : 18000,
      payment_status: 'paid',
      paid_date: dayOffset(-55),
      invoice_no: ph.phase_key === 'maintenance' ? 'INV-2025-088' : 'INV-2025-072',
    });
  }

  // Multi-type engagement: one project, several work packages
  const wpPortal = store.addWorkPackage({
    project_id: projPortal,
    name: 'Citizen portal modules',
    description: 'Core portal UI, licensing, and complaints workflow.',
    classification: 'New System Development',
    status: 'active',
    start_date: dayOffset(-120),
    end_date: dayOffset(90),
  });
  const wpPayment = store.addWorkPackage({
    project_id: projPortal,
    name: 'Payment gateway API',
    description: 'FPX and card payment integration with treasury.',
    classification: 'API Integration',
    status: 'active',
    start_date: dayOffset(-60),
    end_date: dayOffset(45),
  });
  const wpData = store.addWorkPackage({
    project_id: projPortal,
    name: 'Legacy records import',
    description: 'Historical complaint and license data migration.',
    classification: 'Data Migration',
    status: 'on-hold',
    start_date: dayOffset(-14),
    end_date: dayOffset(120),
  });

  store.initProjectPhasesFromTemplate(projPortal, templateForClassification('New System Development'), wpPortal);
  store.initProjectPhasesFromTemplate(projPortal, templateForClassification('API Integration'), wpPayment);
  store.initProjectPhasesFromTemplate(projPortal, templateForClassification('Data Migration'), wpData);

  const portalPhases = store.project_phases.filter((ph) => ph.work_package_id === wpPortal);
  const ursPhase = portalPhases.find((ph) => ph.phase_key === 'urs');
  const devPhase = portalPhases.find((ph) => ph.phase_key === 'development');
  const uatPhase = portalPhases.find((ph) => ph.phase_key === 'uat');
  if (ursPhase) {
    store.updateProjectPhase(ursPhase.id, {
      status: 'completed',
      progress_percent: 100,
      completed_date: dayOffset(-45),
      payment_amount: 85000,
      payment_status: 'paid',
      paid_date: dayOffset(-40),
    });
  }
  if (devPhase) {
    store.updateProjectPhase(devPhase.id, {
      status: 'in_progress',
      progress_percent: 62,
      payment_amount: 180000,
      payment_status: 'pending',
    });
  }
  if (uatPhase) {
    store.updateProjectPhase(uatPhase.id, {
      payment_amount: 95000,
      payment_status: 'pending',
    });
  }

  const paymentPhases = store.project_phases.filter((ph) => ph.work_package_id === wpPayment);
  const payGoLive = paymentPhases.find((ph) => ph.phase_key === 'go_live');
  if (payGoLive) {
    store.updateProjectPhase(payGoLive.id, {
      status: 'completed',
      progress_percent: 100,
      completed_date: dayOffset(-3),
      payment_amount: 65000,
      payment_status: 'pending',
    });
  }

  const apiPhases = store.project_phases.filter((ph) => ph.project_id === projApi);
  const apiUat = apiPhases.find((ph) => ph.phase_key === 'uat');
  if (apiUat) {
    store.updateProjectPhase(apiUat.id, {
      status: 'completed',
      progress_percent: 100,
      completed_date: dayOffset(-5),
      payment_amount: 120000,
      payment_status: 'pending',
    });
  }

  store.addAssignment({ project_id: projPortal, person_id: p5, role_in_project: 'Project Lead', allocation_percent: 50 });
  store.addAssignment({ project_id: projPortal, person_id: p1, role_in_project: 'Developer', allocation_percent: 80 });
  store.addAssignment({ project_id: projPortal, person_id: p2, role_in_project: 'BA', allocation_percent: 60 });
  store.addAssignment({ project_id: projPortal, person_id: p4, role_in_project: 'QA', allocation_percent: 40 });
  store.addAssignment({ project_id: projApi, person_id: p3, role_in_project: 'Lead Developer', allocation_percent: 90 });
  store.addAssignment({ project_id: projApi, person_id: p1, role_in_project: 'Developer', allocation_percent: 30 });
  store.addAssignment({ project_id: projMaint, person_id: p6, role_in_project: 'Support', allocation_percent: 70 });
  store.addAssignment({ project_id: projMaint, person_id: p2, role_in_project: 'Coordinator', allocation_percent: 20 });
  store.addAssignment({ project_id: projMigration, person_id: p2, role_in_project: 'Analyst', allocation_percent: 50 });
  store.addAssignment({ project_id: projTender, person_id: p5, role_in_project: 'Solution Architect', allocation_percent: 40 });

  const gPortal = store.addProjectTask({
    project_id: projPortal,
    name: 'Citizen modules',
    task_kind: 'group',
    work_package_id: wpPortal,
    planned_start_date: dayOffset(-40),
    planned_end_date: dayOffset(60),
  });
  store.addProjectTask({
    project_id: projPortal,
    name: 'Payment gateway integration',
    task_kind: 'task',
    parent_id: gPortal,
    work_package_id: wpPortal,
    assignee_id: p1,
    planned_start_date: dayOffset(-20),
    planned_end_date: dayOffset(14),
    actual_start_date: dayOffset(-18),
    progress_percent: 55,
    status: 'ongoing',
    estimated_hours: 40,
    actual_hours: 22,
  });
  store.addProjectTask({
    project_id: projPortal,
    name: 'Complaint workflow UI',
    task_kind: 'task',
    parent_id: gPortal,
    work_package_id: wpPortal,
    assignee_id: p3,
    planned_start_date: dayOffset(-10),
    planned_end_date: dayOffset(21),
    actual_start_date: dayOffset(-8),
    progress_percent: 30,
    status: 'ongoing',
    estimated_hours: 32,
    actual_hours: 10,
  });
  store.addProjectTask({
    project_id: projPortal,
    name: 'UAT test scripts',
    task_kind: 'task',
    parent_id: gPortal,
    work_package_id: wpPortal,
    assignee_id: p4,
    planned_start_date: dayOffset(10),
    planned_end_date: dayOffset(35),
    progress_percent: 0,
    status: 'new',
  });
  store.addProjectTask({
    project_id: projApi,
    name: 'OAuth2 token service',
    task_kind: 'task',
    assignee_id: p3,
    planned_start_date: dayOffset(-25),
    planned_end_date: dayOffset(-3),
    actual_start_date: dayOffset(-24),
    actual_end_date: dayOffset(-2),
    progress_percent: 100,
    status: 'done',
  });
  store.addProjectTask({
    project_id: projApi,
    name: 'FHIR patient lookup API',
    task_kind: 'task',
    assignee_id: p1,
    planned_start_date: dayOffset(-5),
    planned_end_date: dayOffset(20),
    actual_start_date: dayOffset(-4),
    progress_percent: 40,
    status: 'ongoing',
  });
  store.addProjectTask({
    project_id: projMaint,
    name: 'Monthly patch release Jan',
    task_kind: 'task',
    assignee_id: p6,
    planned_start_date: dayOffset(-15),
    planned_end_date: dayOffset(-8),
    actual_start_date: dayOffset(-14),
    actual_end_date: dayOffset(-7),
    progress_percent: 100,
    status: 'done',
  });
  store.addProjectTask({
    project_id: projMaint,
    name: 'Recurring login timeout investigation',
    task_kind: 'task',
    assignee_id: p6,
    planned_start_date: dayOffset(-3),
    planned_end_date: dayOffset(7),
    progress_percent: 10,
    status: 'ongoing',
  });

  const issueLogin = store.addIssue({
    ticket_no: 'eT-CK-0001',
    title: 'Users cannot login after weekend deployment',
    description: 'Multiple agencies report HTTP 500 on login. Started Saturday 2am.',
    priority: 'critical',
    category: 'defect',
    incident_type: 'bug_defect',
    module_code: 'CK',
    epbt_module: 'Cukai',
    intake_channel: 'helpdesk',
    client_pic: 'Encik Razak (DBKL IT)',
    status: 'in_progress',
    project_id: projPortal,
    client_id: dbklId,
    assignee_person_id: p1,
    reporter_user_id: pmoId,
    external_ticket_ref: 'QA-HD-2026-0088',
    support_level: 'L2',
    l1_assignee_label: 'CTSB | Helpdesk L1',
    l2_assignee_label: 'CTSB | Senior Support',
  });
  const issueCr = store.addIssue({
    ticket_no: 'eT-PN-0002',
    title: 'CR-2026-004: Add export to Excel for audit report',
    description: 'Client requested new export format before UAT sign-off.',
    priority: 'high',
    category: 'change_request',
    incident_type: 'change_request',
    module_code: 'PN',
    epbt_module: 'Penilaian',
    intake_channel: 'email',
    client_pic: 'Puan Siti (MBSA)',
    status: 'open',
    project_id: projPortal,
    client_id: mbsaId,
    assignee_person_id: p2,
    reporter_user_id: adminId,
    external_ticket_ref: 'QA-HD-2026-0103',
    support_level: 'L1',
    l1_assignee_label: 'CTSB | Helpdesk L1',
  });
  const issueSupport = store.addIssue({
    ticket_no: 'eT-LSN-0003',
    title: 'How to reset user password in admin panel?',
    description: 'Council IT helpdesk inquiry — training documentation needed.',
    priority: 'low',
    category: 'support',
    incident_type: 'inquiry',
    module_code: 'LSN',
    epbt_module: 'Lesen',
    intake_channel: 'whatsapp',
    client_pic: 'DBKL Service Desk',
    status: 'waiting_agency',
    project_id: projMaint,
    client_id: dbklId,
    assignee_person_id: p6,
    reporter_user_id: pmoId,
    external_ticket_ref: 'QA-HD-2026-0091',
    support_level: 'L1',
    resolution_method: 'whatsapp',
    resolution_notes: 'Sent step-by-step guide via WhatsApp group',
    action_taken: 'Shared PDF guide and reset link in WhatsApp group',
    l1_assignee_label: 'CTSB | Helpdesk L1',
  });
  const issueData = store.addIssue({
    ticket_no: 'eT-CK-0004',
    title: 'Duplicate IC numbers in migrated records',
    description: 'Data quality check found 240 duplicate records in batch 3.',
    priority: 'high',
    category: 'data',
    incident_type: 'issue',
    module_code: 'CK',
    epbt_module: 'Cukai',
    intake_channel: 'helpdesk',
    client_pic: 'UTHM Data Team',
    status: 'open',
    project_id: projMigration,
    client_id: uthmId,
    assignee_person_id: p2,
    reporter_user_id: adminId,
    external_ticket_ref: 'QA-HD-2026-0115',
    support_level: 'L2',
    l1_assignee_label: 'CTSB | Helpdesk L1',
    l2_assignee_label: 'CTSB | Senior Support',
    backlog_ref: 'PBL-2026-DEMO-01',
  });
  store.addIssue({
    ticket_no: 'eT-CK-0005',
    title: 'API rate limit exceeded during load test',
    description: 'MOH integration environment — 429 errors above 200 RPS.',
    priority: 'medium',
    category: 'infrastructure',
    incident_type: 'issue',
    module_code: 'CK',
    epbt_module: 'Cukai',
    intake_channel: 'call',
    client_pic: 'MOH Integration Team',
    status: 'resolved',
    project_id: projApi,
    client_id: mohId,
    assignee_person_id: p3,
    reporter_user_id: pmoId,
    external_ticket_ref: 'QA-HD-2026-0072',
    support_level: 'L1',
    resolution_method: 'call',
    resolution_notes: 'Advised client to throttle requests; issue closed on call',
    action_taken: 'Explained rate limits on call; client adjusted load test script',
    l1_assignee_label: 'CTSB | Helpdesk L1',
  });

  const blScope = store.addBacklog({
    project_id: projPortal,
    title: 'License renewal module (original scope)',
    description: 'Core scope item from signed URS section 4.2.',
    item_type: 'scope',
    source: 'scope',
    status: 'open',
    priority: 'high',
    assignee_person_id: p2,
    effort_days: 12,
    estimated_hours: 96,
    actual_hours: 24,
    phase_id: devPhase?.id ?? null,
    work_package_id: wpPortal,
  });
  store.addBacklog({
    project_id: projPortal,
    title: 'CR-2026-004: Excel export for audit report',
    description: 'Promoted from helpdesk change request.',
    item_type: 'cr',
    source: 'cr',
    status: 'open',
    priority: 'high',
    issue_id: issueCr,
    assignee_person_id: p2,
    estimated_hours: 16,
    phase_id: devPhase?.id ?? null,
    work_package_id: wpPortal,
  });
  const blBug = store.addBacklog({
    project_id: projPortal,
    title: 'Fix login failure after deployment',
    description: 'Root cause analysis for weekend incident.',
    item_type: 'bug',
    source: 'helpdesk',
    status: 'in_progress',
    priority: 'critical',
    issue_id: issueLogin,
    assignee_person_id: p1,
    estimated_hours: 8,
    actual_hours: 5,
    phase_id: devPhase?.id ?? null,
    work_package_id: wpPortal,
  });
  const taskFromBacklog = store.addProjectTask({
    project_id: projPortal,
    name: 'Hotfix: login session cookie domain',
    task_kind: 'task',
    assignee_id: p1,
    work_package_id: wpPortal,
    planned_start_date: dayOffset(-2),
    planned_end_date: dayOffset(2),
    actual_start_date: dayOffset(-1),
    progress_percent: 70,
    status: 'ongoing',
    backlog_id: blBug,
    estimated_hours: 8,
    actual_hours: 5,
  });
  store.updateBacklog(blBug, { task_id: taskFromBacklog, status: 'in_progress' });

  store.addBacklog({
    project_id: projMaint,
    title: 'Recurring session timeout — root cause',
    item_type: 'recurring',
    source: 'recurring',
    status: 'open',
    priority: 'medium',
    assignee_person_id: p6,
  });
  store.addBacklog({
    project_id: projMigration,
    title: 'Deduplicate IC numbers batch 3',
    item_type: 'data',
    source: 'helpdesk',
    status: 'open',
    priority: 'high',
    issue_id: issueData,
    assignee_person_id: p2,
  });
  store.addBacklog({
    project_id: projApi,
    title: 'Rate limiting configuration for production',
    item_type: 'enhancement',
    source: 'manual',
    status: 'open',
    priority: 'medium',
    assignee_person_id: p3,
    effort_days: 5,
  });

  // Extra curated records for full-cycle walkthrough (L1 → L2 → backlog → task → finance)
  store.addIssue({
    ticket_no: 'eT-ABB-0099',
    title: 'Assessment bill PDF shows wrong owner name',
    description: 'MBSA reported wrong name on printed notice — needs dev fix.',
    priority: 'high',
    category: 'defect',
    incident_type: 'bug_defect',
    module_code: 'ABB',
    epbt_module: 'Akaun Bil',
    intake_channel: 'email',
    client_pic: 'MBSA Assessment Unit',
    status: 'open',
    project_id: projPortal,
    client_id: mbsaId,
    assignee_person_id: p6,
    reporter_user_id: pmoId,
    support_level: 'L1',
    l1_assignee_label: 'CTSB | Helpdesk L1',
  });
  store.addIssue({
    ticket_no: 'eT-CK-0100',
    title: 'Batch payment file rejected by treasury',
    description: 'Escalated from L1 — treasury validation error on file format.',
    priority: 'critical',
    category: 'data',
    incident_type: 'issue',
    module_code: 'CK',
    epbt_module: 'Cukai',
    intake_channel: 'helpdesk',
    client_pic: 'DBKL Treasury',
    status: 'in_progress',
    project_id: projPortal,
    client_id: dbklId,
    assignee_person_id: p1,
    reporter_user_id: pmoId,
    support_level: 'L2',
    l1_assignee_label: 'CTSB | Helpdesk L1',
    l2_assignee_label: 'CTSB | Senior Support',
  });
  store.addProjectTask({
    project_id: projPortal,
    name: 'UAT regression — licensing module',
    task_kind: 'task',
    assignee_id: p1,
    work_package_id: wpPortal,
    planned_start_date: dayOffset(0),
    planned_end_date: dayOffset(10),
    progress_percent: 15,
    status: 'ongoing',
    estimated_hours: 24,
    actual_hours: 4,
  });
  store.addProjectTask({
    project_id: projApi,
    name: 'Document OpenAPI spec for MOH consumers',
    task_kind: 'task',
    assignee_id: p1,
    planned_start_date: dayOffset(-5),
    planned_end_date: dayOffset(12),
    progress_percent: 40,
    status: 'ongoing',
    estimated_hours: 16,
  });

  seedCalendarActivities(store, {
    p1, p2, p3, p4, p5, p6,
    projPortal, projApi, projMaint, projMigration, projTender,
  });

  const bulkStats = seedBulkVolumeData(store, {
    adminId,
    pmoId,
    people: [p1, p2, p3, p4, p5, p6],
    clientIds: [mohId, dbklId, mbsaId, uthmId],
    projectIds: [
      projPortal, projApi, projMaint, projMigration, projTender, projMaint2025,
    ],
    createdByUserId: pmoId,
  });

  store.addNotification({
    user_id: adminId,
    type: 'info',
    title: 'Portfolio demo data loaded',
    body: 'Sample projects, helpdesk, backlog, and payment milestones are ready.',
    link: '/',
  });
  store.addNotification({
    user_id: pmoId,
    type: 'issue_assigned',
    title: `Issue assigned: ${store.issues.find((i) => i.id === issueLogin)?.ticket_no}`,
    body: 'Users cannot login after weekend deployment',
    link: '/helpdesk',
    entity_type: 'issue',
    entity_id: issueLogin,
  });
  store.addNotification({
    user_id: adminId,
    type: 'task_assigned',
    title: 'New task: Hotfix login session cookie',
    body: 'Promoted from backlog for PBT Portal',
    link: `/projects/${projPortal}`,
  });

  store.appendAuditLog(
    { id: adminId, name: 'Admin User', email: 'admin@pmo.local', role: 'admin' },
    {
      action: 'seed',
      target_type: 'system',
      target_id: null,
      summary: `Demo seed v${DEMO_SEED_VERSION} loaded (core + bulk volume)`,
    },
  );

  return {
    users: { admin: 'admin@pmo.local / admin123', pmo: 'pmo@pmo.local / pmo123', finance: 'finance@pmo.local / finance123' },
    projects: projects.length + bulkStats.extraProjects,
    blScope,
    bulk: bulkStats,
  };
}
