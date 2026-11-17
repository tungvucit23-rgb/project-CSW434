// Isolated UI verification: in-memory database, built web assets, loopback only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve('apps/mobile/dist');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
const api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: resolve('apps/server'), windowsHide: true, stdio: 'inherit', env: { ...process.env, PORT: '4000', HOST: '127.0.0.1', PGLITE_DATA_DIR: ':memory:', DATABASE_URL: '', ENABLE_WORKER: 'false', ALLOW_DEMO: 'true', SEED_DEMO: 'true', OPENAI_API_KEY: '', WEATHERAPI_KEY: '', TOMORROW_API_KEY: '', JWT_SECRET: 'isolated-local-ui-verification-only' } });
server.listen(8081, '127.0.0.1', () => console.log('UI preview http://127.0.0.1:8081 (isolated memory database)'));
function stop() { api.kill(); server.close(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
api.on('exit', () => server.close());
