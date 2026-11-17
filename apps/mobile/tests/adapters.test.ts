import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockDataAdapter } from '../src/api/adapters/MockDataAdapter';
import { ApiDataAdapter } from '../src/api/adapters/ApiDataAdapter';
import { httpRequest } from '../src/api/client/http';
import { DataError, type AuthResult } from '../src/api/contracts/adapter';
import { DEMO_PASSWORD, places } from '../src/api/mocks/fixtures';
import type { Group, GroupDetail, Plan, RecommendationResult, Notification, Comment, WeatherSummary, RadarData } from '../src/types';

const now = () => new Date('2026-11-11T08:00:00Z');
const make = () => new MockDataAdapter(now, 0);
const leader = 'mock:mock-leader', member = 'mock:mock-member', third = 'mock:mock-third';
const gid = 'mock-dalat';
const detail = (a: MockDataAdapter) => a.request<GroupDetail>(`/groups/${gid}`, leader);

test('source catalogue keeps 80 distinct OSM coordinates and unknown visitor prices', () => {
  assert.equal(places.length, 80); assert.equal(new Set(places.map(p => p.id)).size, 80);
  for (const p of places) { assert.ok(p.geographyVerified); assert.ok(p.sourceUrl?.startsWith('https://www.openstreetmap.org/')); assert.ok(p.latitude > 10 && p.latitude < 13); assert.ok(p.longitude > 107 && p.longitude < 110); assert.equal(p.visitorInfo?.entranceFeeVnd, null); }
});
test('mock fixtures are reproducible and reads cannot mutate internal state', async () => {
  const a = make(), b = make(); assert.deepEqual(await detail(a), await detail(b));
  const copy = await detail(a); copy.wishlist.length = 0; copy.group.name = 'changed';
  assert.equal((await detail(a)).wishlist.length, 8); assert.notEqual((await detail(a)).group.name, 'changed');
});
test('mock auth validates credentials, registration, profile and password lifecycle', async () => {
  const a = make();
  await assert.rejects(a.request('/auth/login', null, 'POST', { email: 'leader@dichung.demo', password: 'wrong' }), (e: unknown) => e instanceof DataError && e.status === 401);
  const logged = await a.request<AuthResult>('/auth/login', null, 'POST', { email: 'leader@dichung.demo', password: DEMO_PASSWORD }); assert.equal(logged.token, leader);
  const registered = await a.request<AuthResult>('/auth/register', null, 'POST', { email: 'new@example.test', password: 'Password123', name: 'New traveler' });
  assert.equal((await a.request<Group[]>('/groups', registered.token)).length, 0);
  await a.request('/auth/me', registered.token, 'PATCH', { name: 'Updated traveler' });
  assert.equal((await a.request<AuthResult['user']>('/auth/me', registered.token)).name, 'Updated traveler');
  await a.request('/auth/change-password', registered.token, 'POST', { currentPassword: 'Password123', newPassword: 'Updated123' });
  await assert.rejects(a.request('/auth/login', null, 'POST', { email: 'new@example.test', password: 'Password123' }));
  assert.ok(await a.request('/auth/login', null, 'POST', { email: 'new@example.test', password: 'Updated123' }));
  const reset = await a.request<{ message: string }>('/auth/forgot-password', null, 'POST', { email: 'new@example.test' }); assert.match(reset.message, /DEMO/);
});
test('group creation and joining preserve membership and per-user role', async () => {
  const a = make();
  const g = await a.request<Group>('/groups', leader, 'POST', { name: 'Weekend', cityId: 'dalat', tripDate: '2026-11-12', startHour: 8, endHour: 18, budgetPerPersonVnd: 400000 });
  await assert.rejects(a.request(`/groups/${g.id}`, member), (e: unknown) => e instanceof DataError && e.status === 403);
  await a.request('/groups/join', member, 'POST', { code: g.inviteCode });
  const viewed = await a.request<GroupDetail>(`/groups/${g.id}`, member); assert.equal(viewed.group.role, 'MEMBER'); assert.equal(viewed.members.length, 2);
  await a.request('/groups/join', member, 'POST', { code: g.inviteCode }); assert.equal((await a.request<GroupDetail>(`/groups/${g.id}`, leader)).members.length, 2);
  await assert.rejects(a.request(`/groups/${g.id}`, member, 'PATCH', { name: 'Unauthorized' }));
});
test('wishlist add is idempotent and delete updates group detail', async () => {
  const a = make(), placeId = places[15].id;
  await a.request(`/groups/${gid}/wishlist`, leader, 'POST', { placeId }); await a.request(`/groups/${gid}/wishlist`, leader, 'POST', { placeId });
  assert.equal((await detail(a)).wishlist.filter(p => p.id === placeId).length, 1);
  await a.request(`/groups/${gid}/wishlist/${placeId}`, member, 'DELETE'); assert.ok(!(await detail(a)).wishlist.some(p => p.id === placeId));
});
test('preferences are isolated per user and patch merges fields', async () => {
  const a = make(); await a.request(`/groups/${gid}/preferences`, leader, 'PATCH', { categories: ['Văn hóa'], environmentPreference: 'INDOOR' });
  const p = await a.request<{ environmentPreference: string }>(`/groups/${gid}/preferences`, member); assert.equal(p.environmentPreference, 'ANY');
});
test('recommendation setup filters source catalogue, honestly labels simulation, leaves group unchanged', async () => {
  const a = make(), before = await detail(a);
  const result = await a.request<RecommendationResult>('/ai/recommendations', leader, 'POST', { cityId: 'dalat', tripDate: '2026-11-11', startHour: 8, durationHours: 8, budgetPerPersonVnd: 500000, categories: ['CULTURE'], environmentPreference: 'INDOOR', travelStyles: [], preferredPlaceIds: [], groupId: gid, mode: 'live', limit: 6 });
  assert.equal(result.demo, true); assert.equal(result.engine, 'RULE_BASED'); assert.equal(result.fallbackReason, 'MOCK_FIXTURE'); assert.equal(result.input.mode, 'demo');
  assert.equal(result.recommendations.length, 6); assert.ok(result.recommendations.every(r => r.place.environment === 'INDOOR' && r.budgetStatus === 'UNKNOWN'));
  assert.deepEqual(await detail(a), before);
});
test('planner passes selected IDs and never applies proposal before majority', async () => {
  const a = make(); const selected = places.slice(10, 14).map(p => p.id);
  const plan = await a.request<Plan>(`/groups/${gid}/plans/generate`, leader, 'POST', { mode: 'demo', placeIds: selected });
  assert.deepEqual(plan.items.map(i => i.placeId), selected); assert.equal(plan.status, 'VOTING'); assert.equal(plan.demo, true);
  assert.equal((await detail(a)).group.currentPlanId, 'mock-approved');
  await a.request(`/plans/${plan.id}/votes`, leader, 'POST', { choice: 'YES' }); assert.equal((await detail(a)).group.currentPlanId, 'mock-approved');
  const voted = await a.request<Plan>(`/plans/${plan.id}/votes`, member, 'POST', { choice: 'YES' }); assert.equal(voted.status, 'APPROVED');
  const final = await detail(a); assert.equal(final.currentPlan?.id, plan.id); assert.equal(final.plans.find(p => p.id === 'mock-pending')?.status, 'STALE');
  assert.equal((await a.request<Plan>(`/plans/${plan.id}`, third)).myVote, null);
});
test('NO majority rejects a plan; repeated vote updates one ballot rather than inflating totals', async () => {
  const a = make(); const input = { mode: 'demo', placeIds: places.slice(0, 3).map(p => p.id) };
  const p = await a.request<Plan>(`/groups/${gid}/plans/generate`, leader, 'POST', input);
  await a.request(`/plans/${p.id}/votes`, leader, 'POST', { choice: 'YES' });
  await a.request(`/plans/${p.id}/votes`, leader, 'POST', { choice: 'NO' });
  const one = await a.request<Plan>(`/plans/${p.id}`, leader); assert.equal(one.yesVotes, 0); assert.equal(one.noVotes, 1);
  const rejected = await a.request<Plan>(`/plans/${p.id}/votes`, member, 'POST', { choice: 'NO' }); assert.equal(rejected.status, 'REJECTED');
  await assert.rejects(a.request(`/plans/${p.id}/votes`, third, 'POST', { choice: 'YES' })); assert.equal((await detail(a)).group.currentPlanId, 'mock-approved');
});
test('voter snapshot excludes late joiners and rejects stale group revisions', async () => {
  const a = make();
  const newUser = await a.request<AuthResult>('/auth/register', null, 'POST', { email: 'late@example.test', name: 'Late arrival', password: 'Password123' });
  await a.request('/groups/join', newUser.token, 'POST', { code: 'DICHUNG' });
  await assert.rejects(a.request('/plans/mock-pending/votes', newUser.token, 'POST', { choice: 'YES' }), (e: unknown) => e instanceof DataError && e.code === 'NOT_ELIGIBLE');
  await assert.rejects(a.request(`/groups/${gid}`, leader, 'PATCH', { name: 'Stale', expectedRevision: 0 }));
  await a.request(`/groups/${gid}`, leader, 'PATCH', { budgetPerPersonVnd: 600000, expectedRevision: 1 });
  assert.equal((await detail(a)).plans.find(p => p.id === 'mock-pending')?.status, 'STALE');
});
test('comments enforce target and ownership with edit/delete state consistency', async () => {
  const a = make(), base = `/groups/${gid}/comments`;
  await assert.rejects(a.request(base, leader, 'POST', { placeId: places[0].id, planId: 'mock-pending', content: 'Two targets' }));
  const c = await a.request<Comment>(base, leader, 'POST', { placeId: places[0].id, content: 'Hello' });
  await assert.rejects(a.request(`/comments/${c.id}`, member, 'PATCH', { content: 'Not mine' }));
  await a.request(`/comments/${c.id}`, leader, 'PATCH', { content: 'Edited' });
  assert.equal((await a.request<Comment[]>(base + `?placeId=${places[0].id}`, leader)).find(x => x.id === c.id)?.content, 'Edited');
  await a.request(`/comments/${c.id}`, leader, 'DELETE'); assert.ok(!(await a.request<Comment[]>(base + `?placeId=${places[0].id}`, leader)).some(x => x.id === c.id));
});
test('notifications arrive for all members and read state is private to each user', async () => {
  const a = make(); const n = (await a.request<Notification[]>('/notifications', leader))[0];
  await a.request(`/notifications/${n.id}/read`, leader, 'PATCH'); assert.ok((await a.request<Notification[]>('/notifications', leader))[0].readAt);
  assert.equal((await a.request<Notification[]>('/notifications', member))[0].readAt, null);
  await a.request(`/groups/${gid}/plans/generate`, leader, 'POST', { placeIds: [places[0].id] }); assert.equal((await a.request<Notification[]>('/notifications', member)).length, 3);
});
test('subscription events are scoped and cease after cleanup', async () => {
  const a = make(); let events = 0, status = '';
  const s = a.subscribe({ token: leader, groupId: gid, onEvent: () => events++, onStatus: x => status = x });
  assert.equal(status, 'local'); await a.request(`/groups/${gid}/wishlist`, member, 'POST', { placeId: places[20].id }); assert.ok(events > 0);
  s.close(); const before = events; await a.request(`/groups/${gid}/wishlist`, member, 'POST', { placeId: places[21].id }); assert.equal(events, before);
});
test('weather simulation distinguishes missing values, rain changes and unavailable radar', async () => {
  const a = make(); a.setScenario('missing-weather'); const w = await a.request<WeatherSummary>(`/groups/${gid}/weather`, leader);
  assert.equal(w.demo, true); assert.ok(w.slots.every(s => s.level === 'UNKNOWN' && s.temperatureC === null && s.rainMmH === null && s.validSources === 0));
  a.setScenario('rain-change'); const changed = await detail(a); assert.equal(changed.currentPlan?.id, 'mock-approved'); assert.ok(changed.plans.some(p => p.kind === 'RAIN_CHANGE' && p.status === 'VOTING'));
  const radar = await a.request<RadarData>('/radar', leader); assert.equal(radar.frames.length, 0); assert.match(radar.attribution, /DEMO/);
});
test('empty, offline, expired, slow, cancellation and unimplemented scenarios are explicit', async () => {
  const a = make(); a.setScenario('empty'); assert.deepEqual(await a.request('/groups', leader), []); assert.deepEqual(await a.request('/places', leader), []);
  a.setScenario('offline'); await assert.rejects(a.request('/cities', leader), (e: unknown) => e instanceof DataError && e.code === 'NETWORK');
  a.setScenario('expired'); await assert.rejects(a.request('/cities', leader), (e: unknown) => e instanceof DataError && e.status === 401);
  a.setScenario('slow'); const abort = new AbortController(); const p = a.request('/cities', leader, 'GET', undefined, 45000, abort.signal); abort.abort(); await assert.rejects(p, (e: unknown) => e instanceof DataError && e.code === 'CANCELLED');
  await assert.rejects(a.request('/cities', leader, 'GET', undefined, 1), (e: unknown) => e instanceof DataError && e.code === 'TIMEOUT');
  a.setScenario('normal'); await assert.rejects(a.request('/unknown', leader), (e: unknown) => e instanceof DataError && e.status === 501);
});
test('API adapter preserves agreed URL, Bearer auth, method and payload', async () => {
  const original = globalThis.fetch; const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response(JSON.stringify({ id: 'server-plan', engine: 'LLM', demo: false }), { status: 200 }); }) as typeof fetch;
  try {
    const a = new ApiDataAdapter(() => 'https://backend.example');
    const result = await a.request<Plan>('/plans/server-plan/votes', 'id-token', 'POST', { choice: 'YES' });
    assert.equal(result.engine, 'LLM'); assert.equal(result.demo, false); assert.equal(calls[0].url, 'https://backend.example/api/plans/server-plan/votes');
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer id-token'); assert.equal(calls[0].init.body, '{"choice":"YES"}');
  } finally { globalThis.fetch = original; }
});
test('HTTP transport exposes authoritative errors, malformed JSON and empty responses', async () => {
  const run = (status: number, body: string) => httpRequest('https://backend.example', '/cities', leader, 'GET', undefined, 100, undefined, async () => new Response(body, { status }));
  await assert.rejects(run(403, '{"code":"FORBIDDEN","error":"Membership required"}'), (e: unknown) => e instanceof DataError && e.code === 'FORBIDDEN' && e.message === 'Membership required');
  await assert.rejects(run(401, '{"error":"Expired token"}'), (e: unknown) => e instanceof DataError && e.code === 'SESSION_EXPIRED');
  await assert.rejects(run(200, '<html>wrong proxy</html>'), (e: unknown) => e instanceof DataError && e.code === 'INVALID_RESPONSE');
  assert.equal(await httpRequest('https://backend.example', '/comments/1', leader, 'DELETE', undefined, 100, undefined, async () => new Response(null, { status: 204 })), undefined);
});
test('HTTP transport cancels requests and bounds timeout without mocking successful results', async () => {
  const waiting: typeof fetch = async (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  await assert.rejects(httpRequest('https://backend.example', '/cities', leader, 'GET', undefined, 2, undefined, waiting), (e: unknown) => e instanceof DataError && e.code === 'TIMEOUT');
  const c = new AbortController(); const p = httpRequest('https://backend.example', '/cities', leader, 'GET', undefined, 100, c.signal, waiting); c.abort(); await assert.rejects(p, (e: unknown) => e instanceof DataError && e.code === 'CANCELLED');
  await assert.rejects(httpRequest('https://backend.example', '/cities', leader, 'GET', undefined, 100, undefined, async () => { throw new TypeError('Failed to fetch'); }), (e: unknown) => e instanceof DataError && e.code === 'NETWORK');
});
