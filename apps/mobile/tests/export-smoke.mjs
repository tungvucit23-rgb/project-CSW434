import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.css': 'text/css' };
// Temporary loopback-only asset server for testing the export, never an application API.
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const file = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' });
  const errors = [], api = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/api\/(auth|groups|cities|places|ai|plans|notifications)/.test(r.url())) api.push(r.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Khám phá chuyến đi mẫu', exact: true }).click();
  await page.getByRole('button', { name: 'Mở chuyến đi của nhóm', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Công cụ phát triển', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Khám phá điểm đến trên bản đồ', exact: true }).click();
  await page.getByText('80 / 80 điểm trên bản đồ', { exact: true }).waitFor();
  await page.frameLocator('iframe').locator('.cluster').first().waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(api, []);
  const result = { status: 'PASS', viewport: '360x800', productionExport: true, checks: ['Static production export boots', 'Mock authentication opens Home', '80 destinations render with local clustering library', 'Developer controls hidden', 'No backend requests', 'No browser runtime errors'], errors, backendRequests: api };
  await writeFile(new URL('../artifacts/phase3/production-export.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log('PASS production export: auth, 80-place map, hidden dev controls, zero backend requests/errors');
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
