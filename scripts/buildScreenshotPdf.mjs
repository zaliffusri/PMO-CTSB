/**
 * PDF from docs/PMO-CTSB-Screenshot-Tour.html
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'docs', 'PMO-CTSB-Screenshot-Tour.html');
const outPath = path.join(root, 'docs', 'PMO-CTSB-Screenshot-Tour.pdf');

if (!existsSync(htmlPath)) {
  console.error('Missing:', htmlPath, '\nRun: node scripts/buildScreenshotPresentation.mjs');
  process.exit(1);
}

const puppeteer = await import('puppeteer');
const browser = await puppeteer.default.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.pdf({
    path: outPath,
    width: '338.67mm',
    height: '190.5mm',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log('PDF saved:', outPath);
} finally {
  await browser.close();
}
