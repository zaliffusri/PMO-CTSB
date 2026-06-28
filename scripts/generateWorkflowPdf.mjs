/**
 * Build PDF from docs/PMO-CTSB-System-Workflow.md
 * Output: docs/PMO-CTSB-System-Workflow.pdf
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = path.join(root, 'docs', 'PMO-CTSB-System-Workflow.md');
const htmlPath = path.join(root, 'docs', 'PMO-CTSB-System-Workflow.html');
const outPath = path.join(root, 'docs', 'PMO-CTSB-System-Workflow.pdf');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMd(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isTableSep(line) {
  return /^\|?[\s:-]+\|[\s|:-]+\|?$/.test(line.trim());
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushList = (items, ordered) => {
    if (!items.length) return;
    const tag = ordered ? 'ol' : 'ul';
    out.push(`<${tag}>`);
    items.forEach((item) => out.push(`<li>${inlineMd(item)}</li>`));
    out.push(`</${tag}>`);
    items.length = 0;
  };

  let listItems = [];
  let listOrdered = false;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '---') {
      flushList(listItems, listOrdered);
      listOrdered = false;
      out.push('<hr />');
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      flushList(listItems, listOrdered);
      listOrdered = false;
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const body = buf.join('\n');
      if (lang === 'mermaid') {
        out.push(`<div class="diagram-wrap"><div class="mermaid">${body}</div></div>`);
      } else {
        out.push(`<pre><code>${escapeHtml(body)}</code></pre>`);
      }
      continue;
    }

    if (line.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushList(listItems, listOrdered);
      listOrdered = false;
      const header = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      out.push('<div class="table-wrap"><table>');
      out.push('<thead><tr>');
      header.forEach((h) => out.push(`<th>${inlineMd(h)}</th>`));
      out.push('</tr></thead><tbody>');
      rows.forEach((row) => {
        out.push('<tr>');
        row.forEach((cell) => out.push(`<td>${inlineMd(cell)}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table></div>');
      continue;
    }

    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      flushList(listItems, listOrdered);
      listOrdered = false;
      out.push(`<h3>${inlineMd(h3[1])}</h3>`);
      i += 1;
      continue;
    }

    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      flushList(listItems, listOrdered);
      listOrdered = false;
      const id = h2[1].toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h2 id="${id}">${inlineMd(h2[1])}</h2>`);
      i += 1;
      continue;
    }

    const h1 = line.match(/^# (.+)$/);
    if (h1) {
      flushList(listItems, listOrdered);
      listOrdered = false;
      out.push(`<h1>${inlineMd(h1[1])}</h1>`);
      i += 1;
      continue;
    }

    const bq = line.match(/^> (.+)$/);
    if (bq) {
      flushList(listItems, listOrdered);
      listOrdered = false;
      out.push(`<blockquote>${inlineMd(bq[1])}</blockquote>`);
      i += 1;
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (!listOrdered && listItems.length) flushList(listItems, false);
      listOrdered = true;
      listItems.push(ol[1]);
      i += 1;
      continue;
    }

    const ul = line.match(/^-\s+(.+)$/);
    if (ul) {
      if (listOrdered && listItems.length) flushList(listItems, true);
      listOrdered = false;
      listItems.push(ul[1]);
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      flushList(listItems, listOrdered);
      listOrdered = false;
      i += 1;
      continue;
    }

    flushList(listItems, listOrdered);
    listOrdered = false;
    out.push(`<p>${inlineMd(line)}</p>`);
    i += 1;
  }

  flushList(listItems, listOrdered);
  return out.join('\n');
}

const CSS = `
@page {
  size: A4;
  margin: 18mm 16mm 20mm 16mm;
}
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1e293b;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-header {
  border-bottom: 3px solid #10b981;
  padding-bottom: 12px;
  margin-bottom: 24px;
}
.doc-header h1 {
  font-size: 22pt;
  color: #0f172a;
  margin: 0 0 6px;
  border: none;
  padding: 0;
}
.doc-meta {
  font-size: 9pt;
  color: #64748b;
}
h1 { font-size: 18pt; color: #0f172a; margin: 28px 0 12px; page-break-after: avoid; }
h2 {
  font-size: 14pt;
  color: #065f46;
  margin: 24px 0 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid #d1fae5;
  page-break-after: avoid;
}
h3 { font-size: 11pt; color: #334155; margin: 16px 0 8px; page-break-after: avoid; }
p { margin: 0 0 10px; }
strong { color: #0f172a; }
a { color: #059669; text-decoration: none; }
ul, ol { margin: 0 0 12px 20px; padding: 0; }
li { margin-bottom: 4px; }
blockquote {
  margin: 12px 0;
  padding: 10px 14px;
  border-left: 4px solid #10b981;
  background: #f0fdf4;
  color: #14532d;
  font-weight: 600;
}
hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
code {
  font-family: Consolas, "Courier New", monospace;
  font-size: 9pt;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 3px;
}
pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 8.5pt;
  overflow-x: auto;
  margin: 10px 0 14px;
  page-break-inside: avoid;
}
pre code { background: none; color: inherit; padding: 0; }
.table-wrap { overflow-x: auto; margin: 10px 0 16px; page-break-inside: avoid; }
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
th {
  background: #ecfdf5;
  color: #065f46;
  font-weight: 700;
  text-align: left;
  padding: 7px 8px;
  border: 1px solid #a7f3d0;
}
td {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  vertical-align: top;
}
tr:nth-child(even) td { background: #f8fafc; }
.diagram-wrap {
  margin: 14px 0 18px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  page-break-inside: avoid;
  text-align: center;
}
.mermaid { font-size: 9pt; }
.doc-footer {
  margin-top: 28px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
  font-size: 8.5pt;
  color: #94a3b8;
  font-style: italic;
}
`;

function buildHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PMO-CTSB — System Workflow Guide</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="doc-header">
    <h1>PMO-CTSB — System Workflow Guide</h1>
    <p class="doc-meta">Cybersolution Technologies · Helpdesk → Backlog → Tasks · June 2026</p>
  </div>
  <main>${bodyHtml}</main>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
    await mermaid.run({ querySelector: '.mermaid' });
    document.body.dataset.mermaidReady = '1';
  </script>
</body>
</html>`;
}

if (!existsSync(mdPath)) {
  console.error('Missing:', mdPath);
  process.exit(1);
}

const md = readFileSync(mdPath, 'utf8');
const mermaidCount = (md.match(/```mermaid/g) || []).length;
let bodyHtml = markdownToHtml(md);
// Skip duplicate top h1 (cover header already has title)
bodyHtml = bodyHtml.replace(/^<h1>PMO-CTSB — System Workflow Guide<\/h1>\s*/, '');

const html = buildHtml(bodyHtml);
writeFileSync(htmlPath, html, 'utf8');
console.log('HTML written:', htmlPath);

mkdirSync(path.dirname(outPath), { recursive: true });

const puppeteer = await import('puppeteer');
const browser = await puppeteer.default.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: 120000 });
  if (mermaidCount > 0) {
    await page.waitForFunction(
      (n) => document.querySelectorAll('.mermaid svg').length >= n,
      { timeout: 60000 },
      mermaidCount,
    ).catch(() => console.warn('Mermaid render timeout — PDF may lack some diagrams'));
  }
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding-top:4px;">PMO-CTSB System Workflow Guide</div>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  console.log('PDF saved:', outPath);
} finally {
  await browser.close();
}
