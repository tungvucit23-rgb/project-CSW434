/** Provider HTTP contract test: all responses below are deliberate test doubles. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
let scenario = 'retry', calls = 0;
const mock = createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const body = JSON.parse(text); calls++;
  assert.equal(req.url, '/v1/responses'); assert.equal(body.text.format.name, 'destination_recommendations');
  assert.equal(body.text.format.strict, true); assert.equal(body.store, false);
  const input = JSON.parse(body.input[0].content).context;
  assert.ok(input.candidates.length <= 18);
  assert.ok(!JSON.stringify(input).includes('imageUrl'));
  const candidate = input.candidates[0];
  const output = { recommendations: [{ placeId: candidate.placeId, rank: 1, reasonCodes: candidate.allowedReasonCodes, factIds: Object.keys(candidate.facts) }] };
  if (scenario === 'retry' && calls === 1) output.recommendations[0].placeId = 'hallucinated-place';
  if (scenario === 'reason') output.recommendations[0].reasonCodes = ['TIME_WINDOW', 'WEATHER_AVAILABLE', 'BUDGET_KNOWN'];
  if (scenario === 'fact') output.recommendations[0].factIds[0] = 'place:another-city';
  if (scenario === 'disconnect') { req.socket.destroy(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(scenario === 'refusal'
    ? { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'test refusal' }] }] }
    : { status: scenario === 'incomplete' ? 'incomplete' : 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }));
});
mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
const address = mock.address(); assert.ok(address && typeof address !== 'string');
process.env.OPENAI_API_KEY = 'mock-only-no-real-key'; process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
process.env.PGLITE_DATA_DIR = ':memory:'; process.env.DATABASE_URL = ''; process.env.ALLOW_DEMO = 'true'; process.env.SEED_DEMO = 'true';
const { db } = await import('../apps/server/src/db.js');
const { seed } = await import('../apps/server/src/seed.js');
const { recommend } = await import('../apps/server/src/recommendations.js');
const { todayVN } = await import('../apps/server/src/utils.js');
const checks: string[] = [];
try {
  await db.migrate(); await seed();
  const input = { cityId: 'dalat', tripDate: todayVN(), budgetPerPersonVnd: 500000, durationHours: 8, startHour: 8, groupId: null, mode: 'demo' };
  const valid = await recommend('demo-leader', { ...input, limit: 6 });
  assert.equal(calls, 2); assert.equal(valid.engine, 'LLM'); assert.equal(valid.recommendations.length, 1);
  assert.equal(valid.fallbackReason, null);
  checks.push('Real HTTP call to local provider double, strict schema, unknown place rejected then bounded retry succeeds');
  const cached = await recommend('demo-leader', { ...input, limit: 6 });
  assert.equal(cached.cached, true); assert.equal(calls, 2);
  checks.push('Identical authenticated request is cached without another model call');
  for (const [index, next] of ['reason', 'fact', 'refusal', 'incomplete', 'disconnect'].entries()) {
    scenario = next; calls = 0;
    const result = await recommend('demo-leader', { ...input, limit: 5 - index });
    assert.equal(calls, 2); assert.equal(result.engine, 'RULE_BASED');
    assert.equal(result.model, null); assert.equal(result.fallbackReason, 'LLM_UNAVAILABLE_OR_INVALID');
    assert.ok(result.recommendations.every((r: any) => r.place.geographyVerified));
    checks.push(`${next}: invalid/unavailable AI is never reported as successful LLM output`);
  }
  calls = 0;
  const empty = await recommend('demo-leader', { ...input, cityId: 'vungtau' });
  assert.equal(empty.recommendations.length, 0); assert.equal(empty.engine, 'RULE_BASED'); assert.equal(calls, 0);
  checks.push('No source-backed candidates produces an honest empty result, with no model call');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/recommendation-contract-results.json', JSON.stringify({ checks, provider: 'LOCAL_HTTP_TEST_DOUBLE', realOpenAIVerified: false }, null, 2));
  console.log(`${checks.length} recommendation HTTP contract checks passed (local mock, not real OpenAI).`);
} finally { mock.closeAllConnections(); await new Promise<void>(r => mock.close(() => r())); await db.close(); }
