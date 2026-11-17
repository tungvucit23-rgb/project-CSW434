import type { City, Place, WeatherSummary } from '../types';

export type MapFilter = 'all' | 'nature' | 'culture' | 'entertainment' | 'indoor' | 'outdoor' | 'weather' | 'wishlist';
export const mapFilters: [MapFilter, string][] = [['all', 'Tất cả'], ['nature', 'Thiên nhiên'], ['culture', 'Văn hóa'], ['entertainment', 'Giải trí'], ['indoor', 'Trong nhà'], ['outdoor', 'Ngoài trời'], ['weather', 'Hợp thời tiết'], ['wishlist', 'Muốn đi']];
export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export function categoryIcon(place: Pick<Place, 'category' | 'name'>): string {
  const s = normalize(`${place.category} ${place.name}`);
  if (/bao tang|museum/.test(s)) return 'library-outline';
  if (/ho |thac|lake|waterfall|bien/.test(s)) return 'water-outline';
  if (/dinh |di tich|lich su|historic/.test(s)) return 'time-outline';
  if (/nui|doi |viewpoint|peak/.test(s)) return 'trail-sign-outline';
  if (/van hoa|chua|nha tho|culture/.test(s)) return 'business-outline';
  if (/cafe|ca phe|am thuc/.test(s)) return 'cafe-outline';
  if (/giai tri|tham quan|theme/.test(s)) return 'ticket-outline';
  return 'leaf-outline';
}
export function mappable(p: Place) {
  return p.geographyVerified === true && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}
export function weatherForTrip(weather: WeatherSummary | null, group?: Pick<import('../types').Group, 'tripDate' | 'startHour' | 'endHour'> | null): WeatherSummary | null {
  if (!weather || !group) return null;
  const midnight = Date.parse(`${group.tripDate}T00:00:00+07:00`);
  const start = midnight + group.startHour * 3600000, end = midnight + group.endHour * 3600000;
  return { ...weather, slots: weather.slots.filter(s => Date.parse(s.time) < end && Date.parse(s.time) + 3600000 > start) };
}
export type Suitability = { status: 'suitable' | 'risk' | 'unknown'; label: string; explanation: string };
// This is a city-level rain assessment for the trip window, never a local safety forecast.
export function suitability(p: Place, weather?: WeatherSummary | null, now = Date.now()): Suitability {
  const unknown = (explanation: string): Suitability => ({ status: 'unknown', label: 'Chưa có đánh giá thời tiết', explanation });
  if (!weather) return unknown('Chọn nhóm cùng thành phố để xem dự báo theo ngày và giờ chuyến đi.');
  if (!Number.isFinite(Date.parse(weather.fetchedAt)) || now - Date.parse(weather.fetchedAt) > 60 * 60 * 1000) return unknown('Dự báo đã cũ hoặc thiếu thời điểm cập nhật. Hãy tải lại.');
  const slots = weather.slots.filter(s => weather.demo || Date.parse(s.time) + 3600000 > now);
  if (p.environment === 'OUTDOOR' && slots.some(s => (s.windKmh != null && s.windKmh >= 40) || (s.temperatureC != null && (s.temperatureC >= 35 || s.temperatureC <= 5)))) return { status: 'risk', label: 'Gió hoặc nhiệt độ bất lợi · cân nhắc trong nhà', explanation: 'Có dữ kiện đạt ngưỡng thận trọng của ứng dụng: gió từ 40 km/h hoặc nhiệt độ từ 35°C/trở xuống 5°C. Đây không phải thang cảnh báo khí tượng chính thức.' };
  if (!slots.length || slots.some(s => s.validSources < 2 || s.level === 'UNKNOWN')) return unknown('Thiếu dự báo hoặc chưa có đủ hai nguồn trong một phần thời gian chuyến đi; chưa đủ dữ liệu để đánh giá.');
  if (p.environment === 'INDOOR') return { status: 'suitable', label: 'Có thể cân nhắc hoạt động trong nhà', explanation: 'Phân loại trong nhà là gợi ý. Đường di chuyển và một phần khuôn viên vẫn có thể chịu ảnh hưởng thời tiết.' };
  if (slots.some(s => s.rainVotes > 0 || s.level === 'MODERATE' || s.level === 'HEAVY')) return { status: 'risk', label: 'Có nguy cơ mưa · cân nhắc điểm trong nhà', explanation: 'Ít nhất một nguồn dự báo có rủi ro mưa hoặc lượng mưa từ mức vừa trong khung giờ chuyến đi.' };
  return { status: 'suitable', label: 'Phù hợp để cân nhắc hoạt động ngoài trời', explanation: 'Các giờ có dữ liệu chưa ghi nhận ngưỡng rủi ro mưa của hệ thống. Dự báo tại tâm thành phố, không bảo đảm thời tiết từng điểm.' };
}
export function filterPlaces(places: Place[], query: string, filter: MapFilter, city: City | undefined, wishlist: Set<string>, weather?: WeatherSummary | null) {
  const q = normalize(query.trim());
  return places.filter(p => {
    if (q && !normalize(`${p.name} ${p.category} ${city?.name || ''}`).includes(q)) return false;
    if (filter === 'indoor' || filter === 'outdoor') return p.environment === filter.toUpperCase();
    if (filter === 'wishlist') return wishlist.has(p.id);
    if (filter === 'weather') return suitability(p, weather).status === 'suitable';
    if (filter === 'nature') return /thien nhien|bien/.test(normalize(p.category));
    if (filter === 'culture') return /van hoa|lich su|bao tang/.test(normalize(p.category));
    if (filter === 'entertainment') return /giai tri|tham quan|cafe|am thuc|mua sam/.test(normalize(p.category));
    return true;
  });
}
export type Cluster = { id: string; latitude: number; longitude: number; places: Place[] };
export function clusterPlaces(places: Place[], zoom: number, selectedId?: string, emphasized = new Set<string>()): Cluster[] {
  const cells = new Map<string, Cluster>();
  const scale = 256 * 2 ** zoom;
  for (const p of places.filter(mappable)) {
    const sin = Math.sin(p.latitude * Math.PI / 180);
    const x = (p.longitude + 180) / 360 * scale;
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    const key = p.id === selectedId || emphasized.has(p.id) || zoom >= 17 ? p.id : `${Math.floor(x / 54)}:${Math.floor(y / 54)}`;
    const cell = cells.get(key);
    if (cell) { cell.places.push(p); cell.latitude += p.latitude; cell.longitude += p.longitude; }
    else cells.set(key, { id: key, latitude: p.latitude, longitude: p.longitude, places: [p] });
  }
  return Array.from(cells.values(), c => ({ ...c, latitude: c.latitude / c.places.length, longitude: c.longitude / c.places.length }));
}
export function validRadar(radar?: import('../types').RadarData | null, index = 0) {
  return !!radar?.frames[index] && /^https:\/\/([a-z0-9-]+\.)*rainviewer\.com$/i.test(radar.host) && /^\/v2\/radar\/[a-z0-9/_-]+$/i.test(radar.frames[index].path);
}
export type TravelMapProps = {
  city: City; places: Place[]; selectedId?: string; onSelect: (id: string) => void;
  fitKey?: number; focusKey?: number; radar?: import('../types').RadarData | null; frameIndex?: number;
  markerLabels?: Record<string, number>;
  routeSegments?: { latitude: number; longitude: number }[][];
};
