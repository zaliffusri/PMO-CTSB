/** Route pathname → topbar page title key. */
export function pageTitleKey(pathname) {
  if (pathname === '/') return 'page.dashboard';
  if (pathname === '/projects') return 'page.projects';
  if (pathname.startsWith('/projects/')) return 'page.projectWorkspace';
  if (pathname === '/clients') return 'page.clients';
  if (pathname === '/team') return 'page.team';
  if (pathname === '/calendar') return 'page.calendar';
  if (pathname === '/reports') return 'page.reports';
  if (pathname === '/gantt') return 'page.gantt';
  if (pathname === '/helpdesk') return 'page.helpdesk';
  if (pathname === '/my-work') return 'page.myWork';
  if (pathname === '/finance') return 'page.finance';
  if (pathname === '/users') return 'page.users';
  if (pathname === '/history') return 'page.history';
  if (pathname.startsWith('/settings')) return 'page.settings';
  if (pathname === '/account') return 'page.account';
  if (pathname === '/search') return 'page.search';
  if (pathname === '/timesheets') return 'page.timesheets';
  return null;
}

export function pageTitle(pathname, t) {
  const key = pageTitleKey(pathname);
  if (!key) return 'C360';
  return typeof t === 'function' ? t(key) : key;
}
