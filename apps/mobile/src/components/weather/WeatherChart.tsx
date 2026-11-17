import React from 'react';
import { ScrollView, View } from 'react-native';
import type { WeatherSummary } from '../../types';
import { C, Card, hour, Row, Txt } from '../../ui';
/** Null means missing, never zero rain. */
export function WeatherChart({ weather }: { weather: WeatherSummary }) {
  const slots = weather.slots.slice(0, 16), max = Math.max(1, ...slots.map(s => s.rainMmH ?? 0));
  return <Card style={{ gap: 12 }}><Txt bold size={18}>Biểu đồ lượng mưa</Txt><Txt size={11} color={C.muted}>{weather.demo ? 'DEMO · Dự báo mô phỏng' : 'Dự báo theo giờ do backend cung cấp'} · mm/h · — là chưa có dữ liệu</Txt>
    {!slots.length && <Txt color={C.muted}>Chưa có khung giờ dự báo.</Txt>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false}><Row style={{ alignItems: 'flex-end', gap: 14 }}>{slots.map(s => <View key={s.time} accessible accessibilityLabel={`${hour(s.time)}: ${s.rainMmH === null ? 'chưa có dữ liệu mưa' : `${s.rainMmH} mm/h`}`} style={{ width: 42, gap: 6, alignItems: 'center' }}>
      <Txt size={10}>{s.rainMmH ?? '—'}</Txt><View style={{ height: 70, width: 24, justifyContent: 'flex-end', backgroundColor: C.bg, borderRadius: 5 }}><View style={{ backgroundColor: s.rainMmH === null ? C.line : C.blue, height: s.rainMmH === null ? 4 : Math.max(2, s.rainMmH / max * 70), borderRadius: 5 }} /></View><Txt size={10} color={C.muted}>{hour(s.time)}</Txt>
    </View>)}</Row></ScrollView>
  </Card>;
}
