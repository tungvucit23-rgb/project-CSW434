import React from 'react';
import { View } from 'react-native';
import { C } from '../../ui';
export function Skeleton() {
  return <View accessibilityRole="progressbar" accessibilityLabel="Đang tải nội dung" style={{ paddingVertical: 12, gap: 12 }}>{[100, 75, 90].map((width, i) => <View key={i} style={{ width: `${width}%`, height: i === 0 ? 100 : 18, borderRadius: 12, backgroundColor: C.line }} />)}</View>;
}
