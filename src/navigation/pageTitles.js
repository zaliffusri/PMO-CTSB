/** Route pathname → topbar page title. */
export function pageTitle(pathname) {
  if (pathname === '/') return 'Dashboard';
  if (pathname === '/projects') return 'Projects';
  if (pathname.startsWith('/projects/')) return 'Project workspace';
  if (pathname === '/clients') return 'Clients';
  if (pathname === '/team') return 'Team & capacity';
  if (pathname === '/calendar') return 'Calendar & activities';
  if (pathname === '/reports') return 'Reports';
  if (pathname === '/gantt') return 'Gantt timeline';
  if (pathname === '/helpdesk') return 'Helpdesk';
  if (pathname === '/my-work') return 'My work';
  if (pathname === '/finance') return 'Finance & payment';
  if (pathname === '/users') return 'System users';
  if (pathname === '/history') return 'Audit history';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname === '/account') return 'My account';
  return 'PMO CTSB';
}
