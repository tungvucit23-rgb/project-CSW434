import test from 'node:test';
import assert from 'node:assert/strict';
import { dalatCatalog } from '../src/dalat-catalog.js';
import { readFileSync } from 'node:fs';
import { categoryIcon, clusterPlaces, filterPlaces, mappable, suitability, validRadar, weatherForTrip } from '../../mobile/src/map/model.js';
import type { Place, WeatherSummary } from '../../mobile/src/types.js';
process.env.PGLITE_DATA_DIR = ':memory:';
process.env.ALLOW_DEMO = 'true';
process.env.SEED_DEMO = 'true';
const { placeView } = await import('../src/store.js');
const { db } = await import('../src/db.js');
test.after(() => db.close());
const places: Place[] = dalatCatalog.map(p => ({ ...p, geographyVerified: true, priceVnd: 0, durationMin: 60, openHour: 8, closeHour: 20, imageUrl: '' }));
const now = Date.parse('2026-11-10T03:00:00Z');
const weather = (changes = {}): WeatherSummary => ({ demo: false, fetchedAt: new Date(now).toISOString(), providers: [], slots: [{ time: new Date(now).toISOString(), rainMmH: 0, probabilityPct: 10, level: 'NONE', rainVotes: 0, validSources: 2, providers: [] }], rainWindows: [], confidenceText: 'test', ...changes });
test('catalogue contains 80 unique attributed destinations, no generated grid coordinates', () => {
  const source = JSON.parse(readFileSync(new URL('../data/dalat-osm-sources.json', import.meta.url), 'utf8'));
  const sourceById = new Map(source.elements.map((e: any) => [`${e.type}/${e.id}`, e]));
  assert.equal(places.length, 80);
  assert.equal(new Set(places.map(p => p.id)).size, 80);
  assert.equal(new Set(places.map(p => p.sourceUrl)).size, 80);
  assert.equal(new Set(places.map(p => p.name.toLowerCase())).size, 80);
  assert.equal(new Set(places.map(p => `${p.latitude},${p.longitude}`)).size, 80);
  for (const p of places) {
    const e: any = sourceById.get(p.sourceUrl!.replace('https://www.openstreetmap.org/', ''));
    assert.ok(e);
    assert.equal(p.latitude, (e.center || e).lat);
    assert.equal(p.longitude, (e.center || e).lon);
    assert.ok(p.latitude > 11.8 && p.latitude < 12.1 && p.longitude > 108.3 && p.longitude < 108.6);
    assert.equal(p.cityId, 'dalat'); assert.ok(mappable(p));
    assert.match(p.sourceUrl!, /^https:\/\/www.openstreetmap.org\/(node|way|relation)\/\d+$/);
    assert.equal(p.visitorInfo?.entranceFeeVnd, null);
    assert.equal(p.visitorInfo?.visitDurationMin, null);
  }
});
test('verified flag requires stored coordinates to match the source and city', () => {
  const p = places[0];
  const row = { id: p.id, city_id: 'dalat', latitude: p.latitude, longitude: p.longitude };
  assert.equal(placeView(row).geographyVerified, true);
  assert.equal(placeView({ ...row, latitude: 0 }).geographyVerified, false);
  assert.equal(placeView({ ...row, city_id: 'vungtau' }).geographyVerified, false);
  assert.equal(mappable({ ...p, geographyVerified: false }), false);
});
test('clustering preserves all places, selected marker remains individual, zoom reveals each point', () => {
  const clusters = clusterPlaces(places, 10, places[0].id);
  assert.ok(clusters.length < 80);
  assert.equal(clusters.flatMap(c => c.places).length, 80);
  assert.equal(clusters.find(c => c.places.some(p => p.id === places[0].id))?.places.length, 1);
  assert.equal(clusterPlaces(places, 17).length, 80);
});
test('map search is accent insensitive and covers category, city, wishlist and environment', () => {
  const city = { id: 'dalat', name: 'Đà Lạt', latitude: 11.94, longitude: 108.44, imageUrl: '' };
  const wishlist = new Set([places[0].id]);
  assert.equal(filterPlaces(places, 'xuan huong', 'all', city, wishlist)[0]?.id, 'dalat-01');
  assert.equal(filterPlaces(places, 'da lat', 'all', city, wishlist).length, 80);
  assert.equal(filterPlaces(places, '', 'wishlist', city, wishlist).length, 1);
  assert.ok(filterPlaces(places, 'cafe', 'all', city, wishlist).length > 0);
  assert.ok(filterPlaces(places, '', 'indoor', city, wishlist).every(p => p.environment === 'INDOOR'));
  assert.equal(filterPlaces(places, 'no such destination', 'all', city, wishlist).length, 0);
  assert.equal(filterPlaces(places, '', 'weather', city, wishlist, null).length, 0);
  assert.equal(categoryIcon({ name: 'Thác Datanla', category: 'Thiên nhiên' }), 'water-outline');
});
test('weather never interprets missing, stale, past or partial forecast as suitable', () => {
  const p = places.find(p => p.environment === 'OUTDOOR')!;
  assert.equal(suitability(p, null, now).status, 'unknown');
  assert.equal(suitability(p, weather({ fetchedAt: 'invalid' }), now).status, 'unknown');
  assert.equal(suitability(p, weather({ fetchedAt: new Date(now - 7200000).toISOString() }), now).status, 'unknown');
  assert.equal(suitability(p, weather({ slots: [] }), now).status, 'unknown');
  assert.equal(suitability(p, weather({ slots: [{ ...weather().slots[0], validSources: 0 }] }), now).status, 'unknown');
  assert.equal(suitability(p, weather(), now).status, 'suitable');
  assert.equal(suitability(p, weather({ slots: [{ ...weather().slots[0], rainVotes: 1 }] }), now).status, 'risk');
});
test('radar accepts only attributed RainViewer host and radar paths', () => {
  const radar = { host: 'https://tilecache.rainviewer.com', frames: [{ time: 123, path: '/v2/radar/123' }], maxZoom: 7, attribution: 'RainViewer', coverageUrl: '' };
  assert.equal(validRadar(radar), true);
  assert.equal(validRadar({ ...radar, host: 'https://rainviewer.com.evil.test' }), false);
  assert.equal(validRadar(radar, 2), false);
});
test('trip weather excludes forecast hours outside the group travel window', () => {
  const summary = weather({ slots: [1, 3, 10, 15].map(h => ({ ...weather().slots[0], time: `2026-11-10T${String(h).padStart(2, '0')}:00:00Z` })) });
  const scoped = weatherForTrip(summary, { tripDate: '2026-11-10', startHour: 9, endHour: 18 });
  assert.deepEqual(scoped?.slots.map(s => s.time), ['2026-11-10T03:00:00Z', '2026-11-10T10:00:00Z']);
  assert.equal(weatherForTrip(summary, null), null);
});
test('seed upgrades are idempotent, preserve references and never overwrite operator records', async () => {
  const { seed } = await import('../src/seed.js');
  await db.migrate(); await seed();
  assert.equal((await db.query("SELECT id FROM places WHERE city_id='dalat'")).rows.length, 95);
  assert.equal((await db.query("SELECT id FROM places WHERE city_id='vungtau'")).rows.length, 40);
  await db.query("INSERT INTO wishlist_items(id,group_id,place_id,added_by) VALUES('legacy-preserve','demo-group','dalat-17','demo-leader')");
  await db.query("UPDATE places SET name='Operator catalogue',data_quality='OPERATOR: maintained',latitude=12.0 WHERE id='dalat-03'");
  await seed();
  assert.equal((await db.query("SELECT id FROM places WHERE city_id='dalat'")).rows.length, 95);
  assert.equal((await db.query("SELECT * FROM places WHERE id='dalat-03'")).rows[0].name, 'Operator catalogue');
  assert.equal((await db.query("SELECT * FROM wishlist_items WHERE id='legacy-preserve'")).rows[0].place_id, 'dalat-17');
  assert.equal((await db.query("SELECT * FROM groups WHERE id='demo-group'")).rows.length, 1);
});
