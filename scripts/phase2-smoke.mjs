import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
const port = Number(process.env.PHASE2_PORT || 4200), base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: resolve('apps/server'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PGLITE_DATA_DIR: ':memory:', DATABASE_URL: '', ALLOW_DEMO: 'true', SEED_DEMO: 'true', ENABLE_WORKER: 'false', OPENAI_API_KEY: '', WEATHERAPI_KEY: '', TOMORROW_API_KEY: '', JWT_SECRET: 'phase-two-isolated-integration-only' } });
let logs = ''; child.stdout.on('data', c => { logs += c; }); child.stderr.on('data', c => { logs += c; });
const checks = [], sockets = [];
async function api(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`); return result;
}
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS', name); }
try {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) throw Error(logs);
    try { if ((await fetch(base + '/api/health')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
    if (i === 119) throw Error('Server timeout ' + logs);
  }
  const [leader, member, third] = await Promise.all(['leader', 'member', 'third'].map(persona => api('/auth/demo', null, 'POST', { persona })));
  const group = (await api('/groups', leader.token))[0];
  const before = await api(`/groups/${group.id}`, leader.token);
  const places = await api('/places?cityId=dalat', leader.token), allowed = new Set(places.map(p => p.id));
  const input = { cityId: group.cityId, tripDate: group.tripDate, budgetPerPersonVnd: group.budgetPerPersonVnd, durationHours: group.endHour - group.startHour, startHour: group.startHour, groupId: group.id, mode: 'demo', limit: 6 };
  let discovery, plan;
  await check('Standalone discovery returns source-backed recommendations with honest fallback and traceable facts', async () => {
    discovery = await api('/ai/recommendations', leader.token, 'POST', input);
    assert.equal(discovery.engine, 'RULE_BASED'); assert.equal(discovery.fallbackReason, 'NO_API_KEY'); assert.equal(discovery.demo, true);
    assert.ok(discovery.recommendations.length > 0);
    discovery.recommendations.forEach((r, i) => { assert.ok(allowed.has(r.placeId)); assert.equal(r.rank, i + 1); assert.ok(r.factIds.every(f => Object.hasOwn(r.facts, f))); assert.equal(r.budgetStatus, 'UNKNOWN'); });
    const after = await api(`/groups/${group.id}`, leader.token); assert.equal(after.plans.length, before.plans.length); assert.equal(after.wishlist.length, before.wishlist.length);
  });
  await check('Group preferences affect explanations; category-only legacy update preserves new preferences', async () => {
    await api(`/groups/${group.id}/preferences`, member.token, 'PATCH', { categories: ['Văn hóa'], environmentPreference: 'INDOOR', travelStyles: ['CULTURE'] });
    await api(`/groups/${group.id}/preferences`, member.token, 'PATCH', { categories: ['Văn hóa'] });
    assert.deepEqual((await api(`/groups/${group.id}/preferences`, member.token)).travelStyles, ['CULTURE']);
    const updated = await api('/ai/recommendations', leader.token, 'POST', input);
    assert.notEqual(updated.requestId, discovery.requestId); assert.equal(updated.groupPreferenceCount, 3);
    assert.ok(updated.recommendations.some(r => r.preferenceReasons.some(reason => reason.includes('thành viên'))));
  });
  await check('Discovery requires authentication and rejects another group, wrong city and invented preferred IDs', async () => {
    await api('/ai/recommendations', null, 'POST', input, 401);
    await api('/ai/recommendations', leader.token, 'POST', { ...input, cityId: 'vungtau' }, 409);
    await api('/ai/recommendations', leader.token, 'POST', { ...input, preferredPlaceIds: ['invented-place'] }, 422);
    const outsider = await api('/auth/register', null, 'POST', { name: 'Private QA outsider', email: 'private-phase2@qa.test', password: 'OnlyLocal!437' }, 201);
    await api('/ai/recommendations', outsider.token, 'POST', input, 404);
  });
  await check('Discovery works without a group and rain offers explicit indoor alternatives outside strict filters', async () => {
    const result = await api('/ai/recommendations', third.token, 'POST', { ...input, groupId: null, startHour: 11, durationHours: 4, environmentPreference: 'OUTDOOR', categories: ['NATURE'] });
    assert.equal(result.recommendations.length, 0); assert.equal(result.weatherAlternatives.engine, 'RULE_BASED'); assert.equal(result.weatherAlternatives.outsideFilters, true);
    assert.ok(result.weatherAlternatives.recommendations.length > 0);
    assert.ok(result.weatherAlternatives.recommendations.every(r => r.place.environment === 'INDOOR' && allowed.has(r.placeId)));
  });
  await check('Only leaders create proposals; invalid selected IDs are rejected before planning', async () => {
    await api(`/groups/${group.id}/plans/generate`, member.token, 'POST', { mode: 'demo', placeIds: discovery.recommendations.map(r => r.placeId) }, 403);
    await api(`/groups/${group.id}/plans/generate`, leader.token, 'POST', { mode: 'demo', placeIds: ['invented-place'] }, 422);
  });
  await check('Recommendations feed existing planner; order, time, budget estimates and route metadata are validated', async () => {
    plan = await api(`/groups/${group.id}/plans/generate`, leader.token, 'POST', { mode: 'demo', placeIds: discovery.recommendations.map(r => r.placeId) }, 201);
    assert.equal(plan.status, 'VOTING'); assert.equal(plan.route.kind, 'STRAIGHT_LINE'); assert.equal(plan.tripContext.cityId, 'dalat'); assert.equal(plan.route.unmappedPlaceIds.length, 0);
    assert.ok(plan.totalCostVnd <= group.budgetPerPersonVnd); assert.equal(new Set(plan.items.map(i => i.placeId)).size, plan.items.length);
    let previousEnd = Date.parse(`${group.tripDate}T${String(group.startHour).padStart(2, '0')}:00:00+07:00`);
    for (const item of plan.items) { assert.ok(allowed.has(item.placeId)); assert.ok(Date.parse(item.startTime) >= previousEnd + item.travelMin * 60000); previousEnd = Date.parse(item.endTime); }
    assert.ok(previousEnd <= Date.parse(`${group.tripDate}T${String(group.endHour).padStart(2, '0')}:00:00+07:00`));
    assert.equal((await api(`/groups/${group.id}`, leader.token)).group.currentPlanId, before.group.currentPlanId);
  });
  await check('Duplicate votes cannot grow the tally; current plan changes only after snapshot majority', async () => {
    const first = await api(`/plans/${plan.id}/votes`, member.token, 'POST', { choice: 'YES' });
    const duplicate = await api(`/plans/${plan.id}/votes`, member.token, 'POST', { choice: 'YES' });
    assert.equal(first.yesVotes, 1); assert.equal(duplicate.yesVotes, 1);
    assert.equal((await api(`/groups/${group.id}`, leader.token)).group.currentPlanId, before.group.currentPlanId);
    const approved = await api(`/plans/${plan.id}/votes`, leader.token, 'POST', { choice: 'YES' }); assert.equal(approved.status, 'APPROVED');
    assert.equal((await api(`/groups/${group.id}`, leader.token)).group.currentPlanId, plan.id);
  });
  await check('Changing travel date/window invalidates old proposals and blocks rain-change against another date', async () => {
    const draft = await api(`/groups/${group.id}/plans/generate`, leader.token, 'POST', { mode: 'demo', placeIds: discovery.recommendations.map(r => r.placeId) }, 201);
    const tomorrow = new Date(Date.parse(`${group.tripDate}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    await api(`/groups/${group.id}`, leader.token, 'PATCH', { tripDate: tomorrow, startHour: 9, endHour: 17 });
    assert.equal((await api(`/plans/${draft.id}`, leader.token)).status, 'STALE');
    assert.equal((await api(`/groups/${group.id}`, leader.token)).group.currentPlanId, plan.id);
    await api(`/groups/${group.id}/plans/generate`, leader.token, 'POST', { mode: 'demo', task: 'RAIN_CHANGE' }, 422);
  });
  await check('Reconnection rejoins authorized room and receives subsequent wishlist updates', async () => {
    const socket = io(base, { autoConnect: false, transports: ['websocket'], auth: { token: leader.token } }); sockets.push(socket);
    const join = () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Socket join timeout')), 6000);
      socket.once('connect', () => socket.emit('group:join', { groupId: group.id }, ack => { clearTimeout(timeout); ack.ok ? resolve() : reject(Error(ack.error)); })); socket.connect();
    });
    await join(); const previousId = socket.id; socket.disconnect(); await join(); assert.notEqual(socket.id, previousId);
    const event = new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('Missing wishlist event after reconnect')), 6000); socket.once('wishlist:updated', value => { clearTimeout(t); resolve(value); }); });
    const target = places.find(p => !before.wishlist.some(w => w.id === p.id));
    await api(`/groups/${group.id}/wishlist`, member.token, 'POST', { placeId: target.id });
    const update = await event; assert.equal(update.groupId, group.id); assert.ok(update.wishlist.some(p => p.id === target.id));
  });
  await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/phase2-integration-results.json', JSON.stringify({ checks }, null, 2));
  console.log(`${checks.length} Phase 2 integration checks passed.`);
} finally { sockets.forEach(s => s.disconnect()); child.kill(); }
