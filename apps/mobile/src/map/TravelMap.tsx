import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import { Button, C, Icon, Notice, Txt } from '../ui';
import { categoryIcon, clusterPlaces, mappable, TravelMapProps, validRadar } from './model';

const Pin = memo(function Pin({ cluster, selected, label, onPress }: { cluster: ReturnType<typeof clusterPlaces>[number]; selected: boolean; label?: number; onPress: () => void }) {
  return <Marker coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }} onPress={onPress} tracksViewChanges={false} zIndex={selected ? 100 : 1} title={cluster.places.length > 1 ? `${cluster.places.length} điểm đến` : cluster.places[0].name}>
    <View style={{ minWidth: 34, height: 36, paddingHorizontal: 7, borderRadius: 18, borderWidth: selected ? 3 : 2, borderColor: selected ? C.amber : 'white', backgroundColor: selected ? C.ink : label ? C.blue : C.green, alignItems: 'center', justifyContent: 'center' }}>
      {cluster.places.length > 1 || label ? <Txt bold color="white">{label || cluster.places.length}</Txt> : <Icon name={categoryIcon(cluster.places[0]) as any} size={17} color="white" />}
    </View>
  </Marker>;
});
export default function TravelMap({ city, places, selectedId, onSelect, fitKey, focusKey, radar, frameIndex = 0, markerLabels, routeSegments }: TravelMapProps) {
  const ref = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(12);
  const lastFocus = useRef('');
  const fitPlaces = useRef(places); fitPlaces.current = places;
  const clusters = useMemo(() => clusterPlaces(places, zoom, selectedId, new Set(Object.keys(markerLabels || {}))), [places, zoom, selectedId, markerLabels]);
  useEffect(() => { const timer = setTimeout(() => { if (!ready) setFailed(true); }, 18000); return () => clearTimeout(timer); }, [ready, attempt]);
  useEffect(() => {
    if (!ready) return;
    lastFocus.current = '';
    const points = fitPlaces.current.filter(mappable);
    if (points.length > 1) ref.current?.fitToCoordinates(points, { edgePadding: { top: 100, right: 45, bottom: 240, left: 45 }, animated: true });
    else ref.current?.animateToRegion({ ...city, latitudeDelta: .08, longitudeDelta: .08 }, 600);
  }, [city.id, ready, fitKey]);
  useEffect(() => { lastFocus.current = ''; }, [focusKey]);
  useEffect(() => {
    if (!ready || !selectedId || lastFocus.current === selectedId) return;
    const p = places.find(p => p.id === selectedId && mappable(p));
    if (p) { lastFocus.current = selectedId; ref.current?.animateToRegion({ latitude: p.latitude - .001, longitude: p.longitude, latitudeDelta: .012, longitudeDelta: .012 }, 650); }
  }, [selectedId, places, ready, city.id, fitKey, focusKey]);
  if (Platform.OS === 'android' && Constants.executionEnvironment !== 'storeClient' && !Constants.expoConfig?.extra?.nativeMapsConfigured)
    return <View style={{ padding: 24, flex: 1, justifyContent: 'center' }}><Notice warning>Bản đồ Android cần GOOGLE_MAPS_API_KEY tại bước prebuild và build APK. Bạn vẫn có thể tìm kiếm, xem chi tiết và thêm wishlist từ danh sách. Bản web dùng OpenStreetMap không cần khóa.</Notice></View>;
  return <View style={{ flex: 1 }}>
    <MapView key={attempt} ref={ref} style={{ flex: 1 }} initialRegion={{ ...city, latitudeDelta: .12, longitudeDelta: .12 }} onMapReady={() => { setReady(true); setFailed(false); }} onRegionChangeComplete={r => setZoom(Math.max(1, Math.min(20, Math.log2(360 / Math.max(.0001, r.longitudeDelta)))))} toolbarEnabled={false}>
      {clusters.map(c => <Pin key={`${c.id}-${c.places.length}-${c.places[0].id === selectedId}-${markerLabels?.[c.places[0].id] || 0}`} cluster={c} label={c.places.length === 1 ? markerLabels?.[c.places[0].id] : undefined} selected={c.places.some(p => p.id === selectedId)} onPress={() => c.places.length === 1 ? onSelect(c.places[0].id) : ref.current?.fitToCoordinates(c.places, { edgePadding: { top: 100, right: 50, bottom: 230, left: 50 }, animated: true })} />)}
      {routeSegments?.map((segment, index) => <Polyline key={index} coordinates={segment} strokeColor={C.blue} strokeWidth={3} lineDashPattern={[8, 6]} />)}
      {validRadar(radar, frameIndex) && <UrlTile urlTemplate={`${radar!.host}${radar!.frames[frameIndex].path}/256/{z}/{x}/{y}/2/1_1.png`} maximumNativeZ={7} maximumZ={18} opacity={.6} tileSize={256} />}
    </MapView>
    {(!ready || failed) && <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, gap: 8 }}><Notice warning={failed}>{failed ? 'Chưa tải được bản đồ. Kiểm tra mạng và cấu hình khóa Maps. Danh sách điểm đến vẫn hoạt động.' : 'Đang tải bản đồ…'}</Notice>{failed && <Button label="Thử lại bản đồ" onPress={() => { setReady(false); setFailed(false); setAttempt(n => n + 1); }} />}</View>}
  </View>;
}

