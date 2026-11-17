import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Read-only source/index audit. Findings never print matched credential values.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexed = process.argv.includes('--staged') || process.argv.includes('--tracked');
const staged = process.argv.includes('--staged');
const git = args => execFileSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const paths = [...new Set(git(indexed ? ['ls-files', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean))].sort();
const included = new Set(paths);
const failures = [], reviews = [], links = [], files = [], nestedRepositories = [];
const fail = (path, reason, line) => failures.push({ path, reason, ...(line ? { line } : {}) });
const secretPatterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['OpenAI-token', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{25,}/g],
  ['GitHub-token', /\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['Google-key', /\bAIza[0-9A-Za-z_-]{30,}/g],
  ['AWS-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['JWT-literal', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g],
  ['service-account-key', /"private_key"\s*:\s*"[^"\s]{20,}/g],
  ['credential-URL', /https?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/g],
];
const prohibited = /(?:^|\/)(?:node_modules|\.env(?:\.[^/]+)?|\.data|\.expo|\.gradle|\.cxx|\.firebase|emulator-data|artifacts|test-results|playwright-report|credentials|secrets|\.secrets|dist|dist-android(?:-phase3)?)(?:\/|$)|\.(?:apk|aab|keystore|jks|pem|key|p12|pfx|sqlite3?|db|log)$|(?:^|\/)(?:local\.properties|[^/]*serviceAccount[^/]*\.json|[^/]*service-account[^/]*\.json|[^/]*firebase-adminsdk[^/]*\.json)$/i;
for (const path of paths) {
  if (prohibited.test(path) && !/(?:^|\/)\.env(?:\.[^/]+)?\.example$/.test(path)) fail(path, 'Secret/local data/dependency/build file must not be published');
  const info = await lstat(resolve(root, path));
  if (!info.isFile()) { fail(path, 'Only regular source files are allowed'); continue; }
  const data = staged ? git(['show', ':' + path]) : await readFile(resolve(root, path));
  files.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  if (data.length > 10 * 1024 * 1024) fail(path, 'File exceeds reviewed source limit of 10 MiB');
  if (data.includes(0)) {
    if (!/\.(?:png|webp|jpg|jpeg|gif|ico)$/.test(path) && path !== 'apps/mobile/android/gradle/wrapper/gradle-wrapper.jar') fail(path, 'Unreviewed binary file');
    continue;
  }
  const content = data.toString('utf8');
  for (const [name, pattern] of secretPatterns) {
    for (const match of content.matchAll(pattern)) fail(path, name + ' pattern (value redacted)', content.slice(0, match.index).split('\n').length);
  }
  for (const match of content.matchAll(/(?:[A-Z]:[\\/](?:Users|CSW)[^\n`"']*|\/Users\/[^/\s]+|\/home\/[^/\s]+)/g)) {
    reviews.push({ path, line: content.slice(0, match.index).split('\n').length, reason: 'Developer-specific absolute path; review portability' });
  }
  if (!path.endsWith('.md')) continue;
  for (const match of content.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let target = match[1].replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    if (/^(?:[A-Z]:|file:|\/)/i.test(target)) { fail(path, 'Nonportable local Markdown link'); continue; }
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) continue;
    const destination = relative(root, resolve(dirname(resolve(root, path)), target)).split(sep).join('/');
    if (!included.has(destination) && !paths.some(p => p.startsWith(destination + '/'))) fail(path, 'Markdown target absent from publication: ' + destination);
    else links.push({ path, target });
  }
}
const skip = new Set(['node_modules', 'artifacts', '.expo', '.gradle', '.cxx', '.data', 'build', 'dist', 'dist-android', 'dist-android-phase3']);
async function findNested(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git') { if (dir !== root) nestedRepositories.push(relative(root, resolve(dir, entry.name))); continue; }
    if (entry.isDirectory() && !skip.has(entry.name)) await findNested(resolve(dir, entry.name));
  }
}
await findNested(root);
for (const path of nestedRepositories) fail(path, 'Nested Git repository requires explicit review');
// An ignored source file must not silently disappear from a handoff.
async function checkSourceTree(dir) {
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) { if (!skip.has(entry.name) && entry.name !== '.git') await checkSourceTree(path); }
    else if (!included.has(path)) fail(path, 'Existing source omitted from publication, including ignored files');
  }
}
for (const dir of ['apps/mobile/src', 'apps/mobile/tests', 'apps/server/src', 'apps/server/test', 'apps/server/migrations', 'apps/server/data', 'docs', 'scripts']) await checkSourceTree(dir);
const required = ['README.md', '.gitignore', '.github/workflows/check.yml', 'package.json', 'package-lock.json', 'docker-compose.yml', 'apps/mobile/App.tsx', 'apps/mobile/src/api.ts', 'apps/mobile/src/api/adapters/MockDataAdapter.ts', 'apps/mobile/src/api/adapters/ApiDataAdapter.ts', 'apps/mobile/package.json', 'apps/mobile/tsconfig.json', 'apps/mobile/app.json', 'apps/mobile/app.config.ts', 'apps/mobile/.env.example', 'apps/server/package.json', 'apps/server/tsconfig.json', 'apps/server/src/app.ts', 'apps/server/src/seed.ts', 'apps/server/migrations/001_initial.sql', 'apps/server/.env.example', 'docs/team/README.md', 'docs/team/API_CONTRACT.md', 'docs/team/DATABASE_DEVELOPMENT_PLAN.md'];
for (const path of required) if (!included.has(path)) fail(path, 'Essential source missing');
for (const directory of ['apps/mobile/tests/', 'apps/server/test/', 'scripts/', 'docs/team/']) assert.ok(paths.some(p => p.startsWith(directory)), directory);
const report = { status: failures.length ? 'FAIL' : 'PASS', scope: staged ? 'Git index blobs' : indexed ? 'tracked files' : 'tracked and untracked publication candidates', generatedAt: new Date().toISOString(), fileCount: paths.length, totalBytes: files.reduce((n, f) => n + f.bytes, 0), markdownLinks: links.length, nestedRepositories, reviews, failures, largestFiles: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 10), files };
await mkdir(resolve(root, 'artifacts/phase5'), { recursive: true });
await writeFile(resolve(root, 'artifacts/phase5/source-publication-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, files: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
