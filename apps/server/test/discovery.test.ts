import test from 'node:test';
import assert from 'node:assert/strict';
process.env.PGLITE_DATA_DIR = ':memory:';
const { dalatCatalog } = await import('../src/dalat-catalog.js');
const { placeView } = await import('../src/places.js');
const { buildCandidates, recommendationRequest, ruleRecommendations, validateRecommendations } = await import('../src/recommendations.js');
const { openingWindows, planningPlace, weatherFacts } = await import('../src/travel-facts.js');
const { buildInput, validateOutput } = await import('../src/planner.js');
const { aggregateWeather, normalizeOpenMeteo, normalizeTomorrow, normalizeWeatherApi, PROVIDERS } = await import('../src/weather.js');
const { atHour } = await import('../src/utils.js');
const { itineraryGeometry } = await import('../../mobile/src/ai/itineraryModel.js');
const { clusterPlaces } = await import('../../mobile/src/map/model.js');
const { db } = await import('../src/db.js');
test.after(() => db.close());
const date = '2026-11-10', now = Date.parse(atHour(date, 7));
const city = { latitude: 11.9404, longitude: 108.4583 };
const rows = dalatCatalog.map(p => ({ id: p.id, city_id: p.cityId, name: p.name, category: p.category, environment: p.environment, latitude: p.latitude, longitude: p.longitude, price_vnd: 60000, duration_min: 60, open_hour: 8, close_hour: 20, image_url: '', description: p.description, data_quality: 'OSM: fixture' }));
const input = (changes: Record<string, unknown> = {}) => recommendationRequest.parse({ cityId: 'dalat', tripDate: date, budgetPerPersonVnd: 500000, durationHours: 8, mode: 'demo', ...changes });
const forecast = (rain = false, missing = false) => {
  const sources = PROVIDERS.map(provider => ({ provider, status: missing ? 'MISSING' as const : 'OK' as const, fetchedAt: new Date(now).toISOString(), message: 'fixture', snapshotId: null,
    hours: missing ? [] : Array.from({ length: 24 }, (_, hour) => ({ time: atHour(date, hour), rainMmH: rain ? 4 : 0, probabilityPct: rain ? 85 : 10, temperatureC: 20, windKmh: 8 })) }));
  return { ...aggregateWeather(date, sources, true), fetchedAt: new Date(now).toISOString() };
};
const candidates = (changes = {}, weather = forecast()) => buildCandidates(rows, input(changes), weather, city, [], now);

