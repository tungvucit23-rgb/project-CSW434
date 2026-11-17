import { placeView } from './places.js';
import { atHour } from './utils.js';
import { hasConsensus, type WeatherSummary } from './weather.js';

export const CATEGORY_CODES = ['NATURE', 'CULTURE', 'ENTERTAINMENT', 'FOOD_CAFES'] as const;
export const TRAVEL_STYLES = ['ADVENTURE', 'RELAXATION', 'NATURE', 'PHOTOGRAPHY', 'CULTURE', 'FOOD_CAFES', 'FAMILY'] as const;
export const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
export function categoryCode(category: string) {
  const s = normalized(category);
  return /thien nhien|bien/.test(s) ? 'NATURE' : /van hoa|bao tang|lich su/.test(s) ? 'CULTURE' : /cafe|am thuc/.test(s) ? 'FOOD_CAFES' : 'ENTERTAINMENT';
}
export const styleMatches = (style: string, category: string, environment: string) =>
  style === category || (['ADVENTURE', 'PHOTOGRAPHY'].includes(style) && category === 'NATURE') ||
  (style === 'RELAXATION' && ['NATURE', 'FOOD_CAFES'].includes(category)) ||
  (style === 'FAMILY' && (category === 'ENTERTAINMENT' || environment === 'INDOOR'));
export type OpeningWindow = { start: number; end: number };
const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
// Deliberately small OSM subset: unsupported holiday/conditional expressions remain unknown.
export function openingWindows(hours: string | null | undefined, date: string): OpeningWindow[] | null {
  if (!hours) return null;
  if (hours === '24/7') return [{ start: 0, end: 1440 }];
  const day = new Date(`${date}T12:00:00+07:00`).getUTCDay();
  if (!Number.isFinite(day)) return null;
  const windows: OpeningWindow[] = [];
  for (const rule of hours.split(';')) {
    const match = rule.trim().match(/^(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+)?(off|closed|\d\d:\d\d-\d\d:\d\d(?:\s*,\s*\d\d:\d\d-\d\d:\d\d)*)$/);
    if (!match) return null;
    let applies = true;
    if (match[1]) {
      const first = days.indexOf(match[1]), last = days.indexOf(match[2] || match[1]);
      applies = first <= last ? day >= first && day <= last : day >= first || day <= last;
    }
    if (!applies) continue;
    if (/^(off|closed)$/.test(match[3])) return [];
    for (const segment of match[3].split(',')) {
      const [from, to] = segment.trim().split('-').map(v => v.split(':').map(Number));
      const start = from[0] * 60 + from[1], end = to[0] * 60 + to[1];
      if (from[0] > 23 || from[1] > 59 || to[0] > 24 || to[1] > 59 || (to[0] === 24 && to[1] !== 0) || end <= start) return null;
      windows.push({ start, end });
    }
  }
  return windows.sort((a, b) => a.start - b.start);
}
export function planningPlace(row: any, date: string, view = placeView(row)) {
  const known = view.visitorInfo;
  const windows = openingWindows(known.openingHours, date);
  return { ...row,
    open_hour: windows?.length ? windows[0].start / 60 : row.open_hour,
    close_hour: windows?.length ? windows[windows.length - 1].end / 60 : row.close_hour,
    price_vnd: known.entranceFeeVnd ?? row.price_vnd,
    duration_min: known.visitDurationMin ?? row.duration_min,
    planning_windows: windows ?? [{ start: row.open_hour * 60, end: row.close_hour * 60 }],
    information_status: { cost: known.entranceFeeVnd == null ? 'ASSUMED' : 'SOURCE_RECORDED', duration: known.visitDurationMin == null ? 'ASSUMED' : 'SOURCE_RECORDED', hours: windows === null ? 'ASSUMED' : 'SOURCE_RECORDED', geography: view.geographyVerified ? 'OSM_MATCHED' : 'UNVERIFIED' },
  };
}
export function weatherFacts(summary: WeatherSummary, date: string, start: number, end: number, environment: string, now = Date.now()) {
  const from = Date.parse(atHour(date, start / 60)), to = Date.parse(atHour(date, end / 60));
  const slots = summary.slots.filter(s => Date.parse(s.time) < to && Date.parse(s.time) + 3600000 > from);
  const fresh = Number.isFinite(Date.parse(summary.fetchedAt)) && now - Date.parse(summary.fetchedAt) <= 3600000;
  const coverage = slots.reduce((sum, s) => sum + Math.max(0, Math.min(to, Date.parse(s.time) + 3600000) - Math.max(from, Date.parse(s.time))), 0);
  const expired = !summary.demo && to <= now;
  const missing = !fresh || expired || coverage < to - from || slots.some(s => s.validSources < 2);
  const rain = fresh && !expired && slots.some(hasConsensus);
  const severeWind = fresh && !expired && slots.some(s => s.windKmh != null && s.windKmh >= 40);
  const extremeTemperature = fresh && !expired && slots.some(s => s.temperatureC != null && (s.temperatureC >= 35 || s.temperatureC <= 5));
  const adverse = rain || severeWind || extremeTemperature;
  const status = environment === 'OUTDOOR' && adverse ? 'RISK' : missing ? 'UNKNOWN' : 'SUITABLE';
  const explanation = status === 'RISK' ? 'Có dữ kiện mưa đồng thuận, gió mạnh hoặc nhiệt độ bất lợi trong khoảng tham quan; cân nhắc điểm trong nhà.' : status === 'UNKNOWN' ? 'Thiếu nguồn, khoảng dự báo hoặc dữ liệu đã cũ; chưa thể xác nhận điều kiện thuận lợi.' : environment === 'INDOOR' && adverse ? 'Có thể cân nhắc không gian trong nhà khi có dữ kiện thời tiết bất lợi; đường đi vẫn cần kiểm tra.' : 'Chưa ghi nhận ngưỡng rủi ro đã cấu hình trong các giờ có đủ dữ liệu; không bảo đảm thời tiết từng điểm.';
  return { status, explanation, rainConsensus: rain, severeWind, extremeTemperature, adverse, missing, cityLevel: true,
    temperatureAvailable: slots.some(s => s.temperatureC != null), windAvailable: slots.some(s => s.windKmh != null),
    slots: slots.map(s => ({ time: s.time, rainMmH: s.rainMmH, probabilityPct: s.probabilityPct, validSources: s.validSources, rainVotes: s.rainVotes, temperatureC: s.temperatureC ?? null, windKmh: s.windKmh ?? null })),
    fetchedAt: summary.fetchedAt, demo: summary.demo };
}
