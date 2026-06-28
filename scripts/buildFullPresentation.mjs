/**
 * Full pipeline: capture screenshots → HTML slides → PDF
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

console.log('=== PMO CTSB Screenshot Presentation ===\n');
await run('node', ['scripts/captureAppScreenshots.mjs']);
await run('node', ['scripts/buildScreenshotPresentation.mjs']);
await run('node', ['scripts/buildScreenshotPdf.mjs']);
console.log('\n=== Done ===');
console.log('Open: docs/PMO-CTSB-Screenshot-Tour.pdf');
