import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, PanResponder, Platform, ScrollView, View } from 'react-native';
import { Button, C, Photo, Pill, Row, Txt } from '../ui';
import type { Place, Recommendation, WeatherSummary } from '../types';
import { feeText } from './PlaceFacts';
import { WeatherInsight } from './WeatherInsight';
export default function DestinationSheet({ place, weather, wide, wished, busy, onClose, onDetails, onAdd, recommendation, onExplanation }: { place: Place; weather?: WeatherSummary | null; wide: boolean; wished: boolean; busy: boolean; onClose: () => void; onDetails: () => void; onAdd: () => void; recommendation?: Recommendation; onExplanation?: () => void }) {
  const position = useRef(new Animated.Value(35)).current;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); position.setValue(35); Animated.timing(position, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(); }, [place.id]);
  const pan = useMemo(() => PanResponder.create({ onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8, onPanResponderMove: (_, g) => position.setValue(Math.max(-20, g.dy)), onPanResponderRelease: (_, g) => { if (g.dy > 110) onClose(); else { setExpanded(g.dy < -35); Animated.spring(position, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(); } } }), [onClose]);
  return <Animated.View style={{ position: 'absolute', bottom: 24, right: wide ? 24 : 8, left: wide ? undefined : 8, width: wide ? 360 : undefined, maxHeight: wide ? '78%' : expanded ? '78%' : '48%', borderRadius: 24, padding: 16, backgroundColor: C.white, boxShadow: '0 8px 40px #173d3525', transform: [{ translateY: position }], gap: 10 }}>
    {!wide && <View {...pan.panHandlers} accessible accessibilityLabel="Kéo để mở rộng hoặc thu gọn thông tin" style={{ alignItems: 'center', padding: 8 }}><View style={{ width: 44, height: 4, borderRadius: 4, backgroundColor: C.line }} /></View>}
    <Row style={{ justifyContent: 'space-between' }}><Pill>{place.category}</Pill><Button label="Đóng" variant="ghost" onPress={onClose} /></Row>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
      {!!place.imageUrl && <Photo key={place.id} uri={place.imageUrl} height={wide ? 138 : 90} />}
      <Txt size={21} bold>{place.name}</Txt>
      <Txt size={12} color={C.muted}>{place.environment === 'INDOOR' ? 'Trong nhà' : 'Ngoài trời'} · Phân loại ước tính · Vé: {feeText(place)}</Txt>
      <Txt size={12}>{place.description}</Txt>
      {recommendation && <><Pill tone="blue">Gợi ý #{recommendation.rank}</Pill><Txt size={12}>{recommendation.preferenceReasons[0] || recommendation.reason}</Txt><Button label="Vì sao điểm này được gợi ý?" variant="ghost" onPress={onExplanation || onDetails} /></>}
      <WeatherInsight place={place} weather={weather} />
      {!!place.sourceUrl && <Button label="Nguồn tọa độ OpenStreetMap" variant="ghost" onPress={() => Linking.openURL(place.sourceUrl!)} />}
    </ScrollView>
    <Row><Button label="Xem chi tiết" variant="secondary" onPress={onDetails} style={{ flex: 1 }} /><Button label={wished ? 'Đã muốn đi' : 'Muốn đi'} icon={wished ? 'checkmark' : 'heart-outline'} disabled={wished} loading={busy} onPress={onAdd} style={{ flex: 1 }} /></Row>
  </Animated.View>;
}
