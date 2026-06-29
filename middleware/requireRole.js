import {
  PMO_ROLES,
  canAssignIssues,
  canCreateProject,
  canEditCalendarUser,
  canViewFinance,
  normalizeRole,
} from '../lib/permissions.js';

function deny(res, message = 'Forbidden') {
  return res.status(403).json({ error: message });
}

export function requireAdmin(req, res, next) {
  if (!req.user || normalizeRole(req.user.role) !== 'admin') {
    return deny(res, 'Admin access required');
  }
  next();
}

export function requirePmoOrAdmin(req, res, next) {
  const role = normalizeRole(req.user?.role);
  if (role === 'admin' || PMO_ROLES.has(role)) return next();
  return deny(res, 'Admin or PMO access required');
}

export function requireCanAssignIssues(req, res, next) {
  if (!canAssignIssues(req.user)) {
    return deny(res, 'You do not have permission to assign issues');
  }
  next();
}

export function requireCanCreateProject(req, res, next) {
  if (!canCreateProject(req.user)) {
    return deny(res, 'Only PMO can create or manage projects');
  }
  next();
}

export function requireCalendarEditor(req, res, next) {
  if (!canEditCalendarUser(req.user)) {
    return deny(res, 'You do not have permission to edit the calendar');
  }
  next();
}

export function requireFinanceAccess(req, res, next) {
  if (!canViewFinance(req.user)) {
    return deny(res, 'Finance access required');
  }
  next();
}
