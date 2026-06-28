const paths = {
  dashboard: 'M3 13h8V3H3v10zm10 8h8v-8h-8v8zM3 21h8v-6H3v6zm10-10h8V3h-8v8z',
  projects: 'M4 5h16v4H4V5zm0 6h10v8H4v-8zm12 0h4v8h-4v-8z',
  clients: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 8a4 4 0 018 0H4zm12 0a7 7 0 00-6.6-4.7A5 5 0 0119 16v4h-3z',
  team: 'M9 11a3 3 0 100-6 3 3 0 000 6zm-7 9a5 5 0 0110 0H2zm12-2a4 4 0 100-8 4 4 0 000 8zm4 2a6 6 0 00-5.2-3.1A3.5 3.5 0 0119 14v4h-2z',
  calendar: 'M7 3v2M17 3v2M4 9h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z',
  reports: 'M6 20V10M12 20V4M18 20v-7',
  gantt: 'M4 6h16M4 12h10M4 18h14',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 11a4 4 0 100-8 4 4 0 000 8zm9.5 2a3 3 0 100-6',
  history: 'M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  settings: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm8.2-3.5a7.2 7.2 0 01.1 1 7.2 7.2 0 01-.1 1l2 1.6-2 3.4-2.4-1a7.4 7.4 0 01-1.7 1l-.4 2.6H9.4l-.4-2.6a7.4 7.4 0 01-1.7-1l-2.4 1-2-3.4 2-1.6a7.2 7.2 0 01-.1-1 7.2 7.2 0 01.1-1l-2-1.6 2-3.4 2.4 1a7.4 7.4 0 011.7-1l.4-2.6h5.2l.4 2.6a7.4 7.4 0 011.7 1l2.4-1 2 3.4-2 1.6z',
  helpdesk: 'M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h16v2H4v-2zM16 11h6v2h-6v-2z',
  mywork: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  finance: 'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  account: 'M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z',
};

export default function NavIcon({ name, className = '' }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg className={`nav-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
