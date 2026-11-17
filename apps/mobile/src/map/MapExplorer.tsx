import { useForecast } from './useForecast';
﻿import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, useWindowDimensions, View } from 'react-native';
import { cacheIdentity, request } from '../api';
import type { City, GroupDetail, Place, RadarData, RecommendationResult, WeatherSummary } from '../types';
import { Button, C, Card, Empty, Input, Notice, Row, Txt } from '../ui';
import TravelMap from './TravelMap';
import DestinationSheet from './DestinationSheet';
import { filterPlaces, mapFilters, MapFilter, mappable, validRadar, weatherForTrip } from './model';
import { useCatalog } from './useCatalog';
import RecommendationStudio from '../ai/RecommendationStudio';
const discoverySessions = new Map<string, RecommendationResult>();

export default function MapExplorer({ city, cities, token, detail, focus, onBack, onDetails, onAdd, busy, revision, openRecommendations = false, onCity, onPlanner, onRefresh }: { city: City; cities: City[]; token: string | null; detail: GroupDetail | null; focus?: Place | null; onBack: () => void; onDetails: (id: string) => void; onAdd: (p: Place) => void; busy: string | null; revision: number; openRecommendations?: boolean; onCity: (id: string) => void; onPlanner: (ids: string[]) => void; onRefresh: () => void }) {
  const sessionKey = `${cacheIdentity()}:${token}:${city.id}`;
  const cached = discoverySessions.get(sessionKey);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(cached && Date.now() - Date.parse(cached.generatedAt) < 180000 ? cached : null);
  const [studioOpen, setStudioOpen] = useState(openRecommendations);
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const { places, loading, error, retry } = useCatalog(city.id, token);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<MapFilter>('all');
  const [selectedId, setSelectedId] = useState(focus?.id);
  const [fitKey, setFitKey] = useState(0);
  const [focusKey, setFocusKey] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [limit, setLimit] = useState(15);
  const [mode, setMode] = useState<'normal' | 'weather' | 'radar'>('normal');
  const [radar, setRadar] = useState<RadarData | null>(null);
  const [radarError, setRadarError] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [radarAttempt, setRadarAttempt] = useState(0);
  const { width } = useWindowDimensions(); const wide = width >= 900;
  const matchingGroup = detail?.group.cityId === city.id ? detail.group : null;
  const forecast = useForecast(matchingGroup ? `/groups/${matchingGroup.id}/weather?mode=${matchingGroup.mode.toLowerCase()}` : null, token, matchingGroup?.tripDate || '');
  const weather = useMemo(() => weatherForTrip(forecast.data, matchingGroup), [forecast.data, matchingGroup?.startHour, matchingGroup?.endHour, matchingGroup?.tripDate]);
  const weatherError = forecast.error;
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setSelectedId(focus?.id); setFilter('all'); setQuery(''); setDebounced(''); }, [city.id, focus?.id]);
  useEffect(() => { setLimit(15); }, [debounced, filter]);
  useEffect(() => {
    if (mode !== 'radar' || radar) return;
    let active = true; setRadarError('');
    request<RadarData>('/radar', token).then(r => { if (active) { setRadar(r); setFrameIndex(Math.max(0, r.frames.length - 1)); if (!r.frames.length) setRadarError('Chưa có khung radar quá khứ.'); } }).catch(e => { if (active) setRadarError(e.message); });
    return () => { active = false; };
  }, [mode, token, radarAttempt]);
  const wishlist = useMemo(() => new Set(detail?.wishlist.map(p => p.id)), [detail?.wishlist, revision]);
  const recommendedIds = useMemo(() => new Set(recommendations?.recommendations.map(r => r.placeId)), [recommendations]);
  const markerLabels = useMemo(() => Object.fromEntries(recommendations?.recommendations.map(r => [r.placeId, r.rank]) || []), [recommendations]);
  const filtered = useMemo(() => filterPlaces(onlyRecommended ? places.filter(p => recommendedIds.has(p.id)) : places, debounced, filter, city, wishlist, weather), [places, debounced, filter, city, wishlist, weather, onlyRecommended, recommendedIds]);
  useEffect(() => { if (!loading && selectedId && !filtered.some(p => p.id === selectedId)) setSelectedId(undefined); }, [filtered, selectedId, loading]);
  const selected = filtered.find(p => p.id === selectedId);
  const markers = useMemo(() => filtered.filter(mappable), [filtered]);
  const select = (id: string) => { if (!recommendedIds.has(id)) setOnlyRecommended(false); setQuery(''); setDebounced(''); setFilter('all'); setSelectedId(id); setFocusKey(n => n + 1); setListOpen(false); };
  const acceptRecommendations = (result: RecommendationResult) => {
    if (result.cityId !== city.id) return;
    setRecommendations(result); setOnlyRecommended(true); setQuery(''); setDebounced(''); setFilter('all');
    discoverySessions.set(sessionKey, result); while (discoverySessions.size > 6) discoverySessions.delete(discoverySessions.keys().next().value!);
  };
  return <View style={{ flex: 1, backgroundColor: C.bg }}>
    {loading ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}><ActivityIndicator color={C.green} /><Txt>Đang tải các điểm đến {city.name}…</Txt></View> : error ? <View style={{ padding: 24, gap: 12 }}><Notice warning>{error}</Notice><Button label="Tải lại điểm đến" onPress={retry} /><Button label="Quay lại khám phá" onPress={onBack} variant="secondary" /></View> : <TravelMap city={city} places={markers} selectedId={selectedId} onSelect={select} fitKey={fitKey} focusKey={focusKey} markerLabels={markerLabels} radar={mode === 'radar' ? radar : null} frameIndex={frameIndex} />}
    {!loading && !error && <>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 12, right: 12, gap: 8 }}>
        <Card style={{ padding: 12, gap: 8, maxWidth: wide ? 650 : undefined, boxShadow: '0 4px 24px #173d3518' }}>
          <Row><Button label={wide ? "Quay lại" : ""} accessibilityLabel="Quay lại" icon="arrow-back" variant="ghost" onPress={onBack} /><View style={{ flex: 1 }}><Txt bold>{city.name}{wide ? " · Khám phá bản đồ" : ""}</Txt><Txt size={11} color={C.muted}>{markers.length} / {places.length} điểm trên bản đồ</Txt></View><Button label={wide ? "Toàn cảnh" : ""} accessibilityLabel="Toàn cảnh" icon="scan-outline" variant="ghost" onPress={() => { setSelectedId(undefined); setFitKey(k => k + 1); }} /></Row>
          <Input label="Tìm trên bản đồ" value={query} onChange={value => { setQuery(value); setListOpen(!!value.trim()); }} placeholder="Tên điểm đến, loại hoặc thành phố…" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 5 }}>{recommendations && <><Button label="Tất cả điểm" variant={!onlyRecommended ? 'primary' : 'secondary'} onPress={() => setOnlyRecommended(false)} /><Button label={`AI gợi ý (${recommendations.recommendations.length})`} variant={onlyRecommended ? 'primary' : 'secondary'} onPress={() => setOnlyRecommended(true)} /></>}{mapFilters.map(([value, label]) => <Button key={value} label={label} variant={filter === value ? 'primary' : 'ghost'} onPress={() => setFilter(value)} />)}</ScrollView>
        </Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Button label="Find My Perfect Trip" icon="sparkles-outline" onPress={() => setStudioOpen(true)} />{[['normal', 'Bản đồ'], ['weather', 'Thời tiết'], ['radar', 'Radar mưa']].map(([value, label]) => <Button key={value} label={label} variant={mode === value ? 'primary' : 'secondary'} onPress={() => setMode(value as typeof mode)} />)}<Button label={`Danh sách (${filtered.length})`} variant="secondary" onPress={() => setListOpen(v => !v)} /><Button label="Lập lịch thông minh" variant="secondary" onPress={() => onPlanner([])} /></ScrollView>
        {mode === 'weather' && <Card style={{ maxWidth: 420, gap: 7, padding: 12 }}><Txt bold size={13}>{weather?.demo ? 'DEMO · Dự báo giả lập' : 'Dự báo tại tâm thành phố'}</Txt><Txt size={12}>{weatherError || (!matchingGroup ? 'Chọn nhóm cùng thành phố để xem dự báo theo ngày chuyến đi.' : weather ? `${matchingGroup.tripDate} · ${weather.confidenceText}` : 'Đang tải dự báo…')}</Txt>{weather && <Txt size={11}>Cập nhật: {new Date(weather.fetchedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Chọn điểm để xem lý do phù hợp.</Txt>}{matchingGroup && <Button label="Tải lại dự báo" variant="ghost" onPress={forecast.retry} />}</Card>}
        {mode === 'radar' && <Card style={{ maxWidth: 460, gap: 8, padding: 12 }}><Txt bold size={12}>RainViewer · Radar quá khứ</Txt><Txt size={11}>{radarError || (validRadar(radar, frameIndex) ? `Khung ảnh: ${new Date(radar!.frames[frameIndex].time * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : 'Đang tải khung radar…')}</Txt><Txt size={10}>© RainViewer · Chưa xác minh độ phủ tại từng điểm. Tile trống không có nghĩa trời khô. Không phải dự báo mưa tương lai.</Txt>{radar && <Row><Button label="Trước" variant="secondary" disabled={frameIndex === 0} onPress={() => setFrameIndex(i => i - 1)} /><Txt size={11}>{frameIndex + 1}/{radar.frames.length}</Txt><Button label="Sau" variant="secondary" disabled={frameIndex >= radar.frames.length - 1} onPress={() => setFrameIndex(i => i + 1)} /></Row>}{!!radarError && <Button label="Tải lại radar" onPress={() => { setRadar(null); setRadarAttempt(n => n + 1); }} />}</Card>}
      </View>
      {filtered.length === 0 && <View style={{ position: 'absolute', bottom: 28, left: 16, right: 16, maxWidth: 420 }}><Empty title="Không có điểm phù hợp" text="Thử từ khóa khác hoặc xóa bộ lọc." action="Xóa bộ lọc" onAction={() => { setQuery(''); setFilter('all'); }} /></View>}
      {markers.length < filtered.length && !selected && <View style={{ position: 'absolute', bottom: 28, left: 16, right: 16, maxWidth: 420 }}><Notice warning>{filtered.length - markers.length} điểm chưa có tọa độ được đối chiếu. Xem trong Danh sách; chưa hiển thị marker để tránh sai vị trí.</Notice></View>}
      {listOpen && filtered.length > 0 && <Card style={{ position: 'absolute', left: 12, right: wide ? undefined : 12, width: wide ? 380 : undefined, bottom: 24, maxHeight: '48%', gap: 8 }}><Row style={{ justifyContent: 'space-between' }}><Txt bold>{filtered.length} điểm phù hợp</Txt><Button label="Đóng danh sách" variant="ghost" onPress={() => setListOpen(false)} /></Row><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>{filtered.slice(0, limit).map(p => <Card key={p.id} onPress={() => select(p.id)} style={{ padding: 12, backgroundColor: C.bg }}><Txt bold size={13}>{p.name}</Txt><Txt size={11} color={C.muted}>{p.category} · {mappable(p) ? 'Chạm để định vị' : 'Chưa xác minh tọa độ'}</Txt></Card>)}{limit < filtered.length && <Button label="Xem thêm điểm đến" variant="secondary" onPress={() => setLimit(n => n + 15)} />}</ScrollView></Card>}
      {selected && <DestinationSheet place={selected} weather={weather} wide={wide} wished={wishlist.has(selected.id)} busy={busy === `map-wish-${selected.id}`} onClose={() => setSelectedId(undefined)} onDetails={() => onDetails(selected.id)} onAdd={() => onAdd(selected)} recommendation={recommendations?.recommendations.find(r => r.placeId === selected.id) || recommendations?.weatherAlternatives?.recommendations.find(r => r.placeId === selected.id)} onExplanation={() => setStudioOpen(true)} />}
      <RecommendationStudio visible={studioOpen} city={city} cities={cities} places={places} token={token} detail={detail} result={recommendations} onClose={() => setStudioOpen(false)} onCity={onCity} onResult={acceptRecommendations} onSelect={select} onWishlistChanged={onRefresh} onPlanner={onPlanner} />
    </>}
  </View>;
}

