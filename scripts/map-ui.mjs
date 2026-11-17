import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const app = process.env.APP_URL || 'http://127.0.0.1:8081';
const api = process.env.API_URL || 'http://127.0.0.1:4000';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
const checks = [], errors = [];
await mkdir('artifacts/map', { recursive: true });
async function request(path, token, method = 'GET', body) {
  const r = await fetch(`${api}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(r.ok, `${path}: ${r.status}`); return r.json();
}
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS', name); }
try {
  const login = await request('/auth/demo', null, 'POST', { persona: 'leader' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(token => { if (window === window.top) localStorage.setItem('di-chung-token', token); }, login.token);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${app}/#/discover`);
  await check('Discover selects Da Lat and renders 80 attributed markers with clusters', async () => {
    await page.getByRole('button', { name: 'Khám phá Đà Lạt trên bản đồ', exact: true }).click();
    await page.getByText('80 / 80 điểm trên bản đồ', { exact: true }).waitFor();
    const iframe = page.frameLocator('iframe[title="Bản đồ du lịch tương tác"]');
    await iframe.locator('.leaflet-container').waitFor({ timeout: 30000 });
    await iframe.locator('.cluster').first().waitFor({ timeout: 30000 });
    const frame = page.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => typeof clusters !== 'undefined' && clusters.getLayers().length === 80);
    const center = await frame.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng }));
    assert.ok(center.lat > 11.85 && center.lat < 12.1 && center.lng > 108.3 && center.lng < 108.6);
    await page.screenshot({ path: 'artifacts/map/desktop-overview.png' });
  });
  await check('Accent-insensitive search, marker preview and details stay synchronized', async () => {
    await page.getByLabel('Tìm trên bản đồ', { exact: true }).fill('Ga Da Lat');
    await page.getByText('1 / 80 điểm trên bản đồ', { exact: true }).waitFor();
    await page.getByText('Ga Đà Lạt', { exact: true }).click();
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).waitFor();
    const frame = page.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => typeof selectedLayer !== 'undefined' && selectedLayer.getLayers().length === 1 && map.getZoom() === 16);
    assert.equal(await frame.evaluate(() => typeof selectedLayer !== 'undefined' && selectedLayer.getLayers()[0].options.title), 'Ga Đà Lạt');
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
    await page.getByText('Ga Đà Lạt', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xem trên bản đồ', exact: true }).click();
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).waitFor();
    await page.getByText('80 / 80 điểm trên bản đồ', { exact: true }).waitFor();
    const focusFrame = page.frames().find(f => f.parentFrame());
    await focusFrame.waitForFunction(() => typeof selectedLayer !== 'undefined' && selectedLayer.getLayers().length === 1 && clusters.getLayers().length === 79 && map.getZoom() === 16);
    const center = await focusFrame.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng }));
    assert.ok(Math.abs(center.lat - 11.9416078) < .002 && Math.abs(center.lng - 108.4544798) < .002);
    await page.screenshot({ path: 'artifacts/map/desktop-selected.png' });
  });
  await check('Filters retain camera position, handle empty results and deselect hidden places', async () => {
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    const frame = page.frames().find(f => f.parentFrame());
    const before = await frame.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng, z: map.getZoom() }));
    await page.getByRole('button', { name: 'Thiên nhiên', exact: true }).click();
    await frame.waitForFunction(() => typeof clusters !== 'undefined' && clusters.getLayers().length < 80);
    const after = await frame.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng, z: map.getZoom() }));
    assert.deepEqual(after, before);
    await page.getByLabel('Tìm trên bản đồ', { exact: true }).fill('no such place 437');
    await page.getByText('Không có điểm phù hợp', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
    await page.getByText('80 / 80 điểm trên bản đồ', { exact: true }).waitFor();
  });
  await check('Map marker click opens correct preview and wishlist persists through API', async () => {
    const groups = await request('/groups', login.token);
    const detail = await request(`/groups/${groups[0].id}`, login.token);
    const places = await request('/places?cityId=dalat', login.token);
    const target = places.find(p => !detail.wishlist.some(w => w.id === p.id));
    assert.ok(target);
    await page.getByLabel('Tìm trên bản đồ', { exact: true }).fill(target.name);
    await page.getByText('1 / 80 điểm trên bản đồ', { exact: true }).waitFor();
    const frame = page.frames().find(f => f.parentFrame());
    await frame.evaluate(p => map.panTo([p.latitude, p.longitude], { animate: false }), target);
    await frame.locator('.leaflet-marker-icon').first().click();
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).waitFor();
    await page.getByText(target.name, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Muốn đi', exact: true }).last().click();
    await page.getByRole('button', { name: 'Đã muốn đi', exact: true }).waitFor();
    const updated = await request(`/groups/${groups[0].id}`, login.token);
    assert.ok(updated.wishlist.some(p => p.id === target.id));
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByLabel('Tìm trên bản đồ', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Thời tiết', exact: true }).click();
    await page.getByText('DEMO · Dự báo giả lập', { exact: true }).waitFor();
  });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(token => { if (window === window.top) localStorage.setItem('di-chung-token', token); }, login.token);
  const phone = await mobile.newPage(); phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(`${app}/#/map/dalat-08`);
  await check('Mobile opens detail deep link, draggable preview, filters and full-screen map', async () => {
    await phone.getByRole('button', { name: 'Xem chi tiết', exact: true }).waitFor({ timeout: 30000 });
    await phone.getByText('Ga Đà Lạt', { exact: true }).waitFor();
    await phone.frameLocator('iframe').locator('.selected').waitFor({ timeout: 30000 });
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await phone.screenshot({ path: 'artifacts/map/mobile-selected.png' });
    const handle = phone.getByLabel('Kéo để mở rộng hoặc thu gọn thông tin');
    const bounds = await handle.boundingBox(); assert.ok(bounds);
    await phone.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await phone.mouse.down(); await phone.mouse.move(bounds.x + bounds.width / 2, bounds.y - 90, { steps: 12 }); await phone.mouse.up();
    await phone.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
    await phone.getByRole('button', { name: 'Xem trên bản đồ', exact: true }).waitFor();
  });
  await check('Map tile failure offers retry while destination list remains usable', async () => {
    const failure = await context.newPage();
    await failure.goto(`${app}/#/map/city:dalat`);
    await failure.frameLocator('iframe').locator('.cluster').first().waitFor();
    const brokenFrame = failure.frames().find(f => f.parentFrame());
    // Local 404 tiles exercise Leaflet's real tileerror event, without depending on CDN caches.
    await brokenFrame.evaluate(origin => base.setUrl(`${origin}/missing-map-tile/{z}/{x}/{y}.png`), app);
    await failure.getByRole('button', { name: 'Thử lại bản đồ', exact: true }).waitFor({ timeout: 30000 }).catch(async error => {
      console.log('Failure state:', await failure.locator('body').innerText());
      await failure.screenshot({ path: 'artifacts/map/error-state.png' });
      throw error;
    });
    await failure.getByRole('button', { name: 'Thử lại bản đồ', exact: true }).click();
    await failure.frameLocator('iframe').locator('.cluster').first().waitFor();
    await failure.getByRole('button', { name: 'Danh sách (80)', exact: true }).click();
    await failure.getByText('Hồ Xuân Hương', { exact: true }).click();
    await failure.getByRole('button', { name: 'Xem chi tiết', exact: true }).waitFor();
    await failure.close();
  });
  await check('Legacy deep link without verified coordinates explains why a marker is unavailable', async () => {
    await page.goto(`${app}/?legacy=map#/map/dalat-02`);
    await page.getByText('Chưa thể định vị điểm này', { exact: true }).waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
    await page.getByRole('button', { name: 'Khám phá thành phố', exact: true }).waitFor();
  });
  assert.deepEqual(errors, []);
  await writeFile('artifacts/map/results.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} map UI checks passed.`);
} catch (error) {
  await writeFile('artifacts/map/failure.json', JSON.stringify({ checks, errors, failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }


