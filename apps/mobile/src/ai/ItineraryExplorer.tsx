import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import type { City, Plan, WeatherSummary } from '../types';
import { Button, C, Card, date, hour, money, Notice, Pill, Row, Txt } from '../ui';
import TravelMap from '../map/TravelMap';
import { WeatherInsight } from '../map/WeatherInsight';
import { feeText } from '../map/PlaceFacts';
import { itineraryGeometry, visitWeather } from './itineraryModel';
import { suitability, weatherForTrip } from '../map/model';

export default function ItineraryExplorer({ plan, city, weather, weatherError, onBack, onDetails, onReview, onRetryWeather }: { plan: Plan; city: City; weather: WeatherSummary | null; weatherError: string; onBack: () => void; onDetails: (id: string) => void; onReview: () => void; onRetryWeather: () => void }) {
  const geometry = useMemo(() => itineraryGeometry(plan, city.id), [plan.items, city.id]);
  const overview = plan.items[0] ? suitability({ ...plan.items[0].place, environment: 'OUTDOOR' }, weatherForTrip(weather, plan.tripContext)) : null;
  const [selectedId, setSelectedId] = useState<string | undefined>(plan.items[0]?.placeId);
  const [focusKey, setFocusKey] = useState(0); const [fitKey, setFitKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions(); const wide = width >= 900;
  const scroll = useRef<ScrollView>(null), offsets = useRef<Record<string, number>>({});
  const drag = useRef(new Animated.Value(0)).current;
  const pan = useMemo(() => PanResponder.create({ onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8, onPanResponderMove: (_, g) => drag.setValue(Math.max(-25, Math.min(80, g.dy))), onPanResponderRelease: (_, g) => { if (Math.abs(g.dy) > 25) setExpanded(g.dy < 0); Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(); } }), []);
  useEffect(() => { if (selectedId && offsets.current[selectedId] != null) scroll.current?.scrollTo({ y: Math.max(0, offsets.current[selectedId] - 8), animated: true }); }, [selectedId]);
  const select = (id: string) => { setSelectedId(id); setFocusKey(n => n + 1); };
  return <View style={{ flex: 1, backgroundColor: C.bg }}>
    <TravelMap city={city} places={geometry.places} markerLabels={geometry.labels} routeSegments={geometry.segments} selectedId={selectedId} onSelect={select} focusKey={focusKey} fitKey={fitKey} />
    <Card style={{ position: 'absolute', top: 12, left: 12, right: 12, maxWidth: wide ? 650 : undefined, padding: 12, gap: 8 }}>
      <Row><Button label={wide ? 'Quay lại' : ''} accessibilityLabel="Quay lại" icon="arrow-back" variant="ghost" onPress={onBack} /><View style={{ flex: 1 }}><Txt bold size={18}>{city.name} · Lịch trình #{plan.version}</Txt><Txt size={11} color={C.muted}>{plan.tripContext ? date(plan.tripContext.tripDate) : ''} · {plan.items.length} điểm · {plan.totalDurationMin ?? 0} phút theo lịch</Txt></View><Button label={wide ? 'Toàn tuyến' : ''} accessibilityLabel="Toàn tuyến" icon="scan-outline" variant="ghost" onPress={() => { setSelectedId(undefined); setFitKey(n => n + 1); }} /></Row>
      <Row style={{ flexWrap: 'wrap' }}><Pill tone={plan.status === 'APPROVED' ? 'green' : 'amber'}>{plan.status === 'APPROVED' ? 'Đã được nhóm duyệt' : 'Phương án · cần biểu quyết'}</Pill><Pill tone="muted">{plan.engine}</Pill>{plan.demo && <Pill tone="amber">DEMO</Pill>}</Row>
      <Txt size={10} color={C.muted}>Nối đường thẳng ước tính · {plan.route ? `${plan.route.straightLineKm} km giữa các điểm có tọa độ` : 'Chưa có tổng khoảng cách'} · không phải tuyến lái xe.</Txt>
      <Txt size={10} color={C.muted}>Di chuyển dự kiến: {plan.totalTravelMin ?? 0} phút · Thời tiết ngoài trời trong khung chuyến đi: {overview?.label || 'Chưa có dữ liệu'}.</Txt>
    </Card>
    <Animated.View style={{ position: 'absolute', right: wide ? 24 : 8, left: wide ? undefined : 8, bottom: 24, width: wide ? 390 : undefined, maxHeight: wide ? expanded ? '86%' : '68%' : expanded ? '74%' : '43%', backgroundColor: C.white, borderRadius: 24, padding: 15, gap: 8, transform: [{ translateY: drag }], boxShadow: '0 8px 35px #173d3520' }}>
      <View {...pan.panHandlers} accessible accessibilityLabel="Kéo để mở rộng timeline" style={{ padding: 7, alignItems: 'center' }}><View style={{ height: 4, width: 42, backgroundColor: C.line, borderRadius: 4 }} /></View>
      <Row style={{ justifyContent: 'space-between' }}><Txt bold size={18}>Hành trình của nhóm</Txt><Button label={expanded ? 'Thu gọn' : 'Mở rộng'} variant="ghost" onPress={() => setExpanded(v => !v)} /></Row>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
        <Notice warning>Dự toán theo dữ kiện và giả định: {money(plan.totalCostVnd)}/người. {plan.unknownCostCount ?? plan.items.filter(i => i.place.visitorInfo?.entranceFeeVnd == null).length} điểm chưa có giá vé nguồn; chưa gồm ăn uống, lưu trú và phương tiện.</Notice>
        {geometry.unmappedCount > 0 && <Notice warning>{geometry.unmappedCount} điểm chưa có tọa độ nguồn hoặc khác thành phố. Không vẽ marker hay nối đường qua những điểm này.</Notice>}
        {!!weatherError && <View style={{ gap: 6 }}><Notice warning>{weatherError}</Notice><Button label="Tải lại thời tiết lịch trình" variant="secondary" onPress={onRetryWeather} /></View>}
        {plan.items.map((item, index) => <View key={item.id} onLayout={event => { const y = event.nativeEvent.layout.y; offsets.current[item.placeId] = y; if (selectedId === item.placeId) scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }); }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Chọn điểm dừng ${index + 1}: ${item.place.name}`} aria-selected={selectedId === item.placeId} accessibilityState={{ selected: selectedId === item.placeId }} onPress={() => select(item.placeId)}>
            <Card style={{ padding: 12, gap: 6, backgroundColor: selectedId === item.placeId ? C.pale : C.bg, borderColor: selectedId === item.placeId ? C.green : C.line }}>
              <Row><Pill tone="blue">{index + 1}</Pill><View style={{ flex: 1 }}><Txt bold>{item.place.name}</Txt><Txt size={11}>{hour(item.startTime)} → {hour(item.endTime)} · {Math.round((Date.parse(item.endTime) - Date.parse(item.startTime)) / 60000)} phút (ước tính)</Txt></View></Row>
              <Txt size={11} color={C.muted}>{index === 0 ? 'Chưa tính chặng từ vị trí xuất phát của bạn tới điểm đầu.' : `Di chuyển từ điểm trước: khoảng ${item.travelMin} phút theo công thức, không phải giao thông trực tiếp.`}</Txt>
              <Txt size={11} color={C.muted}>Vé: {feeText(item.place)} · dự toán API: {money(item.costVnd)}</Txt>
              {!geometry.labels[item.placeId] && <Txt size={11} color={C.amber}>Tọa độ chưa được đối chiếu; camera không đổi khi chọn điểm này.</Txt>}
            </Card>
          </Pressable>
          {selectedId === item.placeId && <View style={{ gap: 8, paddingTop: 8 }}><Txt size={12}>{item.reason}</Txt><WeatherInsight place={item.place} weather={visitWeather(weather, item.startTime, item.endTime)} /><Button label="Thông tin điểm dừng" variant="secondary" onPress={() => onDetails(item.placeId)} /></View>}
        </View>)}
      </ScrollView>
      <Button label={plan.status === 'APPROVED' ? 'Xem quyết định của nhóm' : 'Xem phương án & biểu quyết'} icon="hand-left-outline" onPress={onReview} />
    </Animated.View>
  </View>;
}
