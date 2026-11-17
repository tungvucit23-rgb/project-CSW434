import type { Group, GroupDetail, Place, Plan, Recommendation, RecommendationResult, User } from '../../types';
import { DataError, type DataAdapter, type DataSubscription, type MockScenario, type Preferences, type SubscriptionOptions } from '../contracts/adapter';
import { atMinute, cities, createFixtures, defaultPreferences, DEMO_PASSWORD, places, planFixture, weatherFixture, type MockState } from '../mocks/fixtures';
import { validTripDate } from '../../utils/validation';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const fail = (code: string, message: string, status = 400): never => { throw new DataError(code, message, status); };
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();

/** Local UI simulator. Never used as a fallback when the API fails. No multi-device sync. */
export class MockDataAdapter implements DataAdapter {
  readonly source = 'mock' as const;
  private state: MockState;
  private listeners = new Set<SubscriptionOptions>();
  private scenario: MockScenario = 'normal';
  private epoch = 0;
  constructor(private readonly clock: () => Date = () => new Date(), private readonly delayMs = 160) { this.state = createFixtures(clock()); }
  getScenario() { return this.scenario; }
  setScenario(scenario: MockScenario, reset = false) {
    this.scenario = scenario; this.epoch++;
    if (reset) this.state = createFixtures(this.clock());
    if (scenario === 'rain-change' && !this.state.alerts.length) this.rain(this.state.groups[0]);
    for (const listener of this.listeners) { listener.onStatus(scenario === 'offline' ? 'disconnected' : 'local'); listener.onEvent({ name: 'resync' }); }
  }
  subscribe(options: SubscriptionOptions): DataSubscription {
    this.listeners.add(options); options.onStatus(this.scenario === 'offline' ? 'disconnected' : 'local');
    return { close: () => { this.listeners.delete(options); }, typing: () => { /* No fictional remote users typing. */ } };
  }
  private event(name: string, groupId?: string, userId?: string) {
    for (const listener of this.listeners) {
      if (userId && listener.token !== `mock:${userId}`) continue;
      if (groupId && listener.groupId !== groupId) continue;
      listener.onEvent({ name, groupId });
    }
  }
  private id(prefix: string) { return `${prefix}-${++this.state.sequence}`; }
  private user(token: string | null): User {
    const user = this.state.users.find(u => token === `mock:${u.id}`);
    return user || fail('SESSION_EXPIRED', 'Phiên mẫu đã hết hạn. Đăng nhập lại để tiếp tục.', 401);
  }
  private group(id: string, userId: string): GroupDetail {
    const group = this.state.groups.find(g => g.group.id === id) || fail('NOT_FOUND', 'Không tìm thấy nhóm.', 404);
    if (!group.members.some(m => m.id === userId)) fail('FORBIDDEN', 'Bạn chưa tham gia nhóm này.', 403);
    return group;
  }
  private leader(group: GroupDetail, userId: string) {
    if (!group.members.some(m => m.id === userId && m.role === 'LEADER')) fail('FORBIDDEN', 'Chỉ trưởng nhóm thực hiện thao tác này.', 403);
  }
  private planView(plan: Plan, userId: string): Plan { return { ...plan, myVote: this.state.votes[plan.id]?.[userId] || null }; }
  private groupView(detail: GroupDetail, userId: string): GroupDetail {
    return { ...detail, group: { ...detail.group, role: detail.members.find(m => m.id === userId)!.role }, plans: detail.plans.map(p => this.planView(p, userId)), currentPlan: detail.currentPlan ? this.planView(detail.currentPlan, userId) : null };
  }
  private log(group: GroupDetail, action: string, message: string) {
    (this.state.activity[group.group.id] ||= []).unshift({ id: this.id('activity'), action, message: `DEMO · ${message}`, createdAt: this.clock().toISOString() });
    this.event('activity:created', group.group.id);
  }
  private notify(group: GroupDetail, title: string, message: string, planId: string | null = null) {
    for (const member of group.members) {
      this.state.notifications.unshift({ id: this.id('notification'), userId: member.id, groupId: group.group.id, title, message: `DEMO · ${message}`, type: 'PLAN', planId, readAt: null, createdAt: this.clock().toISOString() });
      this.event('notification:created', undefined, member.id);
    }
  }
  private addPlan(group: GroupDetail, selected: Place[], kind: Plan['kind'] = 'INITIAL') {
    if (!selected.length) fail('EMPTY_SELECTION', 'Thêm điểm đến cùng thành phố trước khi lập lịch.');
    const plan = planFixture(group.group, selected, this.clock().toISOString(), this.id('mock-plan'), Math.max(0, ...group.plans.map(p => p.version)) + 1, kind);
    if (!plan.items.length) fail('INVALID_WINDOW', 'Khung giờ quá ngắn cho điểm dừng mẫu (60 phút).');
    group.plans.unshift(plan); this.state.votes[plan.id] = {}; this.state.electorates[plan.id] = group.members.map(m => m.id);
    this.log(group, 'PLAN_CREATED', 'Tạo một phương án chờ biểu quyết.'); this.notify(group, 'Có phương án mới', plan.summary, plan.id);
    this.event('plan:created', group.group.id); return plan;
  }
  private rain(group: GroupDetail) {
    const proposal = this.addPlan(group, places.filter(p => p.cityId === group.group.cityId && p.environment === 'INDOOR').slice(0, 4), 'RAIN_CHANGE');
    const alert = { id: this.id('alert'), groupId: group.group.id, message: 'DEMO · Kịch bản mưa: cân nhắc phương án trong nhà. Lịch chính thức vẫn giữ nguyên đến khi đủ phiếu.', demo: true, planId: proposal.id, createdAt: this.clock().toISOString(), status: 'OPEN' };
    this.state.alerts.unshift(alert); this.event('alert:created', group.group.id); this.event('weather:updated', group.group.id);
    return { proposal, alert, weather: weatherFixture(group.group.tripDate, this.clock().toISOString(), false, true) };
  }
  async request<T>(path: string, token: string | null, method = 'GET', body?: unknown, timeoutMs = 45000, signal?: AbortSignal): Promise<T> {
    const epoch = this.epoch;
    const duration = this.scenario === 'slow' ? 1200 : this.delayMs;
    if (signal?.aborted) fail('CANCELLED', 'Yêu cầu đã hủy.', 499);
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DataError('CANCELLED', 'Yêu cầu đã hủy.', 499)); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); duration > timeoutMs ? reject(new DataError('TIMEOUT', 'Phản hồi mô phỏng quá lâu.', 408)) : resolve(); }, Math.min(duration, timeoutMs));
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (epoch !== this.epoch) fail('CANCELLED', 'Kịch bản đã thay đổi; tải lại dữ liệu.', 499);
    const url = new URL(path, 'https://mock.invalid');
    const p = url.pathname, q = url.searchParams;
    if (this.scenario === 'offline' && !p.startsWith('/auth/') && p !== '/health') fail('NETWORK', 'DEMO · Kịch bản mất mạng. Đổi về Đầy đủ dữ liệu trong Cài đặt.', 0);
    if (this.scenario === 'expired' && !p.startsWith('/auth/') && p !== '/health') fail('SESSION_EXPIRED', 'DEMO · Phiên hết hạn. Đổi kịch bản hoặc đăng nhập lại.', 401);
    return clone(this.dispatch(p, q, token, method, (body || {}) as Record<string, any>)) as T;
  }
  private dispatch(p: string, q: URLSearchParams, token: string | null, method: string, b: Record<string, any>): unknown {
    const now = this.clock().toISOString();
    if (p === '/health' && method === 'GET') return { status: 'LOCAL_MOCK', database: 'in-memory (no server)', llmConfigured: false, demoEnabled: true };
    if (p === '/auth/forgot-password' && method === 'POST') {
      if (!/^\S+@\S+\.\S+$/.test(b.email || '')) fail('VALIDATION', 'Nhập email hợp lệ.');
      return { ok: true, message: 'DEMO · Đã mô phỏng yêu cầu đặt lại mật khẩu. Không gửi email thật.' };
    }
    if (p === '/auth/demo' && method === 'POST') {
      const user = this.state.users.find(u => u.id === `mock-${b.persona || 'leader'}`) || fail('VALIDATION', 'Tài khoản mẫu không hợp lệ.');
      return { token: `mock:${user.id}`, user };
    }
    if (p === '/auth/register' && method === 'POST') {
      if (!/^\S+@\S+\.\S+$/.test(b.email || '') || typeof b.password !== 'string' || b.password.length < 8 || !b.name?.trim() || b.name.trim().length < 2) fail('VALIDATION', 'Kiểm tra tên, email và mật khẩu ít nhất 8 ký tự.');
      if (this.state.users.some(u => u.email.toLowerCase() === b.email.trim().toLowerCase())) fail('EMAIL_EXISTS', 'Email đã được sử dụng.', 409);
      const user = { id: this.id('mock-user'), name: b.name.trim(), email: b.email.trim().toLowerCase(), avatarColor: '#18735C' };
      this.state.users.push(user); this.state.passwords[user.id] = b.password;
      return { token: `mock:${user.id}`, user };
    }
    if (p === '/auth/login' && method === 'POST') {
      const user = this.state.users.find(u => u.email.toLowerCase() === b.email?.trim().toLowerCase());
      if (!user || this.state.passwords[user.id] !== b.password) fail('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.', 401);
      return { token: `mock:${user!.id}`, user };
    }
    const user = this.user(token);
    if (p === '/auth/me') {
      if (method === 'GET') return user;
      if (method === 'PATCH') {
        if (typeof b.name !== 'string' || b.name.trim().length < 2) fail('VALIDATION', 'Tên cần ít nhất 2 ký tự.');
        user.name = b.name.trim(); if (b.avatarColor) user.avatarColor = b.avatarColor;
        for (const group of this.state.groups) for (const member of group.members) if (member.id === user.id) Object.assign(member, user);
        return user;
      }
    }
    if (p === '/auth/change-password' && method === 'POST') {
      if (b.currentPassword !== this.state.passwords[user.id]) fail('INVALID_CREDENTIALS', 'Mật khẩu hiện tại chưa đúng.', 401);
      if (typeof b.newPassword !== 'string' || b.newPassword.length < 8 || b.newPassword === b.currentPassword) fail('VALIDATION', 'Mật khẩu mới cần khác mật khẩu cũ và có ít nhất 8 ký tự.');
      this.state.passwords[user.id] = b.newPassword;
      return { ok: true, message: 'DEMO · Đã đổi mật khẩu trong phiên này. Phiên sẽ được đăng xuất.' };
    }
    if (p === '/cities' && method === 'GET') return cities;
    if (p === '/places' && method === 'GET') return this.scenario === 'empty' ? [] : places.filter(place => (!q.get('cityId') || q.get('cityId') === place.cityId) && (!q.get('q') || normalized(`${place.name} ${place.category}`).includes(normalized(q.get('q')!))) && (!q.get('environment') || q.get('environment') === 'ANY' || q.get('environment') === place.environment) && (!q.get('category') || q.get('category') === place.category));
    if (/^\/places\/[^/]+$/.test(p) && method === 'GET') return places.find(place => place.id === decodeURIComponent(p.split('/')[2])) || fail('NOT_FOUND', 'Điểm đến không còn trong danh mục.', 404);
    if (p === '/radar' && method === 'GET') return { host: 'https://tilecache.rainviewer.com', frames: [], maxZoom: 7, attribution: 'DEMO · Không có ảnh radar quan sát trong mẫu offline. © RainViewer, © OpenStreetMap contributors.', coverageUrl: 'https://www.rainviewer.com/coverage.html' };
    if (p === '/notifications' && method === 'GET') return this.scenario === 'empty' ? [] : this.state.notifications.filter(n => n.userId === user.id).map(({ userId, ...n }) => n);
    if (/^\/notifications\/[^/]+\/read$/.test(p) && method === 'PATCH') {
      const n = this.state.notifications.find(n => n.id === p.split('/')[2] && n.userId === user.id) || fail('NOT_FOUND', 'Không tìm thấy thông báo.', 404);
      n.readAt ||= now; this.event('notification:created', undefined, user.id); const { userId, ...result } = n; return result;
    }
    if (p === '/groups') {
      if (method === 'GET') return this.scenario === 'empty' ? [] : this.state.groups.filter(g => g.members.some(m => m.id === user.id)).map(g => this.groupView(g, user.id).group);
      if (method === 'POST') {
        const city = cities.find(c => c.id === b.cityId) || fail('VALIDATION', 'Chọn thành phố hợp lệ.');
        if (!b.name?.trim() || !validTripDate(b.tripDate) || !(b.startHour >= 0 && b.endHour <= 24 && b.endHour > b.startHour) || !Number.isFinite(b.budgetPerPersonVnd) || b.budgetPerPersonVnd <= 0) fail('VALIDATION', 'Kiểm tra ngày, khung giờ và ngân sách.');
        const id = this.id('mock-group');
        const group: Group = { id, name: b.name.trim(), cityId: city.id, cityName: city.name, tripDate: b.tripDate, startHour: b.startHour, endHour: b.endHour, budgetPerPersonVnd: b.budgetPerPersonVnd, inviteCode: `DC${this.state.sequence.toString().padStart(4, '0')}`, currentPlanId: null, memberCount: 1, role: 'LEADER', mode: 'DEMO', revision: 1 };
        const detail: GroupDetail = { group, members: [{ ...user, role: 'LEADER' }], wishlist: [], plans: [], currentPlan: null };
        this.state.groups.push(detail); this.log(detail, 'GROUP_CREATED', 'Đã tạo chuyến đi mới.'); this.event('group:updated'); return group;
      }
    }
    if (p === '/groups/join' && method === 'POST') {
      const group = this.state.groups.find(g => g.group.inviteCode === b.code?.trim().toUpperCase()) || fail('INVALID_CODE', 'Mã mời không đúng.', 404);
      if (!group.members.some(m => m.id === user.id)) { group.members.push({ ...user, role: 'MEMBER' }); group.group.memberCount++; this.log(group, 'MEMBER_JOINED', `${user.name} đã tham gia nhóm.`); this.event('group:updated', group.group.id); }
      return this.groupView(group, user.id).group;
    }
    if (p === '/ai/recommendations' && method === 'POST') return this.recommend(b, user.id);
    if (/^\/plans\/[^/]+(?:\/votes)?$/.test(p)) {
      const id = p.split('/')[2];
      const group = this.state.groups.find(g => g.plans.some(plan => plan.id === id)) || fail('NOT_FOUND', 'Không tìm thấy phương án.', 404);
      this.group(group.group.id, user.id);
      const plan = group.plans.find(plan => plan.id === id)!;
      if (method === 'GET' && !p.endsWith('/votes')) return this.planView(plan, user.id);
      if (method === 'POST' && p.endsWith('/votes')) {
        if (!['YES', 'NO'].includes(b.choice)) fail('VALIDATION', 'Chọn YES hoặc NO.');
        if (plan.status !== 'VOTING' || plan.basePlanId !== group.group.currentPlanId) fail('PLAN_CLOSED', 'Phương án đã đóng hoặc lịch gốc đã thay đổi.', 409);
        if (Date.parse(plan.deadline) <= this.clock().getTime()) { plan.status = 'EXPIRED'; fail('PLAN_EXPIRED', 'Biểu quyết đã hết hạn.', 409); }
        if (!this.state.electorates[id]?.includes(user.id)) fail('NOT_ELIGIBLE', 'Bạn không thuộc danh sách cử tri khi mở phiếu.', 403);
        const votes = this.state.votes[id]; votes[user.id] = b.choice;
        plan.yesVotes = Object.values(votes).filter(v => v === 'YES').length; plan.noVotes = Object.values(votes).filter(v => v === 'NO').length;
        if (plan.yesVotes >= plan.requiredYesVotes) {
          plan.status = 'APPROVED'; group.group.currentPlanId = plan.id; group.currentPlan = plan;
          for (const other of group.plans) if (other.id !== plan.id && other.status === 'VOTING') other.status = 'STALE';
          this.event('plan:applied', group.group.id); this.notify(group, 'Nhóm đã thông qua lịch mới', 'Đã đủ đa số phiếu đồng ý.', plan.id);
        } else if (plan.noVotes > plan.eligibleCount - plan.requiredYesVotes) plan.status = 'REJECTED';
        this.log(group, 'VOTE_CAST', `${user.name} đã biểu quyết ${b.choice}.`); this.event('plan:updated', group.group.id);
        return this.planView(plan, user.id);
      }
    }
    if (/^\/comments\/[^/]+$/.test(p)) {
      const comment = this.state.comments.find(c => c.id === p.split('/')[2]) || fail('NOT_FOUND', 'Không tìm thấy bình luận.', 404);
      this.group(comment.groupId, user.id);
      if (comment.userId !== user.id) fail('FORBIDDEN', 'Chỉ tác giả sửa hoặc xóa bình luận.', 403);
      if (method === 'PATCH') { if (!b.content?.trim()) fail('VALIDATION', 'Nhập nội dung bình luận.'); comment.content = b.content.trim(); comment.editedAt = now; this.event('comment:updated', comment.groupId); return comment; }
      if (method === 'DELETE') { this.state.comments = this.state.comments.filter(c => c.id !== comment.id); this.event('comment:deleted', comment.groupId); return { ok: true }; }
    }
    const match = p.match(/^\/groups\/([^/]+)(?:\/(.*))?$/);
    if (match) {
      const group = this.group(match[1], user.id), tail = match[2] || '';
      if (!tail && method === 'GET') return this.groupView(group, user.id);
      if (!tail && method === 'PATCH') {
        this.leader(group, user.id);
        if (b.expectedRevision !== undefined && b.expectedRevision !== group.group.revision) fail('REVISION_CONFLICT', 'Thông tin nhóm đã thay đổi; hãy tải lại.', 409);
        const next = { ...group.group, ...Object.fromEntries(['name', 'tripDate', 'startHour', 'endHour', 'budgetPerPersonVnd'].filter(k => b[k] !== undefined).map(k => [k, b[k]])) };
        if (!next.name?.trim() || !validTripDate(next.tripDate) || !(next.startHour >= 0 && next.endHour <= 24 && next.endHour > next.startHour) || !(next.budgetPerPersonVnd > 0)) fail('VALIDATION', 'Thông tin chuyến đi chưa hợp lệ.');
        next.revision++; next.mode = 'DEMO'; group.group = next;
        for (const plan of group.plans) if (plan.status === 'VOTING') plan.status = 'STALE';
        this.log(group, 'GROUP_UPDATED', 'Thông tin nhóm đã cập nhật; các phiếu cũ hết hiệu lực.'); this.event('group:updated', next.id); return this.groupView(group, user.id).group;
      }
      if (tail === 'preferences') {
        const key = `${group.group.id}:${user.id}`;
        if (method === 'GET') return this.state.preferences[key] || defaultPreferences;
        if (method === 'PATCH') { const pref = { ...(this.state.preferences[key] || defaultPreferences), ...b } as Preferences; this.state.preferences[key] = pref; this.log(group, 'PREFERENCES_UPDATED', `${user.name} đã lưu sở thích.`); this.event('group:updated', group.group.id); return pref; }
      }
      if (tail === 'wishlist' && method === 'GET') return group.wishlist;
      if (tail === 'wishlist' && method === 'POST') {
        const place = places.find(p => p.id === b.placeId && p.cityId === group.group.cityId) || fail('INVALID_PLACE', 'Chọn điểm đến cùng thành phố.');
        if (!group.wishlist.some(p => p.id === place.id)) { group.wishlist.push(place); this.log(group, 'WISHLIST_ADDED', `${user.name} đã thêm ${place.name}.`); this.event('wishlist:updated', group.group.id); }
        return group.wishlist;
      }
      if (tail.startsWith('wishlist/') && method === 'DELETE') { group.wishlist = group.wishlist.filter(p => p.id !== tail.split('/')[1]); this.log(group, 'WISHLIST_REMOVED', `${user.name} đã bỏ một điểm khỏi danh sách.`); this.event('wishlist:updated', group.group.id); return group.wishlist; }
      if (tail === 'plans' && method === 'GET') return group.plans.map(p => this.planView(p, user.id));
      if (tail === 'plans/generate' && method === 'POST') {
        this.leader(group, user.id);
        if (b.placeIds !== undefined && (!Array.isArray(b.placeIds) || b.placeIds.length < 1 || b.placeIds.length > 20 || new Set(b.placeIds).size !== b.placeIds.length)) fail('VALIDATION', 'Chọn 1–20 điểm khác nhau.');
        const selected = b.placeIds ? b.placeIds.map((id: string) => places.find(p => p.id === id && p.cityId === group.group.cityId) || fail('INVALID_PLACE', 'Điểm không thuộc thành phố.')) : group.wishlist;
        return this.planView(this.addPlan(group, selected, b.task === 'RAIN_CHANGE' ? 'RAIN_CHANGE' : 'INITIAL'), user.id);
      }
      if (tail === 'weather' && method === 'GET') return weatherFixture(group.group.tripDate, now, this.scenario === 'missing-weather', this.state.alerts.some(a => a.groupId === group.group.id));
      if (tail === 'demo/rain' && method === 'POST') { this.leader(group, user.id); return this.rain(group); }
      if (tail === 'weather/check' && method === 'POST') return { weather: weatherFixture(group.group.tripDate, now, this.scenario === 'missing-weather', this.state.alerts.some(a => a.groupId === group.group.id)), alert: this.state.alerts.find(a => a.groupId === group.group.id) || null, proposal: null };
      if (tail === 'alerts' && method === 'GET') return this.state.alerts.filter(a => a.groupId === group.group.id);
      if (tail === 'verification' && method === 'GET') return { verified: 0, correct: 0, incorrect: 0, unknown: 0, accuracyPct: null, note: 'DEMO · Không đưa dữ liệu mô phỏng vào thống kê kiểm chứng thật.' };
      if (tail === 'rain-reports' && method === 'POST') {
        if (!['RAIN', 'DRY'].includes(b.condition) || !Number.isFinite(b.latitude) || Math.abs(b.latitude) > 90 || !Number.isFinite(b.longitude) || Math.abs(b.longitude) > 180 || !Number.isFinite(b.accuracyM) || b.accuracyM < 0) fail('VALIDATION', 'Kiểm tra vị trí và độ chính xác.');
        this.log(group, 'RAIN_REPORTED', `${user.name} đã gửi quan sát mẫu.`); return { id: this.id('rain-report'), verified: false, message: 'DEMO · Đã lưu tương tác mẫu; không xác minh thời tiết thực tế.' };
      }
      if (tail === 'activity' && method === 'GET') return this.state.activity[group.group.id] || [];
      if (tail === 'comments') {
        if (!!q.get('placeId') === !!q.get('planId') && method === 'GET') fail('VALIDATION', 'Chọn đúng một điểm đến hoặc phương án.');
        if (method === 'GET') return this.state.comments.filter(c => c.groupId === group.group.id && (q.get('placeId') ? c.placeId === q.get('placeId') : c.planId === q.get('planId')));
        if (method === 'POST') {
          if (!!b.placeId === !!b.planId || !b.content?.trim()) fail('VALIDATION', 'Chọn đúng một đích và nhập bình luận.');
          if (b.placeId && !places.some(p => p.id === b.placeId && p.cityId === group.group.cityId)) fail('INVALID_PLACE', 'Điểm đến không thuộc thành phố.');
          if (b.planId && !group.plans.some(p => p.id === b.planId)) fail('NOT_FOUND', 'Phương án không thuộc nhóm.', 404);
          const comment = { id: this.id('comment'), groupId: group.group.id, userId: user.id, userName: user.name, avatarColor: user.avatarColor, placeId: b.placeId || null, planId: b.planId || null, content: b.content.trim(), createdAt: now, editedAt: null };
          this.state.comments.push(comment); this.log(group, 'COMMENT_CREATED', `${user.name} đã bình luận.`); this.event('comment:created', group.group.id); return comment;
        }
      }
    }
    return fail('NOT_IMPLEMENTED', `Mock chưa hỗ trợ ${method} ${p}. Không trả kết quả thành công giả.`, 501);
  }
  private recommend(b: Record<string, any>, userId: string): RecommendationResult {
    if (!cities.some(c => c.id === b.cityId) || !validTripDate(b.tripDate) || !(b.durationHours > 0) || !(b.startHour >= 0 && b.startHour + b.durationHours <= 24) || !(b.budgetPerPersonVnd >= 0)) fail('VALIDATION', 'Kiểm tra ngày, ngân sách và khung giờ (0–24).');
    if (b.groupId) { const group = this.group(b.groupId, userId); if (group.group.cityId !== b.cityId) fail('VALIDATION', 'Nhóm khác thành phố.'); }
    const input = { ...b, mode: 'demo' as const }, now = this.clock().toISOString();
    const weather = weatherFixture(b.tripDate, now, this.scenario === 'missing-weather', this.scenario === 'rain-change');
    const preferred: string[] = Array.isArray(b.preferredPlaceIds) ? b.preferredPlaceIds : [];
    const categoryGroups: Record<string, RegExp> = { NATURE: /thien nhien|bien/, CULTURE: /van hoa|lich su/, ENTERTAINMENT: /tham quan|giai tri/, FOOD_CAFES: /am thuc|cafe|ca phe/ };
    const candidates = this.scenario === 'empty' ? [] : places.filter(p => p.cityId === b.cityId && (!b.categories?.length || b.categories.some((c: string) => c === p.category || categoryGroups[c]?.test(normalized(p.category)))) && (!b.environmentPreference || b.environmentPreference === 'ANY' || p.environment === b.environmentPreference));
    const ranked = [...candidates.filter(p => preferred.includes(p.id)), ...candidates.filter(p => !preferred.includes(p.id))];
    const asRecommendation = (place: Place, i: number): Recommendation => {
      const missing = this.scenario === 'missing-weather', risk = this.scenario === 'rain-change' && place.environment === 'OUTDOOR';
      const explanation = missing ? 'DEMO · Thiếu dữ liệu thời tiết.' : risk ? 'DEMO · Kịch bản có mưa; cân nhắc trong nhà.' : 'DEMO · Kịch bản thời tiết ổn định để thử giao diện.';
      return { placeId: place.id, place, rank: i + 1, reason: 'DEMO · Điểm từ danh mục có nguồn được đưa vào kịch bản theo bộ lọc của bạn. Không phải đề xuất AI thật.', preferenceReasons: [`Khớp loại ${place.category}; lựa chọn mô phỏng theo thứ tự danh mục.`], weatherExplanation: explanation,
        weather: { status: missing ? 'UNKNOWN' : risk ? 'RISK' : 'SUITABLE', explanation, adverse: risk, missing, temperatureAvailable: !missing, windAvailable: !missing, fetchedAt: now, demo: true, slots: weather.slots.map(s => ({ ...s, temperatureC: s.temperatureC ?? null, windKmh: s.windKmh ?? null })) },
        budgetStatus: 'UNKNOWN', missingInformation: ['Chưa xác minh giá vé, giờ mở cửa và thời lượng tham quan. Ảnh chỉ minh họa.'],
        visit: { startMinute: b.startHour * 60, endMinute: b.startHour * 60 + 60, durationMin: 60, travelFromCityMin: 15, estimated: true }, distanceFromCityKm: 0,
        factIds: [place.sourceUrl!], facts: { sourceUrl: place.sourceUrl, simulation: true }, alternativePlaceIds: places.filter(p => p.environment === 'INDOOR' && p.id !== place.id).slice(0, 2).map(p => p.id),
      };
    };
    return { requestId: this.id('mock-discovery'), engine: 'RULE_BASED', demo: true, model: null, fallbackReason: 'MOCK_FIXTURE', cityId: b.cityId, groupId: b.groupId || null, input: input as RecommendationResult['input'], recommendations: ranked.slice(0, Math.max(1, Math.min(20, b.limit || 6))).map(asRecommendation), candidateCount: candidates.length,
      groupPreferenceCount: b.groupId ? this.group(b.groupId, userId).members.length : 0, weather, generatedAt: now, cached: false,
      warnings: ['DEMO · Kết quả mô phỏng để thử giao diện. Không gọi AI, nhà cung cấp thời tiết hoặc máy chủ.'],
      ...(this.scenario === 'rain-change' ? { weatherAlternatives: { engine: 'RULE_BASED' as const, outsideFilters: true, recommendations: places.filter(p => p.environment === 'INDOOR').slice(0, 2).map(asRecommendation) } } : {}),
    };
  }
}
