/**
 * Generate PDF from docs/PMO-CTSB-Team-Presentation.html
 * Requires: npx puppeteer (downloaded on first run)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { mkdirSync, existsSync } from 'fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'docs', 'PMO-CTSB-Team-Presentation.html');
const outDir = path.join(root, 'docs');
const outPath = path.join(outDir, 'PMO-CTSB-Team-Presentation.pdf');

if (!existsSync(htmlPath)) {
  console.error('Missing:', htmlPath);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const puppeteer = await import('puppeteer');

const browser = await puppeteer.default.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
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
