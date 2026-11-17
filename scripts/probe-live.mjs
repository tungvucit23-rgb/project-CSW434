import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = `${process.env.API_URL || "http://localhost:4000"}/api`;
async function get(route, token, body) {
  const response = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45000),
  });
  assert.ok(response.ok, `${route}: HTTP ${response.status}`);
  return response.json();
}
const { token } = await get("/auth/demo", null, { persona: "leader" });
const groups = await get("/groups", token);
const weather = await get(`/groups/${groups[0].id}/weather?mode=live`, token);
assert.equal(weather.demo, false);
const radar = await get("/radar", token);
const report = {
  at: new Date().toISOString(),
  weather: {
    demo: weather.demo,
    providers: weather.providers,
    slots: weather.slots.length,
    note: weather.confidenceText,
  },
  radar: {
    host: radar.host,
    frames: radar.frames.length,
    maxZoom: radar.maxZoom,
    coverageUrl: radar.coverageUrl,
  },
  limitation:
    "Không kiểm tra key trả phí, không xác minh coverage tile tại từng thành phố, không chứng minh độ chính xác dự báo.",
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/live-probe.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
