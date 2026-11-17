import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const app = process.env.APP_URL || 'http://127.0.0.1:8091';
const out = fileURLToPath(new URL('../artifacts/phase3/', import.meta.url));
await mkdir(out, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [], apiCalls = [], checks = [];
page.on('pageerror', error => { if (errors.length < 2) console.error('BROWSER ERROR', error.stack); errors.push(error.message); });
page.on('request', req => { if (/\/api\/(auth|groups|cities|places|ai|plans|notifications|radar)/.test(req.url())) apiCalls.push(req.url()); });
const button = name => page.getByRole('button', { name, exact: true });
const text = value => page.getByText(value, { exact: true });
const route = async path => { await page.evaluate(path => { window.location.hash = `#/${path}`; }, path); await page.waitForFunction(path => window.location.hash === `#/${path}`, path); };
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
let currentPlan;
try {
  await page.goto(app, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await button('Đăng nhập').waitFor({ timeout: 120000 });
  await check('Login works without backend and labels local demo state', async () => {
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('leader@dichung.demo');
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('Demo1234!');
    await button('Đăng nhập').click(); await button('Mở chuyến đi của nhóm').waitFor();
    await page.getByText('Chỉ lưu trong phiên này, không đồng bộ nhiều thiết bị', { exact: false }).waitFor();
    await page.screenshot({ path: `${out}/mobile-home.png`, fullPage: true });
  });
  await check('City navigation opens all 80 source-backed map markers and clusters', async () => {
    await route('discover'); await button('Khám phá Đà Lạt trên bản đồ').click();
    await text('80 / 80 điểm trên bản đồ').waitFor();
    await page.frameLocator('iframe').locator('.cluster').first().waitFor({ timeout: 45000 });
    const frame = page.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => typeof markers !== 'undefined' && markers.size === 80);
  });
  await check('Map accent-insensitive search focuses a marker and opens the selected destination', async () => {
    await page.getByRole('textbox', { name: 'Tìm trên bản đồ', exact: true }).fill('ho xuan huong');
    await text('1 / 80 điểm trên bản đồ').waitFor();
    await page.getByRole('button').filter({ hasText: 'Hồ Xuân Hương' }).first().click();
    await button('Xem chi tiết').waitFor(); await button('Xem chi tiết').click();
    await text('Hồ Xuân Hương').first().waitFor();
    assert.match(page.url(), /placeDetail\/dalat-01/);
  });
  await check('Wishlist remove and add stay consistent across detail, map and group', async () => {
    await route('wishlist');
    await button('Bỏ Hồ Xuân Hương khỏi danh sách').click();
    await route('map/dalat-01'); await button('Muốn đi').last().waitFor(); await button('Muốn đi').last().click(); await button('Đã muốn đi').waitFor();
    await route('wishlist'); await text('Hồ Xuân Hương').first().waitFor();
  });
  await check('AI preferences produce simulated recommendation cards and map results', async () => {
    await route('recommendations/city:dalat'); await button('Tìm gợi ý phù hợp').waitFor();
    await button('Thiên nhiên').last().click();
    await button('Tìm gợi ý phù hợp').click();
    await text('RULE_BASED · theo quy tắc').waitFor(); await page.getByText('Không phải đầu ra AI thật.', { exact: false }).first().waitFor();
    await button('Xem gợi ý trên bản đồ').click();
    await page.frameLocator('iframe').locator('.ranked').first().waitFor();
    await button('Find My Perfect Trip').click(); await button('Dùng gợi ý để tạo lịch nhóm').click();
    await button('Tạo phương án để nhóm biểu quyết').waitFor();
  });
  await check('Planner selection generates a pending proposal and an ordered route map', async () => {
    await button('Tạo phương án để nhóm biểu quyết').click();
    await button('Xem phương án & biểu quyết').waitFor();
    assert.match(page.url(), /itineraryMap/); currentPlan = decodeURIComponent(page.url().split('/').at(-1));
    const frame = page.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => markers.size >= 3 && routeLayer.getLayers().length === 1);
    await page.getByText('không phải tuyến lái xe.', { exact: false }).waitFor();
    await page.screenshot({ path: `${out}/mobile-itinerary.png`, fullPage: true });
  });
  await check('Timeline and map selection synchronize in both directions', async () => {
    const rows = page.getByRole('button', { name: /^Chọn điểm dừng/ });
    await rows.nth(1).click(); assert.equal(await rows.nth(1).getAttribute('aria-selected'), 'true');
    const frame = page.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => Array.from(markers.values()).some(m => m.selected));
    const title = (await rows.nth(2).getAttribute('aria-label')).replace(/^Chọn điểm dừng \d+: /, '');
    await frame.evaluate(title => { const item = Array.from(markers.values()).find(m => m.marker.options.title === title); map.stop(); map.panTo(item.marker.getLatLng(), { animate: false }); item.marker.fire('click'); }, title);
    await page.waitForFunction(() => [...document.querySelectorAll('[aria-label^="Chọn điểm dừng"]')][2]?.getAttribute('aria-selected') === 'true');
  });
  await check('Group proposal YES voting stays pending until distinct accounts form majority', async () => {
    await button('Xem phương án & biểu quyết').click(); await button('Xem phiếu và biểu quyết').click();
    await button('Đồng ý').click(); await page.getByText('Đã ghi nhận phiếu đồng ý của bạn.', { exact: false }).waitFor();
    await route('settings'); await button('Đăng nhập thành viên thứ hai').click();
    await page.getByText(/Chào Nam, sẵn sàng/).waitFor();
    await route(`vote/${currentPlan}`); await button('Đồng ý').waitFor(); await button('Đồng ý').click();
    await page.getByText('Nhóm đã đủ đa số.', { exact: false }).waitFor(); await text('Đã thông qua').first().waitFor();
  });
  await check('Notifications open related proposals and generic notification details', async () => {
    await route('notifications'); await page.getByRole('button').filter({ hasText: 'Có phương án mới' }).first().click();
    await text('Đã thông qua').first().waitFor();
    await route('notifications'); await page.getByRole('button').filter({ hasText: 'Chào mừng đến Đi Chung' }).first().click();
    await button('Về thông báo').waitFor(); assert.match(page.url(), /notificationDetail/);
  });
  await check('Comments support create, edit and delete in the same local state', async () => {
    await route('placeDetail/dalat-01'); await page.getByRole('textbox', { name: 'Bình luận của bạn', exact: true }).fill('Đi cùng nhau nhé'); await button('Gửi bình luận').click();
    await expect(page.getByRole('textbox', { name: 'Bình luận của bạn', exact: true })).toHaveValue('');
    await text('Đi cùng nhau nhé').waitFor(); await text('Sửa').last().click(); await page.getByRole('textbox', { name: 'Chỉnh sửa bình luận của bạn', exact: true }).fill('Hẹn lúc 8 giờ'); await button('Lưu chỉnh sửa').click();
    await expect(page.getByRole('textbox', { name: 'Bình luận của bạn', exact: true })).toHaveValue('');
    await text('Hẹn lúc 8 giờ').waitFor(); await text('Xóa').last().click(); await text('Hẹn lúc 8 giờ').waitFor({ state: 'hidden' });
  });
  await check('Browser back and forward restore protected routes', async () => {
    await route('profile'); await button('Chỉnh sửa hồ sơ').click(); await page.goBack(); await button('Chỉnh sửa hồ sơ').waitFor(); await page.goForward(); await button('Lưu hồ sơ').waitFor();
  });
  await check('Weather chart, hourly metrics, sources and radar have honest available/missing states', async () => {
    await route('weather'); await text('Biểu đồ lượng mưa').waitFor(); await page.getByText('Nhiệt độ · khung dự báo đầu', { exact: true }).waitFor();
    await route('hourly'); await page.getByText('Nhiệt độ:', { exact: false }).first().waitFor(); await route('providers'); await text('Open-Meteo').waitFor();
    await route('radar'); await text('Chưa có khung radar').waitFor();
  });
  await check('Weather-change proposals invalidate map forecasts and leave the official plan unchanged', async () => {
    await route('map/city:dalat'); await button('Thời tiết').click(); await page.getByText('DEMO · Các con số', { exact: false }).first().waitFor();
    await route('settings'); await button('Đăng nhập trưởng nhóm').click(); await page.getByText(/Chào Anh, sẵn sàng/).waitFor();
    await route('dashboard'); await button('Giả lập mưa').click(); await page.getByText('Điều chỉnh khi có nguy cơ mưa', { exact: false }).first().waitFor();
    await route('map/city:dalat'); await button('Thời tiết').click();
    await page.getByRole('textbox', { name: 'Tìm trên bản đồ', exact: true }).fill('Hồ Xuân Hương');
    await text('1 / 80 điểm trên bản đồ').waitFor(); await page.getByRole('button').filter({ hasText: 'Hồ Xuân Hương' }).first().click();
    await page.getByText('Có nguy cơ mưa · cân nhắc điểm trong nhà', { exact: true }).waitFor();
    await route('timeline'); await page.getByRole('button', { name: 'Xem tuyến lịch trình trên bản đồ', exact: true }).click(); assert.ok(page.url().includes(currentPlan));
    await route('settings'); await button('Đăng nhập thành viên thứ hai').click(); await page.getByText(/Chào Nam, sẵn sàng/).waitFor();
  });
  await check('Every authenticated route renders without crashing or blank content', async () => {
    const source = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
    const block = source.slice(source.indexOf('const titles:'), source.indexOf('const routeNames'));
    const names = [...block.matchAll(/^  (\w+):/gm)].map(m => m[1]).filter(n => !['login', 'register', 'forgotPassword'].includes(n));
    for (const name of names) {
      const id = ['proposal', 'vote', 'itineraryMap'].includes(name) ? currentPlan : name === 'placeDetail' || name === 'map' ? 'dalat-01' : name === 'recommendations' ? 'city:dalat' : name === 'planItem' ? `${currentPlan}-stop-1` : name === 'notificationDetail' ? 'mock-welcome-mock-member' : '';
      await route(name + (id ? '/' + encodeURIComponent(id) : '')); await page.waitForTimeout(250);
      assert.ok((await page.locator('body').innerText()).length > 80, `${name}: blank`);
      assert.equal(await page.getByText('Cùng bắt đầu lại nhé.', { exact: true }).count(), 0, name);
    }
    assert.equal(names.length, 37); checks.push(`Route inventory: ${names.length} authenticated routes`);
  });
  // Developer scenario controls are intentionally omitted from production exports.
  await route('settings');
  if (await button('Công cụ phát triển').count()) {
    await check('Developer scenarios show loading, empty, offline, missing weather, and reconnect recovery', async () => {
      await button('Công cụ phát triển').click(); await button('Thiếu thời tiết').click(); await route('weather'); await page.getByText('DEMO · Chưa có dự báo.', { exact: false }).waitFor();
      await route('settings'); await button('Công cụ phát triển').click(); await button('Tải chậm (1,2 giây)').click(); await route('activity'); await page.getByRole('progressbar', { name: 'Đang tải nội dung', exact: true }).waitFor();
      await route('settings'); await button('Công cụ phát triển').click(); await button('Mất mạng').click(); await page.getByText('DEMO · Kịch bản mất mạng.', { exact: false }).first().waitFor();
      await button('Đầy đủ dữ liệu').click(); await button('Danh sách trống').click(); await route('discover'); await text('Chưa tìm thấy điểm phù hợp').waitFor();
      await route('settings'); await button('Công cụ phát triển').click(); await button('Đặt lại dữ liệu mẫu').click();
    });
  }
  await check('Password reset and registration are usable public screens', async () => {
    await route('profile'); await button('Đăng xuất').click(); await button('Quên mật khẩu?').click();
    await page.getByRole('textbox', { name: 'Email khôi phục', exact: true }).fill('leader@dichung.demo'); await button('Gửi hướng dẫn đặt lại').click(); await page.getByText('Không gửi email thật.', { exact: false }).waitFor();
    await button('Quay lại').click(); await page.getByText('Chưa có tài khoản? Đăng ký', { exact: true }).click(); await page.getByRole('textbox', { name: 'Tên của bạn', exact: true }).fill('Traveler');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('traveler@example.test'); await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('Password123'); await button('Tạo tài khoản').click(); await button('Bắt đầu lên lịch').waitFor();
  });
  await check('Change-password UI persists the local credential and requires signing in again', async () => {
    await route('changePassword');
    await page.getByRole('textbox', { name: 'Mật khẩu hiện tại', exact: true }).fill('Password123');
    await page.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill('Changed456!');
    await page.getByRole('textbox', { name: 'Nhập lại mật khẩu mới', exact: true }).fill('Changed456!');
    await button('Lưu mật khẩu mới').click(); await button('Đăng nhập lại').click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('traveler@example.test');
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('Changed456!');
    await button('Đăng nhập').click(); await button('Bắt đầu lên lịch').waitFor();
  });
  assert.deepEqual(apiCalls, [], 'Mock journey must never contact backend'); assert.deepEqual(errors, [], 'No browser runtime errors');
  await page.setViewportSize({ width: 1440, height: 1000 }); await route('discover'); await page.screenshot({ path: `${out}/desktop-discover.png`, fullPage: true });
  await writeFile(`${out}/results.json`, JSON.stringify({ status: 'PASS', checks, pageErrors: errors, backendRequests: apiCalls, runtime: 'Headless Edge via Playwright; mobile viewport and desktop. No Android device claim.' }, null, 2));
  console.log(`PASS ${checks.length} UI checks; zero backend requests; zero page errors`);
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${out}/failure.txt`, `${error.stack}\n\n${(await page.locator('body').innerText()).slice(0, 22000)}`);
  await writeFile(`${out}/results.json`, JSON.stringify({ status: 'FAIL', checks, pageErrors: errors, backendRequests: apiCalls, error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); }
