import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const app = process.env.APP_URL || 'http://127.0.0.1:8081', api = process.env.API_URL || 'http://127.0.0.1:4000';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
const checks = [], errors = [];
await mkdir('artifacts/phase2-ui', { recursive: true });
async function request(path, token, method = 'GET', body) {
  const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`); return data;
}
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS', name); }
async function context(options, token) {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(({ token, api }) => { if (window === window.top) { localStorage.setItem('di-chung-token', token); localStorage.setItem('di-chung-api', api); } }, { token, api });
  return ctx;
}
let page;
try {
  const leader = await request('/auth/demo', null, 'POST', { persona: 'leader' });
  const member = await request('/auth/demo', null, 'POST', { persona: 'member' });
  const thirdMember = await request('/auth/demo', null, 'POST', { persona: 'third' });
  const seedGroup = (await request('/groups', leader.token))[0];
  const group = await request('/groups', leader.token, 'POST', { name: `Phase 2 UI ${Date.now()}`, cityId: 'dalat', tripDate: seedGroup.tripDate, startHour: 8, endHour: 20, budgetPerPersonVnd: 600000, mode: 'DEMO' });
  await request('/groups/join', member.token, 'POST', { code: group.inviteCode });
  await request('/groups/join', thirdMember.token, 'POST', { code: group.inviteCode });
  const before = await request(`/groups/${group.id}`, leader.token);
  const desktop = await context({ viewport: { width: 1440, height: 1000 } }, leader.token);
  page = await desktop.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${app}/#/map/city:dalat`);
  await page.frameLocator('iframe').locator('.cluster').first().waitFor({ timeout: 30000 });
  const originalFrame = page.frames().find(f => f.parentFrame());
  await page.waitForTimeout(350);
  const camera = await originalFrame.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() }));
  let discovery, selected, plan;
  await check('AI setup produces honest source-backed recommendations, without creating a plan', async () => {
    await page.getByRole('button', { name: 'Find My Perfect Trip', exact: true }).click();
    await page.getByRole('switch', { name: 'Dùng sở thích nhóm', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ẩm thực & cafe', exact: true }).click();
    const response = page.waitForResponse(r => r.url().endsWith('/api/ai/recommendations') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Tìm gợi ý phù hợp', exact: true }).click();
    const result = await response; discovery = await result.json(); assert.ok(result.ok(), JSON.stringify(discovery));
    assert.equal(discovery.engine, 'RULE_BASED'); assert.equal(discovery.demo, true); assert.ok(discovery.recommendations.length > 0);
    await page.getByText('RULE_BASED · theo quy tắc', { exact: true }).waitFor();
    const current = await request(`/groups/${group.id}`, leader.token);
    assert.equal(current.plans.length, before.plans.length); assert.equal(current.group.currentPlanId, before.group.currentPlanId);
    assert.equal(current.wishlist.length, before.wishlist.length);
    selected = discovery.recommendations.find(r => !before.wishlist.some(p => p.id === r.placeId)); assert.ok(selected);
    await page.screenshot({ path: 'artifacts/phase2-ui/desktop-recommendations.png' });
  });
  await check('Recommendation card saves to the shared wishlist with visible completion inside the dialog', async () => {
    const other = discovery.recommendations.find(r => r.placeId !== selected.placeId);
    await page.getByRole('button', { name: `Lưu ${other.place.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Đã trong wishlist', exact: true }).first().waitFor();
    assert.ok((await request(`/groups/${group.id}`, leader.token)).wishlist.some(p => p.id === other.placeId));
  });
  await check('Ranked recommendation markers preserve the city camera; selecting a result focuses its own marker', async () => {
    await page.getByRole('button', { name: 'Xem gợi ý trên bản đồ', exact: true }).click();
    await originalFrame.waitForFunction(count => markers.size === count && selectedLayer.getLayers().length === count, discovery.recommendations.length);
    assert.deepEqual(await originalFrame.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() })), camera);
    assert.equal(await originalFrame.locator('.ranked').count(), discovery.recommendations.length);
    await page.getByRole('button', { name: 'Find My Perfect Trip', exact: true }).click();
    await page.getByRole('button', { name: `Định vị ${selected.place.name}`, exact: true }).click();
    await originalFrame.waitForFunction(id => markers.get(id)?.selected === true && map.getZoom() === 16, selected.placeId);
    const point = await originalFrame.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng }));
    assert.ok(Math.abs(point.lat - selected.place.latitude) < .001 && Math.abs(point.lng - selected.place.longitude) < .001);
    await page.getByRole('button', { name: 'Vì sao điểm này được gợi ý?', exact: true }).waitFor();
  });
  await check('Recommended destination wishlist action persists and all/recommended toggle stays synchronized', async () => {
    await page.getByRole('button', { name: 'Muốn đi', exact: true }).last().click();
    await page.getByRole('button', { name: 'Đã muốn đi', exact: true }).waitFor();
    assert.ok((await request(`/groups/${group.id}`, leader.token)).wishlist.some(p => p.id === selected.placeId));
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByRole('button', { name: 'Tất cả điểm', exact: true }).click();
    await page.getByText('80 / 80 điểm trên bản đồ', { exact: true }).waitFor();
    await page.getByRole('button', { name: `AI gợi ý (${discovery.recommendations.length})`, exact: true }).click();
    await page.getByText(`${discovery.recommendations.length} / 80 điểm trên bản đồ`, { exact: true }).waitFor();
  });
  await check('Recommendation selection feeds the separate planner and opens an unapproved itinerary map', async () => {
    await page.getByRole('button', { name: 'Find My Perfect Trip', exact: true }).click();
    await page.getByRole('button', { name: 'Dùng gợi ý để tạo lịch nhóm', exact: true }).click();
    await page.getByText('Trợ lý lập lịch', { exact: true }).last().waitFor();
    const response = page.waitForResponse(r => /\/api\/groups\/[^/]+\/plans\/generate$/.test(r.url()) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Tạo phương án để nhóm biểu quyết', exact: true }).click();
    const created = await response; plan = await created.json(); assert.ok(created.ok(), JSON.stringify(plan));
    assert.equal(plan.status, 'VOTING'); assert.ok(plan.items.every(i => discovery.recommendations.some(r => r.placeId === i.placeId)));
    await page.getByRole('button', { name: 'Xem phương án & biểu quyết', exact: true }).waitFor();
    const frame = page.frames().find(f => f.parentFrame());
    await frame.waitForFunction(count => typeof routeLayer !== 'undefined' && routeLayer.getLayers().length === 1 && markers.size === count, plan.items.length);
    assert.equal((await request(`/groups/${group.id}`, leader.token)).group.currentPlanId, before.group.currentPlanId);
    await page.screenshot({ path: 'artifacts/phase2-ui/desktop-itinerary.png' });
  });
  await check('Selecting timeline rows and markers keeps itinerary selection synchronized in both directions', async () => {
    assert.ok(plan.items.length >= 3);
    const frame = page.frames().find(f => f.parentFrame());
    const second = plan.items[1], third = plan.items[2];
    await page.getByRole('button', { name: `Chọn điểm dừng 2: ${second.place.name}`, exact: true }).click();
    await frame.waitForFunction(id => markers.get(id)?.selected === true && map.getZoom() === 16, second.placeId);
    await frame.evaluate(p => { map.stop(); map.panTo([p.latitude, p.longitude], { animate: false }); }, third.place);
    await frame.getByTitle(third.place.name, { exact: true }).click();
    const row = page.getByRole('button', { name: `Chọn điểm dừng 3: ${third.place.name}`, exact: true });
    await row.waitFor();
    await frame.waitForFunction(id => markers.get(id)?.selected === true, third.placeId);
    assert.equal(await row.getAttribute('aria-selected'), 'true');
  });
  await check('Proposal review preserves majority voting and receives approval through realtime', async () => {
    await page.getByRole('button', { name: 'Xem phương án & biểu quyết', exact: true }).click();
    await page.goto(`${app}/?vote-phase2=1#/vote/${plan.id}`);
    await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    const afterOne = await request(`/plans/${plan.id}`, leader.token); assert.equal(afterOne.yesVotes, 1); assert.equal(afterOne.status, 'VOTING');
    assert.equal((await request(`/groups/${group.id}`, leader.token)).group.currentPlanId, before.group.currentPlanId);
    await request(`/plans/${plan.id}/votes`, member.token, 'POST', { choice: 'YES' });
    await page.getByText(/Biểu quyết đã đóng: APPROVED/).waitFor();
    assert.equal((await request(`/groups/${group.id}`, leader.token)).group.currentPlanId, plan.id);
  });
  const mobile = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, leader.token);
  const phone = await mobile.newPage(); phone.on('pageerror', e => errors.push(e.message));
  await check('Mobile setup handles API errors and retry, displays real fallback results without horizontal overflow', async () => {
    let intercepted = false;
    await phone.route('**/api/ai/recommendations', async route => { if (!intercepted) { intercepted = true; await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'QA: máy chủ gợi ý tạm thời chưa khả dụng.' }) }); } else await route.continue(); });
    await phone.goto(`${app}/#/recommendations/city:dalat`);
    await phone.getByRole('button', { name: 'Ẩm thực & cafe', exact: true }).waitFor();
    await phone.getByRole('button', { name: 'Ẩm thực & cafe', exact: true }).click();
    await phone.getByRole('button', { name: 'Tìm gợi ý phù hợp', exact: true }).click();
    await phone.getByText('QA: máy chủ gợi ý tạm thời chưa khả dụng.', { exact: true }).waitFor();
    await phone.getByRole('button', { name: 'Tìm gợi ý phù hợp', exact: true }).click();
    await phone.getByText('RULE_BASED · theo quy tắc', { exact: true }).waitFor();
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await phone.screenshot({ path: 'artifacts/phase2-ui/mobile-recommendations.png' });
  });
  await check('Changing city clears old recommendation markers and uses the correct city center', async () => {
    await phone.getByRole('button', { name: 'Đổi thiết lập gợi ý', exact: true }).click();
    await phone.getByRole('button', { name: 'Vũng Tàu', exact: true }).click();
    await phone.getByRole('button', { name: 'Đóng gợi ý', exact: true }).click();
    const frame = phone.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => typeof cityId !== 'undefined' && cityId === 'vungtau' && markers.size === 0);
    const center = await frame.evaluate(() => map.getCenter().lat); assert.ok(Math.abs(center - 10.346) < .01);
    assert.equal(await frame.locator('.ranked').count(), 0);
  });
  await check('Mobile itinerary map shows ordered stops, expandable timeline and honest route label', async () => {
    await phone.goto(`${app}/?mobile-itinerary=1#/itineraryMap/${plan.id}`);
    await phone.getByText('Đã được nhóm duyệt', { exact: true }).waitFor();
    await phone.getByRole('button', { name: 'Mở rộng', exact: true }).click();
    await phone.getByRole('button', { name: 'Thu gọn', exact: true }).waitFor();
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await phone.frameLocator('iframe').locator('.leaflet-overlay-pane path').first().waitFor();
    await phone.screenshot({ path: 'artifacts/phase2-ui/mobile-itinerary.png' });
  });
  assert.deepEqual(errors, []);
  await writeFile('artifacts/phase2-ui/results.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} Phase 2 UI checks passed.`);
} catch (error) {
  if (page) { await page.screenshot({ path: 'artifacts/phase2-ui/failure.png', fullPage: true }).catch(() => {}); }
  await writeFile('artifacts/phase2-ui/failure.json', JSON.stringify({ checks, errors, error: String(error) }, null, 2)); throw error;
} finally { await browser.close(); }
