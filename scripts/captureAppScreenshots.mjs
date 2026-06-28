/**
 * Capture PMO-CTSB UI screenshots for team presentation.
 * Prerequisite: dev server running (`npm run dev`) or production (`npm run start` on :3001).
 *
 * Usage:
 *   node scripts/captureAppScreenshots.mjs
 *   SCREENSHOT_BASE_URL=http://localhost:5173 node scripts/captureAppScreenshots.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'screenshots');

const LOGIN = {
  email: process.env.SCREENSHOT_EMAIL || 'admin@pmo.local',
  password: process.env.SCREENSHOT_PASSWORD || 'admin123',
};

const PROJECT_TABS = ['overview', 'packages', 'backlog', 'tasks', 'delivery', 'timeline', 'people'];

const PAGES = [
  {
    file: '02-dashboard',
    path: '/',
    eyebrow: 'Overview',
    title: 'Command Center',
    desc: 'Kesihatan portfolio, KPI projek aktif, tugas lewat masa, dan pautan pantas ke modul utama.',
  },
  {
    file: '03-projects',
    path: '/projects',
    eyebrow: 'Delivery',
    title: 'Projects',
    desc: 'Portfolio projek — grid/list, health badge, jenis engagement (Kontrak/LO/PO), penapis & carian.',
  },
  {
    file: '04-helpdesk',
    path: '/helpdesk',
    eyebrow: 'Service desk',
    title: 'Helpdesk',
    desc: 'Ticket L1 → L2 → L3, ref helpdesk luar, escalate, mark solved, promote backlog (L3 sahaja).',
  },
  {
    file: '05-my-work',
    path: '/my-work',
    eyebrow: 'Personal',
    title: 'My work',
    desc: 'Satu queue untuk task, backlog & helpdesk yang di-assign — overdue, due soon, jadual hari ini.',
  },
  {
    file: '06-clients',
    path: '/clients',
    eyebrow: 'Master data',
    title: 'Clients',
    desc: 'Senarai agensi/klien, PIC contact, logo, dan pautan ke projek berkaitan.',
  },
  {
    file: '07-calendar',
    path: '/calendar',
    eyebrow: 'Planning',
    title: 'Calendar & activities',
    desc: 'Log mesyuarat, UAT, training, go-live, outstation — import/export laporan aktiviti.',
  },
  {
    file: '08-gantt',
    path: '/gantt',
    eyebrow: 'Planning',
    title: 'Gantt timeline',
    desc: 'Garis masa visual untuk task projek — KPI, penapis projek, dan bar mengikut tarikh.',
  },
  {
    file: '09-reports',
    path: '/reports',
    eyebrow: 'Reporting',
    title: 'Reports',
    desc: 'Carta kesihatan, kemajuan, utilisasi sumber, dan export CSV untuk management.',
  },
  {
    file: '10-team',
    path: '/team',
    eyebrow: 'Resources',
    title: 'Team & capacity',
    desc: 'Direktori staff, allocation % per projek, workload & amaran overload.',
  },
  {
    file: '11-finance',
    path: '/finance',
    eyebrow: 'Finance',
    title: 'Delivery & payment',
    desc: 'Ready to bill, invoiced, paid — milestone fasa penghantaran & maintenance renewals.',
  },
  {
    file: '12-users',
    path: '/users',
    eyebrow: 'Administration',
    title: 'Users',
    desc: 'Pengurusan akaun sistem — role Admin, PMO, Finance, HR, User.',
  },
  {
    file: '13-history',
    path: '/history',
    eyebrow: 'Administration',
    title: 'Audit history',
    desc: 'Log audit tindakan penting dalam sistem untuk rujukan & compliance.',
  },
  {
    file: '14-settings-branding',
    path: '/settings/branding',
    eyebrow: 'Settings',
    title: 'Branding',
    desc: 'Logo organisasi, banner login, nama paparan & tagline — Admin sahaja.',
  },
  {
    file: '15-settings-locations',
    path: '/settings/locations',
    eyebrow: 'Settings',
    title: 'Locations',
    desc: 'Lokasi aktiviti kalendar (pejabat, klien, outstation) untuk dropdown Calendar.',
  },
  {
    file: '16-account',
    path: '/account',
    eyebrow: 'Account',
    title: 'My account',
    desc: 'Profil pengguna, tukar kata laluan, dan maklumat akaun sendiri.',
  },
];

const TAB_LABELS = {
  overview: 'Overview',
  packages: 'Work packages',
  backlog: 'Backlog',
  tasks: 'Tasks',
  delivery: 'Delivery phases',
  timeline: 'Timeline',
  people: 'People & allocation',
};

async function probeUrl(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok || res.status === 304;
  } catch {
    return false;
  }
}

async function resolveBaseUrl() {
  if (process.env.SCREENSHOT_BASE_URL) return process.env.SCREENSHOT_BASE_URL.replace(/\/$/, '');
  const candidates = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3001'];
  for (const url of candidates) {
    if (await probeUrl(url)) {
      console.log('Using app URL:', url);
      return url;
    }
  }
  throw new Error(
    'App not reachable. Start dev server first:\n  npm run dev\n'
    + 'Or set SCREENSHOT_BASE_URL=http://localhost:5173',
  );
}

async function waitForAppReady(page) {
  await page.waitForFunction(
    () => !document.querySelector('.page-loading') && !document.querySelector('.app-boot'),
    { timeout: 30000 },
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
}

async function screenshotPage(page, fileBase, meta = {}) {
  const filePath = path.join(outDir, `${fileBase}.png`);
  await waitForAppReady(page);
  await page.screenshot({ path: filePath, type: 'png' });
  console.log('  ✓', fileBase + '.png');
  return { file: `${fileBase}.png`, ...meta };
}

mkdirSync(outDir, { recursive: true });

const baseUrl = await resolveBaseUrl();
const puppeteer = await import('puppeteer');

const browser = await puppeteer.default.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
});

const captured = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log('\n1. Login screen…');
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.auth-page', { timeout: 15000 });
  captured.push(await screenshotPage(page, '01-login', {
    eyebrow: 'Access',
    title: 'Sign in',
    desc: 'Login selamat dengan role-based access — Admin, PMO, Finance, dan Team.',
  }));

  console.log('\n2. Signing in…');
  await page.type('input[type="email"]', LOGIN.email, { delay: 20 });
  await page.type('input[type="password"]', LOGIN.password, { delay: 20 });
  await page.click('.auth-submit-btn');
  await page.waitForSelector('.app-layout', { timeout: 30000 });
  await waitForAppReady(page);

  const projectId = await page.evaluate(async () => {
    const token = localStorage.getItem('auth_token');
    const bases = ['http://127.0.0.1:3001/api', '/api'];
    for (const base of bases) {
      try {
        const res = await fetch(`${base}/projects`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data) && data[0]?.id) return data[0].id;
      } catch {
        /* try next */
      }
    }
    return 1;
  });
  console.log('   Project ID for workspace shots:', projectId);

  console.log('\n3. Main modules…');
  for (const item of PAGES) {
    console.log(`   ${item.title}…`);
    await page.goto(`${baseUrl}${item.path}`, { waitUntil: 'networkidle2', timeout: 60000 });
    captured.push(await screenshotPage(page, item.file, {
      eyebrow: item.eyebrow,
      title: item.title,
      desc: item.desc,
    }));
  }

  console.log('\n4. Project workspace tabs…');
  let tabNum = 17;
  for (const tab of PROJECT_TABS) {
    const fileBase = `${String(tabNum).padStart(2, '0')}-project-${tab}`;
    tabNum += 1;
    const url = `${baseUrl}/projects/${projectId}?tab=${tab}`;
    console.log(`   ${TAB_LABELS[tab]}…`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    captured.push(await screenshotPage(page, fileBase, {
      eyebrow: 'Project workspace',
      title: TAB_LABELS[tab],
      desc: `Projek demo — tab ${TAB_LABELS[tab]} untuk urus penghantaran, backlog, task & fasa.`,
    }));
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  const { writeFileSync } = await import('fs');
  writeFileSync(manifestPath, JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl, captured }, null, 2));
  console.log('\nDone:', captured.length, 'screenshots →', outDir);
  console.log('Manifest:', manifestPath);
} finally {
  await browser.close();
}
