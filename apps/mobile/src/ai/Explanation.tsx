import React, { useState } from 'react';
import { View } from 'react-native';
import type { Recommendation } from '../types';
import { Button, C, Notice, Pill, Txt } from '../ui';
import { minuteLabel } from './options';
export default function Explanation({ recommendation: r, compact = false }: { recommendation: Recommendation; compact?: boolean }) {
  const [factsOpen, setFactsOpen] = useState(false);
  const temperatures = r.weather.slots.map(s => s.temperatureC).filter((v): v is number => v != null);
  const winds = r.weather.slots.map(s => s.windKmh).filter((v): v is number => v != null);
  return <View style={{ gap: 8 }}>
    <Pill tone={r.weather.status === 'SUITABLE' ? 'green' : r.weather.status === 'RISK' ? 'amber' : 'muted'}>{r.weather.status === 'UNKNOWN' ? 'Thời tiết chưa đủ dữ liệu' : r.weather.status === 'RISK' ? 'Nhạy cảm với thời tiết' : 'Có dữ liệu để cân nhắc'}</Pill>
    <Txt size={12}>{compact ? r.preferenceReasons[0] || r.weatherExplanation : r.reason}</Txt>
    {!compact && <>
      <Txt size={12} bold>Sở thích</Txt><Txt size={12} color={C.muted}>{r.preferenceReasons.join(' ') || 'Gợi ý dựa trên khung giờ và dữ kiện sẵn có; chưa có sở thích khớp cụ thể.'}</Txt>
      <Txt size={12} bold>Thời gian & di chuyển</Txt><Txt size={12} color={C.muted}>{minuteLabel(r.visit.startMinute)}–{minuteLabel(r.visit.endMinute)} · {r.visit.durationMin} phút · khoảng {r.visit.travelFromCityMin} phút từ tâm thành phố theo công thức ước tính. {r.visit.estimated ? 'Giờ hoặc thời lượng còn là giả định.' : 'Theo dữ kiện nguồn.'}</Txt>
      <Txt size={12} bold>Ngân sách</Txt><Txt size={12} color={C.muted}>{r.budgetStatus === 'UNKNOWN' ? 'Chưa có giá vé nguồn; chưa xác nhận chi phí thực tế.' : 'Giá vé nguồn không vượt ngân sách riêng cho một điểm, chưa gồm ăn uống/di chuyển.'}</Txt>
      <Txt size={12} bold>Thời tiết</Txt><Txt size={12} color={C.muted}>{r.weatherExplanation}</Txt>
      {(temperatures.length > 0 || winds.length > 0) && <Txt size={11} color={C.muted}>{temperatures.length ? `Nhiệt độ theo giờ ${Math.min(...temperatures).toFixed(1)}–${Math.max(...temperatures).toFixed(1)}°C. ` : ''}{winds.length ? `Gió cao nhất theo giờ ${Math.max(...winds).toFixed(1)} km/h.` : ''}</Txt>}
      <Txt size={10} color={C.muted}>{!r.weather.temperatureAvailable ? 'Nhiệt độ chưa có dữ liệu. ' : ''}{!r.weather.windAvailable ? 'Gió chưa có dữ liệu. ' : ''}Dự báo tâm thành phố; không phải điều kiện tại cổng vào.</Txt>
      {r.missingInformation.length > 0 && <Notice warning>{r.missingInformation.join(' ')}</Notice>}
      <Button label={factsOpen ? 'Ẩn dữ kiện' : 'Xem dữ kiện giải thích'} variant="ghost" onPress={() => setFactsOpen(v => !v)} />
      {factsOpen && <View style={{ gap: 5 }}>{r.factIds.map(f => <Txt key={f} size={10} color={C.muted}>{f}</Txt>)}</View>}
    </>}
  </View>;
}
