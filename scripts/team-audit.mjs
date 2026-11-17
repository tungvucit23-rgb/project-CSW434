import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(resolve(root, path), 'utf8');
const json = async path => JSON.parse(await read(path));
const lock = await json('package-lock.json');
const manifests = Object.fromEntries(await Promise.all(['package.json', 'apps/mobile/package.json', 'apps/server/package.json'].map(async path => [path, await json(path)])));
const names = ['typescript','express','firebase','firebase-admin','firebase-tools','@firebase/rules-unit-testing','@electric-sql/pglite','pg','zod','socket.io','socket.io-client','@playwright/test','tsx','expo','react-native','react','jsonwebtoken','expo-secure-store'];
const packages = await Promise.all(names.map(async name => {
  let installed = null; try { installed = (await json(`node_modules/${name}/package.json`)).version; } catch {}
  return { name, declared: Object.entries(manifests).flatMap(([path,p]) => ['dependencies','devDependencies'].flatMap(kind => p[kind]?.[name] ? [{path, kind, range:p[kind][name]}] : [])), locked: lock.packages?.[`node_modules/${name}`]?.version || null, installed };
}));
const lockDrift = [];
for (const [path, p] of Object.entries(manifests)) {
  const key = path === 'package.json' ? '' : path.slice(0, -'/package.json'.length);
  for (const kind of ['dependencies','devDependencies']) for (const [name, range] of Object.entries(p[kind] || {})) {
    if (lock.packages?.[key]?.[kind]?.[name] !== range) lockDrift.push({ workspace: key || '.', name, manifest: range, lockDeclaration: lock.packages?.[key]?.[kind]?.[name] || null });
  }
}
const app = await read('apps/mobile/App.tsx'), source = await read('apps/server/src/app.ts');
const titleBlock = app.slice(app.indexOf('const titles:'), app.indexOf('const routeNames'));
const routes = [...titleBlock.matchAll(/^  (\w+): "([^"]+)"/gm)].map(m => ({ name:m[1], title:m[2] }));
const endpoints = [...source.matchAll(/api\.(get|post|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(m => ({ method:m[1].toUpperCase(), path:m[2], line:source.slice(0,m.index).split('\n').length }));
const report = { auditedOn: '2026-11-17', timezone: 'Asia/Ho_Chi_Minh', runtimeNode: process.version, manifests, packages, lockDrift, routes, endpoints, sqlTables: [...(await read('apps/server/migrations/001_initial.sql')).matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m=>m[1]) };
await mkdir(resolve(root,'artifacts/phase4'),{recursive:true});
await writeFile(resolve(root,'artifacts/phase4/audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({node:report.runtimeNode,routes:routes.length,serverEndpoints:endpoints.length,sqlTables:report.sqlTables,lockDrift,packages:packages.map(({name,locked,installed})=>({name,locked,installed}))},null,2));
