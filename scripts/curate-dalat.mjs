// Reproducible, reviewed selection. Never pad the catalogue with generated coordinates.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const sourcePath = 'apps/server/data/dalat-osm-sources.json';
const saved = existsSync(sourcePath) ? JSON.parse(readFileSync(sourcePath, 'utf8')) : null;
const snapshots = ['raw', 'extra', 'natural'].map((s, i) => existsSync(`artifacts/dalat-osm-${s}.json`)
  ? JSON.parse(readFileSync(`artifacts/dalat-osm-${s}.json`, 'utf8'))
  : { query: saved.queries[i], osm3s: saved.snapshots[i], elements: saved.elements });
const all = new Map(snapshots.flatMap(s => s.elements).map(e => [`${e.type}/${e.id}`, e]));
// Reuse original IDs only when the OSM object represents the same destination.
const retained = {
  'dalat-01': 'relation/2390139', 'dalat-03': 'node/1152350875', 'dalat-04': 'way/452519411',
  'dalat-06': 'node/5274759821', 'dalat-07': 'node/4368051989', 'dalat-08': 'relation/17877171',
  'dalat-09': 'node/1160978742', 'dalat-10': 'node/6546337786', 'dalat-11': 'way/125165263',
  'dalat-13': 'node/1164597191', 'dalat-14': 'node/4096525696', 'dalat-15': 'node/2688028631',
  'dalat-18': 'way/361851927', 'dalat-19': 'way/361692265', 'dalat-20': 'relation/20657435',
  'dalat-23': 'node/6548795185', 'dalat-24': 'way/1509937793', 'dalat-25': 'node/4330922989',
  'dalat-26': 'way/473771570', 'dalat-27': 'node/11810221807', 'dalat-29': 'relation/4119185',
  'dalat-30': 'node/4135863789', 'dalat-32': 'relation/7758125', 'dalat-35': 'way/141724809',
  'dalat-40': 'way/1303678469',
};
const additions = [
  'node/357447237', 'node/4293297115', 'node/4299365893', 'node/4589456390',
  'node/4956621222', 'node/5188469121', 'node/5666385423', 'node/5811546454',
  'node/6165224585', 'node/6322222686', 'node/6341135085', 'node/9633116697',
  'node/9644488565', 'node/13059586149', 'node/13072770501', 'node/13118850665',
  'node/13953793101', 'way/361692317', 'way/473088090', 'way/521598336',
  'way/1486332120', 'way/1486336890', 'way/1515399859',
  'node/2090212777', 'node/7202547685', 'node/11048391402', 'way/64737684',
  'node/3864396278', 'way/164038760',
  'way/232458166', 'way/473547277', 'way/515288602', 'relation/18645373',
  'node/4070796725', 'node/4206500720', 'node/4281674493', 'node/4426130491',
  'node/4601279191', 'node/4798005122', 'node/5334556721', 'node/5955859585',
  'node/5980607285', 'node/6152524285', 'node/6282366185', 'node/6312483785',
  'node/6418806785', 'node/7140136187', 'node/7236155987', 'node/8310652209',
  'node/10252337809', 'node/10846172405', 'node/11836926101', 'node/11840626298',
  'node/13895630601', 'way/1308586853',
];
const original = readFileSync('apps/server/src/seed.ts', 'utf8');
const originalNames = [...original.split('dalat: [')[1].split('vungtau: [')[0].matchAll(/\["([^"]+)",/g)].map(m => m[1]);
const selected = [...Object.entries(retained), ...additions.map(key => [`dalat-osm-${key.replace('/', '-')}`, key])];
if (selected.length !== 80 || new Set(selected.map(([,key]) => key)).size !== 80) throw Error(`Expected 80 distinct source objects, got ${selected.length}`);
const records = selected.map(([id, key]) => {
  const e = all.get(key); if (!e) throw Error(`Missing ${key}`);
  const t = e.tags; const point = e.center || e;
  const legacyIndex = /^dalat-\d+$/.test(id) ? Number(id.slice(6)) - 1 : -1;
  const name = legacyIndex >= 0 ? originalNames[legacyIndex] : (t['name:vi'] || t.name);
  const nature = !!t.natural || ['viewpoint', 'picnic_site'].includes(t.tourism) || /Thác|Thung Lũng|vườn hoa|Vườn Hoa|đồi chè|làng hoa/i.test(name);
  const culture = t.tourism === 'museum' || t.tourism === 'gallery' || t.amenity === 'place_of_worship' || /Dinh|Ga Đà Lạt|XQ|nhà lao/i.test(name);
  const cafe = t.amenity === 'cafe' || /Coffee|cafe|Maze Bar/i.test(name);
  const category = culture ? 'Văn hóa' : cafe ? 'Cafe & thư giãn' : nature ? 'Thiên nhiên' : 'Tham quan';
  const environment = culture || cafe || t.amenity === 'marketplace' ? 'INDOOR' : 'OUTDOOR';
  const kind = t.railway === 'station' ? 'Nhà ga đường sắt với kiến trúc thuộc địa Pháp theo phân loại OSM' : t.natural === 'water' ? 'Không gian mặt hồ và cảnh quan' : t.natural === 'peak' ? 'Đỉnh đồi hoặc núi, phù hợp để tìm hiểu cảnh quan cao nguyên' : t.tourism === 'museum' ? 'Không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương' : t.tourism === 'gallery' ? 'Không gian trưng bày nghệ thuật' : t.tourism === 'theme_park' ? 'Khu vui chơi và tham quan' : t.amenity === 'place_of_worship' ? 'Công trình tôn giáo; cần tôn trọng quy định của cơ sở khi ghé thăm' : cafe ? 'Điểm cà phê và nghỉ chân để kết hợp giữa các điểm tham quan' : nature ? 'Điểm khám phá cảnh quan ngoài trời' : 'Điểm tham quan trong danh mục cộng đồng';
  return { id, cityId: 'dalat', name, category, environment, latitude: point.lat, longitude: point.lon,
    sourceUrl: `https://www.openstreetmap.org/${key}`, sourceId: key,
    coordinateKind: e.center ? 'OSM_BOUNDING_BOX_CENTER' : 'OSM_NODE',
    sourceTimestamp: snapshots[0].osm3s.timestamp_osm_base,
    description: `${name} — ${kind.toLowerCase()}. ${t['addr:street'] ? `Đường ${t['addr:street']} theo địa chỉ OSM. ` : ''}${e.center ? 'Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào.' : 'Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận.'} Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.`,
    visitorInfo: { entranceFeeVnd: null, openingHours: t.opening_hours || null, visitDurationMin: null, environmentEstimated: true, verifiedAt: null },
  };
});
mkdirSync('apps/server/data', {recursive:true});
writeFileSync('apps/server/src/dalat-catalog.ts', `// Generated by scripts/curate-dalat.mjs from attributed OSM snapshots. See docs/TRAVEL-MAP.md.\nexport const dalatCatalog = ${JSON.stringify(records, null, 2)} as const;\n`);
writeFileSync('apps/server/data/dalat-osm-sources.json', JSON.stringify({ license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', queries: snapshots.map(s => s.query), snapshots: snapshots.map(s => s.osm3s), elements: selected.map(([,key]) => all.get(key)) }, null, 2));
console.log(`${records.length} mapped destinations; ${Object.keys(retained).length} original IDs retained; ${40 - Object.keys(retained).length} unresolved legacy records preserved but retired from discovery.`);
