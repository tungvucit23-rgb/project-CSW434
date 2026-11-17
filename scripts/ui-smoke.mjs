import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const app = process.env.APP_URL || "http://localhost:8081";
const api = process.env.API_URL || "http://localhost:4000";
const artifacts = path.resolve("artifacts", "ui");
await mkdir(artifacts, { recursive: true });
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : existsSync(edge)
      ? { executablePath: edge }
      : {}),
});
const errors = [],
  checks = [];
async function request(route, token, method = "GET", body) {
  const response = await fetch(`${api}/api${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, `${route}: ${response.status}`);
  return response.json();
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Khám phá chuyến đi mẫu", exact: true })
    .waitFor({ timeout: 90000 });
  await page.screenshot({
    path: path.join(artifacts, "01-login-desktop.png"),
    fullPage: true,
  });
  await page.getByText("Chưa có tài khoản? Đăng ký", { exact: true }).click();
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .waitFor();
  await page.getByLabel("Tên của bạn", { exact: true }).waitFor();
  checks.push("Màn hình đăng ký");
  await page.getByText("Đã có tài khoản? Đăng nhập", { exact: true }).click();
  await page
    .getByRole("button", { name: "Khám phá chuyến đi mẫu", exact: true })
    .click();
  await page
    .getByText("Một chuyến đi, nhiều niềm vui.", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByText("Mở chuyến đi của nhóm", { exact: true }).waitFor();
  checks.push("Đăng nhập demo qua giao diện");
  const token = await page.evaluate(() =>
    localStorage.getItem("di-chung-token"),
  );
  assert.ok(token);
  const groups = await request("/groups", token);
  const detail = await request(`/groups/${groups[0].id}`, token);
  const newPlan = await request(
    `/groups/${groups[0].id}/plans/generate`,
    token,
    "POST",
    { mode: "demo" },
  );
  const routes = [
    ["home", "Một chuyến đi, nhiều niềm vui."],
    ["groups", "Những chuyến đi của bạn"],
    ["createGroup", "Tạo chuyến đi mới"],
    ["joinGroup", "Tham gia chuyến đi"],
    ["dashboard", "Chuyến đi của chúng mình"],
    ["members", "Những người đồng hành"],
    ["invite", "Rủ nhau đi thôi"],
    ["discover", "Đi đâu cũng có điều hay"],
    ["filters", "Tìm điểm đến phù hợp"],
    ["placeDetail", "Một điểm dừng đáng nhớ", detail.wishlist[0].id],
    ["wishlist", "Danh sách muốn đi"],
    ["timeline", "Lịch trình chung"],
    ["planItem", "Chi tiết điểm dừng", detail.currentPlan.items[0].id],
    ["proposal", "Phương án cho cả nhóm", newPlan.id],
    ["vote", "Cùng nhau quyết định", newPlan.id],
    ["history", "Các phiên bản lịch trình"],
    ["weather", "Đi theo nhịp thời tiết"],
    ["hourly", "Thời tiết từng giờ"],
    ["providers", "Dữ liệu đến từ đâu?"],
    ["radar", "Theo dõi những cơn mưa"],
    ["rainReport", "Thời tiết ở chỗ bạn"],
    ["verification", "Kiểm chứng dự báo"],
    ["notifications", "Có tin mới cho bạn"],
    ["budget", "Ngân sách chuyến đi"],
    ["activity", "Nhật ký nhóm"],
    ["aiSetup", "Trợ lý lập lịch"],
    ["profile", "Góc của bạn"],
    ["editProfile", "Chỉnh sửa hồ sơ"],
    ["settings", "Cài đặt ứng dụng"],
    ["help", "Đi Chung cùng bạn"],
  ];
  for (const [route, title, id] of routes) {
    await page.goto(`${app}/?screen=${route}#/${route}${id ? "/" + id : ""}`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByText(title, { exact: true })
      .last()
      .waitFor({ timeout: 20000 });
    // Full document reload deliberately exercises session restore. Pace those reloads
    // to stay within the same IP quota that protects actual users.
    await page.waitForTimeout(2200);
    if (
      [
        "home",
        "dashboard",
        "discover",
        "timeline",
        "proposal",
        "weather",
        "radar",
      ].includes(route)
    )
      await page.screenshot({
        path: path.join(artifacts, `desktop-${route}.png`),
        fullPage: true,
      });
    checks.push(`Màn hình ${route}`);
    console.log(`PASS screen ${route}`);
  }
  await page.goto(`${app}/?screen=vote-action#/vote/${newPlan.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("button", { name: /Đồng ý/, exact: false })
    .first()
    .click();
  await page.waitForTimeout(700);
  const voted = await request(`/plans/${newPlan.id}`, token);
  assert.equal(voted.yesVotes, 1);
  assert.equal(voted.status, "VOTING");
  checks.push("Vote qua giao diện không tự áp dụng khi chưa đủ đa số");

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mobileContext.addInitScript(
    (value) => { if (window === window.top) localStorage.setItem("di-chung-token", value); },
    token,
  );
  const mobile = await mobileContext.newPage();
  mobile.on("pageerror", (error) => errors.push(error.message));
  for (const route of [
    "home",
    "dashboard",
    "discover",
    "timeline",
    "weather",
    "profile",
  ]) {
    await mobile.goto(`${app}/?mobile=${route}#/${route}`, {
      waitUntil: "domcontentloaded",
    });
    const expected = routes.find((r) => r[0] === route)[1];
    await mobile
      .getByText(expected, { exact: true })
      .last()
      .waitFor({ timeout: 20000 });
    // Match desktop pacing: each full reload restores the session and group data.
    await mobile.waitForTimeout(2200);
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Horizontal document overflow at ${route}`,
    );
    await mobile.screenshot({
      path: path.join(artifacts, `mobile-${route}.png`),
      fullPage: true,
    });
    checks.push(`Mobile 390px ${route}`);
  }
  assert.deepEqual(errors, [], "Browser JavaScript errors");
  console.log(`${checks.length} UI checks passed.`);
} finally {
  await writeFile(
    path.join(artifacts, "results.json"),
    JSON.stringify({ at: new Date().toISOString(), checks, errors }, null, 2),
  );
  await browser.close();
}

