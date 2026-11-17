import React, { useEffect, useRef, useState } from 'react';
import { Modal, SafeAreaView, ScrollView, Switch, View } from 'react-native';
import { dataSource, request } from '../api';
import type { City, DiscoveryInput, GroupDetail, Place, RecommendationResult } from '../types';
import { Button, C, Card, Empty, Input, money, Notice, Pill, Row, Txt } from '../ui';
import { feeText } from '../map/PlaceFacts';
import { PlaceCover } from '../map/PlaceFacts';
import Explanation from './Explanation';
import { activityOptions, environmentOptions, styleOptions } from './options';
import { validTripDate } from '../utils/validation';

export default function RecommendationStudio({ visible, city, cities, places, token, detail, result, onClose, onCity, onResult, onSelect, onWishlistChanged, onPlanner }: {
  visible: boolean; city: City; cities: City[]; places: Place[]; token: string | null; detail: GroupDetail | null; result: RecommendationResult | null;
  onClose: () => void; onCity: (id: string) => void; onResult: (r: RecommendationResult) => void; onSelect: (id: string) => void; onWishlistChanged: () => void; onPlanner: (ids: string[]) => void;
}) {
  const matching = detail?.group.cityId === city.id ? detail.group : null;
  const [useGroup, setUseGroup] = useState(!!matching);
  const [date, setDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
  const [budget, setBudget] = useState('500000'); const [start, setStart] = useState('8'); const [duration, setDuration] = useState('8');
  const [categories, setCategories] = useState<string[]>([]); const [styles, setStyles] = useState<string[]>([]);
  const [environment, setEnvironment] = useState<DiscoveryInput['environmentPreference']>('ANY');
  const [preferred, setPreferred] = useState<string[]>([]); const [search, setSearch] = useState('');
  const [step, setStep] = useState<'setup' | 'results'>(result ? 'results' : 'setup');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [compare, setCompare] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState(new Set<string>());
  const active = useRef(true); const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { if (!visible) { controller.current?.abort(); generation.current++; setBusy(false); } }, [visible]);
  const initializedGroup = useRef(!!matching);
  useEffect(() => { if (matching && !initializedGroup.current) { initializedGroup.current = true; setUseGroup(true); } }, [matching?.id]);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current++; controller.current?.abort(); }; }, []);
  useEffect(() => setSavedIds(new Set()), [detail?.wishlist]);
  const wished = (id: string) => savedIds.has(id) || !!detail?.wishlist.some(p => p.id === id);
  async function savePlace(place: Place) {
    if (savingId) return;
    if (!matching) { setError('Chọn hoặc tạo nhóm cùng thành phố trước khi lưu điểm. Bạn vẫn có thể xem và so sánh gợi ý cá nhân.'); return; }
    setError(''); setSavingId(place.id);
    try { await request(`/groups/${matching.id}/wishlist`, token, 'POST', { placeId: place.id }); if (active.current) { setSavedIds(ids => new Set([...ids, place.id])); onWishlistChanged(); } }
    catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Chưa lưu được điểm đến.'); }
    finally { if (active.current) setSavingId(null); }
  }
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];
  async function generate() {
    if (busy) return;
    const sequence = ++generation.current;
    controller.current?.abort(); controller.current = new AbortController();
    setError(''); setBusy(true);
    try {
      const group = useGroup ? matching : null;
      const input: DiscoveryInput = { cityId: city.id, tripDate: group?.tripDate || date, budgetPerPersonVnd: group?.budgetPerPersonVnd ?? Number(budget), categories,
        environmentPreference: environment, travelStyles: styles, startHour: group?.startHour ?? Number(start), durationHours: group ? group.endHour - group.startHour : Number(duration), preferredPlaceIds: preferred,
        groupId: group?.id || null, mode: group?.mode === 'DEMO' ? 'demo' : 'live', limit: 6 };
      if (!validTripDate(input.tripDate) || !Number.isFinite(input.budgetPerPersonVnd) || input.budgetPerPersonVnd < 0 || !Number.isFinite(input.durationHours) || input.durationHours <= 0 || !Number.isFinite(input.startHour) || input.startHour < 0 || input.startHour + input.durationHours > 24) throw new Error('Kiểm tra ngày hợp lệ, ngân sách và khung giờ trong khoảng 0–24.');
      const next = await request<RecommendationResult>('/ai/recommendations', token, 'POST', input, 90000, controller.current.signal);
      if (!active.current || sequence !== generation.current || next.cityId !== city.id) return;
      onResult(next); setStep('results');
    } catch (e) { if (active.current && sequence === generation.current) setError(e instanceof Error ? e.message : 'Chưa tạo được gợi ý. Hãy thử lại.'); }
    finally { if (active.current && sequence === generation.current) setBusy(false); }
  }
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <SafeAreaView accessibilityViewIsModal style={{ flex: 1, backgroundColor: '#173D3570', padding: 12, justifyContent: 'center' }}>
      <View role="dialog" aria-modal accessibilityLabel="Find My Perfect Trip" style={{ backgroundColor: C.bg, borderRadius: 24, maxWidth: 760, width: '100%', maxHeight: '96%', alignSelf: 'center', padding: 18, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Txt bold size={22}>Find My Perfect Trip</Txt><Txt size={12} color={C.muted}>Gợi ý điểm đến riêng, độc lập với tạo lịch trình.</Txt></View><Button label="Đóng gợi ý" variant="ghost" onPress={onClose} /></Row>
        {!!error && <Notice warning>{error}</Notice>}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
          {dataSource === 'mock' && <Notice warning>DEMO · Gợi ý và thời tiết mô phỏng để kiểm tra giao diện. Không phải đầu ra AI thật.</Notice>}
          {step === 'setup' ? <>
            <Txt bold>Điểm đến</Txt><Row style={{ flexWrap: 'wrap' }}>{cities.map(c => <Button key={c.id} label={c.name} variant={c.id === city.id ? 'primary' : 'secondary'} onPress={() => c.id !== city.id && onCity(c.id)} />)}</Row>
            {matching && <Card style={{ gap: 8 }}><Row><View style={{ flex: 1 }}><Txt bold>Dùng chuyến đi & sở thích nhóm</Txt><Txt size={11} color={C.muted}>{matching.name} · tổng hợp sở thích đã lưu của các thành viên.</Txt></View><Switch accessibilityLabel="Dùng sở thích nhóm" value={useGroup} onValueChange={setUseGroup} /></Row>{useGroup && <Txt size={12}>{matching.tripDate} · {matching.startHour}:00–{matching.endHour}:00 · {money(matching.budgetPerPersonVnd)}/người · {matching.mode}</Txt>}</Card>}
            {(!useGroup || !matching) && <><Input label="Ngày du lịch" value={date} onChange={setDate} placeholder="YYYY-MM-DD" /><Input label="Ngân sách mỗi người (VND)" value={budget} onChange={setBudget} numeric /><Row><View style={{ flex: 1 }}><Input label="Bắt đầu (giờ)" value={start} onChange={setStart} numeric /></View><View style={{ flex: 1 }}><Input label="Thời lượng (giờ)" value={duration} onChange={setDuration} numeric /></View></Row><Notice>{dataSource === 'mock' ? 'DEMO · Dự báo mô phỏng; không phải thời tiết trực tiếp.' : 'Khám phá cá nhân dùng dự báo từ backend. Thiếu dữ liệu được ghi là chưa biết.'}</Notice></>}
            <Txt bold>Hoạt động yêu thích</Txt><Row style={{ flexWrap: 'wrap' }}>{activityOptions.map(([value, label]) => <Button key={value} label={label} variant={categories.includes(value) ? 'primary' : 'secondary'} onPress={() => setCategories(toggle(categories, value))} />)}</Row>
            <Txt bold>Phong cách chuyến đi</Txt><Row style={{ flexWrap: 'wrap' }}>{styleOptions.map(([value, label]) => <Button key={value} label={label} variant={styles.includes(value) ? 'primary' : 'secondary'} onPress={() => setStyles(toggle(styles, value))} />)}</Row>
            <Txt bold>Không gian</Txt><Row style={{ flexWrap: 'wrap' }}>{environmentOptions.map(([value, label]) => <Button key={value} label={label} variant={environment === value ? 'primary' : 'secondary'} onPress={() => setEnvironment(value as typeof environment)} />)}</Row>
            <Input label="Ưu tiên điểm đến" value={search} onChange={setSearch} placeholder="Tìm để chọn điểm ưu tiên (tối đa 20)" />
            <Txt size={11} color={C.muted}>{preferred.length} điểm được ưu tiên; đây là ưu tiên mềm, vẫn phải qua kiểm tra khung giờ và dữ kiện.</Txt>
            {places.filter(p => p.geographyVerified && (!search || p.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))).slice(0, search ? 20 : 8).map(p => <Button key={p.id} label={`${preferred.includes(p.id) ? '✓ ' : '+ '}${p.name}`} variant={preferred.includes(p.id) ? 'primary' : 'ghost'} disabled={!preferred.includes(p.id) && preferred.length >= 20} onPress={() => setPreferred(toggle(preferred, p.id))} />)}
            <Notice warning>Không có giá vé hoặc giờ mở cửa có nguồn thì chưa thể bảo đảm ngân sách hay điều kiện vào cửa. Phong cách gia đình chỉ là gợi ý theo loại điểm, chưa xác minh tiện ích cho trẻ.</Notice>
            {busy && <Notice>Đang lọc địa điểm, đối chiếu dự báo và kiểm tra kết quả gợi ý…</Notice>}
            <Button label={busy ? 'Đang tìm điểm phù hợp…' : 'Tìm gợi ý phù hợp'} icon="sparkles-outline" loading={busy} onPress={generate} />
          </> : result ? <>
            <Txt size={11} color={C.muted}>Gợi ý được tạo lúc {new Date(result.generatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Tạo lại gợi ý nếu thời tiết hoặc sở thích thay đổi; bản đồ hiển thị dự báo được cập nhật riêng.</Txt>
            <Card style={{ gap: 8, backgroundColor: C.pale }}><Row style={{ flexWrap: 'wrap' }}><Pill>{result.engine === 'LLM' ? 'LLM · kết quả đã kiểm tra' : 'RULE_BASED · theo quy tắc'}</Pill>{result.demo && <Pill tone="amber">DEMO · thời tiết giả lập</Pill>}</Row><Txt bold>{city.name} · {result.recommendations.length} gợi ý</Txt><Txt size={12}>{result.input.tripDate} · {result.input.startHour}:00 · {result.input.durationHours} giờ · {money(result.input.budgetPerPersonVnd)}/người.</Txt><Txt size={11} color={C.muted}>{result.fallbackReason === 'MOCK_FIXTURE' ? 'DEMO · Toàn bộ gợi ý là kịch bản mẫu, không phải đầu ra AI thật.' : result.engine === 'RULE_BASED' ? result.fallbackReason === 'NO_API_KEY' ? 'Chưa cấu hình OpenAI key; kết quả do thuật toán quy tắc tạo.' : 'LLM chưa khả dụng hoặc kết quả không vượt kiểm tra; đã dùng thuật toán quy tắc.' : `Model cấu hình: ${result.model}`}</Txt><Txt size={11} color={C.muted}>Sở thích được tổng hợp từ {result.groupPreferenceCount} thành viên. Thứ hạng không phải xác suất hoặc điểm số thời tiết.</Txt></Card>
            {result.warnings.map((warning, i) => <Notice warning key={i}>{warning}</Notice>)}<Row style={{ flexWrap: 'wrap' }}><Button label="Xem gợi ý trên bản đồ" icon="map-outline" onPress={onClose} /><Button label="Đổi thiết lập gợi ý" variant="secondary" onPress={() => setStep('setup')} /></Row>
            {!result.recommendations.length && <Empty title="Chưa có điểm đáp ứng bộ lọc" text="Thử thời lượng dài hơn, bỏ bớt loại/không gian, hoặc chọn thành phố có tọa độ nguồn." />}
            {!!result.weatherAlternatives?.recommendations.length && <Card style={{ gap: 10, backgroundColor: C.pale }}><Txt bold size={18}>Cân nhắc phương án trong nhà</Txt><Pill tone="muted">RULE_BASED · ngoài bộ lọc ban đầu</Pill><Txt size={12}>Có dữ kiện thời tiết bất lợi trong một phần chuyến đi. Các điểm sau nới bộ lọc hoạt động/không gian để bạn chủ động so sánh; giờ và giá chưa biết vẫn cần xác minh.</Txt>{result.weatherAlternatives.recommendations.map(r => <Card key={r.placeId} style={{ gap: 8 }}><Txt bold>{r.place.name}</Txt><Explanation recommendation={r} compact /><Row style={{ flexWrap: 'wrap' }}><Button label={`Định vị phương án ${r.place.name}`} variant="secondary" onPress={() => { onSelect(r.placeId); onClose(); }} /><Button label={`Lưu phương án ${r.place.name}`} variant="ghost" disabled={wished(r.placeId) || !!savingId} loading={savingId === r.placeId} onPress={() => savePlace(r.place)} /></Row></Card>)}</Card>}
            {result.recommendations.map(r => <Card key={r.placeId} style={{ gap: 10 }}><PlaceCover place={r.place} height={130} /><Row><Pill tone="blue">#{r.rank}</Pill><View style={{ flex: 1 }}><Txt bold size={18}>{r.place.name}</Txt><Txt size={11} color={C.muted}>{r.place.category} · Vé: {feeText(r.place)}</Txt></View></Row><Explanation recommendation={r} /><Row style={{ flexWrap: 'wrap' }}><Button label={`Định vị ${r.place.name}`} icon="locate-outline" onPress={() => { onSelect(r.placeId); onClose(); }} /><Button label={wished(r.placeId) ? 'Đã trong wishlist' : `Lưu ${r.place.name}`} variant="secondary" disabled={wished(r.placeId) || !!savingId} loading={savingId === r.placeId} onPress={() => savePlace(r.place)} /></Row>{r.alternativePlaceIds.length > 0 && <Button label="So sánh điểm trong nhà" variant="ghost" onPress={() => setCompare(compare === r.placeId ? null : r.placeId)} />}{compare === r.placeId && <View style={{ gap: 8 }}>{r.alternativePlaceIds.map(id => places.find(p => p.id === id)).filter((p): p is Place => !!p).map(p => <Card key={p.id} style={{ backgroundColor: C.bg, gap: 5 }}><Txt bold size={13}>{p.name}</Txt><Txt size={11}>Trong nhà (ước tính) · Vé: {feeText(p)} · Tự kiểm tra đường di chuyển và phần khuôn viên ngoài trời.</Txt><Button label={`Xem ${p.name} trên bản đồ`} variant="ghost" onPress={() => { onSelect(p.id); onClose(); }} /></Card>)}</View>}</Card>)}
            {result.recommendations.length > 0 && <Button label="Dùng gợi ý để tạo lịch nhóm" icon="calendar-outline" onPress={() => { onPlanner(result.recommendations.map(r => r.placeId)); onClose(); }} />}
          </> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}
