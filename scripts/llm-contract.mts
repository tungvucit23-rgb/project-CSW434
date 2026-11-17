/** Local HTTP contract test. The HTTP model is a test double, never presented as a real LLM. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";

let scenario = "retry-place";
let calls = 0;
const payloads: any[] = [];
const mock = createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = JSON.parse(text);
  payloads.push(body);
  calls++;
  assert.equal(req.url, "/v1/responses");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.ok(body.instructions.includes("KHÔNG dự báo thời tiết"));
  const input = JSON.parse(body.input[0].content).context;
  const place = input.allowedPlaces.find(
    (p: any) =>
      p.environment === "INDOOR" &&
      p.priceVnd <= input.groupConstraints.remainingBudgetVnd &&
      Math.max(input.planningStartMinute, p.openMinute) + p.durationMin <=
        Math.min(p.closeMinute, input.groupConstraints.endMinute),
  );
  assert.ok(place, "Test fixture needs a feasible indoor place");
  const start = Math.max(input.planningStartMinute, place.openMinute);
  let output = {
    summary: "Phương án phù hợp ràng buộc của nhóm.",
    items: [
      {
        placeId: place.id,
        startMinute: start,
        endMinute: start + place.durationMin,
        reason: "Phù hợp giờ mở cửa và không gian trong nhà.",
        factIds: [place.factId],
      },
    ],
  };
  if (scenario === "retry-place" && calls === 1)
    output.items[0].placeId = "hallucinated-place";
  if (scenario === "number")
    output.items[0].reason = "Giá chỉ 9999 đồng và chắc chắn không mưa.";
  if (scenario === "number-words")
    output.items[0].reason = "Giá chỉ năm trăm nghìn đồng.";
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      id: "mock-response",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(output) }],
        },
      ],
    }),
  );
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const address = mock.address();
assert.ok(address && typeof address !== "string");
process.env.OPENAI_API_KEY = "mock-local-contract-test-only";
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
process.env.PGLITE_DATA_DIR = ":memory:";
process.env.DATABASE_URL = "";
process.env.ALLOW_DEMO = "true";
process.env.SEED_DEMO = "true";
process.env.ENABLE_WORKER = "false";
const { db, one } = await import("../apps/server/src/db.ts");
const { seed } = await import("../apps/server/src/seed.ts");
const { makeProposal } = await import("../apps/server/src/planner.ts");
const { getWeather } = await import("../apps/server/src/weather.ts");
const checks: string[] = [];
try {
  await db.migrate();
  await seed();
  const group = await one<any>("SELECT * FROM groups WHERE id='demo-group'");
  const places = (
    await db.query<any>(
      "SELECT p.* FROM places p JOIN wishlist_items w ON w.place_id=p.id WHERE w.group_id='demo-group'",
    )
  ).rows;
  const weather = (await getWeather(group, "demo")).summary;
  const ctx = {
    group,
    places,
    weather,
    task: "INITIAL" as const,
    currentItems: [],
    planningNow: new Date(),
    demo: true,
  };
  const result = await makeProposal(ctx);
  assert.equal(calls, 2);
  assert.equal(result.engine, "LLM");
  assert.ok(result.items.every((i) => places.some((p) => p.id === i.placeId)));
  checks.push(
    "Responses strict schema, actual backend HTTP call, invalid place rejected, bounded retry succeeds",
  );
  scenario = "number";
  calls = 0;
  assert.equal((await makeProposal(ctx)).engine, "RULE_BASED");
  assert.equal(calls, 2);
  checks.push(
    "Unsupported numeric claim rejected twice then explicitly labelled rule fallback",
  );
  scenario = "number-words";
  calls = 0;
  assert.equal((await makeProposal(ctx)).engine, "RULE_BASED");
  assert.equal(calls, 2);
  checks.push("Vietnamese written numeric claim rejected");
  const rows = (
    await db.query<any>(
      "SELECT status,validation_errors FROM llm_runs ORDER BY created_at",
    )
  ).rows;
  assert.equal(rows.length, 6);
  assert.equal(rows.filter((row) => row.status === "VALID").length, 1);
  checks.push("All six attempts persisted with validation provenance");
  console.log(
    `${checks.length} LLM contract checks passed (local HTTP mock; not a live paid model call).`,
  );
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/llm-contract-results.json",
    JSON.stringify(
      { at: new Date().toISOString(), liveModel: false, checks },
      null,
      2,
    ),
  );
} finally {
  await db.close();
  mock.close();
}
