/**
 * High-volume demo data — simulates a busy PMO portfolio for UI/performance preview.
 * Called from runRichDemoSeed() after core sample records exist.
 */
import { templateForClassification } from '../lib/phaseConstants.js';
import { EPBT_MODULES } from '../lib/epbtModules.js';

const ISSUE_STATUSES = ['open', 'in_progress', 'waiting_agency', 'resolved'];
const ISSUE_STATUS_WEIGHTS = [0.35, 0.28, 0.12, 0.25];
const SUPPORT_LEVELS = ['L1', 'L2'];
const SUPPORT_LEVEL_WEIGHTS = [0.62, 0.38];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const CATEGORIES = ['defect', 'support', 'change_request', 'data', 'access', 'infrastructure', 'other'];
const INCIDENT_TYPES = ['bug_defect', 'inquiry', 'change_request', 'issue', 'request'];
const INTAKE = ['helpdesk', 'email', 'call', 'whatsapp', 'walk_in'];

const BACKLOG_TYPES = ['scope', 'cr', 'bug', 'defect', 'enhancement', 'support', 'data', 'recurring'];
const BACKLOG_SOURCES = ['scope', 'helpdesk', 'cr', 'inquiry', 'recurring', 'manual'];
const BACKLOG_STATUSES = ['open', 'in_progress', 'fixed', 'closed'];
const BACKLOG_STATUS_WEIGHTS = [0.32, 0.28, 0.22, 0.18];

const TASK_STATUSES = ['new', 'ongoing', 'done'];
const TASK_STATUS_WEIGHTS = [0.25, 0.45, 0.30];

const ACTIVITY_TYPES = ['meeting', 'task', 'uat', 'urs', 'fat', 'demo', 'training', 'go-live', 'tender', 'other'];
const LOCATIONS = ['MSC Office', 'DBKL HQ', 'MBSA Shah Alam', 'MOH Putrajaya', 'Remote', 'Client site', 'UTHM Parit Raja'];

const EXTRA_CLIENTS = [
  'MPAJ (Ampang Jaya)',
  'MPKJ (Kajang)',
  'MBPJ (Petaling Jaya)',
  'MPSepang',
  'MPD (Port Dickson)',
  'JPN Johor',
  'LHDN Negeri Sembilan',
  'KKM State Health Dept',
  'UiTM Shah Alam',
  'Politeknik Melaka',
  'MAMPU',
  'Jabatan Pendaftaran Negara',
];

const EXTRA_PEOPLE = [
  { name: 'Hafiz Rahman', email: 'hafiz@company.com', role: 'Developer' },
  { name: 'Nur Aisyah', email: 'aisyah@company.com', role: 'Business Analyst' },
  { name: 'Raj Kumar', email: 'raj@company.com', role: 'Developer' },
  { name: 'Mei Ling Ooi', email: 'meiling@company.com', role: 'QA Engineer' },
  { name: 'Zulkifli Osman', email: 'zul@company.com', role: 'Support Engineer' },
  { name: 'Sarah Chen', email: 'sarah@company.com', role: 'Project Coordinator' },
  { name: 'Amir Hakim', email: 'amir@company.com', role: 'DevOps' },
  { name: 'Kavitha Nair', email: 'kavitha@company.com', role: 'Data Analyst' },
  { name: 'Daniel Wong', email: 'daniel@company.com', role: 'Tech Lead' },
  { name: 'Nadia Ibrahim', email: 'nadia@company.com', role: 'UX Designer' },
  { name: 'Irfan Syah', email: 'irfan@company.com', role: 'Developer' },
  { name: 'Lily Tan', email: 'lily@company.com', role: 'Tester' },
];

