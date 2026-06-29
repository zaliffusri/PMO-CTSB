/** CSS class names for issue priority badges. */
export function priorityClass(priority) {
  if (priority === 'critical') return 'issue-priority--critical';
  if (priority === 'high') return 'issue-priority--high';
  if (priority === 'medium') return 'issue-priority--medium';
  return 'issue-priority--low';
}

/** CSS class names for helpdesk support level / backlog stage badges. */
export function levelClass(stage) {
  const code = String(stage || 'L1').toLowerCase();
  if (code === 'backlog' || code === 'l3') return 'helpdesk-level helpdesk-level--backlog';
  const l = code.toUpperCase();
  if (l === 'L2') return 'helpdesk-level helpdesk-level--l2';
  return 'helpdesk-level helpdesk-level--l1';
}
