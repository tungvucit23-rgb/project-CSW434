import React from 'react';
import { View } from 'react-native';
import { C, Card, Icon, money, Photo, Pill, Txt, U } from '../ui';
import type { Place } from '../types';
import { categoryIcon } from './model';
export function PlaceCover({ place, height = 160 }: { place: Place; height?: number }) {
  if (place.imageUrl) return <Photo key={place.id} uri={place.imageUrl} height={height} />;
  return <View style={{ height, borderRadius: 18, padding: 22, backgroundColor: C.pale, overflow: 'hidden', justifyContent: 'space-between', gap: 12 }}>
    <View style={{ position: 'absolute', height: 180, width: 180, borderRadius: 100, backgroundColor: '#D9E8D7', right: -60, top: -45 }} />
    <Icon name={categoryIcon(place) as any} size={height > 200 ? 48 : 32} />
    <View style={{ gap: 4 }}><Pill tone="green">{place.category}</Pill><Txt size={11} color={C.muted}>Ảnh địa điểm chưa có sẵn</Txt></View>
  </View>;
}
export const feeText = (p: Place) => p.visitorInfo?.entranceFeeVnd == null ? 'Chưa có thông tin' : p.visitorInfo.entranceFeeVnd === 0 ? 'Miễn phí' : money(p.visitorInfo.entranceFeeVnd);
export function PlaceFacts({ place }: { place: Place }) {
  return <View style={U.grid}>{[
    [place.visitorInfo?.openingHours || 'Chưa có thông tin', 'Giờ mở cửa'],
    [place.visitorInfo?.visitDurationMin ? `${place.visitorInfo.visitDurationMin} phút` : 'Chưa có thông tin', 'Thời gian tham quan'],
    [feeText(place), 'Vé vào cửa'],
  ].map(([value, label]) => <Card key={label} style={{ flex: 1, minWidth: 140, gap: 6 }}><Txt size={11} color={C.muted}>{label}</Txt><Txt bold>{value}</Txt></Card>)}</View>;
}
