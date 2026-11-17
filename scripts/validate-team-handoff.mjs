import assert from 'node:assert/strict';
import { readFile, readdir, stat, mkdir, mkdtemp, writeFile, rm, copyFile } from 'node:fs/promises';
import { resolve, dirname, basename, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=path=>readFile(resolve(root,path),'utf8');
const normalize=s=>s.replaceAll('\r\n','\n');
const required=['README.md','PROJECT_ARCHITECTURE.md','BACKEND_DEVELOPMENT_PLAN.md','DATABASE_DEVELOPMENT_PLAN.md','API_CONTRACT.md','TECH_STACK.md','ENV_SETUP.md','TEAM_SETUP.md','INTEGRATION_PLAN.md','GIT_WORKFLOW.md','INTEGRATION_CHECKLIST.md'];
const checks=[],failures=[];
const check=async(name,fn)=>{try{await fn();checks.push(name);console.log('PASS',name);}catch(e){failures.push({name,error:e.message});console.error('FAIL',name,e.message);}};
await mkdir(resolve(root,'artifacts/phase4'),{recursive:true});
const docs=(await readdir(resolve(root,'docs/team'))).filter(n=>n.endsWith('.md'));
await check('Các tài liệu bắt buộc tồn tại, có nội dung',async()=>{for(const n of required)assert.ok((await text('docs/team/'+n)).length>500,n);});
let linkCount=0;
await check('Mọi internal Markdown link trỏ tới file/thư mục tồn tại',async()=>{
 for(const name of docs){const content=await text('docs/team/'+name);
  for(const m of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
   let target=m[1].trim().replace(/^<|>$/g,'');
   if(/^(https?:|mailto:|#)/.test(target))continue;
   target=decodeURIComponent(target.split('#')[0]);
   if(!target)continue;
   const dest=resolve(root,'docs/team',target); assert.ok(!isAbsolute(target),`${name}: absolute link không portable`);
   assert.ok(await stat(dest).catch(()=>null),`${name}: thiếu ${target}`);linkCount++;
  }
 }
});
const api=JSON.parse(await text('docs/team/examples/api-coverage.json'));
const model=JSON.parse(await text('docs/team/examples/firestore-model.json'));
const app=await text('apps/mobile/App.tsx');
const block=app.slice(app.indexOf('const titles:'),app.indexOf('const routeNames'));
const routeNames=[...block.matchAll(/^  (\w+):/gm)].map(m=>m[1]);
const server=await text('apps/server/src/app.ts');
const handlers=[...server.matchAll(/api\.(get|post|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1].toUpperCase()+' '+m[2]);
await check('Coverage khớp routes và handler thật; missing status lấy từ source',async()=>{
 assert.ok(routeNames.length>=40);assert.deepEqual(new Set(api.routes.map(r=>r.name)),new Set(routeNames));
 assert.ok(api.operations.length>=40);
 const keys=new Set(api.operations.map(e=>e.method+' '+e.path));assert.equal(keys.size,api.operations.length);
 for(const key of handlers)assert.ok(keys.has(key),key);
 const absent=api.operations.filter(e=>!handlers.includes(e.method+' '+e.path));
 assert.ok(absent.every(e=>e.targetMissing&&e.status.includes('Missing')));
 for(const e of api.operations){assert.ok(e.module&&e.collection&&e.status);assert.equal(e.targetMissing,!handlers.includes(e.method+' '+e.path));for(const route of e.screens)assert.ok(routeNames.includes(route),route);}
});
await check('TypeScript snapshot chính xác với frontend source, không đổi wire types',async()=>{
 const contract=normalize(await text('docs/team/API_CONTRACT.md'));
 for(const p of ['apps/mobile/src/types.ts','apps/mobile/src/api/contracts/adapter.ts'])assert.ok(contract.includes(normalize(await text(p))),p);
 assert.ok(contract.includes('expectedRevision lệch vẫn nhận edit'));
 assert.ok(contract.includes('Event thực do mutation phát'));
});
await check('Schema có paths/fields/validation/example/ACL/index và mapping toàn bộ SQL',async()=>{
 assert.equal(model.status,'PLANNED_NOT_IMPLEMENTED');assert.equal(model.collections.length,23);
 for(const c of model.collections){assert.ok(c.path&&c.purpose&&c.permission&&c.indexes&&c.related.length);assert.ok(c.fields.length>0);assert.ok(c.example.schemaVersion===1);for(const f of c.fields){assert.ok(f.name&&f.type&&f.validation&&typeof f.required==='boolean');if(f.required){let value=c.example;for(const key of f.name.split('.')){assert.ok(value&&Object.hasOwn(value,key),`${c.path}: example thiếu ${f.name}`);value=value[key];}}}}
 const sql=await text('apps/server/migrations/001_initial.sql'),dbDoc=await text('docs/team/DATABASE_DEVELOPMENT_PLAN.md');
 for(const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g))assert.ok(dbDoc.includes(m[1]),m[1]);
 assert.ok(dbDoc.includes('không import password_hash'));assert.ok(dbDoc.includes('Sau khi Firebase đã có write'));
});
await check('Env docs khớp readers hiện tại; template Firebase ghi rõ chưa được đọc',async()=>{
 const documented=await text('docs/team/ENV_SETUP.md');
 for(const p of ['apps/server/src/config.ts','apps/mobile/src/api.ts','apps/mobile/app.config.ts'])for(const m of (await text(p)).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g))assert.ok(documented.includes(m[1]),m[1]);
 for(const p of ['apps/server/.env.firebase.example','apps/mobile/.env.firebase.example'])assert.ok((await text(p)).includes('PLANNED ONLY'),p);
 const cfg=JSON.parse(await text('docs/team/examples/firebase.json.example'));assert.equal(cfg.emulators.ui.port,4401);assert.equal(cfg.emulators.auth.port,9099);assert.equal(cfg.emulators.firestore.port,8080);
});
await check('Ignore bảo vệ credentials nhưng cho phép commit templates',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'di-chung-ignore-'));
 try {
  await copyFile(resolve(root,'.gitignore'),resolve(dir,'.gitignore'));
  execFileSync('git',['init','-q'],{cwd:dir,stdio:'pipe',windowsHide:true});
  const ignored=path=>{try{execFileSync('git',['check-ignore','--no-index','--quiet','--',path],{cwd:dir,stdio:'pipe',windowsHide:true});return true;}catch(e){if(e.status===1)return false;throw e;}};
  for(const p of ['apps/server/.env','apps/mobile/.env.production','apps/server/.data/postgres/x','secrets/example.json','credentials/firebase.json','firebase-adminsdk-example.json','test-service-account.json','private.pem','local.jks','apps/mobile/android/app/debug.keystore','apps/mobile/android/local.properties','apps/mobile/android/app/build/output.apk','node_modules/x.js','artifacts/export.json'])assert.ok(ignored(p),p);
  for(const p of ['apps/mobile/.env.example','apps/server/.env.example','apps/mobile/.env.firebase.example','apps/server/.env.firebase.example','docs/team/API_CONTRACT.md','firebase.json','firestore.rules'])assert.ok(!ignored(p),p);
 } finally {
  const finalPath=resolve(dir),tempRoot=resolve(tmpdir());
  assert.ok(finalPath.startsWith(tempRoot+sep)&&basename(finalPath).startsWith('di-chung-ignore-'),'Refuse cleanup outside owned temporary probe');
  await rm(finalPath,{recursive:true,force:true});
 }
});
await check('Tệp bàn giao không chứa private-key/token/API-key thật',async()=>{
 const examples=(await readdir(resolve(root,'docs/team/examples'))).map(n=>'docs/team/examples/'+n);
 const candidates=docs.map(n=>'docs/team/'+n).concat(examples,['README.md','.gitignore','.github/PULL_REQUEST_TEMPLATE.md','.github/workflows/check.yml','apps/server/.env.example','apps/server/.env.firebase.example','apps/mobile/.env.firebase.example','scripts/team-audit.mjs','scripts/generate-team-schema.mjs','scripts/generate-team-contract.mts','scripts/validate-team-handoff.mjs']);
 const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{25,}/,/\bgh[pousr]_[A-Za-z0-9]{25,}/,/\bgithub_pat_[A-Za-z0-9_]{30,}/,/"private_key"\s*:\s*"[^"\s]{20,}/];
 for(const p of candidates){const s=await text(p);for(const pattern of patterns)assert.ok(!pattern.test(s),`Sensitive pattern found: ${p} (value redacted)`);}
});
// Local evidence only; CI clones do not have the ignored before-change snapshot.
let integrity=null;
const baselinePath=resolve(root,'artifacts/phase4/source-baseline.json');
if(process.argv.includes('--verify-runtime-baseline'))await check('Runtime source/migrations/manifests không đổi so với baseline',async()=>{
 assert.ok(await stat(baselinePath).catch(()=>null),'Cần snapshot trước thay đổi cho kiểm tra Phase 4');
 const before=JSON.parse((await readFile(baselinePath,'utf8')).replace(/^\uFEFF/,''));
 const changed=[];for(const item of before){const hash=createHash('sha256').update(await readFile(resolve(root,item.path))).digest('hex').toUpperCase();if(hash!==item.sha256.toUpperCase())changed.push(item.path);}
 integrity={status:changed.length?'FAIL':'PASS',files:before.length,changed};await writeFile(resolve(root,'artifacts/phase4/source-integrity.json'),JSON.stringify(integrity,null,2)+'\n');assert.deepEqual(changed,[]);
});
const result={status:failures.length?'FAIL':'PASS',auditedOn:'2026-11-17',requiredDocs:required.length,markdownDocs:docs.length,internalLinks:linkCount,checks,failures,sourceIntegrity:integrity};
await writeFile(resolve(root,'artifacts/phase4/document-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,requiredDocs:required.length,internalLinks:linkCount,passed:checks.length,failed:failures.length}));
if(failures.length)process.exitCode=1;