test('discovery validates calendar dates, window, budget and bounded preferences', () => {
  assert.throws(() => input({ tripDate: '2026-02-30' }));
  assert.throws(() => input({ startHour: 23, durationHours: 8 }));
  assert.throws(() => input({ budgetPerPersonVnd: -1 }));
  assert.throws(() => input({ categories: ['INVENTED'] }));
  assert.throws(() => input({ preferredPlaceIds: Array(21).fill('dalat-01') }));
});
test('LIVE discovery and planning use remaining time instead of proposing elapsed visits', () => {
  const later = Date.parse(atHour(date, 12));
  const remaining = buildCandidates(rows, input({ mode: 'live' }), { ...forecast(), demo: false, fetchedAt: new Date(later).toISOString() }, city, [], later);
  assert.ok(remaining.length > 0 && remaining.every(c => c.visit.startMinute > 720));
  assert.equal(buildCandidates(rows, input({ mode: 'live' }), { ...forecast(), demo: false }, city, [], later + 86400000).length, 0);
  const parsed = buildInput({ group: { trip_date: date, start_hour: 8, end_hour: 18, budget_per_person_vnd: 200000 }, places: [planningPlace(rows[1], date)], weather: forecast(), task: 'INITIAL', currentItems: [], planningNow: new Date(later), demo: false });
  assert.ok(parsed.planningStartMinute > 720);
});
test('deterministic filtering keeps source-backed city/category/environment places only', () => {
  const result = candidates({ categories: ['CULTURE'], environmentPreference: 'INDOOR' });
  assert.ok(result.length > 0);
  assert.ok(result.every(c => c.place.geographyVerified && c.place.cityId === 'dalat' && c.place.category === 'Văn hóa' && c.place.environment === 'INDOOR'));
  assert.equal(buildCandidates([{ ...rows[0], latitude: 0 }, { ...rows[1], city_id: 'vungtau' }], input(), forecast(), city, [], now).length, 0);
});
test('unknown costs are not presented as free or confirmed within budget', () => {
  const result = candidates({ budgetPerPersonVnd: 0 });
  assert.ok(result.length > 0);
  assert.ok(result.every(c => c.budgetStatus === 'UNKNOWN' && c.codes.includes('BUDGET_UNKNOWN') && !c.codes.includes('BUDGET_KNOWN')));
});
test('source-recorded entrance fee enforces a real budget ceiling', () => {
  const metadata: any = dalatCatalog[0].visitorInfo;
  const previous = metadata.entranceFeeVnd;
  try {
    metadata.entranceFeeVnd = 80000;
    assert.equal(buildCandidates([rows[0]], input({ budgetPerPersonVnd: 50000 }), forecast(), city, [], now).length, 0);
    const accepted = buildCandidates([rows[0]], input({ budgetPerPersonVnd: 80000 }), forecast(), city, [], now);
    assert.equal(accepted[0].budgetStatus, 'SOURCE_RECORDED');
  } finally { metadata.entranceFeeVnd = previous; }
});
test('credible rain materially excludes outdoor candidates and explains indoor alternatives', () => {
  assert.equal(candidates({ environmentPreference: 'OUTDOOR' }, forecast(true)).length, 0);
  const indoors = candidates({ environmentPreference: 'INDOOR' }, forecast(true));
  assert.ok(indoors.length > 0);
  assert.ok(indoors.every(c => c.codes.includes('WEATHER_INDOOR') && c.weather.rainConsensus));
});
test('missing, stale, incomplete or past live weather never becomes favorable', () => {
  const missing = candidates({}, forecast(false, true));
  assert.ok(missing.length > 0 && missing.every(c => c.weather.status === 'UNKNOWN' && c.codes.includes('WEATHER_UNKNOWN')));
  const old = { ...forecast(), fetchedAt: new Date(now - 7200000).toISOString() };
  assert.equal(weatherFacts(old, date, 480, 540, 'OUTDOOR', now).status, 'UNKNOWN');
  assert.equal(weatherFacts({ ...forecast(), slots: [] }, date, 480, 540, 'OUTDOOR', now).status, 'UNKNOWN');
  assert.equal(weatherFacts({ ...forecast(), demo: false }, date, 480, 540, 'OUTDOOR', now + 86400000).status, 'UNKNOWN');
});
test('wind and temperature use structured values with documented conservative thresholds', () => {
  const windy = forecast(); windy.slots.forEach(s => { s.windKmh = 45; });
  assert.equal(candidates({ environmentPreference: 'OUTDOOR' }, windy).length, 0);
  const cold = forecast(); cold.slots.forEach(s => { s.temperatureC = 3; });
  assert.equal(candidates({ environmentPreference: 'OUTDOOR' }, cold).length, 0);
  const norm = normalizeOpenMeteo({ hourly: { time: [Date.parse(atHour(date, 8)) / 1000, Date.parse(atHour(date, 9)) / 1000], precipitation: [0, 0], precipitation_probability: [5, 5], temperature_2m: [-3, 4], wind_speed_10m: [20, 30] } });
  assert.equal(norm[1].temperatureC, -3); assert.equal(norm[1].windKmh, 20);
  assert.equal(normalizeTomorrow({ timelines: { hourly: [{ time: atHour(date, 8), values: { temperature: 25, windSpeed: 10 } }] } })[0].windKmh, 36);
  assert.equal(normalizeWeatherApi({ forecast: { forecastday: [{ hour: [{ time_epoch: now / 1000, temp_c: 22, wind_kph: 15 }] }] } })[0].temperatureC, 22);
});
test('recommendation output rejects unknown IDs, wrong rank, unrelated facts and invented prose', () => {
  const allowed = candidates(); const good = ruleRecommendations(allowed, 6);
  assert.equal(validateRecommendations(good, allowed, 6).length, 6);
  for (const mutate of [
    (o: any) => { o.recommendations[0].placeId = 'invented-destination'; },
    (o: any) => { o.recommendations[0].rank = 99; },
    (o: any) => { o.recommendations[1].placeId = o.recommendations[0].placeId; },
    (o: any) => { o.recommendations[0].reason = 'Chắc chắn không mưa và miễn phí'; },
    (o: any) => { o.recommendations[0].reasonCodes.push('BUDGET_KNOWN'); },
    (o: any) => { o.recommendations[0].factIds[0] = `place:${allowed[1].place.id}`; },
  ]) { const bad = structuredClone(good); mutate(bad); assert.throws(() => validateRecommendations(bad, allowed, 6)); }
});
test('weather claims and group preference claims require the corresponding facts and matching state', () => {
  const allowed = candidates({}, forecast(false, true));
  const bad = ruleRecommendations(allowed, 3); bad.recommendations[0].reasonCodes = ['TIME_WINDOW', 'WEATHER_AVAILABLE'];
  assert.throws(() => validateRecommendations(bad, allowed, 3));
  const withGroup = buildCandidates(rows, input(), forecast(), city, [{ categories: ['Văn hóa'], travelStyles: ['CULTURE'] }], now);
  assert.ok(withGroup.some(c => c.groupMatches > 0));
  const match = withGroup.find(c => c.codes.includes('GROUP_MATCH'))!;
  const output = ruleRecommendations([match], 1); output.recommendations[0].factIds = output.recommendations[0].factIds.filter(f => !f.startsWith('preference:'));
  assert.throws(() => validateRecommendations(output, [match], 1));
});
test('source hours enforce lunch closures and unsupported expressions remain unknown', () => {
  assert.deepEqual(openingWindows('Mo-Su 07:15-11:30, 13:30-17:00', date), [{ start: 435, end: 690 }, { start: 810, end: 1020 }]);
  assert.deepEqual(openingWindows('Mo off', '2026-11-09'), []);
  assert.deepEqual(openingWindows('Mo-Su 08:00-20:00; Tu off', date), []);
  assert.equal(openingWindows('PH off; sunrise-sunset', date), null);
  const museum = rows.find(p => p.id === 'dalat-03')!;
  const visit = buildCandidates([museum], input({ startHour: 11.5, durationHours: 3 }), forecast(), city, [], now)[0];
  assert.equal(visit.visit.startMinute, 810);
});
test('planner rejects time-window, source-hours, budget and duplicate-stop violations', () => {
  const row = planningPlace(rows.find(p => p.id === 'dalat-03')!, date);
  const ctx = { group: { trip_date: date, start_hour: 8, end_hour: 18, budget_per_person_vnd: 200000 }, places: [row], weather: forecast(), task: 'INITIAL' as const, currentItems: [], planningNow: new Date(now), demo: true };
  const parsed = buildInput(ctx);
  const item = { placeId: row.id, startMinute: 810, endMinute: 870, reason: 'Phù hợp khung giờ và loại địa điểm.', factIds: [`place:${row.id}`] };
  const good = { summary: 'Phương án phù hợp ràng buộc.', items: [item] };
  assert.equal(validateOutput(good, parsed).items.length, 1);
  assert.throws(() => validateOutput({ ...good, items: [{ ...item, startMinute: 660, endMinute: 720 }] }, parsed), /TIME_CONSTRAINT/);
  assert.throws(() => validateOutput({ ...good, items: [{ ...item, startMinute: 1080, endMinute: 1140 }] }, parsed), /TIME_CONSTRAINT/);
  assert.throws(() => validateOutput(good, buildInput({ ...ctx, group: { ...ctx.group, budget_per_person_vnd: 1 } })), /BUDGET_CONSTRAINT/);
  assert.throws(() => validateOutput({ ...good, items: [item, item] }, parsed), /DUPLICATE/);
});
test('itinerary geometry keeps stop numbers and never bridges unknown or wrong-city coordinates', () => {
  const places = rows.slice(0, 4).map(placeView);
  const items = places.map((place, i) => ({ id: String(i), placeId: place.id, place, position: i, startTime: atHour(date, 8 + i), endTime: atHour(date, 9 + i), travelMin: 0, costVnd: 0, reason: '', factIds: [] }));
  items[1].place = { ...items[1].place, cityId: 'vungtau' };
  const geometry = itineraryGeometry({ items }, 'dalat');
  assert.equal(geometry.unmappedCount, 1); assert.equal(geometry.labels[items[2].placeId], 3);
  assert.equal(geometry.segments.length, 1); assert.equal(geometry.segments[0].length, 2);
  const clustered = clusterPlaces(places, 8, undefined, new Set([places[0].id, places[2].id]));
  assert.equal(clustered.find(c => c.places.some(p => p.id === places[2].id))?.places.length, 1);
});
