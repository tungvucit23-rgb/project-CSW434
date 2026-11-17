import type { Activity, Alert, City, Comment, GroupDetail, Notification, Place, Plan, User, WeatherSummary } from '../../types';
import { dalatCatalog } from './dalat-catalog';
import type { Preferences } from '../contracts/adapter';

// Local copy of the supplied OSM catalogue. Coordinates and provenance are unchanged.
// These are source-backed points, not verified visitor entrances. All prices remain unknown.
export const places: Place[] = dalatCatalog.map(p => ({ ...p, geographyVerified: true, dataQuality: 'OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO',
  priceVnd: 0, durationMin: 60, openHour: 8, closeHour: 20,
  imageUrl: p.environment === 'INDOOR'
    ? 'https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75'
    : 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75',
}));
export const cities: City[] = [
  { id: 'dalat', name: 'Đà Lạt', latitude: 11.9404, longitude: 108.4583, imageUrl: 'https://images.unsplash.com/photo-1570366583862-f91883984fde?auto=format&fit=crop&w=960&q=80' },
  { id: 'vungtau', name: 'Vũng Tàu', latitude: 10.346, longitude: 107.0843, imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=960&q=80' },
];
export const demoUsers: User[] = [
  { id: 'mock-leader', name: 'Minh Anh', email: 'leader@dichung.demo', avatarColor: '#18735C' },
  { id: 'mock-member', name: 'Hoàng Nam', email: 'member@dichung.demo', avatarColor: '#597BA1' },
  { id: 'mock-third', name: 'Thu Hà', email: 'third@dichung.demo', avatarColor: '#9A6893' },
];
export const DEMO_PASSWORD = 'Demo1234!';
export const defaultPreferences: Preferences = { categories: ['Thiên nhiên', 'Văn hóa'], environmentPreference: 'ANY', travelStyles: ['RELAXATION'] };
export const scenarioOptions = [
  ['normal', 'Đầy đủ dữ liệu'], ['empty', 'Danh sách trống'], ['offline', 'Mất mạng'], ['expired', 'Phiên hết hạn'],
  ['missing-weather', 'Thiếu thời tiết'], ['rain-change', 'Thay đổi do mưa'], ['slow', 'Tải chậm (1,2 giây)'],
] as const;
export function vnDate(now: Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function atMinute(day: string, minute: number) { return new Date(Date.parse(`${day}T00:00:00+07:00`) + minute * 60000).toISOString(); }
export function weatherFixture(day: string, fetchedAt: string, missing = false, rain = false): WeatherSummary {
  const providers = ['Open-Meteo', 'WeatherAPI', 'Tomorrow.io'];
  return {
    demo: true, fetchedAt,
    confidenceText: missing ? 'DEMO · Chưa có dự báo. Thiếu dữ liệu không có nghĩa trời khô.' : 'DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.',
    providers: providers.map(provider => ({ provider, status: missing ? 'MISSING' : 'OK', fetchedAt: missing ? null : fetchedAt, message: missing ? 'DEMO · Mẫu thiếu nguồn.' : 'DEMO · Nguồn mô phỏng, không gọi nhà cung cấp.' })),
    slots: Array.from({ length: 16 }, (_, i) => {
      const wet = rain && i >= 5 && i <= 9;
      return { time: atMinute(day, (6 + i) * 60), rainMmH: missing ? null : wet ? 4 : 0, probabilityPct: missing ? null : wet ? 80 : 15,
        temperatureC: missing ? null : [18, 19, 20, 22, 23, 24, 23, 22][i % 8], windKmh: missing ? null : 9 + i % 4,
        level: missing ? 'UNKNOWN' : wet ? 'MODERATE' : 'NONE', rainVotes: missing ? 0 : wet ? 3 : 0, validSources: missing ? 0 : 3,
        providers: providers.map(provider => ({ provider, rainMmH: missing ? null : wet ? 4 : 0, probabilityPct: missing ? null : wet ? 80 : 15, risk: wet && !missing, usable: !missing })),
      };
    }), rainWindows: rain && !missing ? [{ start: atMinute(day, 11 * 60), end: atMinute(day, 16 * 60), rainVotes: 3 }] : [],
  };
}
export function planFixture(group: GroupDetail['group'], selected: Place[], now: string, id: string, version: number, kind: Plan['kind'] = 'INITIAL'): Plan {
  const max = Math.max(0, Math.floor(((group.endHour - group.startHour) * 60 + 15) / 75));
  const items = selected.slice(0, max).map((place, i) => ({ id: `${id}-stop-${i + 1}`, placeId: place.id, place, position: i + 1,
    startTime: atMinute(group.tripDate, group.startHour * 60 + i * 75), endTime: atMinute(group.tripDate, group.startHour * 60 + i * 75 + 60),
    travelMin: i ? 15 : 0, costVnd: 0, reason: 'DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.', factIds: [place.sourceUrl || place.id],
  }));
  return { id, groupId: group.id, tripContext: { cityId: group.cityId, tripDate: group.tripDate, startHour: group.startHour, endHour: group.endHour, budgetPerPersonVnd: group.budgetPerPersonVnd },
    version, basePlanId: group.currentPlanId, kind, status: 'VOTING', engine: 'RULE_BASED', demo: true,
    summary: 'DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.', items, totalCostVnd: 0,
    totalDurationMin: items.length ? items.length * 75 - 15 : 0, totalTravelMin: Math.max(0, items.length - 1) * 15, unknownCostCount: items.length,
    yesVotes: 0, noVotes: 0, eligibleCount: group.memberCount, requiredYesVotes: Math.floor(group.memberCount / 2) + 1, myVote: null,
    deadline: new Date(Date.parse(now) + 86400000).toISOString(), createdAt: now,
  };
}
export type MockState = {
  users: User[]; passwords: Record<string, string>; groups: GroupDetail[]; preferences: Record<string, Preferences>;
  comments: Comment[]; notifications: (Notification & { userId: string })[]; activity: Record<string, Activity[]>; alerts: Alert[];
  votes: Record<string, Record<string, 'YES' | 'NO'>>; electorates: Record<string, string[]>; sequence: number;
};
export function createFixtures(now: Date): MockState {
  const stamp = now.toISOString(), day = vnDate(now);
  const group: GroupDetail['group'] = { id: 'mock-dalat', name: 'Đà Lạt cùng những người bạn', cityId: 'dalat', cityName: 'Đà Lạt', tripDate: day, startHour: 8, endHour: 20,
    budgetPerPersonVnd: 500000, inviteCode: 'DICHUNG', currentPlanId: null, memberCount: 3, role: 'LEADER', mode: 'DEMO', revision: 1 };
  const approved = planFixture(group, places.slice(0, 4), stamp, 'mock-approved', 1);
  approved.status = 'APPROVED'; approved.yesVotes = 2;
  group.currentPlanId = approved.id;
  const rejected = planFixture(group, places.slice(4, 7), stamp, 'mock-rejected', 2); rejected.status = 'REJECTED'; rejected.noVotes = 2;
  const pending = planFixture(group, places.slice(1, 5), stamp, 'mock-pending', 3); pending.yesVotes = 1;
  return {
    users: demoUsers.map(u => ({ ...u })), passwords: Object.fromEntries(demoUsers.map(u => [u.id, DEMO_PASSWORD])),
    groups: [{ group, members: demoUsers.map((u, i) => ({ ...u, role: i ? 'MEMBER' : 'LEADER' })), wishlist: places.slice(0, 8), currentPlan: approved, plans: [pending, rejected, approved] }],
    preferences: Object.fromEntries(demoUsers.map(u => [`${group.id}:${u.id}`, { ...defaultPreferences }])),
    comments: [{ id: 'mock-comment', groupId: group.id, userId: demoUsers[1].id, userName: demoUsers[1].name, avatarColor: demoUsers[1].avatarColor, placeId: places[0].id, planId: null, content: 'DEMO · Mình muốn ghé hồ vào buổi sáng!', createdAt: stamp, editedAt: null }],
    notifications: demoUsers.flatMap(u => [
      { id: `mock-notice-${u.id}`, userId: u.id, groupId: group.id, title: 'Nhóm đang chờ ý kiến của bạn', message: 'DEMO · Một phương án đang chờ biểu quyết.', type: 'PLAN', readAt: null, createdAt: stamp, planId: pending.id },
      { id: `mock-welcome-${u.id}`, userId: u.id, groupId: null, title: 'Chào mừng đến Đi Chung', message: 'DEMO · Dữ liệu mẫu chỉ đồng bộ trong phiên ứng dụng này.', type: 'WELCOME', readAt: null, createdAt: stamp, planId: null },
    ]),
    activity: { [group.id]: [{ id: 'mock-activity', action: 'GROUP_CREATED', message: 'DEMO · Nhóm ba thành viên và các phương án mẫu đã sẵn sàng.', createdAt: stamp }] }, alerts: [],
    votes: { [approved.id]: { 'mock-leader': 'YES', 'mock-member': 'YES' }, [rejected.id]: { 'mock-member': 'NO', 'mock-third': 'NO' }, [pending.id]: { 'mock-member': 'YES' } },
    electorates: Object.fromEntries([approved, rejected, pending].map(p => [p.id, demoUsers.map(u => u.id)])), sequence: 0,
  };
}