const EXTRA_PROJECTS = [
  { name: 'MPAJ Assessment Tax eServices', classification: 'New System Development', engagement: 'contract', status: 'active' },
  { name: 'MBPJ Parking Mobile App', classification: 'New System Development', engagement: 'contract', status: 'active' },
  { name: 'JPN Birth Certificate API', classification: 'API Integration', engagement: 'letter_of_offer', status: 'active' },
  { name: 'UiTM Hostel Booking System', classification: 'New System Development', engagement: 'purchase_order', status: 'on-hold' },
  { name: 'LHDN e-Invoice Gateway Phase 1', classification: 'API Integration', engagement: 'contract', status: 'active' },
  { name: 'MPSepang Complaint Portal CR 2026', classification: 'Change Request', engagement: 'contract', status: 'active' },
  { name: 'KKM Clinic Queue Display', classification: 'New System Development', engagement: 'purchase_order', status: 'active' },
  { name: 'Politeknik Student Portal Upgrade', classification: 'New System Development', engagement: 'contract', status: 'completed' },
  { name: 'MAMPU Cloud Migration Assessment', classification: 'Data Migration', engagement: 'tender', status: 'active' },
  { name: 'EKutipan+ State Rollout — Johor', classification: 'New System Development', engagement: 'contract', status: 'active' },
];

