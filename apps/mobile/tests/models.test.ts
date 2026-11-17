import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPlaces, clusterPlaces, mappable, suitability, validRadar, weatherForTrip } from '../src/map/model';
import { itineraryGeometry } from '../src/ai/itineraryModel';
import { cities, createFixtures, places, weatherFixture } from '../src/api/mocks/fixtures';
import { resolveRoute } from '../src/navigation/routeModel';
import type { RouteName } from '../src/types';
import { validTripDate } from '../src/utils/validation';
const now = Date.parse('2026-11-11T08:00:00Z');
test('date fields reject nonexistent calendar days before generation', () => {
  assert.equal(validTripDate('2026-02-29'), false); assert.equal(validTripDate('2028-02-29'), true);
  assert.equal(validTripDate('2026-04-31'), false); assert.equal(validTripDate('2026-11-11'), true); assert.equal(validTripDate('11/11/2026'), false);
});
test('map search is accent insensitive; all category and wishlist filters keep original coordinates', () => {
  const found = filterPlaces(places, 'ho xuan huong', 'all', cities[0], new Set()); assert.equal(found[0].name, 'Hồ Xuân Hương');
  assert.ok(filterPlaces(places, '', 'indoor', cities[0], new Set()).every(p => p.environment === 'INDOOR'));
  assert.deepEqual(filterPlaces(places, '', 'wishlist', cities[0], new Set([places[0].id])), [places[0]]);
  const clusters = clusterPlaces(places, 10); assert.equal(clusters.reduce((n, c) => n + c.places.length, 0), 80); assert.ok(clusters.length < 80);
});
test('selected and itinerary numbered markers remain separate from clusters', () => {
  const clusters = clusterPlaces(places, 9, places[0].id, new Set([places[1].id]));
  for (const id of [places[0].id, places[1].id]) assert.equal(clusters.find(c => c.places.some(p => p.id === id))?.places.length, 1);
  assert.equal(mappable({ ...places[0], geographyVerified: false }), false);
});
test('route geometry preserves itinerary order and breaks at unknown coordinates', () => {
  const plan = createFixtures(new Date(now)).groups[0].currentPlan!;
  const geometry = itineraryGeometry(plan, 'dalat'); assert.deepEqual(geometry.places.map(p => p.id), plan.items.map(i => i.placeId)); assert.equal(geometry.labels[plan.items[2].placeId], 3); assert.equal(geometry.segments.length, 1);
  const invalid = { ...plan, items: plan.items.map((i, n) => n === 1 ? { ...i, place: { ...i.place, geographyVerified: false } } : i) };
  const broken = itineraryGeometry(invalid, 'dalat'); assert.equal(broken.unmappedCount, 1); assert.equal(broken.segments.length, 1); assert.equal(broken.segments[0].length, 2);
});
test('weather UI model never treats missing or stale weather as suitable', () => {
  const outdoor = places.find(p => p.environment === 'OUTDOOR')!;
  assert.equal(suitability(outdoor, null, now).status, 'unknown');
  assert.equal(suitability(outdoor, weatherFixture('2026-11-11', new Date(now).toISOString(), true), now).status, 'unknown');
  assert.equal(suitability(outdoor, weatherFixture('2026-11-11', '2026-11-10T00:00:00Z'), now).status, 'unknown');
  assert.equal(suitability(outdoor, weatherFixture('2026-11-11', new Date(now).toISOString(), false, true), now).status, 'risk');
  const scoped = weatherForTrip(weatherFixture('2026-11-11', new Date(now).toISOString()), { tripDate: '2026-11-12', startHour: 8, endHour: 18 }); assert.equal(scoped?.slots.length, 0);
});
test('radar rejects invalid origins and malformed tile paths', () => {
  const radar = { host: 'https://tilecache.rainviewer.com', frames: [{ time: 1, path: '/v2/radar/1' }], maxZoom: 7, attribution: '', coverageUrl: '' };
  assert.equal(validRadar(radar), true); assert.equal(validRadar({ ...radar, host: 'https://rainviewer.com.attacker.test' }), false); assert.equal(validRadar({ ...radar, frames: [] }), false);
});
test('navigation protects account routes and safely decodes destination and planner IDs', () => {
  const allowed: RouteName[] = ['home', 'login', 'register', 'forgotPassword', 'map', 'aiSetup'];
  assert.deepEqual(resolveRoute('#/map/city%3Adalat', true, allowed), { name: 'map', id: 'city:dalat' });
  assert.deepEqual(resolveRoute('#/map/city:dalat', false, allowed), { name: 'login' });
  assert.deepEqual(resolveRoute('#/forgotPassword', false, allowed), { name: 'forgotPassword' });
  assert.deepEqual(resolveRoute('#/register', true, allowed), { name: 'home' });
  assert.deepEqual(resolveRoute('#/map/%E0%A4%A', true, allowed), { name: 'home' });
  assert.deepEqual(resolveRoute('#/unknown', true, allowed), { name: 'home' });
});
