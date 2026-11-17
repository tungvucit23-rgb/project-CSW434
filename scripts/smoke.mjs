import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.SMOKE_PORT || 4100);
const base = `http://127.0.0.1:${port}/api`;
const runId = randomUUID();
const artifactDir = path.join(root, "artifacts");
await mkdir(artifactDir, { recursive: true });
const child = spawn(
  process.execPath,
  [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "src/index.ts"],
  {
    cwd: path.join(root, "apps", "server"),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      PGLITE_DATA_DIR: path.join(artifactDir, `smoke-db-${runId}`),
      DATABASE_URL: "",
      ALLOW_DEMO: "true",
      SEED_DEMO: "true",
      ENABLE_WORKER: "false",
      OPENAI_API_KEY: "",
      WEATHERAPI_KEY: "",
      TOMORROW_API_KEY: "",
      JWT_SECRET: "smoke-test-secret-unique-for-local-verification-only",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (chunk) => {
  logs += chunk;
});
child.stderr.on("data", (chunk) => {
  logs += chunk;
});
const results = [];
const sockets = [];
async function check(name, task) {
  await task();
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function api(route, token, method = "GET", body, accepted = [200, 201]) {
  const response = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  assert.ok(
    accepted.includes(response.status),
    `${method} ${route}: ${response.status} ${JSON.stringify(data)}`,
  );
  return data;
}
async function ready() {
  for (let i = 0; i < 240; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try {
      const r = await fetch(base + "/health");
      if (r.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server startup timed out: ${logs}`);
}
let failure;
try {
  await ready();
  const [leader, member, third] = await Promise.all(
    ["leader", "member", "third"].map((persona) =>
      api("/auth/demo", null, "POST", { persona }),
    ),
  );
  const groups = await api("/groups", leader.token);
  assert.ok(groups.length);
  const groupId = groups[0].id;
  let details = await api(`/groups/${groupId}`, leader.token);
  const initialPlanId = details.group.currentPlanId;

  await check(
    "Seed: 80 điểm Đà Lạt có nguồn OSM; giữ 40 điểm Vũng Tàu",
    async () => {
      const cities = await api("/cities", leader.token);
      assert.equal(cities.length, 2);
      for (const city of cities)
        assert.ok(
          (await api(`/places?cityId=${city.id}`, leader.token)).length >= 30,
        );
      const dalat = await api('/places?cityId=dalat', leader.token);
      assert.equal(dalat.length, 80);
      assert.equal(new Set(dalat.map(p => p.id)).size, 80);
      assert.equal(new Set(dalat.map(p => p.sourceUrl)).size, 80);
      assert.ok(dalat.every(p => p.geographyVerified && p.visitorInfo.entranceFeeVnd === null));
      assert.equal((await api('/places?cityId=vungtau', leader.token)).length, 40);
      assert.equal((await api('/places/dalat-08', leader.token)).id, 'dalat-08');
      assert.equal((await api('/places/dalat-02', leader.token)).geographyVerified, false);
      assert.equal(details.members.length, 3);
      assert.ok(initialPlanId);
    },
  );
  const proposal = await api(
    `/groups/${groupId}/plans/generate`,
    leader.token,
    "POST",
    { mode: "demo" },
  );
  await check(
    "Thiếu API key: lịch bằng luật ghi đúng nguồn, không giả là LLM",
    async () => {
      assert.equal(proposal.engine, "RULE_BASED");
      assert.equal(proposal.demo, true);
      assert.equal(proposal.status, "VOTING");
      assert.equal(proposal.eligibleCount, 3);
      assert.equal(proposal.requiredYesVotes, 2);
      assert.ok(proposal.items.length >= 2);
    },
  );
  await check(
    "Một phiếu chưa đổi lịch; bỏ lại một phiếu không tăng số phiếu",
    async () => {
      let plan = await api(
        `/plans/${proposal.id}/votes`,
        leader.token,
        "POST",
        { choice: "YES" },
      );
      assert.equal(plan.yesVotes, 1);
      plan = await api(`/plans/${proposal.id}/votes`, leader.token, "POST", {
        choice: "YES",
      });
      assert.equal(plan.yesVotes, 1);
      assert.equal(
        (await api(`/groups/${groupId}`, leader.token)).group.currentPlanId,
        initialPlanId,
      );
    },
  );
  await check("Đủ hai trong ba người mới áp dụng lịch chính thức", async () => {
    const plan = await api(
      `/plans/${proposal.id}/votes`,
      member.token,
      "POST",
      { choice: "YES" },
    );
    assert.equal(plan.status, "APPROVED");
    assert.equal(
      (await api(`/groups/${groupId}`, leader.token)).group.currentPlanId,
      proposal.id,
    );
  });
  const outsider = await api("/auth/register", null, "POST", {
    name: "Người ngoài nhóm",
    email: `outside-${runId}@example.test`,
    password: "TestPass!234",
  });
  await check(
    "REST chặn người ngoài nhóm và member không có quyền tạo lịch",
    async () => {
      await api(
        `/groups/${groupId}`,
        outsider.token,
        "GET",
        undefined,
        [403, 404],
      );
      await api(
        `/groups/${groupId}/plans/generate`,
        member.token,
        "POST",
        { mode: "demo" },
        [403],
      );
    },
  );
  await check("Socket chặn người ngoài room", async () => {
    const socket = io(`http://127.0.0.1:${port}`, {
      auth: { token: outsider.token },
      transports: ["websocket"],
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.on("connect", resolve);
      socket.on("connect_error", reject);
      setTimeout(
        () => reject(new Error("Socket connect timeout")),
        8000,
      ).unref();
    });
    const ack = await socket
      .timeout(5000)
      .emitWithAck("group:join", { groupId });
    assert.equal(ack.ok, false);
  });
  await check(
    "Bình luận đích cụ thể đồng bộ realtime; không cho sửa bình luận người khác",
    async () => {
      const socket = io(`http://127.0.0.1:${port}`, {
        auth: { token: third.token },
        transports: ["websocket"],
      });
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        socket.on("connect", resolve);
        socket.on("connect_error", reject);
        setTimeout(
          () => reject(new Error("Socket connect timeout")),
          8000,
        ).unref();
      });
      const ack = await socket
        .timeout(5000)
        .emitWithAck("group:join", { groupId });
      assert.equal(ack.ok, true);
      const received = new Promise((resolve, reject) => {
        socket.once("comment:created", resolve);
        setTimeout(
          () => reject(new Error("Missing comment event")),
          8000,
        ).unref();
      });
      const comment = await api(
        `/groups/${groupId}/comments`,
        leader.token,
        "POST",
        {
          planId: proposal.id,
          content: "Mình đồng ý phương án đã cân nhắc nguy cơ mưa.",
        },
      );
      const event = await received;
      assert.equal(event.groupId, groupId);
      const list = await api(
        `/groups/${groupId}/comments?planId=${proposal.id}`,
        member.token,
      );
      assert.ok(list.some((c) => c.id === comment.id));
      await api(
        `/comments/${comment.id}`,
        member.token,
        "PATCH",
        { content: "Không được sửa" },
        [403, 404],
      );
      await api(
        `/groups/${groupId}/comments`,
        leader.token,
        "POST",
        {
          planId: proposal.id,
          placeId: details.wishlist[0].id,
          content: "Hai đích sai",
        },
        [400, 422],
      );
    },
  );
  await check(
    "Giả lập mưa tạo cảnh báo và đề xuất; không tự thay lịch",
    async () => {
      const before = (await api(`/groups/${groupId}`, leader.token)).group
        .currentPlanId;
      const result = await api(
        `/groups/${groupId}/demo/rain`,
        leader.token,
        "POST",
        {},
      );
      assert.ok(result.alert);
      assert.ok(result.proposal);
      assert.equal(result.weather.demo, true);
      assert.equal(result.proposal.kind, "RAIN_CHANGE");
      assert.equal(result.proposal.status, "VOTING");
      assert.equal(
        (await api(`/groups/${groupId}`, leader.token)).group.currentPlanId,
        before,
      );
      assert.ok(result.weather.slots.some((slot) => slot.rainVotes >= 2));
    },
  );
  await check(
    "Thống kê không tạo độ chính xác giả khi chưa có thực tế",
    async () => {
      const stats = await api(`/groups/${groupId}/verification`, leader.token);
      assert.equal(stats.accuracyPct, null);
      assert.equal(stats.verified, 0);
    },
  );
  await check("Tạo nhóm, mã mời và chống thêm trùng địa điểm", async () => {
    const group = await api("/groups", leader.token, "POST", {
      name: "Kiểm thử nhóm mới",
      cityId: "dalat",
      tripDate: "2026-10-18",
      startHour: 8,
      endHour: 18,
      budgetPerPersonVnd: 500000,
      mode: "DEMO",
    });
    const joined = await api("/groups/join", outsider.token, "POST", {
      code: group.inviteCode,
    });
    assert.equal(joined.id, group.id);
    const places = await api("/places?cityId=dalat", leader.token);
    await api(`/groups/${group.id}/wishlist`, outsider.token, "POST", {
      placeId: places[0].id,
    });
    const again = await api(
      `/groups/${group.id}/wishlist`,
      outsider.token,
      "POST",
      { placeId: places[0].id },
    );
    assert.equal(again.filter((p) => p.id === places[0].id).length, 1);
  });
  const parallelGroup = await api("/groups", leader.token, "POST", {
    name: "Nhóm kiểm thử đồng thời",
    cityId: "dalat",
    tripDate: "2026-10-18",
    startHour: 8,
    endHour: 18,
    budgetPerPersonVnd: 600000,
    mode: "DEMO",
  });
  await api("/groups/join", outsider.token, "POST", {
    code: parallelGroup.inviteCode,
  });
  const parallelPlaces = await api("/places?cityId=dalat", leader.token);
  for (const place of parallelPlaces.slice(0, 4))
    await api(`/groups/${parallelGroup.id}/wishlist`, leader.token, "POST", {
      placeId: place.id,
    });
  const candidateA = await api(
    `/groups/${parallelGroup.id}/plans/generate`,
    leader.token,
    "POST",
    { mode: "demo" },
  );
  const candidateB = await api(
    `/groups/${parallelGroup.id}/plans/generate`,
    leader.token,
    "POST",
    { mode: "demo" },
  );
  await check(
    "Cử tri được chốt; người vào nhóm sau không được thêm phiếu",
    async () => {
      await api("/groups/join", member.token, "POST", {
        code: parallelGroup.inviteCode,
      });
      await api(
        `/plans/${candidateA.id}/votes`,
        member.token,
        "POST",
        { choice: "YES" },
        [403],
      );
      assert.equal(
        (await api(`/plans/${candidateA.id}`, leader.token)).eligibleCount,
        2,
      );
    },
  );
  await check(
    "Hai phiếu đồng thời áp dụng đúng một lần; đề xuất cạnh tranh thành STALE",
    async () => {
      await Promise.all([
        api(`/plans/${candidateA.id}/votes`, leader.token, "POST", {
          choice: "YES",
        }),
        api(`/plans/${candidateA.id}/votes`, outsider.token, "POST", {
          choice: "YES",
        }),
      ]);
      const state = await api(`/groups/${parallelGroup.id}`, leader.token);
      assert.equal(state.group.currentPlanId, candidateA.id);
      assert.equal(state.group.revision, 2);
      assert.equal(
        (await api(`/plans/${candidateB.id}`, leader.token)).status,
        "STALE",
      );
      await api(
        `/plans/${candidateB.id}/votes`,
        outsider.token,
        "POST",
        { choice: "YES" },
        [409],
      );
    },
  );
  await check(
    "Sở thích chỉ sửa cho bản thân và chỉ nhận danh mục hợp lệ",
    async () => {
      const categories = [parallelPlaces[0].category];
      assert.deepEqual(
        (
          await api(
            `/groups/${parallelGroup.id}/preferences`,
            outsider.token,
            "PATCH",
            { categories },
          )
        ).categories,
        categories,
      );
      assert.deepEqual(
        (await api(`/groups/${parallelGroup.id}/preferences`, leader.token))
          .categories,
        [],
      );
      await api(
        `/groups/${parallelGroup.id}/preferences`,
        outsider.token,
        "PATCH",
        { categories: ["danh-muc-khong-ton-tai"] },
        [400],
      );
    },
  );
  await check(
    "Báo mưa cần vị trí đạt điều kiện hoặc hai người khác nhau",
    async () => {
      const report = {
        latitude: 0,
        longitude: 0,
        accuracyM: 50,
        condition: "RAIN",
      };
      assert.equal(
        (
          await api(
            `/groups/${parallelGroup.id}/rain-reports`,
            leader.token,
            "POST",
            report,
          )
        ).verified,
        false,
      );
      assert.equal(
        (
          await api(
            `/groups/${parallelGroup.id}/rain-reports`,
            leader.token,
            "POST",
            report,
          )
        ).verified,
        false,
      );
      assert.equal(
        (
          await api(
            `/groups/${parallelGroup.id}/rain-reports`,
            outsider.token,
            "POST",
            report,
          )
        ).verified,
        true,
      );
      await api(
        `/groups/${parallelGroup.id}/rain-reports`,
        leader.token,
        "POST",
        {
          ...report,
          observedAt: new Date(Date.now() + 10 * 60000).toISOString(),
        },
        [400],
      );
    },
  );
  await check(
    "Chặn địa điểm sai thành phố; chỉnh sửa đến sau có nhật ký ghi đè",
    async () => {
      const otherCityPlaces = await api("/places?cityId=vungtau", leader.token);
      await api(
        `/groups/${parallelGroup.id}/wishlist`,
        outsider.token,
        "POST",
        { placeId: otherCityPlaces[0].id },
        [400],
      );
      await api(`/groups/${parallelGroup.id}`, leader.token, "PATCH", {
        name: "Tên mới nhất",
        expectedRevision: 1,
      });
      const logs = await api(
        `/groups/${parallelGroup.id}/activity`,
        leader.token,
      );
      assert.ok(logs.some((log) => log.message.includes("ghi đè")));
    },
  );
  await check(
    "Đổi ngân sách vô hiệu hóa phương án dùng ràng buộc cũ",
    async () => {
      const old = await api(
        `/groups/${parallelGroup.id}/plans/generate`,
        leader.token,
        "POST",
        { mode: "demo" },
      );
      await api(`/groups/${parallelGroup.id}`, leader.token, "PATCH", {
        budgetPerPersonVnd: 0,
      });
      await api(
        `/plans/${old.id}/votes`,
        leader.token,
        "POST",
        { choice: "YES" },
        [409],
      );
      assert.equal(
        (await api(`/plans/${old.id}`, leader.token)).status,
        "STALE",
      );
      assert.equal(
        (await api(`/groups/${parallelGroup.id}`, leader.token)).group
          .currentPlanId,
        candidateA.id,
      );
    },
  );
  console.log(`${results.length} integration checks passed.`);
} catch (error) {
  failure = error;
  console.error(error);
  console.error(logs.slice(-12000));
} finally {
  for (const socket of sockets) socket.disconnect();
  child.kill();
  await writeFile(
    path.join(artifactDir, "smoke-results.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        failure: failure?.message ?? null,
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(artifactDir, "smoke-server.log"), logs);
}
if (failure) process.exitCode = 1;