function pickWeighted(weights, values) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += weights[i];
    if (r <= acc) return values[i];
  }
  return values[values.length - 1];
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoAt(dayOffsetDays, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoDaysAgo(days, hour = 10) {
  return isoAt(-days, hour, 0);
}

function pad4(n) {
  return String(n).padStart(4, '0');
}

/**
 * @param {import('./store.js').store} store
 * @param {{
 *   adminId: number,
 *   pmoId: number,
 *   people: number[],
 *   clientIds: number[],
 *   projectIds: number[],
 *   createdByUserId?: number,
 * }} ctx
 */
export function seedBulkVolumeData(store, ctx) {
  const { adminId, pmoId } = ctx;
  let people = [...ctx.people];
  const clientIds = [...ctx.clientIds];
  let projectIds = [...ctx.projectIds];
  const createdBy = ctx.createdByUserId ?? pmoId;

  // —— Clients & people ——
  for (const name of EXTRA_CLIENTS) {
    clientIds.push(store.findOrCreateClient(name));
  }
  for (const p of EXTRA_PEOPLE) {
    people.push(store.addPerson(p));
  }

  // —— Projects ——
  for (const spec of EXTRA_PROJECTS) {
    const pid = store.addProject({
      name: spec.name,
      description: `${spec.name} — demo bulk seed for portfolio volume testing.`,
      engagement_type: spec.engagement,
      classification: spec.classification,
      status: spec.status,
      start_date: dayOffset(-90 - Math.floor(Math.random() * 180)),
      end_date: dayOffset(30 + Math.floor(Math.random() * 240)),
    });
    const cid = pick(clientIds);
    store.setProjectClients(pid, [cid]);
    projectIds.push(pid);
    try {
      store.initProjectPhasesFromTemplate(pid, templateForClassification(spec.classification));
    } catch {
      store.initProjectPhasesFromTemplate(pid, templateForClassification('New System Development'));
    }
    const roster = pickN(people, 2 + Math.floor(Math.random() * 3));
    roster.forEach((personId, idx) => {
      store.addAssignment({
        project_id: pid,
        person_id: personId,
        role_in_project: ['Lead', 'Developer', 'BA', 'QA', 'Support'][idx % 5],
        allocation_percent: 30 + Math.floor(Math.random() * 60),
      });
    });
  }

  const issueTitles = [
    'Payment not reflected after FPX transaction',
    'Unable to print assessment notice',
    'Slow page load on dashboard',
    'User locked out after password reset',
    'Report export timeout',
    'Duplicate receipt number generated',
    'Mobile app crash on login',
    'API returns 500 on peak hours',
    'Data mismatch in consolidated report',
    'CR: Add SMS notification for bill due',
    'Training request — new counter staff',
    'License renewal workflow error',
    'Integration failure with MyTax',
    'Batch job stuck at 78%',
    'Missing records after nightly sync',
    'Permission denied for approver role',
    'UAT defect — wrong tax calculation',
    'Helpdesk inquiry — how to void bill',
    'Recurring timeout on session',
    'Certificate expiry on staging environment',
  ];

  // —— Helpdesk issues (~200) ——
  let ticketSeq = 6;
  const issueIds = [];
  const ISSUE_BULK_COUNT = 200;
  for (let i = 0; i < ISSUE_BULK_COUNT; i++) {
    const mod = EPBT_MODULES[i % EPBT_MODULES.length];
    const code = mod.code;
    const ticketNo = `eT-${code}-${pad4(ticketSeq++)}`;
    const status = pickWeighted(ISSUE_STATUS_WEIGHTS, ISSUE_STATUSES);
    const daysAgo = Math.floor(Math.random() * 120);
    const projectId = pick(projectIds);
    const clientId = pick(clientIds);
    const assignee = pick(people);
    const id = store.addIssue({
      ticket_no: ticketNo,
      title: `${issueTitles[i % issueTitles.length]} (#${i + 1})`,
      description: `Bulk demo ticket for module ${mod.label}. Generated for volume testing.`,
      status,
      priority: pick(PRIORITIES),
      category: pick(CATEGORIES),
      incident_type: pick(INCIDENT_TYPES),
      module_code: code,
      epbt_module: mod.label,
      intake_channel: pick(INTAKE),
      client_pic: `PIC ${i % 20}`,
      project_id: projectId,
      client_id: clientId,
      assignee_person_id: assignee,
      reporter_user_id: i % 3 === 0 ? adminId : pmoId,
      external_ticket_ref: `QA-HD-2026-${pad4(200 + i)}`,
      support_level: pickWeighted(SUPPORT_LEVEL_WEIGHTS, SUPPORT_LEVELS),
      l1_assignee_label: 'CTSB | Helpdesk L1',
      l2_assignee_label: status !== 'open' ? 'CTSB | Senior Support' : null,
      created_at: isoDaysAgo(daysAgo, 8 + (i % 9)),
      updated_at: isoDaysAgo(Math.max(0, daysAgo - 2), 14),
      resolved_at: status === 'resolved' ? isoDaysAgo(Math.max(0, daysAgo - 1), 16) : null,
    });
    issueIds.push(id);
  }

  // —— Backlog items (~120) ——
  const backlogIds = [];
  const BACKLOG_BULK_COUNT = 120;
  for (let i = 0; i < BACKLOG_BULK_COUNT; i++) {
    const projectId = pick(projectIds);
    const mod = EPBT_MODULES[i % EPBT_MODULES.length];
    const refNo = `${mod.code}-${1000 + i}`;
    const status = pickWeighted(BACKLOG_STATUS_WEIGHTS, BACKLOG_STATUSES);
    const assignee = pick(people);
    const id = store.addBacklog({
      ref_no: refNo,
      project_id: projectId,
      title: `Backlog item ${refNo}: ${issueTitles[i % issueTitles.length]}`,
      description: `Prioritized work from helpdesk or scope — bulk seed ${i + 1}.`,
      item_type: pick(BACKLOG_TYPES),
      source: pick(BACKLOG_SOURCES),
      status,
      priority: pick(PRIORITIES),
      assignee_person_id: assignee,
      created_by_user_id: createdBy,
      module_code: mod.code,
      client_id: pick(clientIds),
      external_ticket_ref: i % 4 === 0 ? `QA-HD-2026-${pad4(200 + i)}` : null,
      estimated_hours: 4 + (i % 12) * 4,
      actual_hours: status === 'fixed' || status === 'closed' ? 8 + (i % 6) * 2 : null,
    });
    backlogIds.push(id);
    if (i < 35 && issueIds[i]) {
      store.updateBacklog(id, { issue_id: issueIds[i] });
      store.updateIssue(issueIds[i], { backlog_ref: refNo, status: 'in_progress' });
    }
  }

  // —— Project tasks (~90) ——
  const TASK_BULK_COUNT = 90;
  for (let i = 0; i < TASK_BULK_COUNT; i++) {
    const projectId = pick(projectIds);
    const status = pickWeighted(TASK_STATUS_WEIGHTS, TASK_STATUSES);
    const progress = status === 'done' ? 100 : status === 'ongoing' ? 15 + (i % 8) * 10 : 0;
    const start = dayOffset(-30 + (i % 25));
    const end = dayOffset(-5 + (i % 40));
    store.addProjectTask({
      project_id: projectId,
      name: `Task ${i + 1}: ${issueTitles[i % issueTitles.length]}`,
      task_kind: 'task',
      assignee_id: pick(people),
      planned_start_date: start,
      planned_end_date: end,
      actual_start_date: status !== 'new' ? start : null,
      actual_end_date: status === 'done' ? end : null,
      progress_percent: progress,
      status,
      estimated_hours: 8 + (i % 10) * 4,
      actual_hours: status === 'done' ? 10 + (i % 8) * 3 : (status === 'ongoing' ? 4 + i : null),
      backlog_id: i < backlogIds.length && i % 3 === 0 ? backlogIds[i] : null,
    });
  }

  // —— Calendar activities (~160 across ±45 days) ——
  const activityTitles = [
    'Client status meeting',
    'Sprint planning',
    'UAT session',
    'FAT walkthrough',
    'Site visit — council HQ',
    'Training — end users',
    'Go-live rehearsal',
    'Tender clarification',
    'Weekly team sync',
    'Defect triage',
  ];
  const ACTIVITY_BULK_COUNT = 160;
  for (let i = 0; i < ACTIVITY_BULK_COUNT; i++) {
    const day = -45 + (i % 90);
    const hour = 8 + (i % 9);
    const personId = pick(people);
    store.addActivity({
      person_id: personId,
      project_id: pick(projectIds),
      type: pick(ACTIVITY_TYPES),
      title: `${activityTitles[i % activityTitles.length]} (${i + 1})`,
      description: i % 5 === 0 ? 'Bulk calendar seed for volume preview.' : null,
      location: pick(LOCATIONS),
      start_at: isoAt(day, hour, 0),
      end_at: isoAt(day, hour + 1 + (i % 3), 0),
    });
  }

  // —— Backlog comments (~50) ——
  const commentBodies = [
    'Investigating root cause — will update EOD.',
    'Waiting for client to confirm UAT window.',
    '@Siti Nur can you clarify the URS section?',
    'Deployed to staging — please retest.',
    'Linked to helpdesk ticket — see external ref.',
    'Blocked on agency VPN access.',
    'Fixed in build 2026.06.28 — ready for QA.',
  ];
  for (let i = 0; i < 50; i++) {
    const backlogId = backlogIds[i % backlogIds.length];
    if (!backlogId) continue;
    store.addBacklogComment({
      backlog_id: backlogId,
      author_user_id: i % 2 === 0 ? pmoId : adminId,
      body: commentBodies[i % commentBodies.length],
      mentioned_person_ids: i % 4 === 0 ? [people[1], people[2]].filter(Boolean) : [],
    });
  }

  // —— Notifications (~60) ——
  for (let i = 0; i < 60; i++) {
    const userId = i % 3 === 0 ? adminId : (i % 3 === 1 ? pmoId : null);
    const personId = people[i % people.length];
    const targetUser = userId ?? findUserIdForPerson(store, personId);
    if (!targetUser) continue;
    const types = ['info', 'issue_assigned', 'backlog_assigned', 'backlog_status', 'task_assigned', 'backlog_comment'];
    store.addNotification({
      user_id: targetUser,
      type: pick(types),
      title: `Demo notification ${i + 1}`,
      body: `Sample in-app alert for volume testing — ${issueTitles[i % issueTitles.length]}`,
      link: i % 2 === 0 ? '/helpdesk' : `/projects/${pick(projectIds)}?tab=backlog`,
      read_at: i % 4 === 0 ? new Date().toISOString() : null,
    });
  }

  return {
    extraClients: EXTRA_CLIENTS.length,
    extraPeople: EXTRA_PEOPLE.length,
    extraProjects: EXTRA_PROJECTS.length,
    issuesAdded: ISSUE_BULK_COUNT,
    backlogsAdded: BACKLOG_BULK_COUNT,
    tasksAdded: TASK_BULK_COUNT,
    activitiesAdded: ACTIVITY_BULK_COUNT,
    commentsAdded: 50,
    notificationsAdded: 60,
    totalPeople: people.length,
    totalProjects: projectIds.length,
  };
}

function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function findUserIdForPerson(store, personId) {
  const person = store.people.find((p) => p.id === personId);
  if (!person?.email) return null;
  const u = store.users.find((x) => String(x.email || '').toLowerCase() === String(person.email).toLowerCase());
  return u?.id ?? null;
}
