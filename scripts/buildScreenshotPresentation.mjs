/**
 * Build HTML slide deck from docs/screenshots/manifest.json
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'docs', 'screenshots');
const manifestPath = path.join(shotsDir, 'manifest.json');
const outHtml = path.join(root, 'docs', 'PMO-CTSB-Screenshot-Tour.html');

if (!existsSync(manifestPath)) {
  console.error('Run screenshot capture first: node scripts/captureAppScreenshots.mjs');
  process.exit(1);
}

const { captured, capturedAt } = JSON.parse(readFileSync(manifestPath, 'utf8'));

const slideHtml = (item, num, total) => `
  <section class="slide slide--shot">
    <div class="shot-head">
      <div class="shot-head__copy">
        <p class="eyebrow">${escapeHtml(item.eyebrow || 'Module')}</p>
        <h2>${escapeHtml(item.title || item.file)}</h2>
        <p class="shot-desc">${escapeHtml(item.desc || '')}</p>
      </div>
      <span class="shot-num">${num} / ${total}</span>
    </div>
    <div class="shot-frame">
      <img src="screenshots/${escapeHtml(item.file)}" alt="${escapeHtml(item.title || '')}" loading="lazy" />
    </div>
    <div class="slide-footer">
      <span>PMO CTSB · Screenshot tour</span>
      <span class="slide-num">${num}</span>
    </div>
  </section>`;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const total = captured.length + 2;

const html = `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <title>PMO CTSB — Screenshot Tour</title>
  <style>
    @page { size: 338.67mm 190.5mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #0f1419;
      color: #e8eef2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slide {
      width: 338.67mm;
      height: 190.5mm;
      padding: 10mm 14mm 8mm;
      page-break-after: always;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: linear-gradient(145deg, #0c1210 0%, #0f1a16 45%, #0a100e 100%);
    }
    .slide::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 70% 50% at 100% 0%, rgba(16, 185, 129, 0.1), transparent);
      pointer-events: none;
    }
    .slide > * { position: relative; z-index: 1; }
    .slide--title {
      justify-content: center;
      padding: 18mm;
    }
    .eyebrow {
      font-size: 10pt;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #34d399;
      margin-bottom: 3mm;
    }
    h1 { font-size: 32pt; font-weight: 700; line-height: 1.15; margin-bottom: 5mm; }
    h2 { font-size: 20pt; font-weight: 700; color: #f0fdf4; line-height: 1.2; }
    .subtitle { font-size: 13pt; color: #94a3b8; line-height: 1.5; max-width: 90%; }
    .shot-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 6mm;
      margin-bottom: 4mm;
      flex-shrink: 0;
    }
    .shot-head__copy { min-width: 0; flex: 1; }
    .shot-desc {
      font-size: 9.5pt;
      color: #94a3b8;
      line-height: 1.4;
      margin-top: 2mm;
      max-width: 95%;
    }
    .shot-num {
      font-size: 9pt;
      color: #64748b;
      white-space: nowrap;
      padding-top: 1mm;
    }
    .shot-frame {
      flex: 1;
      min-height: 0;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(52, 211, 153, 0.25);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
      background: #0f1419;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    .shot-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
    }
    .slide-footer {
      margin-top: 3mm;
      padding-top: 3mm;
      border-top: 1px solid rgba(52, 211, 153, 0.2);
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #64748b;
      flex-shrink: 0;
    }
    .slide-num::before { content: "PMO CTSB · "; color: #34d399; }
    .meta-line { font-size: 9pt; color: #64748b; margin-top: 6mm; }
    @media screen {
      body { padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
      .slide { box-shadow: 0 20px 60px rgba(0,0,0,0.5); border-radius: 8px; margin-bottom: 20px; }
    }
    @media print {
      body { padding: 0; }
      .slide { box-shadow: none; border-radius: 0; }
    }
  </style>
</head>
<body>

  <section class="slide slide--title">
    <p class="eyebrow">Cybersolution Technologies · PMO</p>
    <h1>PMO CTSB<br>Screenshot Tour</h1>
    <p class="subtitle">Panduan visual setiap modul dalam sistem — untuk briefing team, onboarding, dan demonstrasi fungsi yang tersedia.</p>
    <p class="meta-line">Generated: ${escapeHtml(new Date(capturedAt).toLocaleString('en-MY'))} · ${captured.length} screens</p>
    <div class="slide-footer">
      <span>Team presentation</span>
      <span class="slide-num">1</span>
    </div>
  </section>

${captured.map((item, i) => slideHtml(item, i + 2, total)).join('\n')}

  <section class="slide slide--title">
    <p class="eyebrow">Thank you</p>
    <h1>Soalan?</h1>
    <p class="subtitle">Demo login: admin@pmo.local / admin123 · Jalankan <code>npm run dev</code> untuk cuba sendiri.</p>
    <div class="slide-footer">
      <span>Cybersolution Technologies Sdn Bhd</span>
      <span class="slide-num">${total}</span>
    </div>
  </section>

</body>
</html>`;

writeFileSync(outHtml, html, 'utf8');
console.log('HTML saved:', outHtml);
